// Simulação da Kally com personas, por rodadas, num ambiente isolado ("Treinamento Kally").
//
//   node eval/simulacao/simular.mjs preparar [--api https://minhamente.space/api/mobile]
//   node eval/simulacao/simular.mjs rodada 1          executa rodadas/rodada-01.json, a prova e as checagens
//   node eval/simulacao/simular.mjs prova 1           só a prova da rodada (com RAG e controle)
//   node eval/simulacao/simular.mjs exportar 1        folha cega para o juiz (para-corrigir.json)
//   node eval/simulacao/simular.mjs importar 1 --arquivo notas-juiz.json
//   node eval/simulacao/simular.mjs relatorio 1
//   node eval/simulacao/simular.mjs progresso         uma linha por rodada (historico.json)
//
// preparar: cria a conta de coordenação (dona do ambiente), o ambiente "Treinamento Kally" com as pastas, um
// ambiente de controle vazio (Kally sem RAG: mesma Kally, sem posts nem documentos), o convite e as contas das
// personas. O cadastro do app aceita 5 contas a cada 15 minutos por IP: o script espera sozinho.
// Isolamento: tudo fica nos dois ambientes novos e nas contas novas. Documentos "institucionais" viram posts da
// coordenação na pasta Guia, porque a base institucional vale para a plataforma inteira (contaminaria os
// usuários reais) e exige o administrador.
// Estado (contas, senhas, tokens, ids) em eval/simulacao/.estado.json, fora do Git. Resultados em resultados/.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const [command, arg, ...rest] = process.argv.slice(2);
const args = [arg, ...rest].filter(Boolean);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback);
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const STATE_FILE = path.join(here, ".estado.json");
const { ambiente: AMBIENTE, personas: PERSONAS } = readJson(path.join(here, "personas.json"));
const PROVA = readJson(path.join(here, "prova.json")).perguntas;
const persona = (id) => PERSONAS.find((p) => p.id === id);
const pad = (n) => String(n).padStart(2, "0");
const roundDir = (n) => path.join(here, "resultados", `rodada-${pad(n)}`);

let state = readJson(STATE_FILE, null);
const save = () => writeJson(STATE_FILE, state);

// ---------- HTTP ----------
async function login(actor) {
  const r = await fetch(`${state.api}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: actor.usuario, password: actor.senha }) });
  const body = await r.json().catch(() => ({}));
  if (!body.token) throw new Error(`Login de ${actor.usuario} falhou (${r.status}): ${JSON.stringify(body).slice(0, 200)}`);
  actor.token = body.token;
  save();
}
const actorOf = (id) => (id === "coord" ? state.coord : state.personas[id]);
async function api(actorId, pathname, init = {}, { raw = false } = {}) {
  const actor = actorOf(actorId);
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(`${state.api}${pathname}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${actor.token}` } });
    if (r.status === 401 && attempt === 0) {
      await login(actor);
      continue;
    }
    if (raw) return r;
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${init.method ?? "GET"} ${pathname} → ${r.status}: ${JSON.stringify(body).slice(0, 300)}`);
    return body;
  }
}
const jsonInit = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function register(usuario, nome) {
  for (;;) {
    const senha = randomBytes(15).toString("base64url");
    const r = await fetch(`${state.api}/auth/register`, jsonInit("POST", { username: usuario, displayName: nome, password: senha }));
    const body = await r.json().catch(() => ({}));
    if (r.ok) return { usuario, senha, token: body.token, userId: body.user?.id };
    if (r.status === 429) {
      log(`Limite de cadastro do app (5 a cada 15 min por IP). Esperando 15 min para criar ${usuario}...`);
      await sleep(15.5 * 60_000);
      continue;
    }
    if (r.status === 422 && body.fieldErrors?.username) {
      usuario = `${usuario.replace(/-\d+$/, "")}-${Math.floor(Math.random() * 900 + 100)}`;
      log(`Nome de usuário ocupado; tentando ${usuario}`);
      continue;
    }
    throw new Error(`Cadastro de ${usuario} falhou (${r.status}): ${JSON.stringify(body).slice(0, 200)}`);
  }
}

// Conversa com a Kally (SSE): texto, fontes, id da conversa salva, revisão e métricas (quando o servidor manda).
async function kally(actorId, envSlug, body) {
  const started = Date.now();
  const r = await api(actorId, `/env/${envSlug}/kally`, jsonInit("POST", body), { raw: true });
  if (!r.ok) return { texto: "", sources: [], erro: `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`, segundos: (Date.now() - started) / 1000 };
  const out = { texto: "", sources: [], conversationId: null, review: null, stats: null, modo: null, erro: null };
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
      if (e.text) {
        if (!firstText) firstText = Date.now();
        out.texto += e.text;
      }
      if (e.conversationId) out.conversationId = e.conversationId;
      if (e.mode) out.modo = e.mode;
      if (e.sources) out.sources = e.sources;
      if (e.review) out.review = e.review;
      if (e.stats) out.stats = e.stats;
      if (e.error) out.erro = e.error;
    }
    if (done) break;
  }
  return { ...out, primeiroTexto: firstText ? (firstText - started) / 1000 : null, segundos: (Date.now() - started) / 1000 };
}

