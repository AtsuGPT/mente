import { AiError, defaultChatModel, ollamaMemory, streamChat, type GenerationStats, type LeaseInfo } from "@/server/ai";
import { logPerf, memorySampler } from "@/server/ai/perf";
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
  createConversation,
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
  if (mode === "ideia" && !access.permissions.publish) mode = "chat";
  const ruleCasual = requested === "auto" && mode === "chat" && intent.casual && !body.attachment;
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
  const lastUser = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  const query = review ? review.text.slice(0, 800) : attachment ? `${message} ${attachment.text.slice(0, 600)}` : message.length < 40 ? `${lastUser} ${message}` : message;
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
    const webQuery = review ? review.text.split("\n")[0].replace(/^#\s*/, "") : message.replace(/^(me |por favor,? )?(pesquise|pesquisa|aprofunde|explique)( sobre)?\s*/i, "");
    web = await searchWeb(webQuery, 4);
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
  const sources = toSources(posts, web, documents);

  const canDraft = wantsDraft(competence, message, access.permissions.publish);
  // Post: o que a pessoa já contou (mensagens dela, sem o "crie o post agora" do /post, anexo e
  // documentos dela). Só o tema não basta: o rascunho seria inventado, então a Kally pergunta.
  const ownWords = [raw.replace(/^\/post\s*/i, ""), ...history.filter((m) => m.role === "user").map((m) => m.content)].join(" ").trim();
  const thinMaterial = competence === "post" && !attachment && !documents.length && ownWords.length < 140;
  const categories = mode === "ideia" || canDraft ? (await listCategories(access.environment.id)).map((c) => c.name) : [];
  // Com anexo, texto para revisar ou trechos de documentos, o contexto já vai cheio: um exemplo só.
  const exampleSelection = competence ? await selectExamples(competence, message, { max: attachment || review || documents.length ? 1 : 2 }) : null;
  const examples: ReferenceExample[] = exampleSelection?.examples ?? [];

  if (!conversation && body.save === true) {
    const created = await createConversation(access.environment.id, userId, mode, review?.text.split("\n")[0].replace(/^#\s*/, "Revisão: ") || message);
    conversation = { ...created, owner: null, messages: [] };
  }
  const conversationId = conversation?.id ?? null;
  if (conversationId) await addMessage(conversationId, "user", message);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      send({ conversationId, temporary: !conversationId, mode, searched: web.length > 0, dev: !!dev });
      send({ sources });
      let answer = "";
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
          const guide = interpretation ? interpretationGuide(interpretation) : null;
          const spec = competence ? COMPETENCES[competence] : null;
          const prompt = spec
            ? buildCompetencePrompt({ competence: spec, examples, canDraft, depth: interpretation?.profundidade ?? (BRIEF.test(message) ? "breve" : undefined), thinMaterial, environmentName: access.environment.name, categories, history, message, posts, web, attachment, reviewText: review?.text ?? null, guide, documents, userName: me?.displayName })
            : buildPrompt({ mode, environmentName: access.environment.name, categories, history, message, posts, web, attachment, reviewText: review?.text ?? null, dev, guide, toneExamples: !pipeline || casual, documents, userName: me?.displayName });
          // No pipeline o executor responde tudo. Fora dele, a revisão intelectual usa KALLY_REVIEW_MODEL, se configurado.
          const model = dev ? devModel(dev) : pipeline ? pipeline.executor : mode === "revisar" && review ? process.env.KALLY_REVIEW_MODEL || undefined : undefined;
          modelName = model || defaultChatModel();
          // Modo dev e pipeline do administrador: diz qual modelo responde e mostra as medições.
          // Servidor de testes (KALLY_EVAL=1): as métricas vão para qualquer conta, para a simulação separar falha de
          // busca de falha de interpretação. Fora dele, nada muda.
          // Em produção, KALLY_EVAL_AMBIENTES (slugs separados por vírgula) liga as métricas só nos ambientes da simulação.
          const evalEnvironment = process.env.KALLY_EVAL === "1" || (process.env.KALLY_EVAL_AMBIENTES ?? "").split(",").map((x) => x.trim()).includes(access.environment.slug);
          const showStats = !!dev || (!!pipeline && platformAdmin) || !!evalConfig || evalEnvironment;
          if (showStats) send({ model: modelName });
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
          try {
            for await (const chunk of streamChat(prompt, { temperature, maxTokens, model, onStats: (s) => (stats = s), onLease: (info) => (lease = info), ...extra })) {
              if (!firstText) firstText = Date.now();
              emit(cleaner.push(chunk));
            }
          } finally {
            emit(cleaner.flush());
          }
          generationEnded = Date.now();
          if (showStats) {
            const seconds = (ms: number) => Math.round(ms / 100) / 10;
            const report = {
              ...(stats ?? { model: modelName }),
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
        send({ done: true });
      } catch (cause) {
        failed = cause instanceof Error ? cause.message : String(cause);
        console.error("Kally:", failed);
        send({ error: cause instanceof AiError ? cause.message : "A resposta foi interrompida. Tente novamente." });
      } finally {
        // Só conversas salvas guardam a resposta (mesmo parcial).
        if (conversationId && answer.trim()) await addMessage(conversationId, "assistant", answer.trim(), sources).catch(() => undefined);
        controller.close();
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
