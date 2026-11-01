import { AiError, streamChat } from "@/server/ai";
import { addMessage, buildPrompt, createConversation, findRelevantPosts, getConversation, listConversations, MAX_MESSAGE_LENGTH, type KallyMode } from "@/server/kally";
import { envAccess, error, json, readJson, type EnvContext } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Limite por pessoa, em memória: protege o provedor de IA de uso excessivo.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 30;
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

/** Conversas da pessoa neste ambiente (as de outros ambientes e de outras pessoas não aparecem). */
export async function GET(_request: Request, context: EnvContext) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  if (!access.userId) return error("Entre com sua conta para conversar com a Kally.", 401);
  return json({ conversations: await listConversations(access.environment.id, access.userId) });
}

/**
 * Envia uma mensagem à Kally: { message, conversationId?, mode? }.
 * Responde em Server-Sent Events: { conversationId } → { sources } → { text }... → { done }.
 * O histórico vem do banco, não do app, e as duas mensagens ficam salvas na conversa.
 */
export async function POST(request: Request, context: EnvContext) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  if (!access.userId) return error("Entre com sua conta para conversar com a Kally.", 401);
  const userId = access.userId;

  const body = await readJson(request, 24_000);
  if (body instanceof Response) return body;
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > MAX_MESSAGE_LENGTH) return error(`Escreva uma mensagem de até ${MAX_MESSAGE_LENGTH} caracteres.`, 400);
  const mode: KallyMode = body.mode === "ideia" ? "ideia" : "chat";

  let conversation = typeof body.conversationId === "string" ? await getConversation(access.environment.id, userId, body.conversationId) : null;
  if (typeof body.conversationId === "string" && !conversation) return error("Conversa não encontrada.", 404);
  const effectiveMode = (conversation?.mode as KallyMode | undefined) ?? mode;
  if (effectiveMode === "ideia" && !access.permissions.publish) return error("Você não pode publicar neste ambiente.", 403);
  if (!allowed(userId)) return error("Muitas mensagens em pouco tempo. Tente de novo em alguns minutos.", 429);

  const history = conversation?.messages ?? [];
  // Busca pelo que a pessoa disse agora e, se for curto, também pela mensagem anterior dela.
  const lastUser = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  const posts = await findRelevantPosts(access.scope, message.length < 40 ? `${lastUser} ${message}` : message, effectiveMode === "ideia" ? 3 : 5);
  const sources = posts.map(({ title, slug }) => ({ title, slug }));
  const prompt = buildPrompt(effectiveMode, access.environment.name, history, message, posts);

  if (!conversation) {
    const created = await createConversation(access.environment.id, userId, effectiveMode, message);
    conversation = { ...created, messages: [] };
  }
  const conversationId = conversation.id;
  await addMessage(conversationId, "user", message);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      send({ conversationId, mode: effectiveMode });
      send({ sources });
      let answer = "";
      try {
        for await (const text of streamChat(prompt, { temperature: effectiveMode === "ideia" ? 0.6 : 0.4, maxTokens: effectiveMode === "ideia" ? 1_600 : 900 })) {
          answer += text;
          send({ text });
        }
        send({ done: true });
      } catch (cause) {
        console.error("Kally:", cause instanceof Error ? cause.message : cause);
        send({ error: cause instanceof AiError ? cause.message : "A resposta foi interrompida. Tente novamente." });
      } finally {
        // O que chegou fica salvo, mesmo se a resposta parou no meio.
        if (answer.trim()) await addMessage(conversationId, "assistant", answer.trim(), sources).catch(() => undefined);
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
