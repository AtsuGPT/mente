import { AiError, defaultChatModel, ollamaMemory, streamChat, type GenerationStats } from "@/server/ai";
import { canEditPost } from "@/server/environments";
import { listCategories } from "@/server/categories";
import { getAdminPost, getPublishedPostBySlug } from "@/server/posts";
import {
  addMessage,
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

/** Conversas SALVAS da pessoa neste ambiente (as temporárias não existem no servidor). */
export async function GET(_request: Request, context: EnvContext) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  if (!access.userId) return error("Entre com sua conta para conversar com a Kally.", 401);
  return json({ conversations: await listConversations(access.environment.id, access.userId) });
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
  const casual = requested === "auto" && mode === "chat" && intent.casual && !body.attachment;
  // Modo Desenvolvedor: só muda o prompt (personalidade/estilo). Permissões e ambiente continuam os mesmos.
  // Só o administrador da plataforma usa o modo; para as outras contas o pedido é ignorado.
  const platformAdmin = (await findUserById(userId))?.legacyKind === "ADMIN";
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

  // Memória do ambiente: pela mensagem (curta? junta com a anterior), pelo texto revisado ou pelo anexo.
  const lastUser = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  const query = review ? review.text.slice(0, 800) : attachment ? `${message} ${attachment.text.slice(0, 600)}` : message.length < 40 ? `${lastUser} ${message}` : message;
  // Conversas anteriores só entram em Conversar e Aprender: na revisão e na ideia elas se misturariam ao texto da pessoa.
  const withConversations = mode === "chat" || mode === "aprender";
  // Papo casual não consulta a memória (mais rápido e sem puxar assunto do nada); revisão
  // sem texto também não (a Kally só pede o texto, em vez de "revisar" posts soltos).
  const posts = casual || (mode === "revisar" && !review)
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
        .filter((p) => mode !== "chat" || p.score >= (intent.wantsMemory ? 0.2 : 0.4));

  // Internet: só com permissão da pessoa, e só quando o ambiente não basta (ou para aprender/aprofundar).
  let web: WebResult[] = [];
  const wantsDeeper = /pesquis|aprofund|fonte|refer[eê]ncia|internet|link/i.test(message);
  if (body.web === true && (needsOutsideHelp(posts) || mode === "aprender" || wantsDeeper)) {
    const webQuery = review ? review.text.split("\n")[0].replace(/^#\s*/, "") : message.replace(/^(me |por favor,? )?(pesquise|pesquisa|aprofunde|explique)( sobre)?\s*/i, "");
    web = await searchWeb(webQuery, 4);
  }
  const sources = toSources(posts, web);
  const categories = mode === "ideia" ? (await listCategories(access.environment.id)).map((c) => c.name) : [];

  if (!conversation && body.save === true) {
    const created = await createConversation(access.environment.id, userId, mode, review?.text.split("\n")[0].replace(/^#\s*/, "Revisão: ") || message);
    conversation = { ...created, messages: [] };
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
          const prompt = buildPrompt({ mode, environmentName: access.environment.name, categories, history, message, posts, web, attachment, reviewText: review?.text ?? null, dev });
          // A revisão intelectual usa o modelo de revisão (KALLY_REVIEW_MODEL), se configurado.
          const model = dev ? devModel(dev) : mode === "revisar" && review ? process.env.KALLY_REVIEW_MODEL || undefined : undefined;
          // Modo dev: diz qual modelo responde e mede tudo (mesmo contexto e mesmo limite para qualquer modelo).
          const modelName = model || defaultChatModel();
          let stats: GenerationStats | null = null;
          if (dev) send({ model: modelName });
          const started = Date.now();
          let firstText = 0;
          for await (const chunk of streamChat(prompt, { temperature: mode === "ideia" ? 0.6 : 0.45, maxTokens: dev ? 4_096 : casual ? 320 : mode === "chat" ? 800 : 1_400, model, ...(dev ? { sameContext: true, timeoutMs: 600_000, onStats: (s: GenerationStats) => (stats = s) } : {}) })) {
            if (!firstText) firstText = Date.now();
            answer += chunk;
            send({ text: chunk });
          }
          if (dev) {
            const memory = await ollamaMemory(modelName);
            const report = { ...(stats ?? { model: modelName }), firstTextSeconds: firstText ? Math.round((firstText - started) / 100) / 10 : null, wallSeconds: Math.round((Date.now() - started) / 100) / 10, memory };
            console.info("Kally dev:", JSON.stringify(report));
            send({ stats: report });
          }
        }
        send({ done: true });
      } catch (cause) {
        console.error("Kally:", cause instanceof Error ? cause.message : cause);
        send({ error: cause instanceof AiError ? cause.message : "A resposta foi interrompida. Tente novamente." });
      } finally {
        // Só conversas salvas guardam a resposta (mesmo parcial).
        if (conversationId && answer.trim()) await addMessage(conversationId, "assistant", answer.trim(), sources).catch(() => undefined);
        controller.close();
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