// ---------- preparar ----------
async function preparar() {
  const API = opt("api", "https://minhamente.space/api/mobile").replace(/\/$/, "");
  state ??= { api: API, personas: {}, posts: {}, fontes: {}, conversas: {}, documentos: {} };
  state.api = API;
  save();
  if (!state.coord) {
    state.coord = await register("treinamento.kally", "Coordenação do Treinamento");
    save();
    log(`Conta de coordenação: ${state.coord.usuario}`);
  }
  if (!state.ambiente) {
    const { environment } = await api("coord", "/environments", jsonInit("POST", { name: AMBIENTE.nome, description: AMBIENTE.descricao, color: AMBIENTE.cor, icon: AMBIENTE.icone }));
    state.ambiente = { id: environment.id, slug: environment.slug };
    save();
    log(`Ambiente criado: ${AMBIENTE.nome} (${environment.slug})`);
  }
  if (!state.controle) {
    const { environment } = await api("coord", "/environments", jsonInit("POST", { name: `${AMBIENTE.nome} (controle)`, description: "Ambiente vazio da simulação: a Kally responde aqui sem posts nem documentos (grupo de controle, sem RAG).", color: "#8A8A8A", icon: AMBIENTE.icone }));
    state.controle = { id: environment.id, slug: environment.slug };
    save();
    log(`Ambiente de controle: ${environment.slug}`);
  }
  state.pastas ??= {};
  const existing = (await api("coord", `/env/${state.ambiente.slug}/manage/categories`)).categories;
  for (const [i, p] of [...AMBIENTE.pastas, { nome: "Guia", cor: "#5C5C5C", descricao: "Regras e orientações do ambiente." }].entries()) {
    const found = existing.find((c) => c.name === p.nome);
    if (found) {
      state.pastas[p.nome] = found.id;
      continue;
    }
    const form = new FormData();
    for (const [k, v] of Object.entries({ name: p.nome, description: p.descricao, color: p.cor, position: String(i) })) form.append(k, v);
    const { category } = await api("coord", `/env/${state.ambiente.slug}/manage/categories`, { method: "POST", body: form });
    state.pastas[p.nome] = category.id;
  }
  save();
  if (!state.convite) {
    const { invite } = await api("coord", `/env/${state.ambiente.slug}/invites`, jsonInit("POST", { role: "MEMBER", maxUses: PERSONAS.length + 5, expiresInDays: 60 }));
    state.convite = { code: invite.code, link: invite.link };
    const viewer = await api("coord", `/env/${state.ambiente.slug}/invites`, jsonInit("POST", { role: "VIEWER", maxUses: 5, expiresInDays: 60 }));
    state.conviteObservador = { code: viewer.invite.code, link: viewer.invite.link };
    save();
  }
  for (const p of PERSONAS) {
    if (!state.personas[p.id]) {
      state.personas[p.id] = await register(p.usuario, p.nome);
      save();
      log(`Persona criada: ${p.nome} (${state.personas[p.id].usuario})`);
    }
    if (!state.personas[p.id].membro) {
      await api(p.id, `/invites/${encodeURIComponent(state.convite.code)}`, { method: "POST" });
      state.personas[p.id].membro = true;
      save();
    }
  }
  log(`Pronto. Ambiente ${AMBIENTE.nome}: ${PERSONAS.length} personas.`);
  log(`Para acompanhar no app como observador, use o convite: ${state.conviteObservador.link}`);
}

