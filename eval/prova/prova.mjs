// Prova da Kally por rodada: as perguntas de eval/embeddings/perguntas.json respondidas pela Kally de verdade,
// com a base de documentos e sem ela (grupo de controle), corrigidas por checagens automáticas e por um juiz.
//
//   node eval/prova/prova.mjs gerar --api http://localhost:3000/api/mobile --usuario admin --senha ... --saida eval/prova/resultados/rodada-0
//        [--ambiente prova] [--config qwen] [--sem-controle]
//   node eval/prova/prova.mjs corrigir --saida eval/prova/resultados/rodada-0 [--confirmar] [--modelo claude-opus-5-5]
//   node eval/prova/prova.mjs relatorio --saida eval/prova/resultados/rodada-0
//   node eval/prova/prova.mjs comparar eval/prova/resultados/rodada-0 eval/prova/resultados/rodada-1 ...
//
// gerar: entra como administrador da plataforma, envia os documentos (institucionais e pessoais) e espera a
//   indexação, faz cada pergunta numa conversa temporária ("com-base"), apaga os documentos e refaz tudo
//   ("sem-base"). Precisa do servidor com KALLY_PIPELINE=admin (ou on): sem o pipeline, a Kally nem consulta a
//   base. Use um ambiente vazio (--ambiente): os posts de um ambiente real entram na memória e misturam a prova.
//   Retoma de onde parou se for interrompido.
// corrigir: checagens automáticas (fatos presentes, valores do documento errado, fonte certa, se admitiu não
//   saber) e nota 0–5 do juiz (Claude, pela API; precisa de ANTHROPIC_API_KEY ou de `ant auth login`). O juiz
//   não sabe se a resposta é com ou sem base. Mostra o custo estimado e só gasta com --confirmar.
// relatorio: junta tudo em relatorio.md e resumo.json; comparar: uma linha por rodada.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const [command, ...rest] = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 && rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[i + 1] : fallback;
};
const flag = (name) => rest.includes(`--${name}`);
const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback);
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const { perguntas } = readJson(path.join(root, "eval/embeddings/perguntas.json"));
const DOCS = [
  { file: "lgpd-bases-legais.md", dir: "eval/kally/documentos", scope: "institucional" },
  { file: "programa-introducao-programacao.md", dir: "eval/kally/documentos", scope: "pessoal" },
  { file: "corrida-anotacoes.txt", dir: "eval/kally/documentos", scope: "pessoal" },
  { file: "regulamento-coletivo-aurora.md", dir: "eval/embeddings/corpus", scope: "institucional" },
  { file: "regulamento-coletivo-aurora-2024-revogado.md", dir: "eval/embeddings/corpus", scope: "institucional" },
  { file: "guia-tcc-aurora.md", dir: "eval/embeddings/corpus", scope: "institucional" },
  { file: "protocolo-laboratorio-fermentacao.md", dir: "eval/embeddings/corpus", scope: "institucional" },
  { file: "politica-dados-coletivo-aurora.md", dir: "eval/embeddings/corpus", scope: "institucional" },
  { file: "ana-notas-tcc.md", dir: "eval/embeddings/corpus", scope: "pessoal" },
  { file: "bruno-plano-concurso.txt", dir: "eval/embeddings/corpus", scope: "pessoal" },
];
const docText = (file) => {
  const d = DOCS.find((x) => x.file === file);
  return fs.readFileSync(path.join(root, d.dir, d.file), "utf8");
};
const CONDITIONS = ["com-base", "sem-base"];

