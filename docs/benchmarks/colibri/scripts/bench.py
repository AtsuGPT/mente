"""Benchmark Colibri x Ollama para a Kally (ambiente isolado, um modelo por vez).

Uso:
  python bench.py --plan plan.json --only colibri-8b --reps 3 --out ..\\results
  python bench.py --plan plan.json --only colibri-8b --scenarios A,B --reps 1

Para cada sessão (um motor + um modelo):
  1. confere que nada de outro teste ficou na memória (processo, VRAM);
  2. sobe o motor e mede o tempo até a primeira resposta de um pedido mínimo ("frio");
  3. roda cada cenário N vezes (streaming), medindo TTFT, decodificação, total e recursos;
  4. desliga o motor e confere que RAM e VRAM foram liberadas.
Tudo vai para um JSONL (um registro por pedido e um por sessão) e as respostas completas também.

Produção: o servidor do site usa o mesmo Ollama. Antes e depois de cada pedido o /api/ps do Ollama é
lido; um pedido em que apareceu um modelo que não é o do teste é marcado como contaminado.
"""
import argparse, json, os, subprocess, sys, threading, time, datetime, statistics
import psutil, requests

sys.path.insert(0, os.path.dirname(__file__))
from scenarios import SCENARIOS, SYSTEM

OLLAMA = "http://127.0.0.1:11434"
NVSMI = "nvidia-smi"
TEMPERATURE, TOP_P = 0.4, 0.9


def now():
    return time.perf_counter()


def gpu_query():
    try:
        out = subprocess.run([NVSMI, "--query-gpu=memory.used,utilization.gpu", "--format=csv,noheader,nounits"],
                             capture_output=True, text=True, timeout=5).stdout.strip().split(",")
        return float(out[0]), float(out[1])
    except Exception:
        return None, None


def ollama_ps():
    try:
        return [m["name"] for m in requests.get(f"{OLLAMA}/api/ps", timeout=5).json().get("models", [])]
    except Exception as e:
        return [f"<erro {e}>"]


class Monitor:
    """Amostra RAM do sistema, RAM do motor, CPU, VRAM, GPU e leitura de disco."""

    def __init__(self, pids_fn, period=0.5):
        self.pids_fn, self.period = pids_fn, period
        self.samples = []
        self._stop = threading.Event()
        self._gpu = (None, None)

    def _gpu_loop(self):
        while not self._stop.is_set():
            self._gpu = gpu_query()
            self._stop.wait(1.0)

    def _loop(self):
        psutil.cpu_percent(None)
        while not self._stop.is_set():
            t = now()
            vm = psutil.virtual_memory()
            rss = priv = rbytes = 0
            for pid in self.pids_fn():
                try:
                    p = psutil.Process(pid)
                    mi = p.memory_info()
                    rss += mi.rss
                    priv += getattr(mi, "private", 0)
                    rbytes += p.io_counters().read_bytes
                except Exception:
                    pass
            disk = psutil.disk_io_counters()
            self.samples.append({
                "t": t, "sys_used_gb": vm.used / 2**30, "sys_avail_gb": vm.available / 2**30,
                "eng_rss_gb": rss / 2**30, "eng_private_gb": priv / 2**30, "eng_read_bytes": rbytes,
                "cpu_pct": psutil.cpu_percent(None), "vram_mb": self._gpu[0], "gpu_pct": self._gpu[1],
                "disk_read_bytes": disk.read_bytes if disk else None,
                "swap_used_gb": psutil.swap_memory().used / 2**30,
            })
            self._stop.wait(self.period)

    def start(self):
        threading.Thread(target=self._gpu_loop, daemon=True).start()
        threading.Thread(target=self._loop, daemon=True).start()
        return self

    def stop(self):
        self._stop.set()

    def window(self, t0, t1):
        s = [x for x in self.samples if t0 <= x["t"] <= t1]
        if not s:
            return {}
        def mx(k):
            v = [x[k] for x in s if x[k] is not None]
            return max(v) if v else None
        def mean(k):
            v = [x[k] for x in s if x[k] is not None]
            return sum(v) / len(v) if v else None
        first, last = s[0], s[-1]
        return {
            "n_samples": len(s),
            "peak_sys_used_gb": mx("sys_used_gb"), "min_sys_avail_gb": min(x["sys_avail_gb"] for x in s),
            "peak_eng_rss_gb": mx("eng_rss_gb"), "peak_eng_private_gb": mx("eng_private_gb"),
            "peak_vram_mb": mx("vram_mb"), "mean_gpu_pct": mean("gpu_pct"), "peak_gpu_pct": mx("gpu_pct"),
            "mean_cpu_pct": mean("cpu_pct"), "peak_cpu_pct": mx("cpu_pct"),
            "peak_swap_used_gb": mx("swap_used_gb"),
            "eng_read_gb": (last["eng_read_bytes"] - first["eng_read_bytes"]) / 2**30,
            "disk_read_gb": ((last["disk_read_bytes"] or 0) - (first["disk_read_bytes"] or 0)) / 2**30,
        }


