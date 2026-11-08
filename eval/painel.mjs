// Painel da avaliação da Kally: gera eval/painel.html a partir dos resultados salvos (sem rede, sem dependências).
//
//   node eval/painel.mjs
//
// Lê: eval/simulacao/resultados/historico.json (rodadas em produção), resultados/ab-rodada-*/resumo.json (testes A/B)
// e eval/embeddings/resultados/*.json (recuperação isolada).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const readJson = (f, fb = null) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : fb);
const sim = path.join(here, "simulacao", "resultados");
const hist = readJson(path.join(sim, "historico.json"), []);
const ab = fs.readdirSync(sim).filter((d) => d.startsWith("ab-rodada-")).sort().map((d) => ({ nome: d, resumo: readJson(path.join(sim, d, "resumo.json")) })).filter((x) => x.resumo);
const emb = fs.readdirSync(path.join(here, "embeddings", "resultados")).filter((f) => f.endsWith(".json") && f !== "historico.json").sort().map((f) => readJson(path.join(here, "embeddings", "resultados", f)));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const pc = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : "—");
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2).replace(".", ",") : "—");

// Barras agrupadas horizontais (uma métrica por linha, uma barra por série). Valores em [0, max].
function bars({ title, series, rows, max = 1, fmt = pc }) {
  const rowH = 18 * series.length + 18, w = 640, left = 230, right = 56, barW = w - left - right;
  const h = rows.length * rowH + 8;
  let svg = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}" class="chart">`;
  rows.forEach((r, i) => {
    const y0 = i * rowH + 4;
    svg += `<text x="0" y="${y0 + 12}" class="lbl">${esc(r.label)}</text>`;
    series.forEach((s, j) => {
      const v = r.values[j];
      const y = y0 + 16 + j * 18;
      const len = Number.isFinite(v) ? Math.max(2, (v / max) * barW) : 0;
      svg += `<rect x="${left}" y="${y - 12}" width="${barW}" height="14" class="track"/>`;
      if (len) svg += `<rect x="${left}" y="${y - 12}" width="${len}" height="14" rx="4" class="s${j + 1}"><title>${esc(s)}: ${fmt(v)}</title></rect>`;
      svg += `<text x="${left + barW + 6}" y="${y}" class="val">${fmt(v)}</text>`;
    });
  });
  svg += "</svg>";
  const legend = series.map((s, j) => `<span class="key"><i class="s${j + 1}"></i>${esc(s)}</span>`).join("");
  return `<figure><figcaption>${esc(title)}</figcaption><div class="legend">${legend}</div>${svg}</figure>`;
}

