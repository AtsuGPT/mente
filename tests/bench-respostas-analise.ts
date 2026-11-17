/**
 * Análise da bateria antes/depois (scratchpad/bench/resultado-respostas.json + os registros "Kally perf" de cada site):
 * vícios de estilo (style-lint), tamanho, tempos, modelo, interpretador e tokens; e um arquivo com as respostas lado a
 * lado para a leitura manual.
 *   npx tsx --tsconfig tests/tsconfig.json tests/bench-respostas-analise.ts <resultado.json> <log-antes> <log-depois> <saida.md>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { lintStyle } from "@/server/kally/style-lint";

const [resFile, logAntes, logDepois, outFile] = process.argv.slice(2);
const rows = JSON.parse(readFileSync(resFile, "utf8")) as { id: string; cat: string; msg: string; antes: Answer; depois: Answer }[];
type Answer = { text: string; ms: number; firstMs: number | null; startedAt: string; erro?: string; error?: string; files?: unknown[] };
type Perf = Record<string, unknown> & { at: string; messageChars?: number };

const perfs = (file: string): Perf[] =>
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.startsWith("Kally perf: "))
    .map((l) => JSON.parse(l.slice("Kally perf: ".length)) as Perf);
const logs = { antes: perfs(logAntes), depois: perfs(logDepois) };

/** O registro do pedido: o primeiro "Kally perf" depois do início, com o mesmo tamanho de mensagem. */
function perfOf(site: "antes" | "depois", a: Answer, msg: string) {
  const t0 = Date.parse(a.startedAt);
  return logs[site].find((p) => Date.parse(p.at) >= t0 && (p.messageChars === undefined || p.messageChars === msg.length)) ?? null;
}

const sum = { antes: { ms: 0, first: 0, words: 0, issues: 0, interp: 0, remote: 0, prompt: 0, output: 0 }, depois: { ms: 0, first: 0, words: 0, issues: 0, interp: 0, remote: 0, prompt: 0, output: 0 } };
const issueCount: Record<string, Record<string, number>> = { antes: {}, depois: {} };
const md: string[] = ["# Respostas lado a lado (antes × depois)\n"];
const table: string[] = ["| Pedido | Antes: s (1º texto) · palavras · vícios · modelo | Depois: s (1º texto) · palavras · vícios · modelo |", "| --- | --- | --- |"];

for (const r of rows) {
  const cells: string[] = [];
  md.push(`\n## ${r.id} (${r.cat})\n\n> ${r.msg}\n`);
  for (const site of ["antes", "depois"] as const) {
    const a = r[site];
    const lint = lintStyle(a.text, r.msg);
    const p = perfOf(site, a, r.msg) as Record<string, any> | null;
    const target = p?.backend?.target ?? p?.target ?? "?";
    const model = (p?.executor?.model as string | undefined)?.split("/").pop() ?? "?";
    const interp = !!p?.interpreter;
    const s = sum[site];
    s.ms += a.ms;
    s.first += a.firstMs ?? a.ms;
    s.words += lint.words;
    s.issues += lint.issues.length;
    s.interp += interp ? 1 : 0;
    s.remote += target === "remote" || target === "coding" ? 1 : 0;
    s.prompt += Number(p?.executor?.promptTokens ?? 0);
    s.output += Number(p?.executor?.outputTokens ?? 0);
    for (const i of lint.issues) issueCount[site][i] = (issueCount[site][i] ?? 0) + 1;
    cells.push(`${Math.round(a.ms / 1000)} s (${a.firstMs ? Math.round(a.firstMs / 1000) : "—"}) · ${lint.words} · ${lint.issues.join(", ") || "—"} · ${model}${interp ? " +interp." : ""}`);
    md.push(`\n### ${site} — ${Math.round(a.ms / 1000)} s, ${lint.words} palavras, ${model}${interp ? ", com interpretador" : ""}${p?.understanding ? `, entendimento: ${JSON.stringify(p.understanding)}` : ""}${p?.plan ? `, plano: ${JSON.stringify(p.plan)}` : ""}${lint.issues.length ? `, vícios: ${lint.issues.join(", ")}` : ""}\n\n${a.erro || a.error ? `ERRO: ${a.erro || a.error}` : a.text}\n`);
  }
  table.push(`| ${r.id} | ${cells[0]} | ${cells[1]} |`);
}

const n = rows.length;
const line = (site: "antes" | "depois") => {
  const s = sum[site];
  return `${site}: tempo médio ${(s.ms / n / 1000).toFixed(1)} s, 1º texto ${(s.first / n / 1000).toFixed(1)} s, ${Math.round(s.words / n)} palavras, ${s.issues} vícios (${JSON.stringify(issueCount[site])}), interpretador em ${s.interp}, remoto em ${s.remote}, tokens de prompt ${s.prompt}, de saída ${s.output}`;
};
console.log(table.join("\n"));
console.log(`\n${line("antes")}\n${line("depois")}`);
writeFileSync(outFile, md.join("\n"));