# ---------------------------------------------------------------- motores

class ColibriSession:
    def __init__(self, cfg, logdir):
        self.cfg, self.logdir = cfg, logdir
        self.port = cfg.get("port", 8010)
        self.proc = None

    def pids(self):
        if not self.proc:
            return []
        try:
            p = psutil.Process(self.proc.pid)
            return [p.pid] + [c.pid for c in p.children(recursive=True)]
        except Exception:
            return []

    def start(self):
        env = dict(os.environ)
        env.update(self.cfg.get("env", {}))
        args = ["py", "-3", "coli", "serve", "--model", self.cfg["model_dir"], "--port", str(self.port),
                "--ctx", str(self.cfg.get("ctx", 8192))] + self.cfg.get("serve_args", [])
        self.log = open(os.path.join(self.logdir, f"{self.cfg['id']}-server.log"), "w", encoding="utf-8")
        self.cmd = " ".join(args)
        self.proc = subprocess.Popen(args, cwd=self.cfg["colibri_dir"], env=env, stdout=self.log,
                                     stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)
        deadline = time.time() + self.cfg.get("start_timeout", 900)
        while time.time() < deadline:
            if self.proc.poll() is not None:
                raise RuntimeError(f"o servidor saiu com código {self.proc.returncode}")
            try:
                r = requests.get(f"http://127.0.0.1:{self.port}/v1/models", timeout=2)
                if r.ok:
                    self.model_id = r.json()["data"][0]["id"]
                    return
            except Exception:
                pass
            time.sleep(0.5)
        raise RuntimeError("o servidor não respondeu dentro do prazo")

    def stream(self, messages, max_tokens):
        body = {"model": self.model_id, "stream": True, "stream_options": {"include_usage": True},
                "max_tokens": max_tokens, "temperature": TEMPERATURE, "top_p": TOP_P, "messages": messages}
        t_send = now()
        t_first = t_last = None
        text, usage, finish, chunks = [], None, None, 0
        with requests.post(f"http://127.0.0.1:{self.port}/v1/chat/completions", json=body, stream=True,
                           timeout=(10, 3600)) as r:
            if not r.ok:
                raise RuntimeError(f"HTTP {r.status_code}: {r.text[:300]}")
            for raw in r.iter_lines(decode_unicode=False):
                if not raw or not raw.startswith(b"data: "):
                    continue
                data = raw[6:]
                if data == b"[DONE]":
                    break
                ev = json.loads(data)
                if ev.get("usage"):
                    usage = ev["usage"]
                for ch in ev.get("choices", []):
                    c = (ch.get("delta") or {}).get("content")
                    if c:
                        t = now()
                        if t_first is None:
                            t_first = t
                        t_last = t
                        chunks += 1
                        text.append(c)
                    if ch.get("finish_reason"):
                        finish = ch["finish_reason"]
        t_end = now()
        return {"t_send": t_send, "t_first": t_first, "t_last": t_last, "t_end": t_end, "text": "".join(text),
                "prompt_tokens": (usage or {}).get("prompt_tokens"),
                "completion_tokens": (usage or {}).get("completion_tokens"), "chunks": chunks,
                "finish_reason": finish, "server": None}

    def stop(self):
        tree = self.pids()
        if self.proc and self.proc.poll() is None:
            subprocess.run(["taskkill", "/T", "/F", "/PID", str(self.proc.pid)], capture_output=True)
            try:
                self.proc.wait(30)
            except Exception:
                pass
        for pid in tree:  # o motor (filho) pode sair depois do lançador
            try:
                psutil.Process(pid).kill()
            except Exception:
                pass
        psutil.wait_procs([p for p in (self._proc_or_none(x) for x in tree) if p], timeout=60)
        self._tree = tree
        if getattr(self, "log", None):
            self.log.close()

    @staticmethod
    def _proc_or_none(pid):
        try:
            return psutil.Process(pid)
        except Exception:
            return None

    def foreign_models(self, loaded):
        return loaded  # qualquer modelo do Ollama carregado durante um teste do Colibri