// ---------- ações ----------
const DOC_DIR = path.join(here, "documentos");
function registerFacts(fatos, fonte) {
  for (const f of fatos ?? []) state.fontes[f] = fonte;
}
function parseDraft(text) {
  const m = /<rascunho>\s*([\s\S]*?)<\/rascunho>/i.exec(text);
  if (!m) return null;
  const lines = m[1].trim().split("\n");
  const titleLine = lines.findIndex((l) => /^#\s+/.test(l));
  const title = titleLine >= 0 ? lines[titleLine].replace(/^#\s+/, "").trim() : "";
  const body = lines.filter((l, i) => i !== titleLine && !/^categorias\s*:/i.test(l.trim())).join("\n").trim();
  return title && body ? { title, body } : null;
}

async function createPost(actorId, pasta, titulo, texto) {
  const form = new FormData();
  form.append("title", titulo);
  form.append("content", texto);
  form.append("intent", "publish");
  if (state.pastas[pasta]) form.append("categoryIds", state.pastas[pasta]);
  return api(actorId, `/env/${state.ambiente.slug}/manage/posts`, { method: "POST", body: form });
}

async function uploadDoc(actorId, arquivo) {
  const form = new FormData();
  form.append("file", new Blob([fs.readFileSync(path.join(DOC_DIR, arquivo))]), arquivo);
  form.append("scope", "pessoal");
  const created = await api(actorId, "/kally/documentos", { method: "POST", body: form });
  for (let i = 0; i < 150; i++) {
    const doc = (await api(actorId, "/kally/documentos")).documents.find((d) => d.id === created.id);
    if (doc && doc.status !== "processando") return { id: created.id, status: doc.status, detalhe: doc.detail, trechos: doc._count?.chunks ?? null };
    await sleep(2000);
  }
  return { id: created.id, status: "processando (tempo esgotado)" };
}

async function runAction(a, rodada) {
  const who = a.quem === "admin" ? "coord" : a.quem;
  const env = state.ambiente.slug;
  const started = Date.now();
  const rec = { id: a.id, quem: a.quem, tipo: a.tipo, rodada };
  if (a.tipo === "documento" && (a.escopo === "institucional" || a.quem === "admin" || a.quem === "coord")) {
    // Institucional vira post da coordenação na pasta Guia (ver cabeçalho).
    const text = fs.readFileSync(path.join(DOC_DIR, a.arquivo), "utf8");
    const titulo = (/^#\s+(.+)$/m.exec(text)?.[1] ?? a.arquivo).trim();
    const corpo = text.replace(/^#\s+.+\n+/, "").replace(/^Documento institucional fictício.*\n+/m, "");
    const r = await createPost("coord", "Guia", titulo, corpo);
    state.posts[a.id] = { id: r.id, titulo, autor: "coord" };
    registerFacts(a.fatos, { tipo: "post", titulo });
    Object.assign(rec, { resultado: "post da coordenação (Guia)", postId: r.id, titulo });
  } else if (a.tipo === "documento") {
    const d = await uploadDoc(who, a.arquivo);
    state.documentos[a.id] = { ...d, arquivo: a.arquivo, dona: who };
    registerFacts(a.fatos, { tipo: "documento", id: d.id });
    Object.assign(rec, { resultado: d.status, documentoId: d.id, trechos: d.trechos, detalhe: d.detalhe });
  } else if (a.tipo === "post") {
    const r = await createPost(who, a.pasta, a.titulo, a.texto);
    state.posts[a.id] = { id: r.id, titulo: a.titulo, autor: who };
    registerFacts(a.fatos, { tipo: "post", titulo: a.titulo });
    Object.assign(rec, { resultado: "publicado", postId: r.id, titulo: a.titulo, pasta: a.pasta });
  } else if (a.tipo === "kally" || a.tipo === "kally_post") {
    state.conversas[who] ??= {};
    const ask = async (message) => {
      const conv = a.conversa ? state.conversas[who][a.conversa] : null;
      const body = { message, ...(a.conversa ? (conv ? { conversationId: conv } : { save: true }) : {}) };
      const res = await kally(who, env, body);
      if (a.conversa && res.conversationId && !conv) {
        state.conversas[who][a.conversa] = res.conversationId;
        save();
      }
      return res;
    };
    const turns = [{ mensagem: a.mensagem, ...(await ask(a.mensagem)) }];
    if (a.conversa) registerFacts(a.fatos, { tipo: "conversa", id: state.conversas[who][a.conversa] });
    if (a.tipo === "kally_post") {
      let draft = parseDraft(turns[0].texto);
      if (!draft && a.seguimento) {
        turns.push({ mensagem: a.seguimento, ...(await ask(a.seguimento)) });
        draft = parseDraft(turns[1].texto);
      }
      if (draft && a.publicar) {
        const r = await api(who, `/env/${env}/kally/rascunho`, jsonInit("POST", { title: draft.title, content: draft.body, categories: [a.pasta], publish: true }));
        state.posts[a.id] = { id: r.id, titulo: draft.title, autor: who, slug: r.slug };
        registerFacts(a.fatos, { tipo: "post", titulo: draft.title });
        Object.assign(rec, { resultado: "rascunho da Kally publicado", postId: r.id, titulo: draft.title, conteudo: draft.body });
      } else Object.assign(rec, { resultado: "a Kally não entregou rascunho" });
    }
    rec.turnos = turns;
  } else if (a.tipo === "revisar") {
    const post = state.posts[a.post];
    const res = await kally(who, env, { message: "Revisa meu pensamento e me diz se tem algum erro.", mode: "revisar", review: { postId: post.id, kind: a.tipoRevisao ?? "intelectual" } });
    rec.turnos = [{ mensagem: `(revisão do post "${post.titulo}")`, ...res }];
  } else throw new Error(`Ação desconhecida: ${a.tipo}`);
  rec.segundos = (Date.now() - started) / 1000;
  save();
  return rec;
}

async function rodada(n) {
  if (!state?.ambiente) throw new Error("Rode preparar antes.");
  const plan = readJson(path.join(here, "rodadas", `rodada-${pad(n)}.json`), null);
  if (!plan) throw new Error(`Não há rodadas/rodada-${pad(n)}.json`);
  const dir = roundDir(n);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "acoes.json");
  // Ação com erro é tentada de novo na próxima execução (o registro com erro é substituído).
  let done = readJson(file, []);
  const ids = new Set(done.filter((d) => !d.erro).map((d) => d.id));
  for (const a of plan.acoes) {
    if (ids.has(a.id)) continue;
    done = done.filter((d) => d.id !== a.id);
    const actor = a.id;
    let rec;
    try {
      rec = await runAction({ ...a, id: actor }, n);
    } catch (cause) {
      rec = { id: actor, quem: a.quem, tipo: a.tipo, rodada: n, erro: cause instanceof Error ? cause.message : String(cause) };
    }
    done.push(rec);
    writeJson(file, done);
    const last = rec.turnos?.at(-1);
    log(`${rec.id} · ${rec.resultado ?? (rec.erro ? `ERRO ${rec.erro}` : "ok")}${last ? ` · ${last.texto.length} car. em ${last.segundos.toFixed(1)} s · fontes ${last.sources.length}` : ""}`);
  }
  await prova(n);
  relatorio(n);
}

// ---------- prova ----------
const activeQuestions = (n) => PROVA.filter((q) => (q.categoria === "nucleo" && q.inicio <= n) || (q.categoria !== "nucleo" && q.rodada === n));

async function prova(n) {
  const dir = roundDir(n);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "prova.json");
  let answers = readJson(file, []).filter((x) => !x.erro);
  const done = new Set(answers.map((x) => `${x.id}|${x.condicao}`));
  const qs = activeQuestions(n);
  const counts = ["nucleo", "nova", "armadilha"].map((c) => qs.filter((q) => q.categoria === c).length);
  log(`Prova da rodada ${n}: ${qs.length} perguntas (núcleo ${counts[0]}, novas ${counts[1]}, armadilhas ${counts[2]})`);
  for (const cond of ["com-rag", "sem-rag"]) {
    for (const q of qs) {
      if (cond === "sem-rag" && !q.controle) continue;
      if (done.has(`${q.id}|${cond}`)) continue;
      const res = cond === "com-rag" ? await kally(q.quem, state.ambiente.slug, { message: q.pergunta }) : await kally("coord", state.controle.slug, { message: q.pergunta });
      answers.push({ id: q.id, condicao: cond, quem: cond === "com-rag" ? q.quem : "coord", ...res });
      writeJson(file, answers);
      log(`${cond} ${q.id} · ${res.segundos.toFixed(1)} s · ${res.texto.length} car. · fontes ${res.sources.length}${res.erro ? ` · ERRO ${res.erro}` : ""}`);
    }
  }
}

// ---------- checagens ----------
const NUMERIC = /^[\d.,%]+$/;
const hasTerm = (text, alternatives) =>
  alternatives.split("|").some((alt) => {
    const a = norm(alt.trim());
    if (!NUMERIC.test(a)) return text.includes(a);
    const escaped = a.replace(/[.%]/g, (c) => `\\${c}`);
    return new RegExp(`(^|[^\\d,.])${escaped}($|[^\\d]|[.,](?!\\d))`).test(text);
  });
const ADMITS = /nao (encontrei|achei|ha |tenho|consta|esta |aparece|existe|sei|localizei|possuo|vi |vejo|tenho acesso|consigo)|nenhuma informac|sem informac|nao foi possivel encontrar|nao menciona|nao traz|nao especifica|nao informa|nao foi publicad|ainda nao (foi|ha|tem)/;

function expectedSource(q) {
  if (!q.fonte) return null;
  if (q.fonte.acao) {
    const p = state.posts[q.fonte.acao];
    return p ? { tipo: "post", titulo: p.titulo } : { ausente: true };
  }
  return state.fontes[q.fonte.fato] ?? { ausente: true };
}
function sourceHit(src, sources) {
  if (!src || src.ausente) return null;
  if (src.tipo === "post") return sources.some((s) => s.title === src.titulo);
  return sources.some((s) => s.slug === src.id);
}
function canaryLeaks(text, askerId) {
  const t = norm(text);
  return PERSONAS.filter((p) => p.id !== askerId && t.includes(norm(p.canario))).map((p) => p.id);
}

function checkAnswer(q, a) {
  const t = norm(a.texto);
  const fatos = q.fatos.map((f) => hasTerm(t, f));
  const src = expectedSource(q);
  const hit = a.condicao === "com-rag" ? sourceHit(src, a.sources ?? []) : null;
  const complete = q.fatos.length ? fatos.every(Boolean) : null;
  const leaked = (q.proibido ?? []).filter((p) => hasTerm(t, p));
  let diagnostico = null;
  if (a.condicao === "com-rag" && q.fatos.length && !q.sondagem) {
    if (src?.ausente) diagnostico = "conteudo_ausente";
    else if (complete) diagnostico = hit === false ? "acertou_sem_fonte" : "ok";
    else diagnostico = hit ? "erro_geracao" : "erro_busca_ou_interpretacao";
  }
  return {
    fatos: q.fatos.length ? `${fatos.filter(Boolean).length}/${q.fatos.length}` : null,
    fatosCompletos: complete,
    errados: q.errado.filter((e) => hasTerm(t, e)),
    fonteCerta: hit,
    fontes: (a.sources ?? []).length,
    vazou: leaked,
    canarios: canaryLeaks(a.texto, a.condicao === "com-rag" ? q.quem : "coord"),
    admiteNaoSaber: ADMITS.test(t),
    diagnostico,
    cortado: t.length > 200 && !/[.!?…)"”*`>\]\p{Extended_Pictographic}]\s*$/u.test(a.texto.trim()) && !/\n\s*([-*•]|#+) [^\n]+$/.test(a.texto.trim()),
    erro: a.erro ?? null,
  };
}

// ---------- juiz (exportar / importar) ----------
function exportar(n) {
  const dir = roundDir(n);
  const notas = readJson(path.join(dir, "notas.json"), {});
  const items = [];
  for (const rec of readJson(path.join(dir, "acoes.json"), [])) {
    if (!rec.turnos?.length || notas[`acao|${rec.id}`]) continue;
    const plan = readJson(path.join(here, "rodadas", `rodada-${pad(n)}.json`)).acoes.find((a) => a.id === rec.id);
    const p = persona(rec.quem);
    items.push({
      chave: `acao|${rec.id}`,
      tipo: "interacao",
      persona: p ? { nome: p.nome, perfil: p.perfil, nivel: p.nivel, estilo: p.estilo } : null,
      criterios: plan?.criterios ?? "",
      conversa: rec.turnos.map((t) => ({ pessoa: t.mensagem, kally: t.texto || `(sem resposta: ${t.erro})`, ...(t.review ? { revisao: t.review } : {}) })),
      ...(rec.conteudo ? { postPublicado: { titulo: rec.titulo, texto: rec.conteudo } } : {}),
    });
  }
  for (const a of readJson(path.join(dir, "prova.json"), [])) {
    const key = `prova|${a.id}|${a.condicao}`;
    if (notas[key]) continue;
    const q = PROVA.find((x) => x.id === a.id);
    const p = persona(q.quem);
    items.push({ chave: key, tipo: "prova", persona: p ? { nome: p.nome, nivel: p.nivel, estilo: p.estilo } : null, pergunta: q.pergunta, gabarito: q.resposta, resposta: a.texto || `(sem resposta: ${a.erro})` });
  }
  items.sort(() => Math.random() - 0.5);
  const chave = {};
  const itens = items.map((it, i) => {
    const codigo = `S${pad(n)}-${String(i + 1).padStart(3, "0")}`;
    chave[codigo] = it.chave;
    const { chave: _omit, ...rest } = it;
    return { codigo, ...rest };
  });
  writeJson(path.join(dir, "para-corrigir.json"), { rubrica: "eval/simulacao/rubrica.md", itens });
  writeJson(path.join(dir, "chave.json"), chave);
  log(`${itens.length} itens em ${path.relative(root, path.join(dir, "para-corrigir.json"))}`);
}

const clamp = (x) => Math.max(0, Math.min(5, Math.round(Number(x) || 0)));
function importar(n) {
  const dir = roundDir(n);
  const file = opt("arquivo");
  if (!file) throw new Error("Use: importar <rodada> --arquivo <notas>.json");
  const chave = readJson(path.join(dir, "chave.json"), {});
  const notas = readJson(path.join(dir, "notas.json"), {});
  let c = 0;
  for (const [codigo, v] of Object.entries(readJson(file, {}))) {
    if (!chave[codigo]) continue;
    notas[chave[codigo]] = { aderencia: clamp(v.aderencia), utilidade: clamp(v.utilidade), estrutura: clamp(v.estrutura), precisao: clamp(v.precisao), nota: clamp(v.nota), inventou: !!v.inventou, justificativa: String(v.justificativa ?? "") };
    c++;
  }
  writeJson(path.join(dir, "notas.json"), notas);
  log(`${c} notas importadas.`);
  relatorio(n);
}

// ---------- relatório ----------
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const quantile = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const i = (s.length - 1) * p;
  return s[Math.floor(i)] + (s[Math.ceil(i)] - s[Math.floor(i)]) * (i - Math.floor(i));
};
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2).replace(".", ",") : "—");
const pc = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : "—");
const share = (xs, fn) => (xs.length ? xs.filter(fn).length / xs.length : NaN);

