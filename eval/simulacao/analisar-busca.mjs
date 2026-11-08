// Análise da busca de posts e das regras de intenção com o conteúdo real de uma rodada da simulação.
//
//   npx tsx eval/simulacao/analisar-busca.mjs 1 [--url http://127.0.0.1:11434]
//
// 1. Regras de intenção: aplica detectIntent (src/server/kally.ts) e as regras de competência
//    (src/server/kally/pipeline.ts) às mensagens reais das personas e às perguntas da prova, na versão
//    atual e na proposta, e conta quantas pulam a memória (papo casual) ou caem na competência errada.
//    Inclui um conjunto de mensagens casuais de verdade, que devem continuar casuais.
// 2. Busca de posts: reconstrói os posts do ambiente (título, pastas, autor, texto), reproduz a nota de
//    kally-memory.ts (significado × weight + palavras × (1 − weight), corte 0,12, filtro de 0,4 na conversa)
//    com o qwen3-embedding real e mede, para cada pergunta da prova cuja fonte é um post, a posição e a nota
//    do post certo: com o texto indexado de hoje e com o nome do autor no texto indexado.
// As regras são cópias (os arquivos do servidor importam "server-only"); se mudarem lá, atualize aqui.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const [arg, ...rest] = process.argv.slice(2);
const n = Number(arg);
const opt = (name, fb) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : fb;
};
const URL_BASE = opt("url", "http://127.0.0.1:11434");
const pad = (x) => String(x).padStart(2, "0");
const dir = path.join(here, "resultados", `rodada-${pad(n)}`);
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const norm = (v) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");

// ---------- 1. regras de intenção ----------
const WANTS_MEMORY = /\b(meus?|minhas?|nossos?) (posts?|textos?|pensamentos?|ideias|rascunhos?|projetos?)\b|o que (eu )?(escrevi|publiquei|pensei)|\bno ambiente\b|\bnos (posts|pensamentos|textos)\b|\banalis|\brelacion|\bconect|\bresum/;
const REVISE_NOW = /\b(revis[ae]|revisar|revisão|corrij[ae]|corrigir|melhor[ae] (meu|este|esse) texto)\b/;
const IDEA = /(me ajud\w* a escrever|quero escrever|escrev(a|er|e) (um|o|uma) (post|texto|pensamento)|virar (um )?(post|pensamento)|\brascunho\b|transformar .{0,40}em (um )?(post|pensamento)|desenvolver (uma|essa|esta|minha) ideia|cri(e|a|ar) (um |o |uma )?(post|pensamento|publica)|\bpubli(que|car|ca)\b|\bpostar\b)/;
const LEARN = /(quero aprender|me ensin|aprender (sobre|a)|estudar (sobre)?|quero entender|me explica(r)? (passo|em etapas|do zero))/;
const GREETING = /^(oi|olá|ola|e aí|eai|bom dia|boa tarde|boa noite|tudo bem|valeu|obrigad|haha|kkk|rs\b|tô |to |estou |hoje |que dia|nossa|eita)/;
const ANALYSIS_NOW = /\banalis[ae]r?\b|\bcritique\b|\bcriticamente\b|\bavali(e|ar)\b|\bse sustenta\b|\besse argumento\b|\bplano de estudos?\b|\bcronograma de estudos?\b|\bme orient[ae]\b|\bpor onde come[çc]o\b|\bcomo (eu )?(organizo|estudo)\b/;

