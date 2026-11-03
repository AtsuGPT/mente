// Avaliação da Kally (Etapa 6): gera as respostas de cada configuração para os casos de casos.json.
// Roda contra o servidor de testes com KALLY_EVAL=1 (a configuração vai no pedido, só para o admin).
//
//   node eval/kally/gerar.js <URL da API mobile> <usuário admin> <senha admin> <pasta de saída>
//
// Saída: respostas.json (com a configuração de cada resposta), cegas.json (as respostas de cada
// caso com letras sorteadas, para dar notas sem saber de onde vieram) e chave.json (letra → configuração).
const fs = require("fs");
const path = require("path");
const [API, user, password, outDir] = process.argv.slice(2);
const { casos } = require("./casos.json");

// Curtos não passam pelo interpretador: "qwen", "llama-qwen" e "qwen-qwen" dariam a mesma resposta.
// "llama" (competências com o executor llama3.2) separa o efeito dos prompts do efeito do modelo.
const CONFIGS = { longo: ["producao", "qwen", "llama-qwen", "qwen-qwen"], curto: ["producao", "llama", "qwen"], documento: ["producao", "qwen"] };
const ORDER = ["producao", "llama", "qwen", "qwen-qwen", "llama-qwen"];
const DOCS = [
  { file: "lgpd-bases-legais.md", scope: "institucional" },
  { file: "programa-introducao-programacao.md", scope: "pessoal" },
  { file: "corrida-anotacoes.txt", scope: "pessoal" },
];

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ask(token, message, evalConfig) {
  const started = Date.now();
  const r = await fetch(`${API}/env/mente/kally`, { method: "POST", headers: { ...auth(token), "Content-Type": "application/json" }, body: JSON.stringify({ message, evalConfig }) });
  if (!r.ok) return { erro: `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`, segundos: (Date.now() - started) / 1000 };
  const out = { texto: "", sources: [], stats: null, modo: null, erro: null };
  let firstText = 0;
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const e = JSON.parse(line.slice(6));
      if (e.text) { if (!firstText) firstText = Date.now(); out.texto += e.text; }
      if (e.sources) out.sources = e.sources;
      if (e.stats) out.stats = e.stats;
      if (e.mode) out.modo = e.mode;
      if (e.error) out.erro = e.error;
    }
    if (done) break;
  }
  return { ...out, primeiroTexto: firstText ? (firstText - started) / 1000 : null, segundos: (Date.now() - started) / 1000 };
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const login = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: user, password }) }).then((r) => r.json());
  if (!login.token) throw new Error("login falhou");
  const token = login.token;

  // Documentos dos casos D (removidos no fim).
  const uploaded = [];
  for (const d of DOCS) {
    const form = new FormData();
    form.append("file", new Blob([fs.readFileSync(path.join(__dirname, "documentos", d.file))]), d.file);
    form.append("scope", d.scope);
    const r = await fetch(`${API}/kally/documentos`, { method: "POST", headers: auth(token), body: form }).then((r) => r.json());
    uploaded.push(r.id);
  }
  for (let i = 0; i < 120; i++) {
    const docs = (await fetch(`${API}/kally/documentos`, { headers: auth(token) }).then((r) => r.json())).documents.filter((d) => uploaded.includes(d.id));
    if (docs.length === uploaded.length && docs.every((d) => d.status !== "processando")) { console.log("documentos:", docs.map((d) => `${d.title} ${d.status} (${d._count.chunks} trechos)`).join("; ")); break; }
    await sleep(2_000);
  }

  const file = path.join(outDir, "respostas.json");
  const respostas = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
  const done = new Set(respostas.map((r) => `${r.caso}|${r.config}`));
  for (const config of ORDER) {
    for (const caso of casos) {
      if (!CONFIGS[caso.tipo].includes(config) || done.has(`${caso.id}|${config}`)) continue;
      const r = await ask(token, caso.mensagem, config);
      respostas.push({ caso: caso.id, config, ...r });
      fs.writeFileSync(file, JSON.stringify(respostas, null, 2));
      const p = r.stats?.pipeline;
      console.log(`${caso.id} ${config.padEnd(10)} ${String(r.segundos).padStart(6)}s · 1º texto ${r.primeiroTexto ?? "-"}s · ${r.stats?.outputTokens ?? "-"} tokens · ${p?.competence ?? "-"}${p?.interpreted ? " (interpretado)" : ""}${r.erro ? ` · ERRO ${r.erro}` : ""}`);
    }
  }

  for (const id of uploaded) await fetch(`${API}/kally/documentos/${id}`, { method: "DELETE", headers: auth(token) });

  // Às cegas: letras sorteadas por caso.
  const cegas = {}, chave = {};
  for (const caso of casos) {
    const own = respostas.filter((r) => r.caso === caso.id).sort(() => Math.random() - 0.5);
    cegas[caso.id] = { mensagem: caso.mensagem, precisa: caso.precisa, respostas: {} };
    chave[caso.id] = {};
    own.forEach((r, i) => {
      const letter = "ABCDE"[i];
      cegas[caso.id].respostas[letter] = r.texto || `(sem resposta: ${r.erro})`;
      chave[caso.id][letter] = r.config;
    });
  }
  fs.writeFileSync(path.join(outDir, "cegas.json"), JSON.stringify(cegas, null, 2));
  fs.writeFileSync(path.join(outDir, "chave.json"), JSON.stringify(chave, null, 2));
  console.log(`\n${respostas.length} respostas; cegas.json e chave.json gravados em ${outDir}`);
})().catch((e) => { console.error(e); process.exit(1); });
