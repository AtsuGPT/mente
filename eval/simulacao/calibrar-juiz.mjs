// Calibração do juiz: consistência, concordância com as checagens objetivas e amostra para correção humana.
//
//   node eval/simulacao/calibrar-juiz.mjs analisar                 relatório em resultados/calibracao/relatorio.md
//   node eval/simulacao/calibrar-juiz.mjs amostra [n=20]           sorteia a amostra estratificada para uma pessoa
//   node eval/simulacao/calibrar-juiz.mjs comparar <notas-humanas.json>   concordância juiz × pessoa
//
// Fontes: todas as notas do juiz em resultados/ (rodada e testes A/B), com as respostas e os gabaritos.
// 1. Consistência: a mesma resposta (mesmo texto, mesma pergunta) corrigida mais de uma vez deve ter a mesma nota.
// 2. Concordância objetiva: nota de precisão do juiz × "fatos do gabarito presentes" (checagem sem juiz), nas
//    perguntas com resposta na base.
// 3. Correção humana: amostra estratificada pelas faixas de nota do juiz (0–1, 2, 3, 4, 5); a pessoa vê a pergunta,
//    o gabarito e a resposta, nunca a nota do juiz. Concordância: exata, ±1 e kappa de Cohen ponderado (quadrático).
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const res = path.join(here, "resultados");
const out = path.join(res, "calibracao");
fs.mkdirSync(out, { recursive: true });
const readJson = (f, fb = null) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : fb);
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const PROVA = readJson(path.join(here, "prova.json")).perguntas;
const [cmd, arg] = process.argv.slice(2);

// ---------- coleta: uma linha por (item corrigido) ----------
function collect() {
  const items = [];
  // rodada 1 em produção: prova (com/sem RAG) e interações
  for (const dir of fs.readdirSync(res).filter((d) => /^rodada-\d+$/.test(d))) {
    const notas = readJson(path.join(res, dir, "notas.json"), {});
    for (const a of readJson(path.join(res, dir, "prova.json"), [])) {
      const n = notas[`prova|${a.id}|${a.condicao}`];
      if (n) items.push({ origem: `${dir}/${a.condicao}`, qid: a.id, texto: a.texto, n });
    }
    const plan = readJson(path.join(here, "rodadas", `${dir}.json`), { acoes: [] }).acoes;
    for (const r of readJson(path.join(res, dir, "acoes.json"), [])) {
      const n = notas[`acao|${r.id}`];
      if (n && r.turnos) items.push({ origem: `${dir}/acao`, acao: r.id, pergunta: r.turnos.map((t) => t.mensagem).join("\n---\n"), gabarito: plan.find((p) => p.id === r.id)?.criterios ?? "", texto: r.turnos.map((t) => t.texto).join("\n---\n"), n });
    }
  }
  // testes A/B: só as notas dadas nesta folha (notas-juiz-sessao.json); as reaproveitadas de outra folha são cópias
  // e não contam como correção independente.
  for (const dir of fs.readdirSync(res).filter((d) => d.startsWith("ab-rodada-"))) {
    const notas = readJson(path.join(res, dir, "notas.json"), {});
    const chave = readJson(path.join(res, dir, "chave.json"), {});
    const dadas = new Set(Object.keys(readJson(path.join(res, dir, "notas-juiz-sessao.json"), {})).map((c) => chave[c]));
    for (const [key, n] of Object.entries(notas)) {
      if (!dadas.has(key)) continue;
      const [v, qid] = key.split("|");
      const a = readJson(path.join(res, `ab-${v}`, "rodada-01", "prova.json"), []).find((x) => x.id === qid && x.condicao === "com-rag");
      if (a) items.push({ origem: `${dir}/${v}`, qid, texto: a.texto, n });
    }
  }
  for (const it of items) {
    if (it.qid) {
      const q = PROVA.find((p) => p.id === it.qid);
      it.pergunta = q.pergunta;
      it.gabarito = q.resposta;
      it.q = q;
    }
    it.hash = createHash("sha1").update(`${it.qid ?? it.acao}\n${norm(it.texto).replace(/\s+/g, " ").trim()}`).digest("hex");
  }
  return items;
}

