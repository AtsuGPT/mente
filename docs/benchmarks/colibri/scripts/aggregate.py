"""Agrega os JSONL de results/ em CSV e tabelas Markdown; monta o pacote cego de respostas.

  python aggregate.py --results ..\\results --out ..\\report
  python aggregate.py --results ..\\results --out ..\\report --blind ollama-4b,ollama-8b,ollama-14b,ollama-30b,colibri-30b

Regras: pedidos com erro ou contaminados (outro modelo carregado no Ollama durante o pedido) ficam fora
das medianas e são contados à parte. Se uma sessão foi repetida, vale a mais recente.
"""
import argparse, csv, glob, json, os, random, statistics


def load(results):
    sessions, requests = {}, {}
    for f in sorted(glob.glob(os.path.join(results, "*.jsonl"))):
        recs = [json.loads(l) for l in open(f, encoding="utf-8") if l.strip()]
        sess = [r for r in recs if r["type"] == "session"]
        if not sess:
            continue
        s = sess[-1]
        prev = sessions.get(s["id"])
        if prev and prev["stamp"] > s["stamp"]:
            continue
        sessions[s["id"]] = s
        reqs = [r for r in recs if r["type"] == "request"]
        if s["engine"] == "ollama":  # recalcula a contaminação com o nome normalizado (":latest")
            norm = lambda m: m if ":" in m else m + ":latest"
            mine = norm(s["cfg"]["model"])
            for r in reqs:
                if "ollama_before" in r:
                    r["contaminated"] = any(norm(m) != mine for m in r["ollama_before"] + r["ollama_after"])
        requests[s["id"]] = reqs
    return sessions, requests


def med(v):
    v = [x for x in v if x is not None]
    return statistics.median(v) if v else None


def rng(v):
    v = [x for x in v if x is not None]
    return (min(v), max(v)) if v else (None, None)


