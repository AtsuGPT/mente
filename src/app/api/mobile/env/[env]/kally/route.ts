import { AiError, defaultChatModel, lightServes, ollamaMemory, openChatStream, streamChat, type AiMessage, type FinishReason, type GenerationStats, type LeaseInfo } from "@/server/ai";
import { ensureGpuWatcher, gpuConfig, noteRemoteUse, startGpu } from "@/server/ai/gpu";
import { logPerf, memorySampler } from "@/server/ai/perf";
import { estimateTokens, remoteConfig, remoteHealth } from "@/server/ai/remote";
import { modelChoiceFrom, routeModel, type RouteDecision } from "@/server/kally/router";
import { remoteMaxTokens, remoteStyle, remoteThinks } from "@/server/kally/remote-style";
import { createPacer, typeOut } from "@/server/kally/pacer";
import { autoWebEnabled, citedSources, filterRelevant, findAnswerSources, findPostSources, intimateStory, localSources, postSearchTerms, postSourcesEnabled } from "@/server/kally/post-sources";
import { postReviewEnabled, reviewPostFidelity } from "@/server/kally/post-review";
import { memoryBlock, recallMemories, rememberFrom } from "@/server/kally/memory";
import { essentialOf } from "@/server/kally/essential";
import { EFFORTS, effortFrom, onTopic, partPrompt, planAnswer, wholeText } from "@/server/kally/deep";
import { markDone, markRunning } from "@/server/kally/running";
import { personalOpener, say } from "@/server/kally/narration";
import { latexToText } from "@/server/kally/math-text";
import { createAnswerCleaner } from "@/server/kally/clean";
import { COMPETENCES, selectExamples, type ReferenceExample } from "@/server/kally/competences";
import { searchDocuments } from "@/server/kally/documents";
import { asksOpinionOnly, competenceFor, competenceMode, EVAL_CONFIGS, evalPipeline, interpret, interpretationGuide, needsInterpretation, pipelineFor, refersToOwnPosts, wantsDraft, type Interpretation } from "@/server/kally/pipeline";
import { canEditPost } from "@/server/environments";
import { listCategories } from "@/server/categories";
import { getAdminPost, getPublishedPostBySlug } from "@/server/posts";
import {
  addMessage,
  buildCompetencePrompt,
  buildPrompt,
  chatHead,
  competenceHead,
  createConversation,
  dropLastAnswer,
  detectIntent,
  findRelevantPosts,
  getConversation,
  KALLY_MODES,
  listConversations,
  MAX_MESSAGE_LENGTH,
  needsOutsideHelp,
  reviewText,
  toSources,
  type Attachment,
  type KallyMode,
} from "@/server/kally";
import { searchWeb, type WebResult } from "@/server/web-search";
import { devModel, parseDevSettings } from "@/server/kally-dev";
import { findUserById } from "@/server/users";
import { envAccess, error, json, readJson, type EnvContext } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pedido de resposta curta ("explica rapidinho", "resumido"): sem o interpretador, a profundidade era sempre média e
// o Dudu recebeu seis seções com exercícios quando pediu a segunda lei de Newton "rapidinho" (simulação, rodada 1).
const BRIEF = /\b(rapidinho|rapidamente|r[aá]pido|resumid[oa]|resumindo|curt[oa]|curtinh[oa]|em poucas palavras|s[oó] o b[aá]sico|sem enrola[cç][aã]o|direto ao ponto|em uma frase)\b/i;

