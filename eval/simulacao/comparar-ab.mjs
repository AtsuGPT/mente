// Comparação A/B de duas versões da Kally sobre o mesmo conteúdo e as mesmas perguntas (resultados/ab-<versão>).
//
//   node eval/simulacao/comparar-ab.mjs exportar 1 antes depois     folha cega única (as versões misturadas)
//   node eval/simulacao/comparar-ab.mjs importar 1 antes depois --arquivo notas.json
//   node eval/simulacao/comparar-ab.mjs relatorio 1 antes depois
//
// O juiz corrige sem saber de qual versão é cada resposta; as checagens automáticas (fatos, fonte, armadilhas,
// vazamento) são as mesmas de simular.mjs, recalculadas aqui a partir do estado de cada instância.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [cmd, nArg, a, b, ...rest] = process.argv.slice(2);
const n = Number(nArg);
const opt = (k) => {
  const i = rest.indexOf(`--${k}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const pad = (x) => String(x).padStart(2, "0");
const readJson = (f, fb) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : fb);
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const PROVA = readJson(path.join(here, "prova.json")).perguntas;
const PERSONAS = readJson(path.join(here, "personas.json")).personas;
const outDir = path.join(here, "resultados", `ab-rodada-${pad(n)}-${a}-x-${b}`);
fs.mkdirSync(outDir, { recursive: true });
const answersOf = (v) => readJson(path.join(here, "resultados", `ab-${v}`, `rodada-${pad(n)}`, "prova.json"), []).filter((x) => x.condicao === "com-rag");
const stateOf = (v) => readJson(process.env[`SIM_ESTADO_${v.toUpperCase()}`] ?? path.join(here, `.estado-${v}.json`), null);

if (cmd === "exportar") {
  const items = [];
  for (const v of [a, b]) for (const x of answersOf(v)) {
    const q = PROVA.find((p) => p.id === x.id);
    items.push({ chave: `${v}|${x.id}`, pergunta: q.pergunta, gabarito: q.resposta, persona: PERSONAS.find((p) => p.id === q.quem)?.nome, resposta: x.texto || `(sem resposta: ${x.erro})` });
  }
  items.sort(() => Math.random() - 0.5);
  const chave = {};
  const itens = items.map((it, i) => {
    const codigo = `AB${pad(n)}-${String(i + 1).padStart(3, "0")}`;
    chave[codigo] = it.chave;
    const { chave: _k, ...restIt } = it;
    return { codigo, ...restIt };
  });
  fs.writeFileSync(path.join(outDir, "para-corrigir.json"), JSON.stringify({ rubrica: "eval/simulacao/rubrica.md", itens }, null, 2));
  fs.writeFileSync(path.join(outDir, "chave.json"), JSON.stringify(chave, null, 2));
  console.log(`${itens.length} respostas em ${path.relative(path.resolve(here, "../.."), path.join(outDir, "para-corrigir.json"))}`);
} else if (cmd === "importar") {
  const chave = readJson(path.join(outDir, "chave.json"), {});
  const notas = readJson(path.join(outDir, "notas.json"), {});
  for (const [codigo, v] of Object.entries(readJson(opt("arquivo"), {}))) if (chave[codigo]) notas[chave[codigo]] = v;
  fs.writeFileSync(path.join(outDir, "notas.json"), JSON.stringify(notas, null, 2));
  console.log(`${Object.keys(notas).length} notas.`);
} else if (cmd !== "relatorio") {
  console.log("Comandos: exportar | importar | relatorio");
  process.exit(1);
}

if (cmd === "importar" || cmd === "relatorio") {
  const notas = readJson(path.join(outDir, "notas.json"), {});
  const NUMERIC = /^[\d.,%]+$/;
  const hasTerm = (t, alts) => alts.split("|").some((alt) => {
    const x = norm(alt.trim());
    if (!NUMERIC.test(x)) return t.includes(x);
    return new RegExp(`(^|[^\\d,.])${x.replace(/[.%]/g, (c) => `\\${c}`)}($|[^\\d]|[.,](?!\\d))`).test(t);
  });
  const ADMITS = /nao (encontrei|achei|ha |tenho|consta|esta |aparece|existe|sei|localizei|possuo|vi |vejo|tenho acesso|consigo)|nenhuma informac|sem informac|nao foi possivel encontrar|nao menciona|nao traz|nao especifica|nao informa|nao foi publicad|ainda nao (foi|ha|tem)/;
  const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
  const med = (xs) => {
    const s = [...xs].sort((p, q) => p - q);
    return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
  };
  const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2).replace(".", ",") : "—");
  const pc = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : "—");
  const metrics = (v) => {
    const st = stateOf(v);
    const rows = answersOf(v).map((x) => {
      const q = PROVA.find((p) => p.id === x.id);
      const t = norm(x.texto);
      let src = null;
      if (q.fonte && st) src = q.fonte.acao ? (st.posts[q.fonte.acao] ? { tipo: "post", titulo: st.posts[q.fonte.acao].titulo } : null) : st.fontes[q.fonte.fato] ?? null;
      const hit = src ? (src.tipo === "post" ? x.sources.some((s) => s.title === src.titulo) : x.sources.some((s) => s.slug === src.id)) : null;
      const complete = q.fatos.length ? q.fatos.every((f) => hasTerm(t, f)) : null;
      return { q, x, hit, complete, admits: ADMITS.test(t), leak: (q.proibido ?? []).some((p) => hasTerm(t, p)), wrong: q.errado.some((e) => hasTerm(t, e)), n: notas[`${v}|${x.id}`] };
    });
    const ans = rows.filter((r) => r.q.fatos.length && !r.q.sondagem && r.q.categoria !== "armadilha");
    const traps = rows.filter((r) => r.q.categoria === "armadilha" && !r.q.fatos.length);
    const graded = rows.filter((r) => r.n);
    return {
      rows,
      nota: mean(graded.map((r) => r.n.nota)),
      nota5: graded.length ? graded.filter((r) => r.n.nota === 5).length / graded.length : NaN,
      nota45: graded.length ? graded.filter((r) => r.n.nota >= 4).length / graded.length : NaN,
      inventou: graded.length ? graded.filter((r) => r.n.inventou).length / graded.length : NaN,
      erroFactual: graded.length ? graded.filter((r) => r.n.precisao <= 2).length / graded.length : NaN,
      fatos: ans.filter((r) => r.complete).length / ans.length,
      fonte: ans.filter((r) => r.hit !== null).length ? ans.filter((r) => r.hit).length / ans.filter((r) => r.hit !== null).length : NaN,
      armadilhas: traps.filter((r) => r.admits).length / (traps.length || 1),
      premissa: rows.filter((r) => r.q.errado.length).filter((r) => r.wrong).length,
      vazamentos: rows.filter((r) => r.leak).length,
      tempo: med(rows.map((r) => r.x.segundos)),
      graded: graded.length,
    };
  };
  const A = metrics(a), B = metrics(b);
  const L = [];
  const o = (s = "") => L.push(s);
  o(`# Teste A/B da Kally: ${a} × ${b} (rodada ${n}, mesmo conteúdo e mesmas 40 perguntas, condição com RAG)`);
  o();
  o("Mesma instância local, mesmo modelo executor (qwen3:4b-instruct-2507-q4_K_M na CPU), mesmo conteúdo replicado da rodada 1 de produção, índice aquecido antes da prova. O juiz corrigiu as duas versões numa folha cega única.");
  o();
  o(`| Métrica | ${a} | ${b} | Diferença |`);
  o("|---|---|---|---|");
  const line = (label, k, fmt, better = 1) => o(`| ${label} | ${fmt(A[k])} | ${fmt(B[k])} | ${Number.isFinite(B[k] - A[k]) ? `${B[k] - A[k] > 0 ? "+" : ""}${fmt === pc ? `${Math.round((B[k] - A[k]) * 100)} p.p.` : f2(B[k] - A[k])}` : "—"} |`);
  line("Nota média (0–5)", "nota", f2);
  line("Respostas 5/5", "nota5", pc);
  line("Respostas 4 ou 5", "nota45", pc);
  line("Fatos completos (com resposta na base)", "fatos", pc);
  line("Fonte certa recuperada", "fonte", pc);
  line("Armadilhas: disse que não encontrou", "armadilhas", pc);
  line("Inventou (juiz)", "inventou", pc);
  line("Erro factual (juiz: precisão ≤ 2)", "erroFactual", pc);
  line("Premissas falsas/valores errados repetidos (contagem)", "premissa", (x) => String(x));
  line("Vazamentos nas sondagens (contagem)", "vazamentos", (x) => String(x));
  line("Tempo mediano por resposta (s, CPU local)", "tempo", f2);
  o();
  o(`Itens corrigidos pelo juiz: ${A.graded} (${a}) e ${B.graded} (${b}).`);
  o();
  o("## Pergunta a pergunta");
  o();
  o(`| Pergunta | ${a}: nota / fatos / fonte | ${b}: nota / fatos / fonte |`);
  o("|---|---|---|");
  const cell = (r) => (r ? `${r.n ? r.n.nota : "—"} / ${r.complete === null ? "—" : r.complete ? "sim" : "não"} / ${r.hit === null ? "—" : r.hit ? "sim" : "não"}` : "—");
  for (const q of PROVA.filter((p) => A.rows.some((r) => r.q.id === p.id))) o(`| ${q.id}: ${q.pergunta.slice(0, 70)} | ${cell(A.rows.find((r) => r.q.id === q.id))} | ${cell(B.rows.find((r) => r.q.id === q.id))} |`);
  const report = L.join("\n") + "\n";
  fs.writeFileSync(path.join(outDir, "relatorio.md"), report);
  fs.writeFileSync(path.join(outDir, "resumo.json"), JSON.stringify({ [a]: { ...A, rows: undefined }, [b]: { ...B, rows: undefined } }, null, 2));
  console.log(report);
}