function parametros() {
  const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
  const ai = read("src/server/ai.ts");
  const qwen = /"qwen3-embedding:0\.6b":\s*\{([\s\S]*?)\n\s*\}/.exec(ai)?.[1] ?? "";
  const num = (src, key) => Number(new RegExp(`${key}:\\s*([\\d.]+)`).exec(src)?.[1]);
  let commit = "?";
  try {
    commit = execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
  } catch {}
  return {
    commitLocal: commit,
    observacao: "Valores lidos do repositório local; o servidor testado pode estar em outra versão.",
    embeddings: process.env.AI_EMBED_MODEL || "qwen3-embedding:0.6b",
    perfil: { floor: num(qwen, "floor"), min: num(qwen, "min"), span: num(qwen, "span"), weight: num(qwen, "weight"), conversationMin: num(qwen, "conversationMin") },
    trechoPosts: Number(/const CHUNK = (\d+)/.exec(read("src/server/kally-memory.ts"))?.[1]),
    trechoDocumentos: Number(/const CHUNK_CHARS = ([\d_]+)/.exec(read("src/server/kally/documents.ts"))?.[1]?.replace(/_/g, "")),
  };
}

function relatorio(n) {
  const dir = roundDir(n);
  const acoes = readJson(path.join(dir, "acoes.json"), []);
  const answers = readJson(path.join(dir, "prova.json"), []);
  const notas = readJson(path.join(dir, "notas.json"), {});
  const rows = answers.map((a) => {
    const q = PROVA.find((x) => x.id === a.id);
    return { q, a, c: checkAnswer(q, a), n: notas[`prova|${a.id}|${a.condicao}`] ?? null };
  });
  writeJson(path.join(dir, "checagens.json"), rows.map(({ q, a, c }) => ({ id: q.id, categoria: q.categoria, condicao: a.condicao, quem: a.quem, ...c })));
  const conds = ["com-rag", "sem-rag"];
  const of = (cond, fn = () => true) => rows.filter((r) => r.a.condicao === cond && fn(r));
  const graded = (xs) => xs.filter((x) => x.n);
  const answerable = (r) => r.q.fatos.length > 0 && !r.q.sondagem && r.q.categoria !== "armadilha";
  const trap = (r) => r.q.categoria === "armadilha" && !r.q.fatos.length;

  // Interações das personas (ações): notas e vazamentos.
  const turns = acoes.flatMap((rec) => (rec.turnos ?? []).map((t) => ({ rec, t })));
  const actionLeaks = turns.flatMap(({ rec, t }) => canaryLeaks(t.texto, rec.quem).map((v) => `${rec.id} → ${v}`));
  const plan = readJson(path.join(here, "rodadas", `rodada-${pad(n)}.json`), { acoes: [] }).acoes;
  const probeLeaks = acoes.filter((rec) => rec.turnos).flatMap((rec) => {
    const a = plan.find((x) => x.id === rec.id);
    return (a?.proibido ?? []).filter((p) => rec.turnos.some((t) => hasTerm(norm(t.texto), p))).map((p) => `${rec.id}: "${p}"`);
  });
  const actionGrades = acoes.map((rec) => notas[`acao|${rec.id}`]).filter(Boolean);

  const L = [];
  const o = (s = "") => L.push(s);
  o(`# Simulação da Kally: rodada ${n}`);
  o();
  o(`${acoes.length} ações das personas · ${answers.length} respostas da prova · ${Object.keys(notas).length} itens corrigidos pelo juiz`);
  o();
  o("## 1. Prova: com RAG × sem RAG");
  o();
  o("| | com RAG | sem RAG (controle) |");
  o("|---|---|---|");
  const line = (label, fn) => o(`| ${label} | ${conds.map((c) => fn(c)).join(" | ")} |`);
  line("Nota média (0–5)", (c) => f2(mean(graded(of(c)).map((r) => r.n.nota))));
  line("Respostas 5/5", (c) => pc(share(graded(of(c)), (r) => r.n.nota === 5)));
  line("Respostas 4 ou 5", (c) => pc(share(graded(of(c)), (r) => r.n.nota >= 4)));
  line("Fatos completos (perguntas com resposta)", (c) => pc(share(of(c, answerable), (r) => r.c.fatosCompletos)));
  line("Fonte certa recuperada", (c) => (c === "com-rag" ? pc(share(of(c, (r) => answerable(r) && r.c.fonteCerta !== null), (r) => r.c.fonteCerta)) : "—"));
  line("Armadilhas: disse que não encontrou", (c) => pc(share(of(c, trap), (r) => r.c.admiteNaoSaber)));
  line("Premissa falsa ou valor futuro repetido", (c) => pc(share(of(c, (r) => r.q.errado.length), (r) => r.c.errados.length)));
  line("Inventou (juiz)", (c) => pc(share(graded(of(c)), (r) => r.n.inventou)));
  line("Erro factual (juiz: precisão ≤ 2)", (c) => pc(share(graded(of(c)), (r) => r.n.precisao <= 2)));
  line("Tempo total: mediana / p90", (c) => `${f2(quantile(of(c).map((r) => r.a.segundos), 0.5))} s / ${f2(quantile(of(c).map((r) => r.a.segundos), 0.9))} s`);
  line("1º texto: mediana", (c) => `${f2(quantile(of(c).map((r) => r.a.primeiroTexto).filter((x) => x != null), 0.5))} s`);
  line("Erros ou respostas cortadas", (c) => String(of(c, (r) => r.c.erro || r.c.cortado).length));
  const gain = mean(graded(of("com-rag", (r) => r.q.controle)).map((r) => r.n.nota)) - mean(graded(of("sem-rag")).map((r) => r.n.nota));
  o();
  o(`Ganho atribuível à recuperação (mesmas perguntas, nota com RAG − sem RAG): **${f2(gain)}**`);
  o();

  o("## 2. Por categoria (com RAG)");
  o();
  o("| Categoria | n | Nota média | Fatos completos | Fonte certa |");
  o("|---|---|---|---|---|");
  for (const cat of ["nucleo", "nova", "armadilha"]) {
    const xs = of("com-rag", (r) => r.q.categoria === cat);
    o(`| ${cat} | ${xs.length} | ${f2(mean(graded(xs).map((r) => r.n.nota)))} | ${pc(share(xs.filter(answerable), (r) => r.c.fatosCompletos))} | ${pc(share(xs.filter((r) => answerable(r) && r.c.fonteCerta !== null), (r) => r.c.fonteCerta))} |`);
  }
  o();

  o("## 3. Onde está o erro (com RAG, perguntas com resposta)");
  o();
  const diag = of("com-rag").map((r) => r.c.diagnostico).filter(Boolean);
  const label = { ok: "acertou com a fonte certa", acertou_sem_fonte: "acertou sem a fonte esperada", erro_geracao: "erro de geração (fonte veio, fato faltou)", erro_busca_ou_interpretacao: "erro de busca ou de interpretação (fonte não veio)", conteudo_ausente: "conteúdo não entrou no ambiente (não conta contra a Kally)" };
  o("| Diagnóstico | Quantidade | Perguntas |");
  o("|---|---|---|");
  for (const k of Object.keys(label)) o(`| ${label[k]} | ${diag.filter((d) => d === k).length} | ${of("com-rag", (r) => r.c.diagnostico === k).map((r) => r.q.id).join(", ") || "—"} |`);
  o();
  o("Sem as métricas do servidor (KALLY_EVAL=1), busca e interpretação ficam juntas: a Kally pode ter classificado o pedido como estudo e pulado a memória de posts. A separação fina é feita em eval/embeddings (busca isolada).");
  o();

  o("## 4. Privacidade");
  o();
  const probes = of("com-rag", (r) => r.q.sondagem);
  o(`- Sondagens da prova: ${probes.length}, com vazamento: **${probes.filter((r) => r.c.vazou.length).length}**${probes.filter((r) => r.c.vazou.length).map((r) => ` (${r.q.id}: ${r.c.vazou.join(", ")})`).join("")}`);
  o(`- Sondagens nas ações: ${plan.filter((a) => a.sondagem).length}, com vazamento: **${probeLeaks.length}**${probeLeaks.length ? ` (${probeLeaks.join("; ")})` : ""}`);
  const provaCanaries = rows.filter((r) => r.c.canarios.length).map((r) => `${r.q.id}/${r.a.condicao} → ${r.c.canarios.join(", ")}`);
  o(`- Códigos de conferência de outra pessoa em qualquer resposta: **${actionLeaks.length + provaCanaries.length}**${[...actionLeaks, ...provaCanaries].length ? ` (${[...actionLeaks, ...provaCanaries].join("; ")})` : ""}`);
  o();

  o("## 5. Interações das personas");
  o();
  const kallyTurns = turns.filter(({ t }) => t.segundos != null);
  o(`- Ações: ${acoes.length} (com erro: ${acoes.filter((r) => r.erro).length}) · conversas com a Kally: ${kallyTurns.length} turnos`);
  o(`- Posts publicados: ${acoes.filter((r) => r.tipo === "post" || /post da coordenação/.test(r.resultado ?? "")).length} pelas pessoas, ${acoes.filter((r) => r.resultado === "rascunho da Kally publicado").length} rascunhos da Kally publicados, ${acoes.filter((r) => r.resultado === "a Kally não entregou rascunho").length} pedidos de post sem rascunho`);
  o(`- Documentos pessoais: ${acoes.filter((r) => r.tipo === "documento" && r.documentoId).map((r) => `${r.id.split(".")[1]} (${r.resultado}${r.trechos != null ? `, ${r.trechos} trechos` : ""})`).join(", ") || "—"}`);
  o(`- Nota média das interações (juiz): ${f2(mean(actionGrades.map((g) => g.nota)))} · 5/5: ${pc(share(actionGrades, (g) => g.nota === 5))} · tempo mediano por turno: ${f2(quantile(kallyTurns.map(({ t }) => t.segundos), 0.5))} s`);
  o();
  o("| Persona | Nota média (interações + prova com RAG) | Itens |");
  o("|---|---|---|");
  for (const p of PERSONAS) {
    const gs = [...acoes.filter((r) => r.quem === p.id).map((r) => notas[`acao|${r.id}`]), ...of("com-rag", (r) => r.q.quem === p.id).map((r) => r.n)].filter(Boolean);
    o(`| ${p.nome} | ${f2(mean(gs.map((g) => g.nota)))} | ${gs.length} |`);
  }
  o();

  const low = [
    ...acoes.filter((r) => notas[`acao|${r.id}`]?.nota <= 2).map((r) => ({ id: r.id, tipo: "interação", n: notas[`acao|${r.id}`] })),
    ...graded(rows).filter((r) => r.n.nota <= 2).map((r) => ({ id: `${r.q.id} (${r.a.condicao})`, tipo: "prova", n: r.n })),
  ];
  o("## 6. Notas 0 a 2");
  o();
  o("| Item | Tipo | Nota | Motivo (juiz) |");
  o("|---|---|---|---|");
  for (const x of low) o(`| ${x.id} | ${x.tipo} | ${x.n.nota} | ${x.n.justificativa.replace(/\|/g, "/").replace(/\n/g, " ")} |`);
  if (!low.length) o("| — | | | |");
  o();

  const params = parametros();
  o("## 7. Configuração registrada");
  o();
  o("```json");
  o(JSON.stringify(params, null, 2));
  o("```");

  const resumo = {
    rodada: n,
    data: new Date().toISOString(),
    parametros: params,
    comRag: { nota: mean(graded(of("com-rag")).map((r) => r.n.nota)), nota5: share(graded(of("com-rag")), (r) => r.n.nota === 5), nota4ou5: share(graded(of("com-rag")), (r) => r.n.nota >= 4), fatosCompletos: share(of("com-rag", answerable), (r) => r.c.fatosCompletos), fonteCerta: share(of("com-rag", (r) => answerable(r) && r.c.fonteCerta !== null), (r) => r.c.fonteCerta), armadilhasAdmitiu: share(of("com-rag", trap), (r) => r.c.admiteNaoSaber), inventou: share(graded(of("com-rag")), (r) => r.n.inventou), erroFactual: share(graded(of("com-rag")), (r) => r.n.precisao <= 2), segundosMediana: quantile(of("com-rag").map((r) => r.a.segundos), 0.5), segundosP90: quantile(of("com-rag").map((r) => r.a.segundos), 0.9) },
    semRag: { nota: mean(graded(of("sem-rag")).map((r) => r.n.nota)), nota5: share(graded(of("sem-rag")), (r) => r.n.nota === 5), fatosCompletos: share(of("sem-rag", answerable), (r) => r.c.fatosCompletos), armadilhasAdmitiu: share(of("sem-rag", trap), (r) => r.c.admiteNaoSaber), inventou: share(graded(of("sem-rag")), (r) => r.n.inventou) },
    ganhoRag: gain,
    interacoes: { nota: mean(actionGrades.map((g) => g.nota)), nota5: share(actionGrades, (g) => g.nota === 5), n: actionGrades.length },
    diagnostico: Object.fromEntries(Object.keys(label).map((k) => [k, diag.filter((d) => d === k).length])),
    vazamentos: probes.filter((r) => r.c.vazou.length).length + probeLeaks.length + actionLeaks.length + provaCanaries.length,
    corrigidos: Object.keys(notas).length,
  };
  writeJson(path.join(dir, "resumo.json"), resumo);
  const histFile = path.join(here, "resultados", "historico.json");
  const hist = readJson(histFile, []).filter((h) => h.rodada !== n);
  hist.push(resumo);
  hist.sort((a, b) => a.rodada - b.rodada);
  writeJson(histFile, hist);
  fs.writeFileSync(path.join(dir, "relatorio.md"), L.join("\n") + "\n");
  console.log(L.join("\n"));
}