// ---------- gerar ----------
async function gerar(out) {
  const API = opt("api")?.replace(/\/$/, "");
  const [user, password] = [opt("usuario"), opt("senha")];
  if (!API || !user || !password) throw new Error("Use: gerar --api <URL>/api/mobile --usuario <admin> --senha <senha> --saida <pasta>");
  const env = opt("ambiente", "mente");
  const evalConfig = opt("config");
  const conditions = flag("sem-controle") ? ["com-base"] : CONDITIONS;

  const login = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: user, password }) }).then((r) => r.json());
  if (!login.token) throw new Error(`Login falhou: ${JSON.stringify(login).slice(0, 200)}`);
  const auth = { Authorization: `Bearer ${login.token}` };

  const file = path.join(out, "respostas.json");
  const respostas = readJson(file, []);
  const done = new Set(respostas.map((r) => `${r.id}|${r.condicao}`));
  const docsFile = path.join(out, "documentos.json");
  let docs = readJson(docsFile, null);
  const allDone = (cond) => perguntas.every((q) => done.has(`${q.id}|${cond}`));

  async function upload() {
    const uploaded = [];
    for (const d of DOCS) {
      const form = new FormData();
      form.append("file", new Blob([fs.readFileSync(path.join(root, d.dir, d.file))]), d.file);
      form.append("scope", d.scope);
      const r = await fetch(`${API}/kally/documentos`, { method: "POST", headers: auth, body: form });
      const body = await r.json();
      if (!r.ok || !body.id) throw new Error(`Envio de ${d.file} falhou (${r.status}): ${JSON.stringify(body).slice(0, 200)}`);
      uploaded.push({ id: body.id, file: d.file, scope: d.scope });
    }
    for (let i = 0; i < 180; i++) {
      const list = (await fetch(`${API}/kally/documentos`, { headers: auth }).then((r) => r.json())).documents.filter((x) => uploaded.some((u) => u.id === x.id));
      if (list.length === uploaded.length && list.every((x) => x.status !== "processando")) {
        const failed = list.filter((x) => x.status !== "pronto");
        if (failed.length) throw new Error(`Indexação falhou: ${failed.map((x) => `${x.title} (${x.detail})`).join("; ")}`);
        console.log(`Documentos prontos: ${list.map((x) => `${x.title} (${x._count.chunks} trechos)`).join("; ")}`);
        return uploaded;
      }
      await sleep(2000);
    }
    throw new Error("A indexação dos documentos não terminou em 6 minutos.");
  }

  async function removeDocs() {
    for (const d of docs ?? []) await fetch(`${API}/kally/documentos/${d.id}`, { method: "DELETE", headers: auth }).catch(() => undefined);
  }

  async function ask(message) {
    const started = Date.now();
    const r = await fetch(`${API}/env/${env}/kally`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ message, ...(evalConfig ? { evalConfig } : {}) }) });
    if (!r.ok) return { texto: "", sources: [], erro: `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`, segundos: (Date.now() - started) / 1000 };
    const result = { texto: "", sources: [], stats: null, modo: null, erro: null };
    let firstText = 0;
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done: end } = await reader.read();
      buffer += decoder.decode(value, { stream: !end });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const e = JSON.parse(line.slice(6));
        if (e.text) {
          if (!firstText) firstText = Date.now();
          result.texto += e.text;
        }
        if (e.sources) result.sources = e.sources;
        if (e.stats) result.stats = e.stats;
        if (e.mode) result.modo = e.mode;
        if (e.error) result.erro = e.error;
      }
      if (end) break;
    }
    return { ...result, primeiroTexto: firstText ? (firstText - started) / 1000 : null, segundos: (Date.now() - started) / 1000 };
  }

  async function run(cond) {
    for (const q of perguntas) {
      if (done.has(`${q.id}|${cond}`)) continue;
      const r = await ask(q.pergunta);
      // A fonte vem por documento (id); traduz para o nome do arquivo da prova.
      const docsFonte = r.sources.filter((s) => s.kind === "documento" || s.kind === "referencia").map((s) => docs?.find((d) => d.id === s.slug)?.file ?? s.title);
      respostas.push({ id: q.id, condicao: cond, ...r, docsFonte });
      done.add(`${q.id}|${cond}`);
      writeJson(file, respostas);
      console.log(`${cond} ${q.id} ${String(r.segundos.toFixed(1)).padStart(5)} s · ${r.texto.length} car. · fontes: ${docsFonte.join(", ") || "—"}${r.erro ? ` · ERRO ${r.erro}` : ""}`);
    }
  }

  if (conditions.includes("com-base") && !allDone("com-base")) {
    if (!docs) {
      docs = await upload();
      writeJson(docsFile, docs);
    }
    await run("com-base");
    const withDocs = respostas.filter((r) => r.condicao === "com-base" && r.docsFonte.length).length;
    if (!withDocs) console.warn("\nAVISO: nenhuma resposta usou a base de documentos. O servidor está com KALLY_PIPELINE=admin (ou on)?");
  }
  if (conditions.includes("sem-base") && !allDone("sem-base")) {
    await removeDocs();
    await run("sem-base");
  } else if (!flag("manter-documentos")) await removeDocs();
  console.log(`\n${respostas.length} respostas em ${path.relative(root, file)}`);
}

