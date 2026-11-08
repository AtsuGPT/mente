// Avaliação da busca por significado da base de documentos da Kally (recall@k e limiares).
//
//   npx tsx eval/embeddings/medir.mjs [opções]
//   (ou node eval/embeddings/medir.mjs, com Node 22.18 ou mais novo)
//
// Opções:
//   --url http://localhost:11434   Ollama (padrão: OLLAMA_BASE_URL ou o Ollama local)
//   --modelo qwen3-embedding:0.6b  modelo de embeddings (padrão: AI_EMBED_MODEL ou o da Kally)
//   --tamanhos 600,900,1100,1400   tamanhos de trecho a comparar (1100 é o da base de documentos hoje)
//   --falso                        embedding falso (trigramas): só testa o encadeamento; os números não valem nada e nada é gravado
//
// Usa a mesma divisão em trechos do servidor (src/server/kally/chunks.ts) e reproduz a pontuação de
// searchDocuments (src/server/kally/documents.ts): corte = min + 0,05, palavras em comum somam até 0,04,
// no máximo 3 trechos por documento e 4 no total. Os vetores ficam em .cache/eval-embeddings/ (fora do Git),
// então rodar de novo só calcula o que mudou. O relatório vai para eval/embeddings/resultados/.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
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
const URL_BASE = opt("url", process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
const MODEL = FAKE ? "falso-trigramas" : opt("modelo", process.env.AI_EMBED_MODEL || "qwen3-embedding:0.6b");
const SIZES = opt("tamanhos", "600,900,1100,1400").split(",").map(Number).filter((n) => n > 100);
const CURRENT_SIZE = 1100; // CHUNK_CHARS em src/server/kally/documents.ts
const K = 4; // trechos que a busca de documentos entrega ao modelo (limit padrão)

// Perfis copiados de EMBED_PROFILES (src/server/ai.ts), que não pode ser importado fora do Next ("server-only").
// Se o perfil mudar lá, atualize aqui.
const PROFILES = {
  "qwen3-embedding:0.6b": { query: "Instruct: Given a search query in Portuguese, retrieve relevant passages that answer the query\nQuery: ", document: "", floor: 0.3, min: 0.4, span: 0.3, weight: 0.7 },
  "nomic-embed-text:latest": { query: "search_query: ", document: "search_document: ", floor: 0.62, min: 0.665, span: 0.13, weight: 0.55 },
};
const profileKey = MODEL.includes(":") ? MODEL : `${MODEL}:latest`;
const PROFILE = PROFILES[profileKey] ?? { ...PROFILES["qwen3-embedding:0.6b"], query: "", document: "" };
const CUTOFF = PROFILE.min + 0.05; // como em searchDocuments

// ---------- corpus e perguntas ----------
const DOC_DIRS = [path.join(root, "eval/kally/documentos"), path.join(here, "corpus")];
const docs = DOC_DIRS.flatMap((dir) =>
  fs.readdirSync(dir).filter((f) => /\.(md|txt)$/i.test(f)).map((file) => ({ file, text: fs.readFileSync(path.join(dir, file), "utf8") })),
);
const { perguntas } = JSON.parse(fs.readFileSync(path.join(here, "perguntas.json"), "utf8"));
for (const q of perguntas) {
  if (!q.documento) continue;
  const doc = docs.find((d) => d.file === q.documento);
  if (!doc) throw new Error(`${q.id}: documento ${q.documento} não existe`);
  for (const t of q.trechos) if (!normalizeText(doc.text).includes(normalizeText(t))) throw new Error(`${q.id}: trecho "${t}" não está em ${q.documento}`);
}
const answerable = perguntas.filter((q) => q.documento);
const answerless = perguntas.filter((q) => !q.documento);

// ---------- embeddings (com cache em disco) ----------
const cacheDir = path.join(root, ".cache/eval-embeddings");
const cacheFile = path.join(cacheDir, `${MODEL.replace(/[^a-z0-9.-]/gi, "_")}.json`);
const cache = FAKE ? {} : fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, "utf8")) : {};
const keyOf = (text) => createHash("sha1").update(text).digest("hex");

function fakeVector(text) {
  const v = new Float32Array(512);
  const words = normalizeText(text).match(/[\p{L}\p{N}]+/gu) ?? [];
  for (const w of words) {
    const padded = ` ${w} `;
    for (let i = 0; i + 3 <= padded.length; i++) {
      const h = createHash("md5").update(padded.slice(i, i + 3)).digest();
      v[h.readUInt16LE(0) % 512] += 1;
    }
  }
  return Array.from(v);
}