let body = "";
const last = hist.at(-1);
if (last) {
  body += `<section><h2>Produção: rodada ${last.rodada}, com RAG × sem RAG</h2>
<div class="tiles">
<div class="tile"><b>${f2(last.comRag.nota)}</b><span>nota média com RAG</span></div>
<div class="tile"><b>${f2(last.semRag.nota)}</b><span>nota média sem RAG</span></div>
<div class="tile"><b>${f2(last.ganhoRag)}</b><span>ganho atribuível à recuperação</span></div>
<div class="tile"><b>${last.vazamentos}</b><span>vazamentos de privacidade</span></div>
</div>
${bars({ title: "Prova da rodada (40 perguntas)", series: ["com RAG", "sem RAG"], rows: [
    { label: "Respostas 5/5", values: [last.comRag.nota5, last.semRag.nota5] },
    { label: "Fatos completos", values: [last.comRag.fatosCompletos, last.semRag.fatosCompletos] },
    { label: "Armadilhas: disse que não encontrou", values: [last.comRag.armadilhasAdmitiu, last.semRag.armadilhasAdmitiu] },
    { label: "Inventou (juiz)", values: [last.comRag.inventou, last.semRag.inventou] },
  ] })}
${bars({ title: "Onde está o erro (com RAG)", series: ["perguntas"], max: Math.max(1, ...Object.values(last.diagnostico)), fmt: (x) => String(x), rows: Object.entries(last.diagnostico).filter(([, v]) => v).map(([k, v]) => ({ label: k.replace(/_/g, " "), values: [v] })) })}
</section>`;
}
for (const x of ab) {
  const versions = Object.keys(x.resumo);
  const R = (k) => versions.map((v) => x.resumo[v][k]);
  body += `<section><h2>Teste A/B: ${esc(versions.join(" × "))}</h2>
<p class="note">Mesma instância local, mesmo modelo executor, mesmo conteúdo da rodada e mesmas perguntas com RAG; o juiz corrigiu as versões às cegas.</p>
<div class="tiles">${versions.map((v) => `<div class="tile"><b>${f2(x.resumo[v].nota)}</b><span>nota média · ${esc(v)}</span></div>`).join("")}</div>
${bars({ title: "Qualidade e recuperação", series: versions, rows: [
    { label: "Respostas 5/5", values: R("nota5") },
    { label: "Respostas 4 ou 5", values: R("nota45") },
    { label: "Fatos completos", values: R("fatos") },
    { label: "Fonte certa recuperada", values: R("fonte") },
    { label: "Erro factual (precisão ≤ 2)", values: R("erroFactual") },
    { label: "Inventou", values: R("inventou") },
  ] })}
</section>`;
}
const e = emb.at(-1);
if (e) {
  const sets = Object.keys(e.documentos);
  body += `<section><h2>Recuperação isolada (${esc(e.modelo)}, ${esc(e.data)})</h2>
<p class="note">Base de documentos de teste, perguntas com gabarito de trecho; conjuntos separados de calibração e avaliação. Configuração atual × melhor da grade (escolhida só na calibração).</p>
${bars({ title: "Trecho certo entregue ao modelo", series: ["atual", "melhor da grade"], rows: sets.flatMap((s) => [
    { label: `Recall@1 · ${s}`, values: [e.documentos[s].atual.recall1, e.documentos[s].melhor.recall1] },
    { label: `Entregue · ${s}`, values: [e.documentos[s].atual.entregue, e.documentos[s].melhor.entregue] },
  ]) })}
</section>`;
}

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Avaliação da Kally</title>
<style>
:root{--surface:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--track:#ecebe7;--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#6250d6}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--surface:#1a1a19;--ink:#f0efec;--ink2:#c3c2b7;--track:#2a2a28;--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#9085e9}}
:root[data-theme="dark"]{--surface:#1a1a19;--ink:#f0efec;--ink2:#c3c2b7;--track:#2a2a28;--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#9085e9}
body{margin:0;background:var(--surface);color:var(--ink);font:15px/1.5 system-ui,sans-serif}
main{max-width:720px;margin:0 auto;padding:24px 16px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px}.note{color:var(--ink2);font-size:13px;margin:0 0 8px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:8px 0 12px}
.tile{border:1px solid var(--track);border-radius:8px;padding:10px}.tile b{display:block;font-size:22px}.tile span{color:var(--ink2);font-size:12px}
figure{margin:12px 0}figcaption{font-weight:600;font-size:14px}.legend{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--ink2);margin:4px 0}
.key i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.chart{width:100%;height:auto}.lbl{fill:var(--ink);font-size:12px}.val{fill:var(--ink2);font-size:12px}.track{fill:var(--track)}
.s1{fill:var(--s1);background:var(--s1)}.s2{fill:var(--s2);background:var(--s2)}.s3{fill:var(--s3);background:var(--s3)}.s4{fill:var(--s4);background:var(--s4)}
</style></head><body><main><h1>Avaliação da Kally</h1><p class="note">Gerado em ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC a partir dos resultados versionados em eval/.</p>${body}</main></body></html>`;
fs.writeFileSync(path.join(here, "painel.html"), html);
console.log(`Painel: ${path.relative(path.resolve(here, ".."), path.join(here, "painel.html"))} (${(html.length / 1024).toFixed(1)} KB)`);