// ---------- corrigir ----------
const NUMERIC = /^[\d.,%]+$/;
const hasTerm = (text, alternatives) =>
  alternatives.split("|").some((alt) => {
    const a = norm(alt.trim());
    if (!NUMERIC.test(a)) return text.includes(a);
    // Números inteiros como palavra: "6" não pode casar com "2026".
    const escaped = a.replace(/[.%]/g, (c) => `\\${c}`);
    return new RegExp(`(^|[^\\d,.])${escaped}($|[^\\d]|[.,](?!\\d))`).test(text);
  });
const ADMITS = /nao (encontrei|achei|ha |tenho|consta|esta |aparece|existe|sei|localizei|possuo)|nenhuma informac|sem informac|nao ha informac|nao foi possivel encontrar|nao menciona|nao traz|nao especifica|nao informa/;

function checks(q, r) {
  const t = norm(r.texto || "");
  const fatos = q.fatos.map((f) => hasTerm(t, f));
  return {
    fatos: q.fatos.length ? `${fatos.filter(Boolean).length}/${q.fatos.length}` : null,
    fatosCompletos: q.fatos.length ? fatos.every(Boolean) : null,
    errados: q.errado.filter((e) => hasTerm(t, e)),
    fonteCerta: q.documento ? r.docsFonte.includes(q.documento) : null,
    fontes: r.docsFonte.length,
    admiteNaoSaber: ADMITS.test(t),
    cortado: t.length > 200 && !/[.!?…)"”*`>\]\p{Extended_Pictographic}]\s*$/u.test(r.texto.trim()) && !/\n\s*([-*•]|#+) [^\n]+$/.test(r.texto.trim()),
    erro: r.erro || null,
  };
}

const JUDGE_SYSTEM = `Você corrige respostas de uma assistente de estudos (a Kally) dentro de um ambiente de estudos em português. A assistente consulta uma base de documentos do ambiente. Você recebe a pergunta da pessoa, o gabarito escrito antes da prova, o documento de referência (quando há) e a resposta. Dê notas inteiras de 0 a 5, com rigor e consistência.

Critérios:
- aderencia: responde exatamente o que foi perguntado, no nível e no tom da pergunta, sem desviar.
- utilidade: a pessoa consegue usar a resposta direto (aplicar, estudar, decidir), sem precisar refazer o trabalho.
- estrutura: organização proporcional à pergunta. Pergunta curta e factual pede resposta curta; seções, listas e tabelas só quando ajudam. Formatação bonita não soma ponto.
- precisao: os fatos batem com o gabarito e com o documento. Um número, prazo, nome ou regra errado é erro grave. Valor que só aparece num documento revogado também é erro.
- nota: avaliação geral.

Âncoras da nota geral:
5 = responde exatamente, fatos corretos, pronta para usar, estrutura proporcional.
4 = correta e útil, com uma falha menor (um pouco longa, faltou um detalhe secundário).
3 = correta mas genérica, ou incompleta num ponto que a pessoa vai precisar.
2 = parcial: acerta parte, desvia do pedido ou mistura informação certa com errada.
1 = quase inútil: fora do assunto, superficial ou com erro relevante.
0 = errada, inventada ou recusa sem motivo.

Regras:
- Qualquer erro factual limita a nota geral a no máximo 2.
- Pergunta cuja resposta não está na base (o gabarito diz isso): a resposta certa diz com clareza que não encontrou a informação e, se possível, sugere onde procurar. Inventar um valor dá nota 0 ou 1.
- Pergunta fora do assunto da base: vale responder com conhecimento geral ou conversar normalmente; só não pode atribuir aos documentos do ambiente o que não está neles.
- inventou = true se a resposta afirma como fato do ambiente algo que não está no gabarito nem no documento.
- justificativa: uma ou duas frases, citando o erro ou a falta principal.`;

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    aderencia: { type: "integer" },
    utilidade: { type: "integer" },
    estrutura: { type: "integer" },
    precisao: { type: "integer" },
    nota: { type: "integer" },
    inventou: { type: "boolean" },
    justificativa: { type: "string" },
  },
  required: ["aderencia", "utilidade", "estrutura", "precisao", "nota", "inventou", "justificativa"],
  additionalProperties: false,
};
const clamp = (n) => Math.max(0, Math.min(5, Math.round(Number(n) || 0)));

