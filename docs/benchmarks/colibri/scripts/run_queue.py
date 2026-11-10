"""Executa a fila de testes (queue.json) um item por vez e mantém o checkpoint em dia.

  python run_queue.py            # roda os itens pendentes, na ordem
  python run_queue.py --status   # só mostra o que falta

Cada item: {"name", "only", "scenarios", "reps", "out", "done"}. Um item só é marcado como feito
depois que todas as sessões dele terminam; se a execução parar no meio, o item roda de novo inteiro
(as sessões repetidas valem pela mais recente). Depois de cada item, aggregate.py atualiza
report/ e o checkpoint é copiado para docs/benchmarks/colibri/ do repositório.
"""
import argparse, datetime, json, os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
QUEUE = os.path.join(HERE, "queue.json")
REPO_DIR = os.environ.get("KALLY_BENCH_DOCS", os.path.join(os.path.dirname(os.path.dirname(HERE)), "docs-bancada"))
PY = sys.executable


def load():
    return json.load(open(QUEUE, encoding="utf-8"))


def save(q):
    json.dump(q, open(QUEUE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def checkpoint(q, note=""):
    subprocess.run([PY, os.path.join(HERE, "aggregate.py"), "--results", os.path.join(ROOT, "results"),
                    "--out", os.path.join(ROOT, "report")], cwd=HERE, capture_output=True)
    os.makedirs(REPO_DIR, exist_ok=True)
    for f in ("tables.md", "requests.csv", "summary_by_scenario.csv", "summary_by_session.csv"):
        src = os.path.join(ROOT, "report", f)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(REPO_DIR, f))
    for f in ("bench.py", "scenarios.py", "aggregate.py", "run_queue.py", "plan.json", "queue.json", "testar.ps1"):
        src = os.path.join(HERE, f)
        if os.path.exists(src):
            os.makedirs(os.path.join(REPO_DIR, "scripts"), exist_ok=True)
            shutil.copy2(src, os.path.join(REPO_DIR, "scripts", f))
    done = [i for i in q if i.get("done")]
    todo = [i for i in q if not i.get("done")]
    best = os.path.join(HERE, "best.json")
    best_txt = open(best, encoding="utf-8").read() if os.path.exists(best) else "(ainda não definida)"
    lines = [
        "# Checkpoint do benchmark Colibrì x Ollama",
        "",
        f"Atualizado em {datetime.datetime.now():%Y-%m-%d %H:%M}. {note}",
        "",
        "Ambiente de teste (fora do repositório): `C:\\Users\\satan\\kally-bench\\` — motores em `colibri\\` "
        "(Vulkan/CPU) e `colibri-cuda\\` (CUDA), modelos em `models\\` (vínculos para os arquivos do Ollama), "
        "resultados brutos em `results\\`, Python isolado em `venv\\`.",
        "",
        "## Continuar de onde parou",
        "",
        "```powershell",
        "cd C:\\Users\\satan\\kally-bench\\bench",
        "..\\venv\\Scripts\\python.exe -u run_queue.py",
        "```",
        "",
        "## Testar à mão a melhor configuração",
        "",
        "```powershell",
        "cd C:\\Users\\satan\\kally-bench\\bench",
        ".\\testar.ps1            # a melhor até agora (best.json); ou .\\testar.ps1 colibri-30b-v28",
        "```",
        "",
        "Depois abra http://127.0.0.1:8010/ (painel e chat do Colibrì). Ctrl+C no terminal para parar.",
        "",
        "## Melhor configuração encontrada até agora",
        "",
        "```json", best_txt.strip(), "```",
        "",
        f"## Feito ({len(done)})", "",
        *[f"- {i['name']}: `{i.get('only', ' '.join(i.get('cmd', [])))}` cenários {i.get('scenarios', '-')} × {i.get('reps', '-')}" for i in done],
        "", f"## Pendente ({len(todo)})", "",
        *[f"- {i['name']}: `{i.get('only', ' '.join(i.get('cmd', [])))}` cenários {i.get('scenarios', '-')} × {i.get('reps', '-')}" for i in todo],
        "", "Tabelas atualizadas: [tables.md](tables.md). Dados brutos: `requests.csv`.", "",
    ]
    open(os.path.join(REPO_DIR, "CHECKPOINT.md"), "w", encoding="utf-8").write("\n".join(lines))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", action="store_true")
    a = ap.parse_args()
    q = load()
    if a.status:
        for i in q:
            print(("feito    " if i.get("done") else "pendente ") + i["name"])
        return
    checkpoint(q, "Fila iniciada.")
    tried = set()
    while True:
        q = load()
        pend = [i for i in q if not i.get("done") and i["name"] not in tried]
        if not pend:
            break
        item = pend[0]
        tried.add(item["name"])
        print(f"=== {item['name']}", flush=True)
        item.setdefault("only", item.get("cmd", ["?"])[0]); item.setdefault("scenarios", "-"); item.setdefault("reps", "-")
        if item.get("cmd"):
            r = subprocess.run([PY, "-u", os.path.join(HERE, item["cmd"][0])] + item["cmd"][1:], cwd=HERE)
        else:
          r = subprocess.run([PY, "-u", os.path.join(HERE, "bench.py"), "--plan", os.path.join(HERE, "plan.json"),
                            "--only", item["only"], "--scenarios", item["scenarios"], "--reps", str(item["reps"]), "--reps-per", item.get("reps_per", ""),
                            "--out", os.path.join(ROOT, item.get("out", "results"))], cwd=HERE)
        q = load()
        for i in q:
            if i["name"] == item["name"]:
                i["done"] = r.returncode == 0
                i["finished_at"] = f"{datetime.datetime.now():%Y-%m-%d %H:%M}"
        save(q)
        checkpoint(q, f"Último item: {item['name']} (código {r.returncode}).")
    print("fila concluída", flush=True)


if __name__ == "__main__":
    main()