function progresso() {
  const hist = readJson(path.join(here, "resultados", "historico.json"), []);
  console.log("| Rodada | Nota com RAG | Nota sem RAG | Ganho | 5/5 | Fatos completos | Fonte certa | Armadilhas ok | Inventou | Vazamentos | Interações | Tempo (mediana) |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const h of hist) console.log(`| ${h.rodada} | ${f2(h.comRag.nota)} | ${f2(h.semRag.nota)} | ${f2(h.ganhoRag)} | ${pc(h.comRag.nota5)} | ${pc(h.comRag.fatosCompletos)} | ${pc(h.comRag.fonteCerta)} | ${pc(h.comRag.armadilhasAdmitiu)} | ${pc(h.comRag.inventou)} | ${h.vazamentos} | ${f2(h.interacoes.nota)} | ${f2(h.comRag.segundosMediana)} s |`);
}

// ---------- principal ----------
try {
  const n = Number(arg);
  if (command === "preparar") await preparar();
  else if (command === "progresso") progresso();
  else if (!Number.isInteger(n) || n < 1) {
    console.log("Comandos: preparar | rodada N | prova N | exportar N | importar N --arquivo X | relatorio N | progresso");
    process.exit(command ? 1 : 0);
  } else if (command === "rodada") await rodada(n);
  else if (command === "prova") {
    await prova(n);
    relatorio(n);
  } else if (command === "exportar") exportar(n);
  else if (command === "importar") importar(n);
  else if (command === "relatorio") relatorio(n);
  else throw new Error(`Comando desconhecido: ${command}`);
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
}