async function embedAll(texts) {
  const missing = [...new Set(texts.filter((t) => !cache[keyOf(t)]))];
  for (let i = 0; i < missing.length; i += 16) {
    const batch = missing.slice(i, i + 16);
    let vectors;
    if (FAKE) vectors = batch.map(fakeVector);
    else {
      const r = await fetch(`${URL_BASE}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Mesmas opções do servidor: CPU e num_ctx 2048.
        body: JSON.stringify({ model: MODEL, input: batch, keep_alive: "30m", options: { num_ctx: 2048, num_gpu: 0 } }),
      }).catch((e) => {
        throw new Error(`Não consegui falar com o Ollama em ${URL_BASE} (${e.message}). Use --url ou --falso.`);
      });
      if (!r.ok) throw new Error(`Ollama respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
      vectors = (await r.json()).embeddings;
    }
    batch.forEach((t, j) => (cache[keyOf(t)] = vectors[j]));
    process.stdout.write(`\r  vetores: ${Math.min(i + 16, missing.length)}/${missing.length}   `);
  }
  if (missing.length) process.stdout.write("\n");
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
const pct = (values, p) => {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  return s[Math.floor(i)] + (s[Math.ceil(i)] - s[Math.floor(i)]) * (i - Math.floor(i));
};
const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN);
const f2 = (n) => (Number.isFinite(n) ? n.toFixed(2) : "—");
const f3 = (n) => (Number.isFinite(n) ? n.toFixed(3) : "—");
const pc = (n) => (Number.isFinite(n) ? `${Math.round(n * 100)}%` : "—");

// ---------- avaliação de um tamanho de trecho ----------
async function evaluate(size, queryVectors) {
  const chunks = docs.flatMap((d) => splitIntoChunks([{ label: "texto", text: d.text }], size).map((c) => ({ doc: d.file, text: c.text })));
  const vectors = await embedAll(chunks.map((c) => PROFILE.document + c.text));
  chunks.forEach((c, i) => (c.vector = vectors[i]));

  const rows = perguntas.map((q) => {
    const qv = queryVectors.get(q.id);
    const terms = queryTerms(q.pergunta);
    const scored = chunks.map((c, index) => ({
      index,
      doc: c.doc,
      cos: cosine(qv, c.vector),
      lexical: Math.min(scoreChunk(c.text, terms) / 10, 1),
      gold: !!q.documento && c.doc === q.documento && q.trechos.some((t) => normalizeText(c.text).includes(normalizeText(t))),
    }));
    const ranked = [...scored].sort((a, b) => b.cos - a.cos);
    const goldRank = ranked.findIndex((s) => s.gold); // -1: o trecho-gabarito foi cortado ao meio neste tamanho
    return { q, scored, ranked, goldRank, goldCos: goldRank >= 0 ? ranked[goldRank].cos : NaN };
  });

  // Busca como em searchDocuments, com corte e peso das palavras configuráveis.
  const pipeline = (row, cutoff = CUTOFF, lexWeight = 0.04) => {
    const passing = row.scored.filter((s) => s.cos >= cutoff).map((s) => ({ ...s, score: s.cos + s.lexical * lexWeight })).sort((a, b) => b.score - a.score);
    const perDoc = new Map();
    const hits = [];
    for (const s of passing) {
      if ((perDoc.get(s.doc) ?? 0) >= 3) continue;
      perDoc.set(s.doc, (perDoc.get(s.doc) ?? 0) + 1);
      hits.push(s);
      if (hits.length >= K) break;
    }
    return hits;
  };

  const ans = rows.filter((r) => r.q.documento);
  const none = rows.filter((r) => !r.q.documento);
  const metrics = (subset) => ({
    n: subset.length,
    recall1: mean(subset.map((r) => (r.goldRank === 0 ? 1 : 0))),
    recallK: mean(subset.map((r) => (r.goldRank >= 0 && r.goldRank < K ? 1 : 0))),
    mrr: mean(subset.map((r) => (r.goldRank >= 0 ? 1 / (r.goldRank + 1) : 0))),
    pipelineK: mean(subset.map((r) => (pipeline(r).some((h) => h.gold) ? 1 : 0))),
  });

  return {
    size,
    chunks: chunks.length,
    split: ans.filter((r) => r.goldRank < 0).map((r) => r.q.id),
    all: metrics(ans),
    byType: Object.fromEntries([...new Set(ans.map((r) => r.q.tipo))].map((t) => [t, metrics(ans.filter((r) => r.q.tipo === t))])),
    noneFalsePositive: mean(none.map((r) => (pipeline(r).length ? 1 : 0))),
    noneMeanHits: mean(none.map((r) => pipeline(r).length)),
    rows,
    pipeline,
  };
}

// ---------- execução ----------
console.log(`Modelo: ${MODEL}${FAKE ? "  (FALSO: só testa o encadeamento)" : ""}`);
console.log(`Corpus: ${docs.length} documentos, ${docs.reduce((a, d) => a + d.text.length, 0).toLocaleString("pt-BR")} caracteres · ${answerable.length} perguntas com resposta, ${answerless.length} sem`);
const qVectors = await embedAll(perguntas.map((q) => PROFILE.query + q.pergunta));
const queryVectors = new Map(perguntas.map((q, i) => [q.id, qVectors[i]]));
const results = [];
for (const size of SIZES) results.push(await evaluate(size, queryVectors));
if (!FAKE) {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(cache));
}