class OllamaSession:
    def __init__(self, cfg, logdir):
        self.cfg = cfg
        self.model = cfg["model"]
        self.loaded_by_us = False
        self.cmd = f"ollama /api/chat model={self.model} options={cfg.get('options')}"

    def pids(self):
        out = []
        for p in psutil.process_iter(["name"]):
            name = (p.info["name"] or "").lower()
            if name.startswith("llama-server") or (name.startswith("ollama") and "app" not in name):
                out.append(p.pid)
        return out

    def start(self):
        already = self.model in ollama_ps()
        self.already_loaded = already
        r = requests.post(f"{OLLAMA}/api/generate", json={"model": self.model, "keep_alive": "20m",
                                                           "options": self.cfg.get("options", {})}, timeout=900)
        r.raise_for_status()
        self.load_duration_s = r.json().get("load_duration", 0) / 1e9
        self.loaded_by_us = not already

    def stream(self, messages, max_tokens):
        opts = dict(self.cfg.get("options", {}))
        opts.update({"num_predict": max_tokens, "temperature": TEMPERATURE, "top_p": TOP_P})
        body = {"model": self.model, "stream": True, "messages": messages, "keep_alive": "20m", "options": opts}
        if "think" in self.cfg:
            body["think"] = self.cfg["think"]
        t_send = now()
        t_first = t_last = None
        text, final, chunks = [], {}, 0
        with requests.post(f"{OLLAMA}/api/chat", json=body, stream=True, timeout=(10, 3600)) as r:
            r.raise_for_status()
            for raw in r.iter_lines():
                if not raw:
                    continue
                ev = json.loads(raw)
                if ev.get("error"):
                    raise RuntimeError(ev["error"])
                c = (ev.get("message") or {}).get("content")
                if c:
                    t = now()
                    if t_first is None:
                        t_first = t
                    t_last = t
                    chunks += 1
                    text.append(c)
                if ev.get("done"):
                    final = ev
        t_end = now()
        server = {k: final.get(k) for k in ("total_duration", "load_duration", "prompt_eval_count",
                                            "prompt_eval_duration", "eval_count", "eval_duration")}
        return {"t_send": t_send, "t_first": t_first, "t_last": t_last, "t_end": t_end, "text": "".join(text),
                "prompt_tokens": final.get("prompt_eval_count"), "completion_tokens": final.get("eval_count"),
                "chunks": chunks, "finish_reason": final.get("done_reason"), "server": server}

    def stop(self):
        if self.cfg.get("unload_after", True):
            requests.post(f"{OLLAMA}/api/generate", json={"model": self.model, "keep_alive": 0}, timeout=60)
            for _ in range(60):
                if self.model not in ollama_ps():
                    break
                time.sleep(0.5)

    def foreign_models(self, loaded):
        norm = lambda m: m if ":" in m else m + ":latest"
        return [m for m in loaded if norm(m) != norm(self.model)]


# ---------------------------------------------------------------- execução

def metrics(res):
    m = {"ttft_s": None, "decode_tps": None, "total_s": res["t_end"] - res["t_send"]}
    if res["t_first"] is not None:
        m["ttft_s"] = res["t_first"] - res["t_send"]
        n = res["completion_tokens"] or res["chunks"]
        gen = res["t_last"] - res["t_first"]
        if n and n > 1 and gen > 0:
            m["decode_tps"] = (n - 1) / gen
        if res["prompt_tokens"] and m["ttft_s"]:
            m["prefill_tps_client"] = res["prompt_tokens"] / m["ttft_s"]
    s = res.get("server")
    if s and s.get("eval_duration"):
        m["server_decode_tps"] = s["eval_count"] / (s["eval_duration"] / 1e9)
        if s.get("prompt_eval_duration"):
            m["server_prefill_tps"] = s["prompt_eval_count"] / (s["prompt_eval_duration"] / 1e9)
    return m


def wait_released(baseline_vram, mon_pids_fn, timeout=60):
    t0 = time.time()
    while time.time() - t0 < timeout:
        v, _ = gpu_query()
        if not mon_pids_fn() and (v is None or baseline_vram is None or v <= baseline_vram + 300):
            return {"released": True, "vram_mb_after": v, "secs": time.time() - t0}
        time.sleep(1)
    v, _ = gpu_query()
    return {"released": False, "vram_mb_after": v, "secs": time.time() - t0}