async function judge(client, model, q, r) {
  const reference = q.documento ? `\n\n<documento nome="${q.documento}">\n${docText(q.documento)}\n</documento>` : "\n\n(Não há documento de referência: a resposta não está na base.)";
  const user = `<pergunta>${q.pergunta}</pergunta>\n\n<gabarito>${q.resposta}</gabarito>${reference}\n\n<resposta>\n${r.texto || "(sem resposta)"}\n</resposta>`;
  const response = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: JUDGE_SYSTEM,
    output_config: { effort: "medium", format: { type: "json_schema", schema: JUDGE_SCHEMA } },
    messages: [{ role: "user", content: user }],
  });
  if (response.stop_reason === "refusal") throw new Error(`juiz recusou (${response.stop_details?.category ?? "sem categoria"})`);
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const parsed = JSON.parse(text);
  return {
    aderencia: clamp(parsed.aderencia),
    utilidade: clamp(parsed.utilidade),
    estrutura: clamp(parsed.estrutura),
    precisao: clamp(parsed.precisao),
    nota: clamp(parsed.nota),
    inventou: !!parsed.inventou,
    justificativa: String(parsed.justificativa ?? ""),
    tokens: { entrada: response.usage.input_tokens, saida: response.usage.output_tokens },
  };
}

async function corrigir(out) {
  const respostas = readJson(path.join(out, "respostas.json"), null);
  if (!respostas) throw new Error(`Não há respostas.json em ${out}. Rode gerar antes.`);
  const notasFile = path.join(out, "notas.json");
  const notas = readJson(notasFile, {});
  const model = opt("modelo", "claude-opus-5-5");
  // A ordem é embaralhada para o juiz não ver todas as "com-base" juntas.
  const pending = respostas.filter((r) => !notas[`${r.id}|${r.condicao}`]).sort(() => Math.random() - 0.5);
  if (pending.length) {
    // Estimativa: ~2,5 mil tokens de entrada e ~1,5 mil de saída (com o raciocínio) por resposta.
    const prices = { "claude-opus-5-5": [4, 20], "claude-sonnet-5-5": [2, 10], "claude-haiku-5-5": [0.1, 0.5] };
    const [pin, pout] = prices[model] ?? [4, 20];
    const cost = (pending.length * (2500 * pin + 1500 * pout)) / 1e6;
    console.log(`${pending.length} respostas para o juiz (${model}). Custo estimado: ~US$ ${cost.toFixed(2)}.`);
    if (!flag("confirmar")) {
      console.log("Nada foi enviado. Rode de novo com --confirmar para corrigir.");
      return false;
    }
    const client = new Anthropic();
    let next = 0, finished = 0;
    const worker = async () => {
      while (next < pending.length) {
        const r = pending[next++];
        const q = perguntas.find((x) => x.id === r.id);
        try {
          notas[`${r.id}|${r.condicao}`] = await judge(client, model, q, r);
        } catch (cause) {
          if (cause instanceof Anthropic.AuthenticationError) throw new Error("Sem credencial para a API: defina ANTHROPIC_API_KEY ou rode `ant auth login`.");
          if (cause instanceof Anthropic.RateLimitError || cause instanceof Anthropic.InternalServerError) {
            pending.push(r); // volta para o fim da fila
            await sleep(10_000);
            continue;
          }
          console.error(`${r.id} ${r.condicao}: ${cause instanceof Error ? cause.message : cause}`);
          continue;
        }
        writeJson(notasFile, notas);
        finished++;
        if (process.stdout.isTTY) process.stdout.write(`\r  corrigidas: ${finished}/${pending.length}   `);
        else if (finished % 20 === 0 || finished === pending.length) console.log(`  corrigidas: ${finished}/${pending.length}`);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    process.stdout.write("\n");
  }
  relatorio(out);
  return true;
}

// ---------- relatório ----------
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
};
const f2 = (n) => (Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : "—");
const pc = (n) => (Number.isFinite(n) ? `${Math.round(n * 100)}%` : "—");
const share = (rows, test) => (rows.length ? rows.filter(test).length / rows.length : NaN);

function relatorio(out) {
  const respostas = readJson(path.join(out, "respostas.json"), []);
  const notas = readJson(path.join(out, "notas.json"), {});
  const rows = respostas.map((r) => {
    const q = perguntas.find((x) => x.id === r.id);
    return { q, r, c: checks(q, r), n: notas[`${r.id}|${r.condicao}`] ?? null };
  });
  writeJson(path.join(out, "checagens.json"), rows.map(({ q, r, c }) => ({ id: q.id, condicao: r.condicao, tipo: q.tipo, ...c })));
  const conds = CONDITIONS.filter((c) => rows.some((x) => x.r.condicao === c));
  const of = (cond, test = () => true) => rows.filter((x) => x.r.condicao === cond && test(x));
  const graded = (xs) => xs.filter((x) => x.n);
  const answerable = (x) => !!x.q.documento;

  const lines = [];
  const outl = (s = "") => lines.push(s);
  outl(`# Prova da Kally: ${path.basename(out)}`);
  outl();
  outl(`${perguntas.length} perguntas (${perguntas.filter((q) => q.documento).length} com resposta na base, ${perguntas.filter((q) => !q.documento).length} sem) · ${rows.length} respostas · ${Object.keys(notas).length} corrigidas pelo juiz`);
  outl();

  outl("## 1. Resultado geral");
  outl();
  outl("| | " + conds.join(" | ") + " |");
  outl("|---|" + conds.map(() => "---").join("|") + "|");
  const line = (label, fn) => outl(`| ${label} | ${conds.map((c) => fn(c)).join(" | ")} |`);
  line("Nota geral média (0–5)", (c) => f2(mean(graded(of(c)).map((x) => x.n.nota))));
  line("Respostas com nota 4 ou 5", (c) => pc(share(graded(of(c)), (x) => x.n.nota >= 4)));
  line("Aderência / utilidade / estrutura / precisão", (c) => ["aderencia", "utilidade", "estrutura", "precisao"].map((k) => f2(mean(graded(of(c)).map((x) => x.n[k])))).join(" / "));
  line("Fatos completos (com resposta na base)", (c) => pc(share(of(c, answerable), (x) => x.c.fatosCompletos)));
  line("Usou valor do documento errado", (c) => pc(share(of(c, (x) => x.q.errado.length), (x) => x.c.errados.length)));
  line("Inventou (juiz)", (c) => pc(share(graded(of(c)), (x) => x.n.inventou)));
  line("Citou o documento certo", (c) => pc(share(of(c, answerable), (x) => x.c.fonteCerta)));
  line("Tempo total (mediana)", (c) => `${f2(median(of(c).map((x) => x.r.segundos)))} s`);
  line("1º texto (mediana)", (c) => `${f2(median(of(c).map((x) => x.r.primeiroTexto).filter((v) => v != null)))} s`);
  line("Erros ou respostas cortadas", (c) => String(of(c, (x) => x.c.erro || x.c.cortado).length));
  outl();
  outl("Sem base é o grupo de controle: a mesma Kally, com os documentos apagados. A diferença entre as colunas é o que a base acrescenta.");
  outl();

  outl("## 2. Por tipo de pergunta (nota geral média)");
  outl();
  const types = [...new Set(perguntas.map((q) => q.tipo))];
  outl("| Tipo | n | " + conds.join(" | ") + " |");
  outl("|---|---|" + conds.map(() => "---").join("|") + "|");
  for (const t of types) outl(`| ${t} | ${perguntas.filter((q) => q.tipo === t).length} | ${conds.map((c) => f2(mean(graded(of(c, (x) => x.q.tipo === t)).map((x) => x.n.nota)))).join(" | ")} |`);
  outl();

  if (conds.includes("com-base")) {
    const base = of("com-base", answerable);
    const cell = (fonte, fatos) => base.filter((x) => !!x.c.fonteCerta === fonte && !!x.c.fatosCompletos === fatos);
    outl("## 3. Onde está o erro (com base, perguntas com resposta)");
    outl();
    outl("| | Fatos completos | Faltou fato |");
    outl("|---|---|---|");
    outl(`| Documento certo na fonte | ${cell(true, true).length} (ok) | ${cell(true, false).length} (erro de geração) |`);
    outl(`| Documento certo ausente | ${cell(false, true).length} (acertou sem a fonte) | ${cell(false, false).length} (erro de busca) |`);
    outl();
    outl("Erro de busca: o trecho certo não chegou ao modelo, então a correção está nos embeddings, no corte ou no tamanho do trecho (eval/embeddings). Erro de geração: o trecho chegou, mas a resposta não usou; a correção está no prompt, na competência ou no modelo.");
    outl();
    const gen = cell(true, false).map((x) => x.q.id), search = cell(false, false).map((x) => x.q.id);
    if (gen.length) outl(`- Erros de geração: ${gen.join(", ")}`);
    if (search.length) outl(`- Erros de busca: ${search.join(", ")}`);
    if (gen.length || search.length) outl();
  }

  outl("## 4. Perguntas sem resposta na base");
  outl();
  outl("| | " + conds.join(" | ") + " |");
  outl("|---|" + conds.map(() => "---").join("|") + "|");
  const near = (x) => x.q.tipo === "sem_resposta_perto";
  line("Assunto próximo: disse que não encontrou (checagem)", (c) => pc(share(of(c, near), (x) => x.c.admiteNaoSaber)));
  line("Assunto próximo: inventou (juiz)", (c) => pc(share(graded(of(c, near)), (x) => x.n.inventou)));
  line("Assunto próximo: nota média", (c) => f2(mean(graded(of(c, near)).map((x) => x.n.nota))));
  line("Fora do assunto: nota média", (c) => f2(mean(graded(of(c, (x) => x.q.tipo === "sem_resposta_longe")).map((x) => x.n.nota))));
  outl();

  const worst = graded(rows).filter((x) => x.n.nota <= 2).sort((a, b) => a.n.nota - b.n.nota || a.q.id.localeCompare(b.q.id));
  outl("## 5. Notas 0 a 2");
  outl();
  outl("| Pergunta | Condição | Nota | Fatos | Fonte certa | Motivo (juiz) |");
  outl("|---|---|---|---|---|---|");
  for (const x of worst) outl(`| ${x.q.id}: ${x.q.pergunta} | ${x.r.condicao} | ${x.n.nota} | ${x.c.fatos ?? "—"} | ${x.c.fonteCerta == null ? "—" : x.c.fonteCerta ? "sim" : "não"} | ${x.n.justificativa.replace(/\|/g, "/").replace(/\n/g, " ")} |`);
  if (!worst.length) outl("| — | | | | | |");
  outl();

  const resumo = Object.fromEntries(
    conds.map((c) => [
      c,
      {
        nota: mean(graded(of(c)).map((x) => x.n.nota)),
        nota4ou5: share(graded(of(c)), (x) => x.n.nota >= 4),
        precisao: mean(graded(of(c)).map((x) => x.n.precisao)),
        fatosCompletos: share(of(c, answerable), (x) => x.c.fatosCompletos),
        documentoErrado: share(of(c, (x) => x.q.errado.length), (x) => x.c.errados.length),
        inventou: share(graded(of(c)), (x) => x.n.inventou),
        fonteCerta: share(of(c, answerable), (x) => x.c.fonteCerta),
        admiteNaoSaberPerto: share(of(c, near), (x) => x.c.admiteNaoSaber),
        segundosMediana: median(of(c).map((x) => x.r.segundos)),
        respostas: of(c).length,
        corrigidas: graded(of(c)).length,
      },
    ]),
  );
  writeJson(path.join(out, "resumo.json"), resumo);
  fs.writeFileSync(path.join(out, "relatorio.md"), lines.join("\n") + "\n");
  console.log(lines.join("\n"));
  console.log(`Relatório: ${path.relative(root, path.join(out, "relatorio.md"))}`);
}

function comparar(dirs) {
  const rowsOut = ["| Rodada | Nota (com base) | Nota (sem base) | Ganho da base | Notas 4–5 | Fatos completos | Documento errado | Inventou | Fonte certa | Tempo (mediana) |", "|---|---|---|---|---|---|---|---|---|---|"];
  for (const d of dirs) {
    const r = readJson(path.join(d, "resumo.json"), null);
    if (!r) {
      rowsOut.push(`| ${path.basename(d)} | (sem resumo.json) | | | | | | | | |`);
      continue;
    }
    const a = r["com-base"] ?? {}, b = r["sem-base"] ?? {};
    rowsOut.push(`| ${path.basename(d)} | ${f2(a.nota)} | ${f2(b.nota)} | ${f2(a.nota - b.nota)} | ${pc(a.nota4ou5)} | ${pc(a.fatosCompletos)} | ${pc(a.documentoErrado)} | ${pc(a.inventou)} | ${pc(a.fonteCerta)} | ${f2(a.segundosMediana)} s |`);
  }
  console.log(rowsOut.join("\n"));
}

// ---------- principal ----------
try {
  if (command === "comparar") comparar(rest.filter((x) => !x.startsWith("--")));
  else {
    const out = opt("saida");
    if (!out || !["gerar", "corrigir", "relatorio"].includes(command)) {
      console.log("Comandos: gerar | corrigir | relatorio | comparar (veja o cabeçalho de eval/prova/prova.mjs)");
      process.exit(command ? 1 : 0);
    }
    fs.mkdirSync(out, { recursive: true });
    if (command === "gerar") await gerar(out);
    else if (command === "corrigir") await corrigir(out);
    else relatorio(out);
  }
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
}