const ref = results.find((r) => r.size === CURRENT_SIZE) ?? results[0];
const lines = [];
const out = (s = "") => lines.push(s);
const today = new Date().toISOString().slice(0, 10);

out(`# Busca da base de documentos: ${MODEL} (${today})`);
out();
if (FAKE) out("> **Embedding falso.** Este relatório só prova que o script funciona; os números não dizem nada sobre a Kally.\n");
out(`Corpus: ${docs.length} documentos · ${answerable.length} perguntas com resposta · ${answerless.length} sem resposta · k = ${K} · corte atual = min + 0,05 = ${f3(CUTOFF)}`);
out();
out("## 1. Tamanho do trecho");
out();
out("| Trecho (car.) | Trechos | Recall@1 | Recall@4 | MRR | Recall@4 com o corte atual | Sem resposta: traz algo | Sem resposta: trechos em média | Gabarito cortado ao meio |");
out("|---|---|---|---|---|---|---|---|---|");
for (const r of results) {
  out(`| ${r.size}${r.size === CURRENT_SIZE ? " (atual)" : ""} | ${r.chunks} | ${pc(r.all.recall1)} | ${pc(r.all.recallK)} | ${f2(r.all.mrr)} | ${pc(r.all.pipelineK)} | ${pc(r.noneFalsePositive)} | ${f2(r.noneMeanHits)} | ${r.split.length ? r.split.join(", ") : "—"} |`);
}
out();
out("Recall@k: o trecho-gabarito está entre os k mais parecidos (só significado). MRR: média de 1/posição do gabarito. Com o corte atual: o que a busca de produção realmente entregaria ao modelo (corte, palavras, máx. 3 por documento). Sem resposta: o certo é não trazer nada.");
out();
out(`## 2. Por tipo de pergunta (trecho de ${ref.size})`);
out();
out("| Tipo | n | Recall@1 | Recall@4 | MRR | Recall@4 com o corte |");
out("|---|---|---|---|---|---|");
for (const [t, m] of Object.entries(ref.byType)) out(`| ${t} | ${m.n} | ${pc(m.recall1)} | ${pc(m.recallK)} | ${f2(m.mrr)} | ${pc(m.pipelineK)} |`);
out();

// Distribuições de cosseno: base para floor, min e span.
const ansRows = ref.rows.filter((r) => r.q.documento && r.goldRank >= 0);
const goldCos = ansRows.map((r) => r.goldCos);
const bestWrong = ansRows.map((r) => r.ranked.find((s) => !s.gold).cos);
const noneMax = ref.rows.filter((r) => !r.q.documento).map((r) => r.ranked[0].cos);
const nearMax = ref.rows.filter((r) => r.q.tipo === "sem_resposta_perto").map((r) => r.ranked[0].cos);
const farMax = ref.rows.filter((r) => r.q.tipo === "sem_resposta_longe").map((r) => r.ranked[0].cos);
out(`## 3. Cossenos (trecho de ${ref.size})`);
out();
out("| Grupo | p5 | p25 | mediana | p75 | p95 |");
out("|---|---|---|---|---|---|");
const dist = (name, v) => out(`| ${name} | ${f3(pct(v, 0.05))} | ${f3(pct(v, 0.25))} | ${f3(pct(v, 0.5))} | ${f3(pct(v, 0.75))} | ${f3(pct(v, 0.95))} |`);
dist("Gabarito (pergunta com resposta)", goldCos);
dist("Melhor trecho errado (mesma pergunta)", bestWrong);
dist("Sem resposta, assunto próximo: melhor trecho", nearMax);
dist("Sem resposta, fora do assunto: melhor trecho", farMax);
out();