/** A mensagem cita o nome (ou sobrenome) de quem escreveu o post. */
function namesAuthor(message: string, author: string | null | undefined) {
  if (!author) return false;
  const fold = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const text = ` ${fold(message).replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  return fold(author).split(/[^\p{L}\p{N}]+/u).some((w) => w.length >= 3 && text.includes(` ${w} `));
}

/**
 * Quanto um pedido grande espera a GPU ligar antes de ir para o 8B (KALLY_REMOTE_WAIT_MS, padrão 6 min; "0" desliga
 * a espera). Em 10/11 a instância levou ~5 min do pedido até a primeira resposta remota.
 */
const remoteWaitMs = () => {
  const v = Number(process.env.KALLY_REMOTE_WAIT_MS);
  return process.env.KALLY_REMOTE_WAIT_MS !== undefined && process.env.KALLY_REMOTE_WAIT_MS !== "" && Number.isFinite(v) && v >= 0 ? v : 360_000;
};

/**
 * Resposta cortada pelo limite de tokens (finish_reason/done_reason "length"): a Kally continua de onde parou, sem
 * repetir. Antes, a frase terminava no meio e passava por completa. No máximo MAX_CONTINUATIONS vezes por resposta.
 */
const MAX_CONTINUATIONS = 2;
function continueFrom(base: AiMessage[], written: string): AiMessage[] {
  const tail = written.length > 6_000 ? written.slice(-6_000) : written;
  return [
    ...base,
    { role: "assistant", content: tail },
    { role: "user", content: "Continue exatamente de onde você parou (mesmo que seja no meio de uma frase, tabela ou lista), sem repetir nada do que já escreveu, sem introdução e sem comentar que está continuando. Termine a resposta normalmente." },
  ];
}

/** Até 3 sites das fontes, para a etapa dizer de onde vem a base: ", como g1.globo.com, cdc.gov e uol.com.br". */
function siteNames(web: WebResult[], prefix = ", como ") {
  const names = [...new Set(web.map((w) => { try { return new URL(w.url).hostname.replace(/^www\./, ""); } catch { return ""; } }).filter(Boolean))].slice(0, 3);
  if (!names.length) return "";
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
  return prefix.startsWith(",") ? `${prefix}${list}` : `${prefix}${list}.`;
}

// Limite por pessoa, em memória: protege o provedor de IA de uso excessivo.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 40;
const usage = new Map<string, { count: number; resetAt: number }>();
function allowed(userId: string) {
  const now = Date.now();
  const entry = usage.get(userId);
  if (!entry || entry.resetAt <= now) {
    usage.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_PER_WINDOW;
}

/**
 * Conversas SALVAS da pessoa neste ambiente (as temporárias não existem no servidor).
 * O dev da plataforma recebe as de todos no ambiente, com a dona em owner.
 */
export async function GET(_request: Request, context: EnvContext) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  if (!access.userId) return error("Entre com sua conta para conversar com a Kally.", 401);
  return json({ conversations: await listConversations(access.environment.id, access.userId, access.platformDev), allUsers: access.platformDev });
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Mensagem à Kally:
 *   { message, mode?, conversationId?, save?, history?, web?, attachment?, review? }
 * - Conversa nova é TEMPORÁRIA por padrão: nada é gravado e o histórico vem do app
 *   (history). Com save: true ela é criada e o histórico passa a vir do banco.
 * - web: a pessoa permite pesquisar na internet quando o ambiente não bastar.
 * - review: { postId | slug | text, kind: "textual" | "intelectual" } (modo revisar).
 * Responde em Server-Sent Events: { conversationId?, temporary, mode } → { sources } →
 * { review }? → { text }... → { done }.
 */
export async function POST(request: Request, context: EnvContext) {
  const startedAt = Date.now();
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  if (!access.userId) return error("Entre com sua conta para conversar com a Kally.", 401);
  const userId = access.userId;

  const body = await readJson(request, 80_000);
  if (body instanceof Response) return body;
  const raw = text(body.message, MAX_MESSAGE_LENGTH + 1);
  if (!raw || raw.length > MAX_MESSAGE_LENGTH) return error(`Escreva uma mensagem de até ${MAX_MESSAGE_LENGTH} caracteres.`, 400);
  // "/post ideia": o mesmo comando do chat do site. Vai direto para Idealizar e monta a prévia.
  const postCommand = /^\/post(?:\s|$)/i.test(raw);
  if (postCommand && !access.permissions.publish) return error("Você não pode publicar neste ambiente.", 403);
  const message = postCommand ? `${raw.replace(/^\/post\s*/i, "").trim() || "minha ideia desta conversa"} — crie o post agora` : raw;

  let conversation = typeof body.conversationId === "string" ? await getConversation(access.environment.id, userId, body.conversationId) : null;
  if (typeof body.conversationId === "string" && !conversation) return error("Conversa não encontrada.", 404);
  // O modo vale por mensagem (a conversa é uma só). Automático: a Kally deduz a intenção.
  const requested = KALLY_MODES.includes(body.mode as KallyMode) ? (body.mode as KallyMode) : "auto";
  if (requested === "ideia" && !access.permissions.publish) return error("Você não pode publicar neste ambiente.", 403);
  const intent = detectIntent(message);
  const hasReviewPayload = !!body.review && typeof body.review === "object";
  let mode: Exclude<KallyMode, "auto"> = postCommand ? "ideia" : requested === "auto" ? (hasReviewPayload ? "revisar" : intent.mode) : requested;
  // Modo Desenvolvedor: só muda o prompt (personalidade/estilo). Permissões e ambiente continuam os mesmos.
  // Só o administrador da plataforma usa o modo; para as outras contas o pedido é ignorado.
  const me = await findUserById(userId);
  const platformAdmin = me?.legacyKind === "ADMIN";
  const dev = platformAdmin ? parseDevSettings(body.dev) : null;
  // Administrador da plataforma e proprietários do ambiente usam a Kally sem o limite por pessoa.
  if (!platformAdmin && access.role !== "OWNER" && !allowed(userId)) return error("Muitas mensagens em pouco tempo. Tente de novo em alguns minutos.", 429);

  // Histórico: do banco (conversa salva) ou do app (temporária, validado e limitado).
  const history = conversation
    ? conversation.messages
    : (Array.isArray(body.history) ? body.history : [])
        .filter((m): m is { role: string; content: string } => !!m && typeof m === "object" && typeof (m as { content?: unknown }).content === "string")
        .slice(-10)
        .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content.slice(0, MAX_MESSAGE_LENGTH) }));

  // Conversa de post em andamento: a mensagem seguinte, sem pergunta nova, continua o post (antes cada mensagem era lida
  // sozinha: "Atividades gerais" virava papo e "Poste isso" saía como texto solto, sem o cartão de publicar).
  if (requested === "auto" && mode === "chat" && !hasReviewPayload && !message.includes("?")) {
    const recent = history.slice(-4);
    const postFlow = recent.some((m) => (m.role === "user" && detectIntent(m.content).mode === "ideia") || (m.role === "assistant" && m.content.includes("<rascunho>")));
    if (postFlow) mode = "ideia";
  }
  if (mode === "ideia" && !access.permissions.publish) mode = "chat";
  const ruleCasual = requested === "auto" && mode === "chat" && intent.casual && !body.attachment;

  const attachment: Attachment | null =
    body.attachment && typeof body.attachment === "object"
      ? (() => {
          const a = body.attachment as Record<string, unknown>;
          const content = text(a.text, 20_000);
          const kinds = ["pdf", "imagem", "texto", "docx", "csv", "audio"] as const;
          return content ? { name: text(a.name, 120) || "anexo", kind: kinds.includes(a.kind as never) ? (a.kind as Attachment["kind"]) : "texto", text: content } : null;
        })()
      : null;

  // Pipeline (KALLY_PIPELINE): a competência vem das regras acima ou, quando elas não bastam,
  // do interpretador; depois o executor responde. Um modelo carregado por vez (model-manager).
  // Avaliação (Etapa 6): escolhe a configuração por pedido, só no servidor de testes e só para o administrador.
  const evalConfig = process.env.KALLY_EVAL === "1" && platformAdmin && EVAL_CONFIGS.includes(body.evalConfig as never) ? (body.evalConfig as (typeof EVAL_CONFIGS)[number]) : null;
  const pipeline = dev ? null : evalConfig ? evalPipeline(evalConfig) : pipelineFor(platformAdmin);
  const sampler = memorySampler();
  let interpretation: Interpretation | null = null;
  let interpreterReport: (Partial<LeaseInfo> & { model: string; ms: number; ok: boolean; competencia: string | null }) | null = null;
  if (pipeline?.interpreter && needsInterpretation({ requested, postCommand, hasReviewPayload, intentMode: intent.mode, message, hasAttachment: !!attachment })) {
    const lastAssistant = [...history].reverse().find((m) => m.role === "assistant")?.content;
    const r = await interpret(pipeline.interpreter, { message, lastAssistant, attachment });
    interpretation = r.result && r.result.competencia === "post" && asksOpinionOnly(message) ? { ...r.result, competencia: "conversa" } : r.result;
    interpreterReport = { ...r.lease, model: pipeline.interpreter, ms: r.ms, ok: !!r.result, competencia: r.result?.competencia ?? null };
    if (interpretation) mode = competenceMode(interpretation, { publish: access.permissions.publish, textToReview: message.length > 400 });
  }

  // Texto para revisar: só o que esta pessoa pode ler (rascunho próprio/editável, publicado visível ou colado).
  let review: { kind: "textual" | "intelectual"; text: string; postId: string | null; slug: string | null } | null = null;
  if (mode === "revisar") {
    const r = (body.review && typeof body.review === "object" ? body.review : {}) as Record<string, unknown>;
    const kind = r.kind === "textual" ? "textual" : "intelectual";
    if (typeof r.postId === "string") {
      const post = await getAdminPost(r.postId, access.environment.id);
      if (!post || !canEditPost(access, post)) return error("Pensamento não encontrado.", 404);
      review = { kind, text: `# ${post.title}\n\n${post.content}`, postId: post.id, slug: post.slug };
    } else if (typeof r.slug === "string") {
      const post = await getPublishedPostBySlug(r.slug, access.scope);
      if (!post) return error("Pensamento não encontrado.", 404);
      review = { kind, text: `# ${post.title}\n\n${post.content}`, postId: null, slug: post.slug };
    } else if (text(r.text, 20_000)) {
      review = { kind, text: text(r.text, 20_000), postId: null, slug: null };
    } else if (message.length > 400) {
      // Automático/Revisar com o texto colado na própria mensagem.
      review = { kind, text: message, postId: null, slug: null };
    }
    // Sem texto: a Kally pede, com naturalidade, que a pessoa cole ou escolha um pensamento.
  }

  // Competência (só no pipeline): instruções, critérios e exemplos próprios de estudo, post e análise.
  // Pedido explícito ("me explica…", "analise…") não é papo casual, mesmo curto e sem "?".
  const competence = pipeline ? competenceFor({ mode, interpretation, message, reviewKind: review?.kind ?? null }) : null;
  const casual = ruleCasual && !competence;
  // Texto de estudo e análise de algo externo: os posts do ambiente só entram se a pessoa se referir
  // a eles. Com a busca atual, posts pouco relacionados entravam e o modelo forçava a relação.
  const skipMemory = (competence === "estudo" || (competence === "analise" && mode !== "revisar")) && !refersToOwnPosts(message);

  // Memória do ambiente: pela mensagem (curta? junta com a anterior), pelo texto revisado ou pelo anexo.
  // Primeiro filtro: o essencial do pedido (essential.ts), escrito pelo modelo, vai para todas as buscas e para o filtro
  // das fontes; a mensagem inteira com saudação, forma de pedir e instruções de formato desviava a busca do assunto.
  // Só nos pedidos grandes (Aprofundado e Máximo), decisão do dono do projeto (11/11/2026): no Normal ele somaria ~3,5 s
  // a toda resposta da Kally 1.5, e a busca segue como antes (a mensagem; curta, junto com a anterior).
  const essential =
    review || casual || effortFrom(body.effort) === "normal"
      ? null
      : await essentialOf({
          message,
          history,
          head: dev ? null : competence ? competenceHead({ competence: COMPETENCES[competence], environmentName: access.environment.name, history }) : chatHead({ environmentName: access.environment.name, history }),
          localModel: dev ? null : pipeline ? pipeline.executor : defaultChatModel(),
        });
  const lastUser = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  const focus = essential?.text || message;
  const query = review
    ? review.text.slice(0, 800)
    : attachment
      ? `${focus} ${attachment.text.slice(0, 600)}`
      : essential
        ? focus
        : message.length < 40
          ? `${lastUser} ${message}`
          : message;
  // Conversas anteriores só entram em Conversar e Aprender: na revisão e na ideia elas se misturariam ao texto da pessoa.
  const withConversations = mode === "chat" || mode === "aprender";
  const retrievalStarted = Date.now();
  // Papo casual não consulta a memória (mais rápido e sem puxar assunto do nada); revisão
  // sem texto também não (a Kally só pede o texto, em vez de "revisar" posts soltos).
  const posts = casual || skipMemory || (mode === "revisar" && !review)
    ? []
    : (
        await findRelevantPosts(access.scope, query, mode === "ideia" ? 3 : 5, {
          userId: withConversations ? userId : null,
          draftAuthorId: userId,
          excludeConversationId: conversation?.id,
          allDrafts: access.permissions.manageContent,
        })
      )
        .filter((p) => !review?.slug || p.slug !== review.slug)
        // Em conversa, só material claramente relacionado, a menos que a pessoa peça os posts.
        // Conversas salvas já passaram pelo mínimo próprio (conversationMin) e entram com metade da nota para ficar
        // atrás dos posts; com o filtro de 0,4 elas nunca chegavam à conversa (simulação: a conversa do João sobre a
        // associação, com cosseno 0,61, ficava de fora e a Kally dizia não saber quem preside).
        // Quem cita o nome de quem escreveu ("o EP do Theo", "o sítio do João") está perguntando por aquele conteúdo:
        // os posts dessa pessoa usam o mesmo filtro de quando se pedem os posts (0,2). Medido com os posts reais da
        // simulação (eval/simulacao/analisar-busca.mjs): post certo passando de 21/24 para 24/24, mesmos 0,25 posts
        // errados por pergunta.
        .filter((p) => mode !== "chat" || p.kind === "conversa" || p.score >= (intent.wantsMemory || namesAuthor(message, p.author) ? 0.2 : 0.4))
        // Quem escreveu, do ponto de vista de quem pergunta: num ambiente com várias pessoas, a Kally tratava o
        // post de uma como se fosse de quem perguntava (simulação, rodada 1).
        .map((p) => (p.kind === "conversa" ? p : { ...p, author: p.authorId === userId ? "a própria pessoa que está conversando com você" : `${p.author ?? "outra pessoa"} (outra pessoa do ambiente)` }));

  // Internet: só com permissão da pessoa, e só quando o ambiente não basta (ou para aprender/aprofundar).
  let web: WebResult[] = [];
  const wantsDeeper = /pesquis|aprofund|fonte|refer[eê]ncia|internet|link/i.test(message);
  if (body.web === true && (needsOutsideHelp(posts) || mode === "aprender" || wantsDeeper)) {
    const webQuery = review
      ? review.text.split("\n")[0].replace(/^#\s*/, "")
      : essential
        ? focus
        : message.replace(/^(me |por favor,? )?(pesquise|pesquisa|aprofunde|explique)( sobre)?\s*/i, "");
    web = await searchWeb(webQuery, 4);
  }
  // Pedido de conhecimento: fontes da internet automáticas, na local e na remota, para a resposta se apoiar nelas
  // e não afirmar o que não encontrou (post-sources.ts). Fora: papo casual, posts (busca própria) e relato pessoal.
  let answerHunt: { consulted: number; sites: number; picked: number; removed: number; ms: number } | null = null;
  const knowledgeAsk = competence === "estudo" || (competence === "analise" && mode !== "revisar") || mode === "aprender" || (mode === "chat" && needsOutsideHelp(posts) && (message.includes("?") || /\b(o que|como|por ?que|quando|quem|qual|quanto|explica|diferen[çc]a)\b/i.test(message)));
  if (!web.length && autoWebEnabled() && !casual && competence !== "post" && mode !== "ideia" && knowledgeAsk && !intimateStory(message)) {
    const hunt = await findAnswerSources(focus);
    // Segundo filtro de assunto com o 32B, se ele estiver no ar (não liga a GPU por isso).
    const filtered = hunt.picked.length && remoteConfig().enabled && (await remoteHealth()).state === "disponivel" ? await filterRelevant(focus, hunt.picked) : { kept: hunt.picked, removed: 0 };
    web = filtered.kept;
    answerHunt = { consulted: hunt.consulted, sites: hunt.sites, picked: filtered.kept.length, removed: filtered.removed, ms: hunt.ms };
  }
  // Bases de documentos (pipeline): a institucional e a pessoal de quem pergunta. Num post pessoal
  // só entram os documentos da própria pessoa (referências externas não são fala dela), e só quando ela
  // pede para usar as anotações ou documentos: o post é público e os documentos são privados. Na simulação
  // (rodada 1), o post de divulgação da Sônia saiu com o faturamento, o aluguel e o código do documento
  // pessoal dela, e outra pessoa recebeu esses dados da Kally em seguida.
  const postUsesOwnDocs = /\b(meus?|minhas?) (documentos?|anota[cç](ão|ões)|notas|arquivos?|planilhas?|n[uú]meros|dados|caderno)\b|\b(do|no|o) (meu )?(documento|arquivo|pdf|caderno) que (eu )?(mandei|enviei|subi)\b/i.test(message);
  const documentSearch = pipeline && !casual && (competence !== "post" || postUsesOwnDocs)
    ? await searchDocuments({ userId, query, limit: 4, institutional: competence !== "post" }).catch((cause) => {
        console.error("Kally documentos: busca indisponível:", cause instanceof Error ? cause.message : cause);
        return null;
      })
    : null;
  const documents = documentSearch?.hits ?? [];
  const retrievalMs = Date.now() - retrievalStarted;
  let sources = toSources(posts, web, documents);
  // Memória da Kally: o que a pessoa contou em conversas salvas e tem a ver com esta mensagem (memory.ts).
  const memories = await recallMemories(access.environment.id, userId, focus, casual ? 3 : 6);

  const canDraft = wantsDraft(competence, message, access.permissions.publish);
  // Post: o que a pessoa já contou (mensagens dela, sem o "crie o post agora" do /post, anexo e
  // documentos dela). Só o tema não basta: o rascunho seria inventado, então a Kally pergunta.
  const ownWords = [raw.replace(/^\/post\s*/i, ""), ...history.filter((m) => m.role === "user").map((m) => m.content)].join(" ").trim();
  const thinMaterial = competence === "post" && !attachment && !documents.length && ownWords.length < 140;
  // Pouca matéria (um objetivo e uma cidade, por exemplo): rascunho breve. Com o tamanho médio (200 a 400 palavras), o
  // modelo enchia com motivações, planos e metáforas que a pessoa não contou (rodada 3: 5 rascunhos de apresentação).
  const shortMaterial = competence === "post" && !attachment && ownWords.length < 400;
  const categories = mode === "ideia" || canDraft ? (await listCategories(access.environment.id)).map((c) => c.name) : [];
  // Com anexo, texto para revisar ou trechos de documentos, o contexto já vai cheio: um exemplo só.
  const exampleSelection = competence ? await selectExamples(competence, message, { max: attachment || review || documents.length ? 1 : 2 }) : null;
  const examples: ReferenceExample[] = exampleSelection?.examples ?? [];

  // Roteamento (só no pipeline, fora do modo dev e da revisão textual): local ou remoto (vLLM).
  // A decisão usa os sinais já calculados acima; com o remoto fora do ar, responde o local.
  const materialChars = (attachment?.text.length ?? 0) + (review?.text.length ?? 0) + documents.reduce((n, d) => n + d.text.length, 0);
  // Quem conversa escolhe o modelo (Automático, Kally local 8B, Kally remota 32B) e o esforço (pedido do dono do
  // projeto, 11/11/2026). Os limites da GPU (vagas, gasto por dia) continuam valendo.
  const effort = effortFrom(body.effort);
  // Esforço acima do normal no Automático vai para a remota (no 8B cada parte levaria minutos) e espera a GPU ligar.
  const chosen = modelChoiceFrom(body.model, true);
  const choice = chosen === "auto" && effort !== "normal" ? "remote" : chosen;
  let route: RouteDecision = { target: "local", reason: "fora do pipeline" };
  let remoteFallback: string | null = null;
  /** pedido grande com a GPU desligada ou ligando: espera o 32B (dentro da resposta) em vez de ir para o 8B */
  let waitRemote: { reason: string; started: Promise<{ ok: boolean; detail: string }> | null } | null = null;
  if (pipeline && !dev && review?.kind !== "textual" && remoteConfig().enabled) {
    route = routeModel(
      { mode, competence, casual, interpretation, message, materialChars, sources: posts.length + documents.length, canDraft, thinMaterial, brief: BRIEF.test(message) },
      choice,
    );
  } else if (dev && choice === "remote" && remoteConfig().enabled) {
    // Modo dev com a personalidade ligada e "só 32B": o mesmo prompt do modo dev, no remoto.
    route = { target: "remote", reason: "modo dev: só 32B" };
  }
  {
    if (route.target === "remote") {
      const health = await remoteHealth();
      if (health.state !== "disponivel") {
        remoteFallback = `remoto ${health.state}${health.detail ? `: ${health.detail}` : ""}`;
        // GPU sob demanda: só com KALLY_GPU_AUTOSTART.
        const gpu = gpuConfig();
        let started: Promise<{ ok: boolean; detail: string }> | null = null;
        if (gpu.autostart && (health.state === "indisponivel" || health.state === "desligado")) {
          started = startGpu(`pedido de ${competence ?? mode} (${route.reason})`).then((r) => {
            if (!r.ok) console.info("Kally GPU: não liguei:", r.detail);
            return r;
          });
        }
        // Pedido grande (post, estudo, análise, revisão, material longo, ou "só 32B" do dev) espera a GPU ligar em vez
        // de gastar o pedido no 8B; o resto responde no local na hora. A espera acontece dentro da resposta, com o
        // andamento na tela (waitForRemote, abaixo).
        const big = choice === "remote" || competence === "post" || competence === "estudo" || competence === "analise" || mode === "revisar" || mode === "ideia" || materialChars > 6_000;
        if (gpu.enabled && gpu.autostart && big && remoteWaitMs() > 0 && (started || health.state === "inicializando")) {
          waitRemote = { reason: route.reason, started };
        }
        route = { target: "local", reason: `${route.reason}; ${remoteFallback}` };
      }
    }
  }
  ensureGpuWatcher();

  // Modo aprofundado (esforço acima do normal): a conversa é salva sozinha, sem perguntar (pedido do dono do projeto).
  if (!conversation && (body.save === true || effort !== "normal")) {
    const created = await createConversation(access.environment.id, userId, mode, review?.text.split("\n")[0].replace(/^#\s*/, "Revisão: ") || message);
    conversation = { ...created, owner: null, messages: [] };
  }
  const conversationId = conversation?.id ?? null;
  // Refazer (botão do app): a pergunta já está gravada; sai só a última resposta, que vai ser gerada de novo.
  if (conversationId && body.retry === true) await dropLastAnswer(conversationId);
  else if (conversationId) await addMessage(conversationId, "user", message);

  const encoder = new TextEncoder();
  // A pessoa fechou a conversa ou saiu. Conversa temporária: a geração para e libera o modelo (nada seria guardado).
  // Conversa salva: a geração continua no servidor ("desligada" da tela) e a resposta inteira é gravada no fim;
  // quem reabrir a conversa vê que a Kally ainda está escrevendo (running.ts).
  const cancel = new AbortController();
  let detached = false;
  let statusSeq = 0;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      if (conversationId) {
        detached = true;
        return;
      }
      cancel.abort();
    },
    async start(controller) {
      if (conversationId) markRunning(conversationId, cancel);
      // Sinal de vida a cada 15 s (comentário SSE, que o app ignora): enquanto a Kally pensa ou escreve uma parte
      // sem mandar texto, o Cloudflare (corta após 100 s parado) e o iPhone (desiste após 60 s sem dados) não
      // derrubam a conversa. Antes, as respostas em partes caíam no meio.
      const heartbeat = setInterval(() => {
        if (cancel.signal.aborted || detached) return;
        try {
          controller.enqueue(encoder.encode(": ainda escrevendo\n\n"));
        } catch {
          // fechado
        }
      }, 15_000);
      const send = (event: Record<string, unknown>) => {
        if (event.status !== undefined) statusSeq += 1;
        if (cancel.signal.aborted || detached) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          if (conversationId) detached = true;
          else cancel.abort();
        }
      };
      send({ conversationId, temporary: !conversationId, mode, searched: web.length > 0, dev: !!dev });
      // Esperando a GPU: confere a cada 5 s e mostra o andamento (isso também mantém a conexão viva).
      // Pronta: responde o 32B. Não ligou (limite do dia, erro) ou passou de KALLY_REMOTE_WAIT_MS: responde o 8B.
      if (waitRemote) {
        const began = Date.now();
        let failed: string | null = null;
        let gpuLine = "";
        void waitRemote.started?.then((r) => {
          if (!r.ok && !/em andamento/.test(r.detail)) failed = r.detail;
        });
        while (!cancel.signal.aborted && Date.now() - began < remoteWaitMs()) {
          gpuLine ||= say("gpu");
          send({ status: gpuLine, step: "gpu" });
          await new Promise((resolve) => setTimeout(resolve, 5_000));
          if (failed) break;
          const h = await remoteHealth(true);
          if (h.state === "disponivel") {
            route = { target: "remote", reason: `${waitRemote.reason}; esperou a GPU ${Math.round((Date.now() - began) / 1000)} s` };
            remoteFallback = null;
            break;
          }
          if (h.state === "erro") {
            failed = h.detail;
            break;
          }
        }
        if (route.target !== "remote") {
          remoteFallback = failed ? `GPU não ligou: ${failed}` : `GPU não ficou pronta em ${Math.round(remoteWaitMs() / 1000)} s`;
          route = { target: "local", reason: `${waitRemote.reason}; ${remoteFallback}` };
          send({ status: say("gpuFalhou"), step: "gpu-falhou" });
        }
      }
      send({ sources });
      // O que a Kally já fez antes de escrever, em uma frase amistosa: a pessoa sabe de onde vem a resposta.
      if (!casual) {
        const done = [
          posts.length ? `encontrei ${posts.length === 1 ? "um pensamento" : `${posts.length} pensamentos`} do ambiente sobre isso` : "",
          documents.length ? `olhei ${documents.length === 1 ? "um trecho" : `${documents.length} trechos`} dos seus documentos` : "",
          web.length ? `consultei ${web.length} ${web.length === 1 ? "fonte" : "fontes"}${siteNames(web)}${answerHunt ? `, entre ${answerHunt.consulted} páginas de ${answerHunt.sites} sites` : ""}, para te responder com base e não de cabeça` : "",
          memories.length ? "lembrei do que você já me contou, para deixar a resposta do seu jeito" : "",
        ].filter(Boolean);
        if (done.length) {
          const text = done.length === 1 ? done[0] : `${done.slice(0, -1).join(", ")} e ${done[done.length - 1]}`;
          send({ status: say("escrevendo", { feito: `${text.charAt(0).toUpperCase()}${text.slice(1)}` }), step: "resumo" });
        }
        // Abertura única para este pedido, escrita pelo 32B em paralelo (só com a remota no ar). Entra se chegar antes
        // do texto e antes de outra etapa; senão fica de fora (não atrasa nada).
        if (route.target === "remote" && !dev) {
          const seq = statusSeq;
          const plans = [
            ...done,
            competence === "post" ? "buscar fontes para o post e escrever o rascunho com a voz da pessoa, conferindo cada frase" : "",
            effort !== "normal" && competence !== "post" ? "planejar e escrever a resposta em partes, conferindo cada uma" : "",
          ].filter(Boolean);
          void personalOpener({ message, plans }).then((frase) => {
            if (frase && !answer && statusSeq === seq) send({ status: frase, step: "resumo" });
          });
        }
      }
      let answer = "";
      let postWeb: WebResult[] = [];
      let continuations = 0;
      let deepReport: { effort: string; parts: number; target: string; retried: number; dropped: number; skipped: number; trimmed: number; ms: number } | null = null;
      let sourceHunt: { terms: string[]; consulted: number; sites: number; byKind: Record<string, number>; picked: number; removed: number; ms: number } | null = null;
      let postReview: { applied: number; proposed: number; ms: number; ok: boolean } | null = null;
      // Desempenho deste pedido (logs/kally-perf.jsonl).
      let modelName: string | null = null;
      let stats = null as GenerationStats | null;
      let lease = null as LeaseInfo | null;
      let generationStarted = 0;
      let generationEnded = 0;
      let firstText = 0;
      let failed: string | null = null;
      try {
        if (review?.kind === "textual") {
          const result = await reviewText(review.text, access.environment.name);
          send({ review: { ...result, postId: review.postId, slug: review.slug } });
          answer = [
            result.resumo || "Revisei o texto.",
            result.sugestoes.length
              ? `\n\n${result.sugestoes.length} sugestões: marque as que quiser aplicar e leve ao editor. Nada muda no original sem você salvar.${result.truncated ? " (Revisei só o começo de um texto longo.)" : ""}`
              : "\n\nNão encontrei mudanças importantes a sugerir.",
          ].join("");
          send({ text: answer });
        } else {
          // Post na remota: fontes reais e diversas (notícias nacionais e globais, redes sociais, referências, vídeos)
          // sobre os conceitos gerais do tema, citadas com link. Só os termos gerais saem do servidor (post-sources.ts);
          // a pessoa vê cada etapa enquanto espera.
          // Só quando ela pede fontes, dados ou pesquisa: num post pessoal, as fontes viravam seção de "Referências" e o
          // post saía com cara de artigo (13/11/2026).
          const wantsSources = /\b(fontes?|refer[eê]ncias?|pesquis\w*|dados|estat[ií]stic\w*|estudos?|cient[ií]fic\w*|com links?|embasad\w*)\b/i.test(ownWords);
          if (route.target === "remote" && competence === "post" && wantsSources && !thinMaterial && postSourcesEnabled() && !intimateStory(ownWords)) {
            send({ status: say("postFontes"), step: "post-fontes" });
            const terms = interpretation?.termos ? { pt: interpretation.termos, en: interpretation.termosEn ?? [] } : await postSearchTerms(ownWords);
            if (terms.pt.length && !cancel.signal.aborted) {
              send({ status: say("postPesquisa", { termos: terms.pt.join(", ") }), step: "post-pesquisa" });
              const hunt = await findPostSources(terms);
              // Segundo filtro: o 32B confere se cada fonte trata do que ela escreveu (post-sources.ts).
              const filtered = await filterRelevant(ownWords, hunt.picked);
              sourceHunt = { terms: terms.pt, consulted: hunt.consulted, sites: hunt.sites, byKind: hunt.byKind, picked: filtered.kept.length, removed: filtered.removed, ms: hunt.ms };
              const found = filtered.kept.filter((f) => !web.some((w) => w.url === f.url));
              if (found.length) {
                send({ status: say("postLeu", { paginas: hunt.consulted, sites: hunt.sites }) + siteNames(found, " Entre elas: "), step: "post-leu" });
                postWeb = found;
                web = [...web, ...found].slice(0, 16);
                sources = toSources(posts, web, documents);
                send({ sources });
              }
            }
          }
          const guide = interpretation ? interpretationGuide(interpretation) : null;
          const spec = competence ? COMPETENCES[competence] : null;
          const competenceArgs = spec
            ? { competence: spec, examples, canDraft, depth: shortMaterial ? ("breve" as const) : interpretation?.profundidade ?? (BRIEF.test(message) ? ("breve" as const) : undefined), thinMaterial, environmentName: access.environment.name, categories, history, message, posts, web, attachment, reviewText: review?.text ?? null, guide, documents, userName: me?.displayName }
            : null;
          // Memória da pessoa (só os itens ligados a esta mensagem) logo depois das regras do sistema.
          // Memória logo antes da pergunta (e não no começo): o começo do prompt e o histórico ficam iguais entre pedidos,
          // e o modelo os reaproveita sem reler.
          const withMemory = (p: AiMessage[]): AiMessage[] => {
            if (!memories.length) return p;
            const at = p.map((m) => m.role).lastIndexOf("user");
            const cut = at < 0 ? p.length : at;
            return [...p.slice(0, cut), { role: "system", content: memoryBlock(memories) }, ...p.slice(cut)];
          };
          const promptWith = (w: WebResult[]) =>
            withMemory(competenceArgs
              ? buildCompetencePrompt({ ...competenceArgs, web: w })
              : buildPrompt({ mode, environmentName: access.environment.name, categories, history, message, posts, web: w, attachment, reviewText: review?.text ?? null, dev, guide, toneExamples: !pipeline || casual, documents, userName: me?.displayName }));
          // Local (8B): versão reduzida das fontes, para o prompt não pesar na placa (localSources). Remota: todas.
          const reducedWeb = localSources(web);
          const prompt = promptWith(reducedWeb);
          const fullPrompt = reducedWeb.length === web.length && reducedWeb.every((w, i) => w.snippet === web[i].snippet) ? prompt : promptWith(web);
          // No pipeline o executor responde tudo. Fora dele, a revisão intelectual usa KALLY_REVIEW_MODEL, se configurado.
          // Modo dev com "só 8B": o executor do pipeline (KALLY_EXECUTOR_MODEL), não o modelo experimental.
          const model = dev ? (choice === "local" ? process.env.KALLY_EXECUTOR_MODEL || devModel(dev) : devModel(dev)) : pipeline ? pipeline.executor : mode === "revisar" && review ? process.env.KALLY_REVIEW_MODEL || undefined : undefined;
          modelName = model || defaultChatModel();
          // Modo dev e pipeline do administrador: diz qual modelo responde e mostra as medições.
          // Servidor de testes (KALLY_EVAL=1): as métricas vão para qualquer conta, para a simulação separar falha de
          // busca de falha de interpretação. Fora dele, nada muda.
          // Em produção, KALLY_EVAL_AMBIENTES (slugs separados por vírgula) liga as métricas só nos ambientes da simulação.
          const evalEnvironment = process.env.KALLY_EVAL === "1" || (process.env.KALLY_EVAL_AMBIENTES ?? "").split(",").map((x) => x.trim()).includes(access.environment.slug);
          const showStats = !!dev || (!!pipeline && platformAdmin) || !!evalConfig || evalEnvironment;
          if (showStats) send({ model: route.target === "remote" ? remoteConfig().model : modelName, backend: route.target });
          generationStarted = Date.now();
          // Com 800, o código pedido pelo Rafael e a conta da Sônia saíram cortados no meio (simulação, rodada 1). O modelo
          // para sozinho quando termina; só respostas longas usam o teto.
          // Tetos de 8 de novembro (pedido do dono do projeto): conversa 1.400 → 2.048, papo casual 320 → 480, competências
          // +35 a 45%. Nas provas locais nenhuma resposta chegou perto do teto (máximo de 260 tokens de 1.400): as respostas
          // curtas vinham das regras de estilo, não do corte. O teto só pesa em pedidos longos (planos, código, textos), e
          // prompt + resposta continuam dentro do contexto de 8.192.
          const maxTokens = dev ? 4_096 : spec ? spec.maxTokens : casual ? 480 : 2_048;
          // Conversa comum a 0,2 (era 0,45): na simulação, perguntas sobre o ambiente ganhavam interpretações que não
          // estão no material e variavam de uma execução para outra. Ideia e competências mantêm a temperatura delas.
          const temperature = spec ? spec.temperatura : mode === "ideia" ? 0.6 : 0.2;
          // Mesmo contexto (num_ctx) para qualquer modelo no dev e no pipeline: comparações justas e sem recargas.
          // KALLY_TIMEOUT_MS: teto do pipeline (padrão 180 s). Na simulação local, na CPU (~7 tokens/s), 4 de 19 respostas
          // longas da rodada 2 passaram de 180 s e foram cortadas; na GPU do servidor (~34 tokens/s) o teto de 2.048 tokens
          // cabe em ~60 s. A instância de teste usa um teto maior; a produção continua com o padrão.
          const pipelineTimeout = Number(process.env.KALLY_TIMEOUT_MS) || 180_000;
          const extra = dev ? { sameContext: true, timeoutMs: 600_000 } : pipeline ? { sameContext: true, timeoutMs: pipelineTimeout } : {};
          // Rótulos internos ([P1], "material fornecido") saem da resposta antes de chegar à pessoa (clean.ts).
          const cleaner = createAnswerCleaner();
          const emit = (text: string) => {
            if (!text) return;
            answer += text;
            send({ text });
          };
          const runLocal = async () => {
            let messages = prompt;
            for (let round = 0; round <= MAX_CONTINUATIONS; round++) {
              let reason = "other" as FinishReason;
              for await (const chunk of streamChat(messages, { temperature, maxTokens, model, onStats: (s) => (stats = s), onLease: (info) => (lease = info), signal: cancel.signal, onFinish: (r) => (reason = r), ...extra })) {
                if (!firstText) firstText = Date.now();
                emit(cleaner.push(chunk));
              }
              if (reason !== "length" || cancel.signal.aborted) break;
              emit(cleaner.flush());
              continuations += 1;
              messages = continueFrom(prompt, answer);
            }
          };
          // Remoto: o mesmo prompt (a mesma busca, as mesmas regras). Cai para o local, sem misturar modelos,
          // quando falha ou não manda o 1º texto a tempo ANTES de qualquer texto chegar à pessoa. Depois do 1º
          // texto, uma falha vira erro (a resposta parcial não é apresentada como completa).
          const runRemote = async (): Promise<boolean> => {
            const cfg = remoteConfig();
            const health = await remoteHealth();
            // Prompt do remoto: o mesmo da Kally (material, regras, histórico) + o estilo de alta qualidade no fim.
            const brief = BRIEF.test(message);
            const isPost = competence === "post" && canDraft;
            // Modo dev: o prompt do modo, sem o estilo de alta qualidade (a personalidade definida manda no formato).
            const style = dev ? "" : remoteStyle({ competence, brief, post: isPost, shortPost: isPost && shortMaterial });
            // Post: um exemplo só (ele ancora a fidelidade; sem nenhum, o 32B inventou falas e detalhes no post do avô).
            // O formato vem do esqueleto do estilo.
            const base = isPost && competenceArgs && examples.length > 1 ? withMemory(buildCompetencePrompt({ ...competenceArgs, web, examples: examples.slice(0, 1) })) : fullPrompt;
            const last = base[base.length - 1];
            const remotePrompt = !style ? base : last?.role === "system" ? [...base.slice(0, -1), { ...last, content: `${last.content}\n\n${style}` }] : [...base, { role: "system" as const, content: style }];
            const promptTokens = estimateTokens(remotePrompt.map((m) => m.content).join("\n"));
            // Raciocínio escondido nas tarefas difíceis: mais tokens (o pensar conta no teto) e mais prazo para o 1º texto.
            const thinks = remoteThinks({ competence, mode, message, brief });
            const wanted = Math.max(maxTokens, remoteMaxTokens(competence, brief, isPost)) + (thinks ? 3_000 : 0);
            const remoteMax = health.maxModelLen ? Math.min(wanted, health.maxModelLen - promptTokens - 64) : wanted;
            if (remoteMax < 512) {
              remoteFallback = `contexto do remoto (${health.maxModelLen}) pequeno para ~${promptTokens} tokens de prompt`;
              return false;
            }
            const firstToken = new AbortController();
            const timer = setTimeout(() => firstToken.abort(), thinks ? Math.max(cfg.firstTokenMs, 120_000) : cfg.firstTokenMs);
            let gotText = false;
            // O texto do vLLM chega em rajadas: o pacer solta em ritmo constante (pacer.ts).
            const pacer = createPacer(emit, cancel.signal);
            // Post: o rascunho é escrito inteiro, passa pela revisão de fidelidade (post-review.ts) e só então aparece.
            // Enquanto isso, a pessoa vê o andamento (palavras escritas, revisão).
            const collect = isPost && postReviewEnabled();
            let draft = "";
            let lastStatus = 0;
            let rascunhoLine = "";
            if (thinks) send({ status: say("raciocinio"), step: "raciocinio" });
            try {
              // Post a 0,2 (a 0,4 saíam palavras truncadas como "escre-las" e mais detalhes inventados); o resto a 0,4 ou mais.
              let messages = remotePrompt;
              let written = "";
              for (let round = 0; round <= MAX_CONTINUATIONS; round++) {
                let reason = "other" as FinishReason;
                // Continuação: cabe no contexto do vLLM junto com o fim do que já foi escrito (~2.000 tokens).
                const roundMax = round === 0 ? remoteMax : health.maxModelLen ? Math.max(512, Math.min(remoteMax, health.maxModelLen - promptTokens - 2_100)) : remoteMax;
                const chunks = await openChatStream(messages, { temperature: isPost ? 0.2 : Math.max(temperature, 0.4), maxTokens: roundMax, target: "remote", think: round === 0 ? thinks : false, signal: round === 0 ? AbortSignal.any([cancel.signal, firstToken.signal]) : cancel.signal, onStats: (s) => (stats = s), onFinish: (r) => (reason = r) });
                modelName = cfg.model;
                for await (const chunk of chunks) {
                  if (!gotText) {
                    gotText = true;
                    clearTimeout(timer);
                  }
                  const part = cleaner.push(chunk);
                  if (!collect) {
                    if (!firstText) firstText = Date.now();
                    written += part;
                    pacer.push(part);
                    continue;
                  }
                  draft += part;
                  if (Date.now() - lastStatus > 1_500) {
                    lastStatus = Date.now();
                    rascunhoLine ||= say("rascunho", { palavras: -1 });
                    send({ status: rascunhoLine.replace("-1", String(draft.split(/\s+/).filter(Boolean).length)), step: "rascunho" });
                  }
                }
                if (reason !== "length" || cancel.signal.aborted) break;
                const rest = cleaner.flush();
                if (collect) draft += rest;
                else {
                  written += rest;
                  pacer.push(rest);
                }
                continuations += 1;
                messages = continueFrom(remotePrompt, collect ? draft : written);
              }
              if (collect) {
                draft += cleaner.flush();
                send({ status: say("revisao"), step: "revisao" });
                const checked = await reviewPostFidelity({ ownWords, sources: web, draft });
                postReview = { applied: checked.applied, proposed: checked.proposed, ms: checked.ms, ok: checked.ok };
                firstText = Date.now();
                await typeOut(checked.text, emit, cancel.signal);
              } else {
                await pacer.finish();
              }
              noteRemoteUse();
              return true;
            } catch (cause) {
              pacer.flushNow();
              // Nada chegou à pessoa ainda (inclusive no post, que só aparece no fim): dá para cair para o local.
              if (cancel.signal.aborted || answer) throw cause;
              remoteFallback = firstToken.signal.aborted ? `remoto sem 1º texto em ${cfg.firstTokenMs} ms` : `remoto falhou: ${cause instanceof Error ? cause.message : String(cause)}`;
              console.warn("Kally: remoto → local:", remoteFallback);
              return false;
            } finally {
              clearTimeout(timer);
            }
          };
          // Resposta em partes (esforço aprofundado ou máximo, deep.ts): planeja e escreve parte por parte, cada uma
          // com o plano e o que já foi escrito. Fora do post (que tem revisão própria), da ideia e do papo casual.
          const deep = effort !== "normal" && !casual && competence !== "post" && mode !== "ideia" ? EFFORTS[effort] : null;
          const runDeep = async (remote: boolean): Promise<boolean> => {
            if (!deep || effort === "normal") return false;
            const style = remote && !dev ? remoteStyle({ competence, brief: false, post: false }) : "";
            // Sem os exemplos de referência: no teste de 11/11 o 8B escreveu uma parte inteira sobre o tema do exemplo
            // ("elasticidade-preço") numa pergunta sobre inflação.
            const own = competenceArgs ? withMemory(buildCompetencePrompt({ ...competenceArgs, examples: [], web: remote ? web : localSources(web) })) : remote ? fullPrompt : prompt;
            const lastMsg = own[own.length - 1];
            const base = !style ? own : lastMsg?.role === "system" ? [...own.slice(0, -1), { ...lastMsg, content: `${lastMsg.content}\n\n${style}` }] : [...own, { role: "system" as const, content: style }];
            // Teto de tempo (Aprofundado: 5 minutos, com qualquer modelo): conta do plano à última parte.
            const deadline = deep.budgetMs ? Date.now() + deep.budgetMs : null;
            const left = () => (deadline ? deadline - Date.now() : Number.POSITIVE_INFINITY);
            send({ status: say("planejar", { partes: deep.parts }), step: "planejar" });
            const plan = await planAnswer(base, effort, { remote, model, signal: cancel.signal });
            if (!plan || cancel.signal.aborted) {
              send({ status: say("planoFalhou"), step: "plano-falhou" });
              return false;
            }
            deepReport = { effort, parts: plan.partes.length, target: remote ? "remote" : "local", retried: 0, dropped: 0, skipped: 0, trimmed: 0, ms: 0 };
            const deepStarted = Date.now();
            send({ status: `Planejei ${plan.partes.length} partes: ${plan.partes.map((p) => `«${p.titulo}»`).join(" · ")}.`, step: "plano" });
            // Velocidade medida da geração (tokens/s), para caber a parte no tempo que resta; antes da 1ª parte, uma estimativa.
            // A Kally 1.5 pela API escreve tão rápido quanto a 32; só o Qwen do PC fica em ~8 tokens/s.
            let rate = remote || lightServes(model) ? 35 : 8;
            const partMs: number[] = [];
            /**
             * Escreve uma parte inteira (sem mostrar): ela só aparece depois de conferida (onTopic). Com teto de tempo, a
             * parte para quando o tempo acaba e é cortada no último ponto inteiro (wholeText): nunca no meio da frase.
             */
            const writePart = async (messages: AiMessage[], maxTokens: number) => {
              let text = "";
              let current = messages;
              let unfinished = false;
              const timeUp = new AbortController();
              const timer = deadline ? setTimeout(() => timeUp.abort(), Math.max(0, left())) : null;
              const signal = AbortSignal.any([cancel.signal, timeUp.signal]);
              try {
                for (let round = 0; round <= MAX_CONTINUATIONS; round++) {
                  let reason = "other" as FinishReason;
                  if (remote) {
                    const thinkPart = round === 0 && (deep.think || remoteThinks({ competence, mode, message, brief: false }));
                    const chunks = await openChatStream(current, { temperature: 0.4, maxTokens: maxTokens + (thinkPart ? 2_500 : 0), target: "remote", think: thinkPart, signal, onStats: (st) => (stats = st), onFinish: (r) => (reason = r) });
                    modelName = remoteConfig().model;
                    for await (const chunk of chunks) text += cleaner.push(chunk);
                  } else {
                    for await (const chunk of streamChat(current, { temperature, maxTokens, model, onStats: (st) => (stats = st), onLease: (info) => (lease = info), signal, onFinish: (r) => (reason = r), ...extra })) text += cleaner.push(chunk);
                  }
                  text += cleaner.flush();
                  if (reason !== "length" || signal.aborted) break;
                  // Sem tempo para continuar: fica o que cabe, cortado num ponto inteiro.
                  if (left() < 20_000) {
                    unfinished = true;
                    break;
                  }
                  continuations += 1;
                  current = continueFrom(messages, text);
                }
              } catch (cause) {
                // Só o fim do tempo é tratado aqui (fica o que já foi escrito); o Parar e as falhas seguem para fora.
                if (cancel.signal.aborted || !timeUp.signal.aborted) throw cause;
                text += cleaner.flush();
                unfinished = true;
              } finally {
                if (timer) clearTimeout(timer);
              }
              if (stats?.tokensPerSecond) rate = stats.tokensPerSecond;
              if (unfinished && deepReport) deepReport.trimmed += 1;
              return (unfinished ? wholeText(text) : text).trim();
            };
            try {
              for (const [i, part] of plan.partes.entries()) {
                if (cancel.signal.aborted) break;
                const partStarted = Date.now();
                const average = partMs.length ? partMs.reduce((a, b) => a + b, 0) / partMs.length : null;
                // Sem tempo nem para uma parte curta: as que faltam ficam de fora (a anterior já fechou, se deu para prever).
                if (i > 0 && left() < 25_000) {
                  deepReport.skipped = plan.partes.length - i;
                  break;
                }
                // Depois desta não haveria tempo para outra: esta fecha a resposta. Antes da 1ª parte, a estimativa vem da
                // velocidade (uma parte costuma usar ~70% do limite): no 8B, a 1ª parte sozinha pode levar quase os 5 minutos.
                const estimate = average ?? ((deep.tokens * 0.7) / rate) * 1000;
                const final = deadline !== null && i < plan.partes.length - 1 && left() < estimate * 2;
                const label = `parte ${i + 1} de ${plan.partes.length}: ${part.titulo}`;
                send({ status: say(final ? "fechando" : i === 0 ? "primeiraParte" : "parte", { label }), step: `parte-${i}` });
                // Tokens que cabem no tempo que resta (com folga), sem passar do limite normal da parte.
                const budget = () => (deadline ? Math.max(300, Math.min(deep.tokens, Math.floor(((left() - 10_000) / 1000) * rate * 0.85))) : deep.tokens);
                // Nunca sair do assunto: a parte é conferida antes de aparecer; fora do assunto, é refeita uma vez (se
                // houver tempo) e, se continuar fora, não entra na resposta.
                // Conferida contra o pedido e contra o essencial dele (essential.ts): o pedido inteiro, com saudação e forma de
                // pedir, puxava a nota para baixo e descartava partes do assunto certo (log de 12/11: as 4 partes de uma
                // pergunta sobre o site saíram, com notas de 0,28 a 0,37, e a resposta ficou vazia).
                const topic = async (t: string) => {
                  const own = await onTopic(message, t);
                  return own.ok || !essential ? own : onTopic(essential.text, t);
                };
                let text = await writePart(partPrompt(base, plan, i, answer, message, false, final), budget());
                let check = await topic(text);
                if (!check.ok && !cancel.signal.aborted && left() > (average ?? 60_000)) {
                  deepReport.retried += 1;
                  send({ status: say("parteRefeita", { label }), step: `parte-${i}-refeita` });
                  text = await writePart(partPrompt(base, plan, i, answer, message, true, final), budget());
                  check = await topic(text);
                }
                partMs.push(Date.now() - partStarted);
                if (!check.ok || !text) {
                  deepReport.dropped += 1;
                  console.warn("Kally em partes: parte fora do assunto descartada:", part.titulo, check);
                } else {
                  if (!firstText) firstText = Date.now();
                  await typeOut(`${answer ? "\n\n" : ""}${text}`, emit, cancel.signal);
                }
                if (final) {
                  deepReport.skipped = plan.partes.length - i - 1;
                  break;
                }
              }
              deepReport.ms = Date.now() - deepStarted;
              // Nenhuma parte passou: em vez de terminar sem resposta, cai para a resposta normal (uma só).
              if (!answer.trim() && !cancel.signal.aborted) {
                send({ status: "" });
                return false;
              }
              send({ status: "" });
              if (remote) noteRemoteUse();
              return true;
            } catch (cause) {
              // Já há texto na tela: a falha vira erro (a resposta parcial não passa por completa). Sem texto, cai para o normal.
              if (cancel.signal.aborted || answer) throw cause;
              remoteFallback = `em partes falhou: ${cause instanceof Error ? cause.message : String(cause)}`;
              return false;
            }
          };
          try {
            if (route.target === "remote") {
              const done = (deep && (await runDeep(true))) || (await runRemote());
              if (!done) {
                route = { target: "local", reason: `${route.reason}; ${remoteFallback}` };
                modelName = model || defaultChatModel();
                // A remota falhou: a local responde direto (em partes, no 8B, levaria muitos minutos).
                await runLocal();
              }
            } else if (!(deep && (await runDeep(false)))) {
              await runLocal();
            }
          } finally {
            emit(cleaner.flush());
          }
          generationEnded = Date.now();
          // Fontes do post: a lista final mostra só as que o texto citou.
          if (postWeb.length) {
            const cited = citedSources(postWeb, answer);
            web = web.filter((w) => !postWeb.includes(w) || cited.includes(w));
            sources = toSources(posts, web, documents);
            send({ sources });
          }
          if (showStats) {
            const seconds = (ms: number) => Math.round(ms / 100) / 10;
            const report = {
              ...(stats ?? { model: modelName }),
              backend: { target: route.target, reason: route.reason, fallback: remoteFallback },
              ...(sourceHunt ? { sources: sourceHunt } : {}),
              ...(postReview ? { postReview } : {}),
              firstTextSeconds: firstText ? seconds(firstText - generationStarted) : null,
              wallSeconds: seconds(generationEnded - generationStarted),
              ...(evalEnvironment
                ? { retrieval: { mode, competence, casual, skippedMemory: skipMemory, posts: posts.length, documents: documents.length, seconds: seconds(retrievalMs) } }
                : {}),
              memory: await ollamaMemory(modelName),
              ...(pipeline
                ? {
                    pipeline: {
                      interpreted: !!interpreterReport,
                      competence,
                      interpreterSeconds: interpreterReport ? seconds(interpreterReport.ms) : 0,
                      // trocas de modelo: a do interpretador (se houve) e a de volta ao executor
                      swapSeconds: seconds((interpreterReport?.unloadMs ?? 0) + (interpreterReport?.loadMs ?? 0) + (lease?.unloadMs ?? 0) + (lease?.loadMs ?? 0)),
                      queueSeconds: seconds((interpreterReport?.queueMs ?? 0) + (lease?.queueMs ?? 0)),
                      firstTextTotalSeconds: firstText ? seconds(firstText - startedAt) : null,
                      totalSeconds: seconds(generationEnded - startedAt),
                    },
                  }
                : {}),
            };
            if (dev) console.info("Kally dev:", JSON.stringify(report));
            send({ stats: report });
          }
        }
        // Conversa salva: o que a mensagem traz de duradouro sobre a pessoa vai para a memória (aviso na tela).
        // A extração segue em segundo plano: se acabar em até 6 s, a tela avisa; senão guarda sem segurar o fim.
        if (conversationId && answer) {
          const remembering = rememberFrom({ environmentId: access.environment.id, userId, message: raw, conversationId, localModel: pipeline?.executor, timeoutMs: 45_000 });
          const remembered = await Promise.race([remembering, new Promise<string[]>((resolve) => setTimeout(() => resolve([]), 6_000))]);
          if (remembered.length) send({ remembered });
        }
        // Pedido maior numa conversa temporária: a Kally oferece salvar (o app pergunta; nada é salvo sem o sim).
        if (!conversationId && !casual && answer.length >= 1_200 && (competence || mode !== "chat" || answer.length >= 2_500)) send({ offerSave: true });
        send({ done: true });
      } catch (cause) {
        failed = cancel.signal.aborted ? "cancelada por quem perguntou" : cause instanceof Error ? cause.message : String(cause);
        if (!cancel.signal.aborted) console.error("Kally:", failed);
        send({ error: cause instanceof AiError ? cause.message : "A resposta foi interrompida. Tente novamente." });
      } finally {
        // Só conversas salvas guardam a resposta (mesmo parcial).
        if (conversationId && answer.trim()) await addMessage(conversationId, "assistant", latexToText(answer.trim()), sources).catch(() => undefined);
        if (conversationId) markDone(conversationId);
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // já fechado pelo cancelamento
        }
        const memory = sampler.stop();
        void (async () =>
          logPerf({
            route: "app",
            evalConfig,
            pipeline: !!pipeline,
            dev: !!dev,
            mode,
            competence,
            interpreted: interpretation?.competencia ?? null,
            examples: examples.map((e) => e.id),
            examplesMs: exampleSelection?.ms ?? null,
            examplesBy: exampleSelection?.by ?? null,
            canDraft,
            // origem dos trechos usados (sem o texto): base e documento
            documents: documents.map((d) => ({ scope: d.scope, id: d.documentId, label: d.label, score: Math.round(d.score * 1000) / 1000 })),
            documentsMs: documentSearch?.ms ?? null,
            thinMaterial,
            casual,
            skipMemory,
            messageChars: message.length,
            historyMessages: history.length,
            retrieved: posts.length,
            web: web.length,
            retrievalMs,
            interpreter: interpreterReport,
            // roteamento: onde respondeu, por quê e, se caiu para o local, o motivo (sem conteúdo do pedido)
            backend: { target: route.target, reason: route.reason, choice, fallback: remoteFallback },
            // fontes do post (quantas páginas e sites, sem o texto) e revisão de fidelidade
            postSources: sourceHunt,
            effort,
            deep: deepReport,
            continuations,
            answerSources: answerHunt,
            // Só contagens e tempo (o registro não guarda o texto das mensagens).
            essential: essential ? { by: essential.by, ms: essential.ms, words: essential.before, kept: essential.after } : null,
            postReview,
            executor: modelName
              ? {
                  model: modelName,
                  queueMs: lease?.queueMs ?? null,
                  unloaded: lease?.unloaded ?? [],
                  unloadMs: lease?.unloadMs ?? null,
                  loadMs: lease?.loadMs ?? null,
                  promptTokens: stats?.promptTokens ?? null,
                  promptSeconds: stats?.promptSeconds ?? null,
                  outputTokens: stats?.outputTokens ?? null,
                  tokensPerSecond: stats?.tokensPerSecond ?? null,
                  generationMs: generationEnded ? generationEnded - generationStarted : null,
                  memory: await ollamaMemory(modelName),
                }
              : null,
            // tempo percebido: do pedido chegar ao primeiro texto e ao fim da resposta
            firstTextMs: firstText ? firstText - startedAt : null,
            totalMs: (generationEnded || Date.now()) - startedAt,
            minFreeRamGB: memory.minFreeRamGB,
            peakVramMiB: memory.peakVramMiB,
            error: failed,
          }))();
      }
    },
  });

  // Mesmos cabeçalhos (CORS de teste) das respostas JSON, trocando o tipo para stream.
  const headers = new Headers(json(null).headers);
  headers.set("Cache-Control", "no-store, no-transform");
  headers.set("Content-Type", "text/event-stream; charset=utf-8");
  headers.set("X-Accel-Buffering", "no");
  return new Response(stream, { headers });
}

export { preflight as OPTIONS } from "../../../_lib/http";