// Proposta (uma regra por vez, cada uma medida aqui):
//  P1 casual: sem "?" só é papo casual se for cumprimento/agradecimento ou não tiver nenhuma palavra de pergunta
//     ou de pedido (qual, quando, quanto, quem, onde, como, por que, me ajuda, explica, faz...).
const ASKS = /\b(qu[ae]l|quais|qu?ando|qnd|quant[oa]s?|quem|onde|como|por ?que|pq|o que|oq|me (ajud|diz|fala|explic|mostr|lembr|conta)|explic|faz|fa[cç]a|elabor|escrev|cri[ae]|organiz|revis|resum|monte|liste|calcul|precis|quero|queria|pode|consegue|tem |existe|lembra)/;
const casualNow = (m) => !WANTS_MEMORY.test(m) && m.length < 160 && (GREETING.test(m) || !m.includes("?"));
const casualNew = (m) => !WANTS_MEMORY.test(m) && m.length < 160 && ((GREETING.test(m) && !ASKS.test(m.replace(GREETING, ""))) || (!m.includes("?") && !ASKS.test(m)));
//  P2 análise: plano de estudo, cronograma, "me oriente", "por onde começo" e "como organizo/estudo" pedem orientação,
//     não crítica de argumento; saem da regra de análise (ficam com a competência padrão da conversa).
const ANALYSIS_NEW = /\banalis[ae]r?\b|\bcritique\b|\bcriticamente\b|\bavali(e|ar)\b|\bse sustenta\b|\besse argumento\b/;
//  P3 revisar: "revisão" como substantivo ("a revisão dele", "revisão de literatura") não é pedido de revisão.
const REVISE_NEW = /\b(revis[ae] |revisar|corrij[ae]|corrigir|melhor[ae] (meu|este|esse) texto|(faz|fa[cç]a|faça) uma revisão)/;

function intent(m, version) {
  const t = m.toLowerCase();
  const revise = version === "nova" ? REVISE_NEW : REVISE_NOW;
  if (revise.test(t)) return "revisar";
  if (IDEA.test(t)) return "ideia";
  if (LEARN.test(t)) return "aprender";
  const casual = version === "nova" ? casualNew(t) : casualNow(t);
  const analysis = (version === "nova" ? ANALYSIS_NEW : ANALYSIS_NOW).test(t);
  return casual ? "casual" : analysis ? "analise" : "chat";
}

const plan = readJson(path.join(here, "rodadas", `rodada-${pad(n)}.json`)).acoes;
const prova = readJson(path.join(here, "prova.json")).perguntas;
const messages = [
  ...plan.filter((a) => a.mensagem).map((a) => ({ id: a.id, texto: a.mensagem, esperado: a.tipo === "kally_post" ? "ideia" : a.expectativa ?? null })),
  ...prova.map((q) => ({ id: q.id, texto: q.pergunta, esperado: "busca" })),
];
const REAL_CASUAL = ["oi", "oi kally", "bom dia!", "boa noite, kally", "valeu", "obrigada!", "kkkk", "tudo bem?", "hoje tô cansado", "nossa, que dia", "eita", "obrigado pela ajuda"];
const out = [];
const o = (s = "") => out.push(s);
o(`# Análise da busca e das intenções: rodada ${n}`);
o();
o("## 1. Regras de intenção (mensagens reais da rodada e da prova)");
o();
const rows = messages.map((m) => ({ ...m, atual: intent(m.texto, "atual"), nova: intent(m.texto, "nova") }));
const provaRows = rows.filter((r) => r.esperado === "busca");
const skipNow = provaRows.filter((r) => r.atual === "casual");
const skipNew = provaRows.filter((r) => r.nova === "casual");
o(`- Perguntas da prova tratadas como papo casual (sem memória nem documentos): **${skipNow.length}/${provaRows.length}** hoje → **${skipNew.length}/${provaRows.length}** com P1`);
if (skipNow.length) o(`  - Hoje: ${skipNow.map((r) => r.id).join(", ")}`);
if (skipNew.length) o(`  - Com P1: ${skipNew.map((r) => r.id).join(", ")}`);
const casualKept = REAL_CASUAL.filter((m) => intent(m, "nova") === "casual");
o(`- Mensagens casuais de verdade que continuam casuais com P1: **${casualKept.length}/${REAL_CASUAL.length}**${casualKept.length < REAL_CASUAL.length ? ` (deixam de ser: ${REAL_CASUAL.filter((m) => intent(m, "nova") !== "casual").map((m) => `"${m}"`).join(", ")})` : ""}`);
o();
o("| Mensagem | Hoje | Proposta |");
o("|---|---|---|");
for (const r of rows.filter((x) => x.atual !== x.nova)) o(`| ${r.id}: ${r.texto.slice(0, 90).replace(/\n/g, " ").replace(/\|/g, "/")} | ${r.atual} | ${r.nova} |`);
o();