out(`## 4. Corte (trecho de ${ref.size})`);
out();
out("| Corte | Gabarito passa | Recall@4 com o corte | Sem resposta: traz algo | Perto: traz algo | Trechos errados que passam (média) |");
out("|---|---|---|---|---|---|");
const sweep = [];
for (let c = 0.2; c <= 0.751; c += 0.025) {
  const cut = Math.round(c * 1000) / 1000;
  const kept = mean(ansRows.map((r) => (r.goldCos >= cut ? 1 : 0)));
  const recall = mean(ref.rows.filter((r) => r.q.documento).map((r) => (ref.pipeline(r, cut).some((h) => h.gold) ? 1 : 0)));
  const fp = mean(ref.rows.filter((r) => !r.q.documento).map((r) => (ref.pipeline(r, cut).length ? 1 : 0)));
  const fpNear = mean(ref.rows.filter((r) => r.q.tipo === "sem_resposta_perto").map((r) => (ref.pipeline(r, cut).length ? 1 : 0)));
  const noise = mean(ref.rows.filter((r) => r.q.documento).map((r) => ref.pipeline(r, cut).filter((h) => !h.gold).length));
  sweep.push({ cut, kept, recall, fp, fpNear, noise });
  const mark = Math.abs(cut - CUTOFF) < 0.0125 ? " (atual)" : "";
  out(`| ${f3(cut)}${mark} | ${pc(kept)} | ${pc(recall)} | ${pc(fp)} | ${pc(fpNear)} | ${f2(noise)} |`);
}
out();

out(`## 5. Peso das palavras em comum (trecho de ${ref.size}, corte atual)`);
out();
out("| Peso somado | Recall@1 com o corte | Recall@4 com o corte |");
out("|---|---|---|");
for (const w of [0, 0.02, 0.04, 0.08, 0.15, 0.25]) {
  const ans = ref.rows.filter((r) => r.q.documento);
  const r1 = mean(ans.map((r) => (ref.pipeline(r, CUTOFF, w)[0]?.gold ? 1 : 0)));
  const rk = mean(ans.map((r) => (ref.pipeline(r, CUTOFF, w).some((h) => h.gold) ? 1 : 0)));
  out(`| ${w}${w === 0.04 ? " (atual)" : ""} | ${pc(r1)} | ${pc(rk)} |`);
}
out();

// Sugestão a partir dos dados (só vale com o modelo real e amostra suficiente).
const floorSug = pct(noneMax, 0.95);
const keep95 = sweep.filter((s) => s.kept >= 0.95).map((s) => s.cut);
const cutSug = keep95.length ? Math.max(...keep95) : NaN;
const spanSug = pct(goldCos, 0.5) - floorSug;
out("## 6. Valores sugeridos pelos dados");
out();
out("| Parâmetro | Atual | Sugerido | Regra |");
out("|---|---|---|---|");
out(`| floor | ${PROFILE.floor} | ${f3(floorSug)} | p95 do melhor trecho das perguntas sem resposta (teto do ruído) |`);
out(`| corte dos documentos (min + 0,05) | ${f3(CUTOFF)} | ${f3(cutSug)} | maior corte que ainda deixa passar 95% dos gabaritos |`);
out(`| span | ${PROFILE.span} | ${spanSug > 0 ? f3(spanSug) : "— (gabarito não se separa do ruído)"} | mediana do gabarito − floor |`);
out();
out("Com poucas perguntas, cada uma mexe muito nesses números: trate como direção, não como valor final. O weight do perfil vale para a memória de posts (kally-memory.ts), que este script não mede.");
out();

const misses = ref.rows.filter((r) => r.q.documento && r.goldRank !== 0);
out(`## 7. Onde a busca errou o 1º lugar (trecho de ${ref.size})`);
out();
out("| Pergunta | Tipo | Posição do gabarito | Cosseno do gabarito | 1º lugar veio de | Cosseno do 1º |");
out("|---|---|---|---|---|---|");
for (const r of misses) out(`| ${r.q.id}: ${r.q.pergunta} | ${r.q.tipo} | ${r.goldRank >= 0 ? r.goldRank + 1 : "cortado"} | ${f3(r.goldCos)} | ${r.ranked[0].doc} | ${f3(r.ranked[0].cos)} |`);
if (!misses.length) out("| — | | | | | |");

const report = lines.join("\n") + "\n";
if (FAKE) {
  console.log("\n" + report);
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
      falso: FAKE,
      corteAtual: CUTOFF,
      tamanhos: results.map((r) => ({ tamanho: r.size, trechos: r.chunks, ...r.all, semRespostaTrazAlgo: r.noneFalsePositive, porTipo: r.byType, gabaritoCortado: r.split })),
      cortes: sweep,
      sugestao: { floor: floorSug, corteDocumentos: cutSug, span: spanSug },
      perguntas: ref.rows.map((r) => ({ id: r.q.id, tipo: r.q.tipo, posicaoGabarito: r.goldRank >= 0 ? r.goldRank + 1 : null, cosGabarito: r.goldCos, top: r.ranked.slice(0, K).map((s) => ({ doc: s.doc, cos: s.cos, gabarito: s.gold })) })),
    },
    null,
    2,
  ),
);
console.log("\n" + report);
console.log(`Relatório: ${path.relative(root, base)}.md (e .json)`);
