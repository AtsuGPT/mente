// Avaliação da recuperação da Kally (embeddings, trechos, limiares), com conjuntos separados.
//
//   npx tsx eval/embeddings/medir.mjs [opções]     (ou node, com Node 22.18 ou mais novo)
//
// Opções:
//   --url http://localhost:11434    Ollama (padrão: OLLAMA_BASE_URL ou o Ollama local)
//   --modelo qwen3-embedding:0.6b   modelo de embeddings (padrão: AI_EMBED_MODEL ou o da Kally)
//   --tamanhos 600,900,1100,1400    tamanhos de trecho da base de documentos (1100 é o atual)
//   --overlaps 0,150,300            sobreposição entre trechos vizinhos, em caracteres (hoje: 0)
//   --validacao                     mede também o conjunto de validação (só no fim, uma vez)
//   --falso                         embedding falso (trigramas): só testa o encadeamento; nada é gravado
//
// Três partes:
//  A. Base de documentos (src/server/kally/documents.ts): mesma divisão em trechos (chunks.ts), mesma pontuação
//     de searchDocuments (corte = min + 0,05; palavras somam até 0,04; máx. 3 trechos por documento; 4 no total).
//     Grade: tamanho × overlap × corte × peso das palavras × limite. A configuração é escolhida no conjunto de
//     CALIBRAÇÃO e medida no de AVALIAÇÃO, ao lado da atual: assim a melhora não é ajuste à própria prova.
//  B. Memória de posts (src/server/kally-memory.ts): cada documento faz o papel de um post (título = 1º "# ").
//     Mesma divisão (CHUNK, por parágrafo) e mesma nota: significado × weight + palavras × (1 − weight), corte
//     de 0,12 e o filtro da conversa (≥ 0,4) da rota da Kally. Grade: weight × min. Não modela o empurrão por
//     pasta/link (os documentos não têm pastas nem links).
//  C. Distribuições de cosseno (gabarito × melhor errado × sem resposta), latência e memória.
// Os parâmetros atuais são lidos do código-fonte (não copiados). Vetores em .cache/eval-embeddings/ (fora do Git).
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { normalizeText, queryTerms, scoreChunk, splitIntoChunks } from "../../src/server/kally/chunks.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const FAKE = args.includes("--falso");
const WITH_VALIDATION = args.includes("--validacao");
const URL_BASE = opt("url", process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
const MODEL = FAKE ? "falso-trigramas" : opt("modelo", process.env.AI_EMBED_MODEL || "qwen3-embedding:0.6b");
const list = (name, fallback) => opt(name, fallback).split(",").map(Number).filter((n) => Number.isFinite(n));

// ---------- parâmetros atuais, lidos do código ----------
const src = (f) => fs.readFileSync(path.join(root, f), "utf8");
function readProfile(model) {
  const ai = src("src/server/ai.ts");
  const key = model.includes(":") ? model : `${model}:latest`;
  const block = new RegExp(`"${key.replace(/[.:]/g, (c) => `\\${c}`)}":\\s*\\{([\\s\\S]*?)\\n?\\s*\\},?\\n`).exec(ai)?.[1] ?? new RegExp(`"${key.replace(/[.:]/g, (c) => `\\${c}`)}":\\s*\\{([^}]*)\\}`).exec(ai)?.[1];
  const qwen = /"qwen3-embedding:0\.6b":\s*\{([\s\S]*?)\n\s*\},/.exec(ai)?.[1] ?? "";
  const from = block ?? qwen;
  const num = (k) => Number(new RegExp(`${k}:\\s*([\\d.]+)`).exec(from)?.[1]);
  const str = (k) => {
    const m = new RegExp(`${k}:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
    return m ? JSON.parse(`"${m[1]}"`) : "";
  };
  const profile = { query: block ? str("query") : "", document: block ? str("document") : "", floor: num("floor"), min: num("min"), span: num("span"), weight: num("weight"), conversationMin: num("conversationMin") };
  if (![profile.floor, profile.min, profile.span, profile.weight].every(Number.isFinite)) throw new Error("Não consegui ler o perfil de embeddings em src/server/ai.ts (EMBED_PROFILES).");
  return { ...profile, medido: !!block };
}
const PROFILE = readProfile(MODEL === "falso-trigramas" ? "qwen3-embedding:0.6b" : MODEL);
if (FAKE) PROFILE.query = PROFILE.document = "";
const CURRENT = {
  docChunk: Number(/const CHUNK_CHARS = ([\d_]+)/.exec(src("src/server/kally/documents.ts"))[1].replace(/_/g, "")),
  postChunk: Number(/const CHUNK = (\d+)/.exec(src("src/server/kally-memory.ts"))[1]),
  cutoff: Math.round((PROFILE.min + 0.05) * 1000) / 1000,
  lexWeight: 0.04,
  limit: 4,
  perDoc: 3,
  overlap: 0,
};
const SIZES = list("tamanhos", `600,900,${CURRENT.docChunk},1400`);
const OVERLAPS = list("overlaps", "0,150,300");

// ---------- corpus e perguntas ----------
const DOC_DIRS = [path.join(root, "eval/kally/documentos"), path.join(here, "corpus")];
const docs = DOC_DIRS.flatMap((dir) => fs.readdirSync(dir).filter((f) => /\.(md|txt)$/i.test(f)).map((file) => ({ file, text: fs.readFileSync(path.join(dir, file), "utf8") })));
const { perguntas } = JSON.parse(fs.readFileSync(path.join(here, "perguntas.json"), "utf8"));
for (const q of perguntas) {
  if (!q.conjunto) throw new Error(`${q.id}: sem conjunto`);
  if (!q.documento) continue;
  const doc = docs.find((d) => d.file === q.documento);
  if (!doc) throw new Error(`${q.id}: documento ${q.documento} não existe`);
  for (const t of q.trechos) if (!normalizeText(doc.text).includes(normalizeText(t))) throw new Error(`${q.id}: trecho "${t}" não está em ${q.documento}`);
}
const SETS = ["calibracao", "avaliacao", ...(WITH_VALIDATION ? ["validacao"] : [])];

// ---------- embeddings (com cache) ----------
const cacheDir = path.join(root, ".cache/eval-embeddings");
const cacheFile = path.join(cacheDir, `${MODEL.replace(/[^a-z0-9.-]/gi, "_")}.json`);
const cache = FAKE ? {} : fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, "utf8")) : {};
const keyOf = (t) => createHash("sha1").update(t).digest("hex");
const timing = { embedMs: 0, embedded: 0 };
function fakeVector(text) {
  const v = new Float32Array(512);
  for (const w of normalizeText(text).match(/[\p{L}\p{N}]+/gu) ?? []) {
    const padded = ` ${w} `;
    for (let i = 0; i + 3 <= padded.length; i++) v[createHash("md5").update(padded.slice(i, i + 3)).digest().readUInt16LE(0) % 512] += 1;
  }
  return Array.from(v);
}
async function embedAll(texts) {
  const missing = [...new Set(texts.filter((t) => !cache[keyOf(t)]))];
  for (let i = 0; i < missing.length; i += 16) {
    const batch = missing.slice(i, i + 16);
    const started = performance.now();
    let vectors;
    if (FAKE) vectors = batch.map(fakeVector);
    else {
      const r = await fetch(`${URL_BASE}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, input: batch, keep_alive: "30m", options: { num_ctx: 2048, num_gpu: 0 } }),
      }).catch((e) => {
        throw new Error(`Não consegui falar com o Ollama em ${URL_BASE} (${e.message}). Use --url ou --falso.`);
      });
      if (!r.ok) throw new Error(`Ollama respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
      vectors = (await r.json()).embeddings;
    }
    timing.embedMs += performance.now() - started;
    timing.embedded += batch.length;
    batch.forEach((t, j) => (cache[keyOf(t)] = vectors[j]));
  }
  return texts.map((t) => cache[keyOf(t)]);
}
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

// ---------- estatística ----------
const pct = (v, p) => {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  return s[Math.floor(i)] + (s[Math.ceil(i)] - s[Math.floor(i)]) * (i - Math.floor(i));
};
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const f2 = (n) => (Number.isFinite(n) ? n.toFixed(2) : "—");
const f3 = (n) => (Number.isFinite(n) ? n.toFixed(3) : "—");
const pc = (n) => (Number.isFinite(n) ? `${Math.round(n * 100)}%` : "—");

// ---------- A. base de documentos ----------
// Overlap: cada trecho (a partir do 2º) começa com o fim do anterior, cortado no começo de uma palavra.
function withOverlap(chunks, overlap) {
  if (!overlap) return chunks;
  return chunks.map((c, i) => {
    if (i === 0) return c;
    const tail = chunks[i - 1].slice(-overlap);
    const start = tail.search(/\s/);
    return `${start >= 0 ? tail.slice(start + 1) : tail}\n\n${c}`;
  });
}
const goldOf = (q, doc, text) => !!q.documento && doc === q.documento && q.trechos.some((t) => normalizeText(text).includes(normalizeText(t)));

async function buildIndex(size, overlap) {
  const chunks = docs.flatMap((d) => withOverlap(splitIntoChunks([{ label: "texto", text: d.text }], size).map((c) => c.text), overlap).map((text) => ({ doc: d.file, text })));
  const vectors = await embedAll(chunks.map((c) => PROFILE.document + c.text));
  chunks.forEach((c, i) => (c.vector = vectors[i]));
  return chunks;
}

function scoreQuestions(chunks, qv) {
  const searchStarted = performance.now();
  const rows = perguntas.map((q) => {
    const terms = queryTerms(q.pergunta);
    const scored = chunks.map((c) => ({ doc: c.doc, cos: cosine(qv.get(q.id), c.vector), lexical: Math.min(scoreChunk(c.text, terms) / 10, 1), gold: goldOf(q, c.doc, c.text) }));
    const ranked = [...scored].sort((a, b) => b.cos - a.cos);
    const goldRank = ranked.findIndex((s) => s.gold);
    return { q, scored, ranked, goldRank, goldCos: goldRank >= 0 ? ranked[goldRank].cos : NaN };
  });
  return { rows, searchMsPerQuery: (performance.now() - searchStarted) / perguntas.length };
}

function pipeline(row, { cutoff, lexWeight, limit, perDoc }) {
  const passing = row.scored.filter((s) => s.cos >= cutoff).map((s) => ({ ...s, score: s.cos + s.lexical * lexWeight })).sort((a, b) => b.score - a.score);
  const used = new Map();
  const hits = [];
  for (const s of passing) {
    if ((used.get(s.doc) ?? 0) >= perDoc) continue;
    used.set(s.doc, (used.get(s.doc) ?? 0) + 1);
    hits.push(s);
    if (hits.length >= limit) break;
  }
  return hits;
}

function metrics(rows, cfg) {
  const ans = rows.filter((r) => r.q.documento);
  const none = rows.filter((r) => !r.q.documento);
  const near = rows.filter((r) => r.q.tipo === "sem_resposta_perto");
  return {
    n: ans.length,
    recall1: mean(ans.map((r) => (r.goldRank === 0 ? 1 : 0))),
    recall4: mean(ans.map((r) => (r.goldRank >= 0 && r.goldRank < 4 ? 1 : 0))),
    mrr: mean(ans.map((r) => (r.goldRank >= 0 ? 1 / (r.goldRank + 1) : 0))),
    entregue: mean(ans.map((r) => (pipeline(r, cfg).some((h) => h.gold) ? 1 : 0))),
    entregue1: mean(ans.map((r) => (pipeline(r, cfg)[0]?.gold ? 1 : 0))),
    ruido: mean(ans.map((r) => pipeline(r, cfg).filter((h) => !h.gold).length)),
    semRespostaTrazAlgo: mean(none.map((r) => (pipeline(r, cfg).length ? 1 : 0))),
    pertoTrazAlgo: mean(near.map((r) => (pipeline(r, cfg).length ? 1 : 0))),
    cortado: ans.filter((r) => r.goldRank < 0).map((r) => r.q.id),
  };
}
// Objetivo da grade: o trecho certo chega ao modelo (entregue), com desempate pelo 1º lugar e menos ruído;
// trazer algo para pergunta sem resposta pesa contra.
// Trecho irrelevante no contexto empurra o modelo a inventar: trazer algo para pergunta sem resposta e mandar
// trechos errados pesam contra.
const OBJECTIVE = "entregue + 0,25 × entregue em 1º − 0,5 × (sem resposta: traz algo) − 0,1 × trechos errados entregues";
const objective = (m) => m.entregue + 0.25 * m.entregue1 - 0.5 * m.semRespostaTrazAlgo - 0.1 * m.ruido;

// ---------- B. memória de posts ----------
function postChunks(text, size) {
  const parts = [];
  let current = "";
  for (const paragraph of text.split(/\n+/)) {
    if ((current + "\n" + paragraph).length > size && current) {
      parts.push(current.trim());
      current = "";
    }
    current += `\n${paragraph}`;
    while (current.length > size * 1.5) {
      parts.push(current.slice(0, size).trim());
      current = current.slice(size);
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts.slice(0, 12);
}
const STOP = new Set("a as o os um uma uns umas de da do das dos em no na nos nas por para com sem que qual quais como porque sobre isso este esta esse essa me mim eu voce ele ela eles elas ou mas ao aos ser ter faz fazer pensamento pensamentos post posts escreveu escrevi publicou kally algum alguma tem existe quero aprender explique explica fale sei tudo bem conta conte ola obrigado obrigada beleza rapida rapido favor pode voces gente coisa algo curiosidade".split(" "));
const postTerms = (t) => [...new Set(normalizeText(t).match(/[\p{L}\p{N}]{3,}/gu) ?? [])].filter((x) => !STOP.has(x)).slice(0, 12);

async function postMemory() {
  const posts = docs.map((d) => {
    const title = (/^#\s+(.+)$/m.exec(d.text)?.[1] ?? d.text.split("\n")[0]).trim();
    return { file: d.file, title, text: d.text, chunks: postChunks(`${title}\n${d.text}`, CURRENT.postChunk) };
  });
  const vectors = await embedAll(posts.flatMap((p) => p.chunks.map((c) => PROFILE.document + c)));
  let k = 0;
  for (const p of posts) p.vectors = p.chunks.map(() => vectors[k++]);
  const rows = perguntas.map((q) => {
    const qv = qVectors.get(q.id);
    const words = postTerms(q.pergunta);
    return {
      q,
      posts: posts.map((p) => {
        const best = Math.max(...p.vectors.map((v) => cosine(qv, v)));
        const title = normalizeText(p.title), text = normalizeText(p.text);
        let lexical = 0;
        for (const t of words) lexical += (title.includes(t) ? 5 : 0) + (text.includes(t) ? 1 : 0);
        return { file: p.file, best, lexical: Math.min(lexical / 8, 1) };
      }),
    };
  });
  const evalCfg = (subset, { weight, min }) => {
    const res = subset.map((r) => {
      const scored = r.posts.map((p) => ({ ...p, score: (p.best >= min ? Math.min((p.best - PROFILE.floor) / PROFILE.span, 1) : 0) * weight + p.lexical * (1 - weight) })).filter((p) => p.score >= 0.12).sort((a, b) => b.score - a.score).slice(0, 5);
      const rank = scored.findIndex((p) => p.file === r.q.documento);
      return { r, scored, rank };
    });
    const ans = res.filter((x) => x.r.q.documento);
    const none = res.filter((x) => !x.r.q.documento);
    return {
      recall1: mean(ans.map((x) => (x.rank === 0 ? 1 : 0))),
      recall5: mean(ans.map((x) => (x.rank >= 0 ? 1 : 0))),
      filtroConversa: mean(ans.map((x) => (x.rank >= 0 && x.scored[x.rank].score >= 0.4 ? 1 : 0))),
      semRespostaPassa: mean(none.map((x) => (x.scored.some((p) => p.score >= 0.4) ? 1 : 0))),
    };
  };
  return { rows, evalCfg };
}

// ---------- execução ----------
const started = performance.now();
const qVecList = await embedAll(perguntas.map((q) => PROFILE.query + q.pergunta));
const qVectors = new Map(perguntas.map((q, i) => [q.id, qVecList[i]]));
const queryEmbedMs = timing.embedded ? timing.embedMs / timing.embedded : NaN;

const bySet = (rows, set) => rows.filter((r) => r.q.conjunto === set);
const indexes = [];
for (const size of SIZES) for (const overlap of OVERLAPS) {
  const chunks = await buildIndex(size, overlap);
  const { rows, searchMsPerQuery } = scoreQuestions(chunks, qVectors);
  indexes.push({ size, overlap, chunks: chunks.length, rows, searchMsPerQuery });
}
const current = indexes.find((x) => x.size === CURRENT.docChunk && x.overlap === 0) ?? indexes[0];
const currentCfg = { cutoff: CURRENT.cutoff, lexWeight: CURRENT.lexWeight, limit: CURRENT.limit, perDoc: CURRENT.perDoc };

// Grade completa, escolhida só na calibração.
const grid = [];
const cutoffs = [];
for (let c = 0.3; c <= 0.651; c += 0.025) cutoffs.push(Math.round(c * 1000) / 1000);
for (const ix of indexes) for (const cutoff of cutoffs) for (const lexWeight of [0, 0.04, 0.1, 0.2]) for (const limit of [3, 4, 6]) for (const perDoc of [2, 3]) {
  const cfg = { cutoff, lexWeight, limit, perDoc };
  grid.push({ ix, cfg, cal: metrics(bySet(ix.rows, "calibracao"), cfg) });
}
grid.sort((a, b) => objective(b.cal) - objective(a.cal) || a.cfg.limit - b.cfg.limit);
const best = grid[0];

const L = [];
const o = (s = "") => L.push(s);
const today = new Date().toISOString().slice(0, 10);
let commit = "?";
try {
  commit = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
} catch {}
o(`# Recuperação da Kally: ${MODEL} (${today}, commit ${commit})`);
o();
if (FAKE) o("> **Embedding falso.** Este relatório só prova que o script funciona; os números não dizem nada sobre a Kally.\n");
const counts = Object.fromEntries(["calibracao", "avaliacao", "validacao"].map((s) => [s, perguntas.filter((q) => q.conjunto === s).length]));
o(`Corpus: ${docs.length} documentos, ${docs.reduce((a, d) => a + d.text.length, 0).toLocaleString("pt-BR")} caracteres · perguntas: calibração ${counts.calibracao}, avaliação ${counts.avaliacao}, validação ${counts.validacao}${WITH_VALIDATION ? " (medida nesta execução)" : " (guardada)"} · dimensões do vetor: ${qVecList[0]?.length ?? "—"}`);
o();
o(`Parâmetros atuais (lidos do código): floor ${PROFILE.floor}, min ${PROFILE.min}, span ${PROFILE.span}, weight ${PROFILE.weight}, conversationMin ${PROFILE.conversationMin}; trecho de documentos ${CURRENT.docChunk}, de posts ${CURRENT.postChunk}; corte dos documentos ${CURRENT.cutoff}; overlap 0.${PROFILE.medido ? "" : " (Modelo sem perfil medido: usa a escala do qwen3.)"}`);
o();

o("## A. Base de documentos");
o();
o("### A1. Tamanho do trecho e overlap (configuração atual de corte e limite; conjunto de calibração)");
o();
o("| Trecho | Overlap | Trechos | Recall@1 | Recall@4 | MRR | Entregue ao modelo | Sem resposta: traz algo | Busca (ms/pergunta) |");
o("|---|---|---|---|---|---|---|---|---|");
for (const ix of indexes) {
  const m = metrics(bySet(ix.rows, "calibracao"), currentCfg);
  o(`| ${ix.size}${ix.size === CURRENT.docChunk ? " (atual)" : ""} | ${ix.overlap} | ${ix.chunks} | ${pc(m.recall1)} | ${pc(m.recall4)} | ${f2(m.mrr)} | ${pc(m.entregue)} | ${pc(m.semRespostaTrazAlgo)} | ${f2(ix.searchMsPerQuery)} |`);
}
o();
o("Recall@k: o trecho-gabarito está entre os k mais parecidos (só significado). Entregue ao modelo: passou pelo corte, pelo limite por documento e pelo limite total, como na busca de produção.");
o();

o("### A2. Melhor configuração da grade × atual");
o();
o(`Grade: ${indexes.length} índices (tamanho × overlap) × ${cutoffs.length} cortes × 4 pesos de palavras × 3 limites × 2 máximos por documento = ${grid.length} configurações. Escolhida pelo objetivo (${OBJECTIVE}) na **calibração**; os números de **avaliação** são de perguntas que não participaram da escolha.`);
o();
o(`- Atual: trecho ${CURRENT.docChunk}, overlap 0, corte ${currentCfg.cutoff}, palavras ${currentCfg.lexWeight}, limite ${currentCfg.limit}, máx. ${currentCfg.perDoc} por documento`);
o(`- Melhor na calibração: trecho ${best.ix.size}, overlap ${best.ix.overlap}, corte ${best.cfg.cutoff}, palavras ${best.cfg.lexWeight}, limite ${best.cfg.limit}, máx. ${best.cfg.perDoc} por documento`);
o();
o("| Conjunto | Config. | Recall@1 | Recall@4 | MRR | Entregue | Entregue em 1º | Trechos errados entregues | Sem resposta: traz algo | Perto: traz algo |");
o("|---|---|---|---|---|---|---|---|---|---|");
for (const set of SETS) for (const [name, ix, cfg] of [["atual", current, currentCfg], ["melhor", best.ix, best.cfg]]) {
  const m = metrics(bySet(ix.rows, set), cfg);
  o(`| ${set} | ${name} | ${pc(m.recall1)} | ${pc(m.recall4)} | ${f2(m.mrr)} | ${pc(m.entregue)} | ${pc(m.entregue1)} | ${f2(m.ruido)} | ${pc(m.semRespostaTrazAlgo)} | ${pc(m.pertoTrazAlgo)} |`);
}
o();
o("Se a melhora some na avaliação, ela era ajuste às perguntas da calibração: não leve para produção. Com poucas perguntas por conjunto, diferenças de uma ou duas perguntas são ruído.");
o();

const curRows = current.rows;
const ansRows = curRows.filter((r) => r.q.documento && r.goldRank >= 0 && r.q.conjunto === "calibracao");
const goldCos = ansRows.map((r) => r.goldCos);
const bestWrong = ansRows.map((r) => r.ranked.find((s) => !s.gold).cos);
const noneMax = curRows.filter((r) => !r.q.documento && r.q.conjunto === "calibracao").map((r) => r.ranked[0].cos);
const nearMax = curRows.filter((r) => r.q.tipo === "sem_resposta_perto" && r.q.conjunto === "calibracao").map((r) => r.ranked[0].cos);
const farMax = curRows.filter((r) => r.q.tipo === "sem_resposta_longe" && r.q.conjunto === "calibracao").map((r) => r.ranked[0].cos);
o(`### A3. Cossenos (trecho ${current.size}, calibração)`);
o();
o("| Grupo | n | p5 | p25 | mediana | p75 | p95 |");
o("|---|---|---|---|---|---|---|");
const dist = (name, v) => o(`| ${name} | ${v.length} | ${f3(pct(v, 0.05))} | ${f3(pct(v, 0.25))} | ${f3(pct(v, 0.5))} | ${f3(pct(v, 0.75))} | ${f3(pct(v, 0.95))} |`);
dist("Gabarito", goldCos);
dist("Melhor trecho errado (mesma pergunta)", bestWrong);
dist("Sem resposta, assunto próximo: melhor trecho", nearMax);
dist("Sem resposta, fora do assunto: melhor trecho", farMax);
o();
const floorSug = pct(noneMax, 0.95);
const keep95 = cutoffs.filter((c) => mean(goldCos.map((g) => (g >= c ? 1 : 0))) >= 0.95);
const cutSug = keep95.length ? Math.max(...keep95) : NaN;
const spanSug = pct(goldCos, 0.5) - floorSug;
o("| Parâmetro | Atual | Pelos dados | Regra |");
o("|---|---|---|---|");
o(`| floor | ${PROFILE.floor} | ${f3(floorSug)} | p95 do melhor trecho das perguntas sem resposta |`);
o(`| corte dos documentos | ${CURRENT.cutoff} | ${f3(cutSug)} | maior corte que deixa passar 95% dos gabaritos |`);
o(`| span | ${PROFILE.span} | ${spanSug > 0 ? f3(spanSug) : "— (gabarito não se separa do ruído)"} | mediana do gabarito − floor |`);
o();

o("### A4. Erros de 1º lugar (atual, calibração e avaliação)");
o();
o("| Pergunta | Conjunto | Tipo | Posição do gabarito | Cosseno do gabarito | 1º lugar veio de | Cosseno do 1º |");
o("|---|---|---|---|---|---|---|");
const misses = curRows.filter((r) => r.q.documento && r.goldRank !== 0 && r.q.conjunto !== "validacao");
for (const r of misses) o(`| ${r.q.id}: ${r.q.pergunta} | ${r.q.conjunto} | ${r.q.tipo} | ${r.goldRank >= 0 ? r.goldRank + 1 : "cortado"} | ${f3(r.goldCos)} | ${r.ranked[0].doc} | ${f3(r.ranked[0].cos)} |`);
if (!misses.length) o("| — | | | | | | |");
o();

o("## B. Memória de posts (kally-memory.ts)");
o();
const pm = await postMemory();
const pmGrid = [];
for (const weight of [0.5, 0.6, 0.7, 0.8, 0.9]) for (let m = 0.3; m <= 0.551; m += 0.05) {
  const min = Math.round(m * 100) / 100;
  pmGrid.push({ weight, min, cal: pm.evalCfg(bySet(pm.rows, "calibracao"), { weight, min }) });
}
const pmObjective = (x) => x.filtroConversa + 0.25 * x.recall1 - 0.5 * x.semRespostaPassa;
pmGrid.sort((a, b) => pmObjective(b.cal) - pmObjective(a.cal));
const pmBest = pmGrid[0];
o(`Cada documento faz o papel de um post. "Passa no filtro da conversa": o post certo fica com nota ≥ 0,4, o mínimo da rota no modo conversa quando a pessoa não pede os posts explicitamente.`);
o();
o("| Conjunto | Config. | Recall@1 | Recall@5 | Passa no filtro da conversa | Sem resposta passa no filtro |");
o("|---|---|---|---|---|---|");
for (const set of SETS) for (const [name, cfg] of [[`atual (weight ${PROFILE.weight}, min ${PROFILE.min})`, { weight: PROFILE.weight, min: PROFILE.min }], [`melhor (weight ${pmBest.weight}, min ${pmBest.min})`, pmBest]]) {
  const m = pm.evalCfg(bySet(pm.rows, set), cfg);
  o(`| ${set} | ${name} | ${pc(m.recall1)} | ${pc(m.recall5)} | ${pc(m.filtroConversa)} | ${pc(m.semRespostaPassa)} |`);
}
o();
o("Este modelo não inclui o empurrão por pasta (+0,08) e por link (+0,15) da busca real; no ambiente da simulação, com poucas pastas, esse empurrão pode trazer posts sem relação. A simulação mede o efeito no uso real.");
o();

const rss = process.memoryUsage().rss / 1024 / 1024;
o("## C. Latência e recursos (nesta máquina)");
o();
o(`- Vetor de uma pergunta: ${f2(queryEmbedMs)} ms em média${FAKE ? " (falso)" : " (só o que não estava em cache)"} · busca por pergunta na base atual: ${f2(current.searchMsPerQuery)} ms com ${current.chunks} trechos`);
o(`- Memória do processo: ${f2(rss)} MB · tempo total: ${f2((performance.now() - started) / 1000)} s`);
o();

const report = L.join("\n") + "\n";
if (!FAKE) {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(cache));
}
console.log(report);
if (FAKE) {
  console.log("Embedding falso: nada foi gravado em resultados/.");
  process.exit(0);
}
const resultsDir = path.join(here, "resultados");
fs.mkdirSync(resultsDir, { recursive: true });
const base = path.join(resultsDir, `${today}-${MODEL.replace(/[^a-z0-9.-]/gi, "_")}`);
fs.writeFileSync(`${base}.md`, report);
fs.writeFileSync(
  `${base}.json`,
  JSON.stringify(
    {
      modelo: MODEL,
      data: today,
      commit,
      parametrosAtuais: { ...PROFILE, ...CURRENT },
      melhorDocumentos: { tamanho: best.ix.size, overlap: best.ix.overlap, ...best.cfg },
      melhorPosts: { weight: pmBest.weight, min: pmBest.min },
      documentos: Object.fromEntries(SETS.map((s) => [s, { atual: metrics(bySet(current.rows, s), currentCfg), melhor: metrics(bySet(best.ix.rows, s), best.cfg) }])),
      posts: Object.fromEntries(SETS.map((s) => [s, { atual: pm.evalCfg(bySet(pm.rows, s), { weight: PROFILE.weight, min: PROFILE.min }), melhor: pm.evalCfg(bySet(pm.rows, s), pmBest) }])),
      cossenos: { gabarito: goldCos, melhorErrado: bestWrong, semResposta: noneMax },
      sugestao: { floor: floorSug, corteDocumentos: cutSug, span: spanSug },
      latencia: { vetorPerguntaMs: queryEmbedMs, buscaMs: current.searchMsPerQuery, rssMB: rss },
    },
    null,
    2,
  ),
);
const histFile = path.join(resultsDir, "historico.json");
const hist = fs.existsSync(histFile) ? JSON.parse(fs.readFileSync(histFile, "utf8")) : [];
hist.push({ data: today, commit, modelo: MODEL, atual: metrics(bySet(current.rows, "avaliacao"), currentCfg), parametros: { ...PROFILE, ...CURRENT } });
fs.writeFileSync(histFile, JSON.stringify(hist, null, 2));
console.log(`Relatório: ${path.relative(root, base)}.md (e .json); histórico em ${path.relative(root, histFile)}`);