// ---------- 2. busca de posts ----------
const state = readJson(path.join(here, ".estado.json"));
const personas = readJson(path.join(here, "personas.json")).personas;
const acoes = readJson(path.join(dir, "acoes.json"));
const posts = [];
for (const a of plan) {
  const rec = acoes.find((r) => r.id === a.id);
  const st = state.posts[a.id];
  if (!st) continue;
  const autor = a.quem === "coord" ? "Coordenação do Treinamento" : personas.find((p) => p.id === a.quem).nome;
  let titulo = st.titulo, texto = "", pasta = a.pasta;
  if (a.tipo === "post") texto = a.texto;
  else if (a.tipo === "kally_post") texto = rec?.conteudo ?? "";
  else if (a.tipo === "documento") {
    const raw = fs.readFileSync(path.join(here, "documentos", a.arquivo), "utf8");
    texto = raw.replace(/^#\s+.+\n+/, "").replace(/^Documento institucional fictício.*\n+/m, "");
    pasta = "Guia";
  }
  posts.push({ key: a.id, titulo, texto, pasta, autor });
}
const stripMd = (t) => t.replace(/[#*_`>]/g, "").replace(/\[(.*?)\]\(.*?\)/g, "$1");
// O servidor (src/lib/text.ts stripMarkdown) junta todo o texto numa linha só; COLLAPSE reproduz isso.
let COLLAPSE = true;
const serverStrip = (t) => t.replace(/^\s{0,3}#{1,6}\s+/gm, "").replace(/^\s*[-*+]\s+/gm, "").replace(/^\s*\d+\.\s+/gm, "").replace(/(\*\*|__)(.*?)\1/g, "$2").replace(/\s+/g, " ").trim();
const lineStrip = (t) => t.split(/\n+/).map(serverStrip).filter(Boolean).join("\n");
// O servidor não põe o autor no texto indexado: ele só conta nas palavras (kally-memory.ts). AUTHOR_TEXT = false
// reproduz isso; as variantes antigas (true) ficam como registro do que foi medido antes.
let AUTHOR_TEXT = true;
const docText = (p, withAuthor) => [p.titulo, p.pasta, ...(withAuthor && AUTHOR_TEXT ? [`Autor: ${p.autor}`] : []), COLLAPSE ? serverStrip(p.texto) : lineStrip(p.texto)].join("\n");
let CHUNK_SIZE = 900;
function chunks(text, size = CHUNK_SIZE) {
  const parts = [];
  let cur = "";
  for (const par of text.split(/\n+/)) {
    if ((cur + "\n" + par).length > size && cur) {
      parts.push(cur.trim());
      cur = "";
    }
    cur += `\n${par}`;
    while (cur.length > size * 1.5) {
      parts.push(cur.slice(0, size).trim());
      cur = cur.slice(size);
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts.slice(0, 12);
}
const cacheFile = path.join(root, ".cache/eval-embeddings/qwen3-embedding_0.6b.json");
const cache = fs.existsSync(cacheFile) ? readJson(cacheFile) : {};
const keyOf = (t) => createHash("sha1").update(t).digest("hex");
const QUERY = "Instruct: Given a search query in Portuguese, retrieve relevant passages that answer the query\nQuery: ";
async function embed(texts) {
  const missing = [...new Set(texts.filter((t) => !cache[keyOf(t)]))];
  for (let i = 0; i < missing.length; i += 16) {
    const batch = missing.slice(i, i + 16);
    const r = await fetch(`${URL_BASE}/api/embed`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "qwen3-embedding:0.6b", input: batch, options: { num_ctx: 2048, num_gpu: 0 } }) });
    if (!r.ok) throw new Error(`Ollama ${r.status}`);
    (await r.json()).embeddings.forEach((v, j) => (cache[keyOf(batch[j])] = v));
  }
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(cache));
  return texts.map((t) => cache[keyOf(t)]);
}
const cos = (a, b) => {
  let d = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i];
    x += a[i] * a[i];
    y += b[i] * b[i];
  }
  return d / Math.sqrt(x * y);
};
const STOP = new Set("a as o os um uma uns umas de da do das dos em no na nos nas por para com sem que qual quais como porque sobre isso este esta esse essa me mim eu voce ele ela eles elas ou mas ao aos ser ter faz fazer pensamento pensamentos post posts escreveu escrevi publicou kally algum alguma tem existe quero aprender explique explica fale sei tudo bem conta conte ola obrigado obrigada beleza rapida rapido favor pode voces gente coisa algo curiosidade".split(" "));
const terms = (t) => [...new Set(norm(t).match(/[\p{L}\p{N}]{3,}/gu) ?? [])].filter((x) => !STOP.has(x)).slice(0, 12);

