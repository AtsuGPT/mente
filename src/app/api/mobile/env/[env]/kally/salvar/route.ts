import { addMessage, createConversation, KALLY_MODES, MAX_MESSAGE_LENGTH, type KallyMode } from "@/server/kally";
import { rememberFrom } from "@/server/kally/memory";
import { envAccess, error, json, readJson, type EnvContext } from "../../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Salva uma conversa temporária depois que a pessoa confirma ("Salvar esta conversa?", oferecido pela Kally em
 * pedidos maiores). Grava as mensagens que o app tem e, a partir daí, a conversa continua salva. Só então as
 * mensagens dela podem virar memória (src/server/kally/memory.ts), em segundo plano.
 *   { mode?, messages: [{ role: "user" | "assistant", content }] } → { id, title }
 */
export async function POST(request: Request, context: EnvContext) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  if (!access.userId) return error("Entre com sua conta para salvar a conversa.", 401);
  const userId = access.userId;
  const body = await readJson(request, 400_000);
  if (body instanceof Response) return body;
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m): m is { role: string; content: string } => !!m && typeof m === "object" && typeof (m as { content?: unknown }).content === "string")
    .map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: m.content.trim().slice(0, m.role === "assistant" ? 60_000 : MAX_MESSAGE_LENGTH) }))
    .filter((m) => m.content)
    .slice(-60);
  const first = messages.find((m) => m.role === "user");
  if (!first) return error("Não há mensagens para salvar.", 400);
  const mode: KallyMode = KALLY_MODES.includes(body.mode as KallyMode) && body.mode !== "auto" ? (body.mode as KallyMode) : "chat";
  const created = await createConversation(access.environment.id, userId, mode as Exclude<KallyMode, "auto">, first.content);
  for (const m of messages) await addMessage(created.id, m.role, m.content);
  // Memória em segundo plano: não segura a resposta do salvar.
  void (async () => {
    for (const m of messages.filter((x) => x.role === "user").slice(-8)) await rememberFrom({ environmentId: access.environment.id, userId, message: m.content, conversationId: created.id });
  })();
  return json({ id: created.id, title: created.title });
}

export { preflight as OPTIONS } from "../../../../_lib/http";