def f(x, d=1):
    return "—" if x is None else f"{x:.{d}f}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--results", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--blind", default="")
    ap.add_argument("--seed", type=int, default=20261109)
    ap.add_argument("--blind-rep", type=int, default=0, help="qual repetição entra no pacote cego (a última disponível, se não houver)")
    ap.add_argument("--blind-dir", default="blind")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    sessions, reqs = load(a.results)

    # CSV bruto, um pedido por linha
    cols = ["id", "engine", "scenario", "rep", "ttft_s", "decode_tps", "total_s", "prompt_tokens", "completion_tokens",
            "finish_reason", "prefill_tps_client", "server_decode_tps", "server_prefill_tps", "contaminated", "error",
            "peak_eng_rss_gb", "peak_eng_private_gb", "peak_sys_used_gb", "min_sys_avail_gb", "peak_vram_mb",
            "mean_cpu_pct", "mean_gpu_pct", "peak_swap_used_gb", "disk_read_gb", "eng_read_gb"]
    with open(os.path.join(a.out, "requests.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(cols)
        for sid, rs in reqs.items():
            for r in rs:
                res = r.get("resources", {})
                w.writerow([r.get(c, res.get(c)) for c in cols])

    # resumo por sessão x cenário
    rows, md = [], []
    md.append("| Sessão | Cenário | n válidos | TTFT mediana (s) | TTFT faixa | Decodificação mediana (tok/s) | faixa | Total mediana (s) | Tokens de saída (mediana) | Fim por limite |")
    md.append("|---|---|---|---|---|---|---|---|---|---|")
    for sid in sorted(reqs):
        for sc in ["A", "A2", "A3", "A4", "B", "B2", "C", "D", "E", "F"]:
            rs = [r for r in reqs[sid] if r["scenario"] == sc]
            if not rs:
                continue
            ok = [r for r in rs if not r.get("error") and not r.get("contaminated")]
            bad = len(rs) - len(ok)
            t = [r["ttft_s"] for r in ok]; d = [r["decode_tps"] for r in ok]; tot = [r["total_s"] for r in ok]
            n_out = [r["completion_tokens"] for r in ok]
            lim = sum(1 for r in ok if r.get("finish_reason") == "length")
            row = {"id": sid, "scenario": sc, "n_ok": len(ok), "n_excluded": bad, "ttft_med": med(t),
                   "ttft_min": rng(t)[0], "ttft_max": rng(t)[1], "decode_med": med(d), "decode_min": rng(d)[0],
                   "decode_max": rng(d)[1], "total_med": med(tot), "out_tokens_med": med(n_out), "hit_limit": lim,
                   "prompt_tokens": med([r["prompt_tokens"] for r in ok])}
            rows.append(row)
            md.append(f"| {sid} | {sc} | {len(ok)}{f' (+{bad} excl.)' if bad else ''} | {f(row['ttft_med'],2)} | "
                      f"{f(row['ttft_min'],2)}–{f(row['ttft_max'],2)} | {f(row['decode_med'])} | "
                      f"{f(row['decode_min'])}–{f(row['decode_max'])} | {f(row['total_med'])} | {f(row['out_tokens_med'],0)} | {lim}/{len(ok)} |")
    with open(os.path.join(a.out, "summary_by_scenario.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()) if rows else ["id"])
        w.writeheader(); w.writerows(rows)

    # resumo por sessão
    srows, smd = [], []
    smd.append("| Sessão | Motor | Subida até 1ª resposta (s) | TTFT mediana (s) | Decodificação mediana (tok/s) | RAM máx. do motor (GB) | RAM do sistema máx. usada (GB) | RAM livre mín. (GB) | VRAM máx. (MB) | CPU média (%) | GPU média (%) | Leitura de disco (GB) | Pedidos válidos/total | Liberou memória |")
    smd.append("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for sid in sorted(sessions):
        s = sessions[sid]; rs = reqs.get(sid, [])
        ok = [r for r in rs if not r.get("error") and not r.get("contaminated")]
        res = [r.get("resources", {}) for r in ok]
        def mx(k):
            v = [x.get(k) for x in res if x.get(k) is not None]
            return max(v) if v else None
        def mn(k):
            v = [x.get(k) for x in res if x.get(k) is not None]
            return min(v) if v else None
        def mean(k):
            v = [x.get(k) for x in res if x.get(k) is not None]
            return sum(v) / len(v) if v else None
        st = s.get("startup", {})
        row = {"id": sid, "engine": s["engine"], "first_answer_s": st.get("first_answer_s"),
               "ollama_load_s": st.get("ollama_load_duration_s"), "ttft_med": med([r["ttft_s"] for r in ok]),
               "decode_med": med([r["decode_tps"] for r in ok]),
               "peak_eng_rss_gb": max([v for v in [mx("peak_eng_rss_gb"), (st.get("resources") or {}).get("peak_eng_rss_gb")] if v is not None], default=None),
               "peak_sys_used_gb": mx("peak_sys_used_gb"), "min_sys_avail_gb": mn("min_sys_avail_gb"),
               "peak_vram_mb": mx("peak_vram_mb"), "mean_cpu_pct": mean("mean_cpu_pct"), "mean_gpu_pct": mean("mean_gpu_pct"),
               "disk_read_gb": sum(x.get("disk_read_gb") or 0 for x in res), "n_ok": len(ok), "n": len(rs),
               "released": (s.get("release") or {}).get("released"), "error": s.get("error")}
        srows.append(row)
        smd.append(f"| {sid} | {s['engine']} | {f(row['first_answer_s'])} | {f(row['ttft_med'],2)} | {f(row['decode_med'])} | "
                   f"{f(row['peak_eng_rss_gb'],2)} | {f(row['peak_sys_used_gb'],1)} | {f(row['min_sys_avail_gb'],2)} | {f(row['peak_vram_mb'],0)} | "
                   f"{f(row['mean_cpu_pct'],0)} | {f(row['mean_gpu_pct'],0)} | {f(row['disk_read_gb'],2)} | {row['n_ok']}/{row['n']} | {row['released']} |")
    with open(os.path.join(a.out, "summary_by_session.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(srows[0].keys()) if srows else ["id"])
        w.writeheader(); w.writerows(srows)
    open(os.path.join(a.out, "tables.md"), "w", encoding="utf-8").write(
        "## Por sessão\n\n" + "\n".join(smd) + "\n\n## Por cenário\n\n" + "\n".join(md) + "\n")
    print("\n".join(smd)); print(); print("\n".join(md))

    # pacote cego: a 1ª repetição válida de cada sessão pedida, com rótulos embaralhados por cenário
    if a.blind:
        ids = a.blind.split(",")
        rnd = random.Random(a.seed)
        key, bdir = {}, os.path.join(a.out, a.blind_dir)
        os.makedirs(bdir, exist_ok=True)
        from scenarios import SCENARIOS, CHECKS
        for sc in SCENARIOS:
            entries = []
            for sid in ids:
                ok = [r for r in reqs.get(sid, []) if r["scenario"] == sc["id"] and not r.get("error")]
                if ok:
                    ok = sorted(ok, key=lambda r: r["rep"]); entries.append((sid, ok[min(a.blind_rep, len(ok) - 1)]))
            rnd.shuffle(entries)
            labels = "PQRSTUVWXY"
            key[sc["id"]] = {labels[i]: sid for i, (sid, _) in enumerate(entries)}
            with open(os.path.join(bdir, f"{sc['id']}.md"), "w", encoding="utf-8") as fh:
                fh.write(f"# Cenário {sc['id']} — {sc['name']}\n\n## Pedido\n\n{sc['user']}\n\n## O que conferir\n\n{CHECKS[sc['id']]}\n\n")
                for i, (sid, r) in enumerate(entries):
                    fh.write(f"---\n\n## Resposta {labels[i]}  ({r['completion_tokens']} tokens, fim: {r.get('finish_reason')})\n\n{r['text']}\n\n")
        json.dump(key, open(os.path.join(a.out, a.blind_dir + "_key.json"), "w", encoding="utf-8"), indent=1)
        print(f"pacote cego em {bdir}; chave em blind_key.json (não abrir antes de corrigir)")


if __name__ == "__main__":
    main()