async function rank(withAuthor, questions, authorWeight = 1, catWeight = 3) {
  const prepared = posts.map((p) => ({ ...p, parts: chunks(docText(p, withAuthor)) }));
  const vecs = await embed(prepared.flatMap((p) => p.parts));
  let k = 0;
  for (const p of prepared) p.vecs = p.parts.map(() => vecs[k++]);
  const qv = await embed(questions.map((q) => QUERY + q.pergunta));
  return questions.map((q, i) => {
    const words = terms(q.pergunta);
    const scored = prepared.map((p) => {
      const best = Math.max(...p.vecs.map((v) => cos(qv[i], v)));
      const title = norm(p.titulo), cat = norm(p.pasta), text = norm(p.texto), author = norm(p.autor);
      let lex = 0;
      for (const w of words) lex += (title.includes(w) ? 5 : 0) + (cat.includes(w) ? catWeight : 0) + (text.includes(w) ? 1 : 0) + (withAuthor && author.split(/\s+/).includes(w) ? authorWeight : 0);
      const meaning = best >= 0.4 ? Math.min((best - 0.3) / 0.3, 1) : 0;
      const named = author.split(/\s+/).some((w) => w.length >= 3 && new RegExp(`\\b${w}\\b`).test(norm(q.pergunta)));
      return { key: p.key, best, named, score: meaning * 0.7 + Math.min(lex / 8, 1) * 0.3 };
    }).sort((a, b) => b.score - a.score);
    const target = q.fonte.acao ?? Object.entries(state.posts).find(([, v]) => v.titulo === state.fontes[q.fonte.fato]?.titulo)?.[0];
    const pos = scored.findIndex((s) => s.key === target);
    return { q, target, pos, hit: scored[pos], scored };
  });
}