def run_session(cfg, scenarios, reps, outdir, reps_per=None):
    os.makedirs(outdir, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    jpath = os.path.join(outdir, f"{cfg['id']}-{stamp}.jsonl")
    out = open(jpath, "w", encoding="utf-8")
    write = lambda rec: (out.write(json.dumps(rec, ensure_ascii=False) + "\n"), out.flush())

    engines = {n + ".exe" for n in ("qwen36", "colibri", "olmoe", "qwen38")}
    for _ in range(120):
        alive = [p.pid for p in psutil.process_iter(["name"]) if (p.info["name"] or "").lower() in engines]
        if not alive:
            break
        time.sleep(1)
    else:
        raise SystemExit(f"Há um motor do Colibri ainda rodando (pids {alive}); pare antes de testar.")
    vram0, _ = gpu_query()
    vm0 = psutil.virtual_memory()
    loaded0 = ollama_ps()
    sess = (ColibriSession if cfg["engine"] == "colibri" else OllamaSession)(cfg, outdir)
    mon = Monitor(sess.pids).start()
    session = {"type": "session", "id": cfg["id"], "engine": cfg["engine"], "cfg": cfg, "stamp": stamp,
               "baseline": {"vram_mb": vram0, "sys_used_gb": vm0.used / 2**30, "sys_avail_gb": vm0.available / 2**30,
                            "ollama_loaded": loaded0}}
    print(f"[{cfg['id']}] base: VRAM {vram0} MB, RAM livre {vm0.available/2**30:.1f} GB, Ollama {loaded0}", flush=True)
    try:
        t0 = now()
        sess.start()
        t_up = now()
        # pedido mínimo: mede "do zero até a primeira resposta"
        probe = sess.stream([{"role": "system", "content": SYSTEM}, {"role": "user", "content": "Responda apenas: ok"}], 8)
        t_ready = now()
        session["startup"] = {"api_up_s": t_up - t0, "first_answer_s": t_ready - t0,
                              "probe_ttft_s": (probe["t_first"] or probe["t_end"]) - probe["t_send"],
                              "probe_text": probe["text"], "resources": mon.window(t0, t_ready),
                              "ollama_load_duration_s": getattr(sess, "load_duration_s", None),
                              "ollama_already_loaded": getattr(sess, "already_loaded", None)}
        session["cmd"] = getattr(sess, "cmd", None)
        print(f"[{cfg['id']}] pronto em {t_ready - t0:.1f}s", flush=True)
        for sc in scenarios:
            for rep in range((reps_per or {}).get(sc["id"], reps)):
                extra = sc.get("system_extra")
                msgs = [{"role": "system", "content": SYSTEM + ("\n" + extra if extra else "")},
                        {"role": "user", "content": sc["user"]}]
                before = ollama_ps()
                rec = {"type": "request", "id": cfg["id"], "engine": cfg["engine"], "scenario": sc["id"], "rep": rep}
                try:
                    res = sess.stream(msgs, sc["max_tokens"])
                    after = ollama_ps()
                    rec.update(metrics(res))
                    rec.update({k: res[k] for k in ("prompt_tokens", "completion_tokens", "chunks", "finish_reason", "server")})
                    rec["resources"] = mon.window(res["t_send"], res["t_end"])
                    rec["text"] = res["text"]
                    rec["ollama_before"], rec["ollama_after"] = before, after
                    rec["contaminated"] = bool(sess.foreign_models(before) or sess.foreign_models(after))
                    print(f"[{cfg['id']}] {sc['id']}#{rep}: ttft {rec['ttft_s'] and round(rec['ttft_s'],2)}s "
                          f"decode {rec['decode_tps'] and round(rec['decode_tps'],2)} tok/s "
                          f"total {rec['total_s']:.1f}s out {rec['completion_tokens']} "
                          f"RAMpk {rec['resources'].get('peak_eng_rss_gb', 0):.2f} VRAMpk {rec['resources'].get('peak_vram_mb')} "
                          f"{'CONTAMINADO ' + str(after) if rec['contaminated'] else ''}", flush=True)
                except Exception as e:
                    rec["error"] = f"{type(e).__name__}: {e}"
                    print(f"[{cfg['id']}] {sc['id']}#{rep}: ERRO {rec['error']}", flush=True)
                write(rec)
    except Exception as e:
        session["error"] = f"{type(e).__name__}: {e}"
        print(f"[{cfg['id']}] ERRO na sessão: {session['error']}", flush=True)
    finally:
        t_stop = now()
        sess.stop()
        session["stop_s"] = now() - t_stop
        session["release"] = wait_released(vram0, sess.pids if cfg["engine"] == "colibri" else (lambda: []))
        mon.stop()
        session["resources_all"] = mon.window(-1e18, 1e18)
        write(session)
        out.close()
        print(f"[{cfg['id']}] fim; liberado={session['release']}; {jpath}", flush=True)
    return jpath


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", required=True)
    ap.add_argument("--only", required=True, help="ids separados por vírgula")
    ap.add_argument("--scenarios", default="A,B,C,D,E,F", help="ids separados por vírgula, ex.: A,A2,F")
    ap.add_argument("--reps", type=int, default=3)
    ap.add_argument("--reps-per", default="", help="ex.: B=1,C=1 (sobrepõe --reps nesses cenários)")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "results"))
    a = ap.parse_args()
    plan = {c["id"]: c for c in json.load(open(a.plan, encoding="utf-8"))}
    wanted = a.scenarios.split(",")
    scs = [s for s in SCENARIOS if s["id"] in wanted]
    for sid in a.only.split(","):
        rp = {k: int(v) for k, v in (x.split("=") for x in a.reps_per.split(",") if x)}
        run_session(plan[sid], scs, a.reps, a.out, rp)


if __name__ == "__main__":
    main()