const NUMERIC = /^[\d.,%]+$/;
const hasTerm = (t, alts) => alts.split("|").some((alt) => {
  const x = norm(alt.trim());
  if (!NUMERIC.test(x)) return t.includes(x);
  return new RegExp(`(^|[^\\d,.])${x.replace(/[.%]/g, (c) => `\\${c}`)}($|[^\\d]|[.,](?!\\d))`).test(t);
});

function weightedKappa(a, b, k = 6) {
  const n = a.length;
  if (!n) return NaN;
  const O = Array.from({ length: k }, () => Array(k).fill(0));
  a.forEach((x, i) => O[x][b[i]]++);
  const ra = O.map((r) => r.reduce((s, v) => s + v, 0)), cb = O[0].map((_, j) => O.reduce((s, r) => s + r[j], 0));
  let num = 0, den = 0;
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
    const w = ((i - j) ** 2) / ((k - 1) ** 2);
    num += w * O[i][j];
    den += w * (ra[i] * cb[j]) / n;
  }
  return den ? 1 - num / den : NaN;
}
const pc = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : "—");
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2).replace(".", ",") : "—");

if (cmd === "analisar") {
  const items = collect();
  const L = [];
  const o = (s = "") => L.push(s);
  o("# Calibração do juiz");
  o();
  o(`${items.length} correções do juiz (rodada 1 em produção e testes A/B).`);
  o();
  // 1. consistência
  const groups = {};
  for (const it of items) (groups[it.hash] ??= []).push(it);
  const dup = Object.values(groups).filter((g) => g.length > 1);
  const pairs = dup.flatMap((g) => g.slice(1).map((x) => [g[0].n.nota, x.n.nota]));
  const same = pairs.filter(([x, y]) => x === y).length, near = pairs.filter(([x, y]) => Math.abs(x - y) <= 1).length;
  o("## 1. Consistência: a mesma resposta corrigida mais de uma vez");
  o();
  o(`- Respostas idênticas corrigidas em folhas diferentes: **${dup.length}** grupos, ${pairs.length} pares de notas`);
  o(`- Mesma nota: **${pc(same / pairs.length)}** · diferença de no máximo 1 ponto: **${pc(near / pairs.length)}** · kappa ponderado: **${f2(weightedKappa(pairs.map((p) => p[0]), pairs.map((p) => p[1])))}**`);
  const diverg = dup.filter((g) => new Set(g.map((x) => x.n.nota)).size > 1);
  if (diverg.length) {
    o();
    o("| Pergunta | Notas dadas | Origens |");
    o("|---|---|---|");
    for (const g of diverg) o(`| ${g[0].qid ?? g[0].acao}: ${(g[0].pergunta ?? "").slice(0, 60).replace(/\n/g, " ")} | ${g.map((x) => x.n.nota).join(", ")} | ${g.map((x) => x.origem).join("; ")} |`);
  }
  o();
  // 2. concordância objetiva
  const objective = items.filter((it) => it.q && it.q.fatos.length && !it.q.sondagem && it.q.categoria !== "armadilha");
  const rows = objective.map((it) => ({ fatos: it.q.fatos.every((f) => hasTerm(norm(it.texto), f)), precisao: it.n.precisao, nota: it.n.nota }));
  const agree = rows.filter((r) => (r.fatos ? r.precisao >= 4 : r.precisao <= 3)).length;
  o("## 2. Concordância com a checagem objetiva (fatos do gabarito presentes)");
  o();
  o(`- ${rows.length} respostas a perguntas com resposta na base.`);
  o(`- Fatos presentes e precisão do juiz ≥ 4: ${rows.filter((r) => r.fatos && r.precisao >= 4).length} · fatos presentes e precisão ≤ 3: ${rows.filter((r) => r.fatos && r.precisao <= 3).length}`);
  o(`- Fatos ausentes e precisão ≤ 3: ${rows.filter((r) => !r.fatos && r.precisao <= 3).length} · fatos ausentes e precisão ≥ 4: ${rows.filter((r) => !r.fatos && r.precisao >= 4).length}`);
  o(`- Concordância: **${pc(agree / rows.length)}**`);
  o(`- Nota média do juiz com os fatos presentes: ${f2(rows.filter((r) => r.fatos).reduce((s, r) => s + r.nota, 0) / rows.filter((r) => r.fatos).length)} · com os fatos ausentes: ${f2(rows.filter((r) => !r.fatos).reduce((s, r) => s + r.nota, 0) / (rows.filter((r) => !r.fatos).length || 1))}`);
  o();
  o("As discordâncias esperadas: fatos presentes com nota baixa quando a resposta também erra outra coisa (voz trocada, dado privado, invenção); fatos ausentes com nota alta quando a checagem por termos não reconhece uma forma equivalente.");
  o();
  // 3. resultado humano (se houver)
  const human = readJson(path.join(out, "comparacao.json"));
  if (human) {
    o("## 3. Juiz × correção humana");
    o();
    o(`- ${human.n} respostas · mesma nota: **${pc(human.exata)}** · diferença ≤ 1: **${pc(human.perto)}** · kappa ponderado: **${f2(human.kappa)}** · diferença média (juiz − pessoa): **${f2(human.vies)}**`);
    o();
  } else {
    o("## 3. Juiz × correção humana");
    o();
    o("Amostra sorteada em amostra-humana.json, aguardando a correção.");
    o();
  }
  fs.writeFileSync(path.join(out, "relatorio.md"), L.join("\n") + "\n");
  console.log(L.join("\n"));
} else if (cmd === "amostra") {
  const n = Number(arg) || 20;
  const items = collect();
  const seen = new Set();
  const unique = items.filter((it) => (seen.has(it.hash) ? false : seen.add(it.hash)));
  const bands = [[0, 1], [2, 2], [3, 3], [4, 4], [5, 5]];
  // Sorteio determinístico (semente fixa) para a amostra ser reproduzível.
  let seed = 20261108;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const pick = [];
  for (const [lo, hi] of bands) {
    const pool = unique.filter((it) => it.n.nota >= lo && it.n.nota <= hi).sort(() => rand() - 0.5);
    pick.push(...pool.slice(0, Math.ceil(n / bands.length)));
  }
  pick.sort(() => rand() - 0.5);
  const sample = pick.slice(0, n).map((it, i) => ({ codigo: `H${String(i + 1).padStart(2, "0")}`, pergunta: it.pergunta, criterios: it.gabarito, resposta: it.texto, _hash: it.hash }));
  const chave = Object.fromEntries(sample.map((s) => [s.codigo, { hash: s._hash, juiz: items.find((it) => it.hash === s._hash).n }]));
  fs.writeFileSync(path.join(out, "amostra-humana.json"), JSON.stringify(sample.map(({ _hash, ...rest }) => rest), null, 2));
  fs.writeFileSync(path.join(out, "chave-humana.json"), JSON.stringify(chave, null, 2));
  console.log(`${sample.length} respostas em ${path.relative(path.resolve(here, "../.."), path.join(out, "amostra-humana.json"))}`);
} else if (cmd === "comparar") {
  const chave = readJson(path.join(out, "chave-humana.json"));
  const humano = readJson(arg);
  const pairs = Object.entries(humano).filter(([c]) => chave[c]).map(([c, h]) => [chave[c].juiz.nota, Math.max(0, Math.min(5, Math.round(Number(h.nota ?? h))))]);
  const result = {
    n: pairs.length,
    exata: pairs.filter(([a, b]) => a === b).length / pairs.length,
    perto: pairs.filter(([a, b]) => Math.abs(a - b) <= 1).length / pairs.length,
    kappa: weightedKappa(pairs.map((p) => p[0]), pairs.map((p) => p[1])),
    vies: pairs.reduce((s, [a, b]) => s + (a - b), 0) / pairs.length,
    pares: Object.fromEntries(Object.entries(humano).filter(([c]) => chave[c]).map(([c, h]) => [c, { juiz: chave[c].juiz.nota, pessoa: Number(h.nota ?? h), comentario: h.comentario ?? "" }])),
  };
  fs.writeFileSync(path.join(out, "comparacao.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, pares: undefined }, null, 2));
} else {
  console.log("Comandos: analisar | amostra [n] | comparar <notas-humanas.json>");
}