const postQuestions = prova.filter((q) => q.fonte && (q.fonte.acao || state.fontes[q.fonte.fato]?.tipo === "post") && (q.categoria === "nucleo" ? q.inicio <= n : q.rodada === n));
const now = await rank(false, postQuestions);
const withA = await rank(true, postQuestions);
o("## 2. Busca de posts com o conteúdo real do ambiente");
o();
o(`${posts.length} posts reconstruídos; ${postQuestions.length} perguntas da prova cuja fonte é um post. "Passa no chat": nota ≥ 0,4, o filtro da rota no modo conversa.`);
o();
o("| Pergunta | Quem | Hoje: posição / nota / cosseno | Passa no chat | Com o autor indexado: posição / nota | Passa no chat |");
o("|---|---|---|---|---|---|");
const fmt = (r) => (r.pos >= 0 ? `${r.pos + 1}º / ${r.hit.score.toFixed(2)} / ${r.hit.best.toFixed(2)}` : "—");
for (let i = 0; i < now.length; i++) o(`| ${now[i].q.id}: ${now[i].q.pergunta.slice(0, 60)} | ${now[i].q.quem} | ${fmt(now[i])} | ${now[i].hit?.score >= 0.4 ? "sim" : "não"} | ${withA[i].pos >= 0 ? `${withA[i].pos + 1}º / ${withA[i].hit.score.toFixed(2)}` : "—"} | ${withA[i].hit?.score >= 0.4 ? "sim" : "não"} |`);
const share = (rs, f) => rs.filter(f).length;
o();
// Variantes com ruído: posts errados que passam no filtro e posts que passam em perguntas sem post-fonte.
const traps = prova.filter((q) => q.categoria !== "nucleo" ? q.rodada === n : q.inicio <= n).filter((q) => !postQuestions.includes(q));
const variants = [["hoje", false, 1], ["autor no texto (1 ponto)", true, 1], ["autor com peso de título (5 pontos)", true, 5], ["autor 5 pontos + pasta 1 ponto", true, 5, 1], ["autor 5 + pasta 1 + parágrafos preservados", true, 5, 1, false], ["servidor atual (autor só nas palavras, trechos de 900)", true, 5, 1, false, 900, false], ["servidor atual + trechos de 600", true, 5, 1, false, 600, false], ["servidor atual + trechos de 450", true, 5, 1, false, 450, false], ["servidor atual + trechos de 300", true, 5, 1, false, 300, false]];
o();
o("### Variantes (uma mudança por vez) × filtro da conversa");
o();
o("| Variante | Filtro | Post certo em 1º | Post certo passa | Posts errados que passam (média) | Perguntas sem post-fonte que trazem algum post |");
o("|---|---|---|---|---|---|");
const detail = [];
for (const [name, wa, aw, cw = 3, collapse = true, size = 900, authorText = true] of variants) {
  COLLAPSE = collapse;
  CHUNK_SIZE = size;
  AUTHOR_TEXT = authorText;
  const rs = await rank(wa, postQuestions, aw, cw);
  const ts = await rank(wa, traps.map((q) => ({ ...q, fonte: { acao: "__nenhum__" } })), aw, cw);
  for (const f of [0.4, 0.3, "0,4 (0,2 se o autor é citado)"]) {
    const thr = (x) => (typeof f === "number" ? f : x.named ? 0.2 : 0.4);
    const noise = rs.reduce((acc, r) => acc + r.scored.filter((x) => x.key !== r.target && x.score >= thr(x)).length, 0) / rs.length;
    if (name.startsWith("servidor")) detail.push([name, f, rs.filter((r) => !(r.hit && r.hit.score >= thr(r.hit))).map((r) => `${r.q.id} (${r.pos + 1}º, ${r.hit ? r.hit.score.toFixed(2) : "—"})`).join(", ") || "nenhuma"]);
    o(`| ${name} | ${f} | ${share(rs, (r) => r.pos === 0)}/${rs.length} | ${share(rs, (r) => r.hit && r.hit.score >= thr(r.hit))}/${rs.length} | ${noise.toFixed(2)} | ${share(ts, (r) => r.scored.some((x) => x.score >= thr(x)))}/${ts.length} |`);
  }
}
CHUNK_SIZE = 900;
AUTHOR_TEXT = true;
o();
o("Perguntas cujo post certo não passa no filtro, por variante:");
o();
for (const [name, f, list] of detail) o(`- ${name}, filtro ${f}: ${list}`);
o();
o(`- Post certo em 1º: hoje **${share(now, (r) => r.pos === 0)}/${now.length}**, com o autor **${share(withA, (r) => r.pos === 0)}/${withA.length}**`);
o(`- Post certo passa no filtro do chat (≥ 0,4): hoje **${share(now, (r) => r.hit?.score >= 0.4)}/${now.length}**, com o autor **${share(withA, (r) => r.hit?.score >= 0.4)}/${withA.length}**`);
o();
const report = out.join("\n") + "\n";
fs.writeFileSync(path.join(dir, "analise-busca.md"), report);
console.log(report);
