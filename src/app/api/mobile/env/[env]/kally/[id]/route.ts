import { deleteConversation, getConversation } from "@/server/kally";
import { isRunning } from "@/server/kally/running";
import { envAccess, error, json } from "../../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ env: string; id: string }> };

/** Retoma uma conversa: só a própria pessoa, no mesmo ambiente. O dev da plataforma lê a de qualquer pessoa. */
export async function GET(_request: Request, context: Context) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  if (!access.userId) return error("Entre com sua conta para conversar com a Kally.", 401);
  const conversation = await getConversation(access.environment.id, access.userId, (await context.params).id, access.platformDev);
  // generating: a Kally ainda está escrevendo uma resposta desta conversa (a pessoa saiu antes do fim).
  return conversation ? json({ ...conversation, generating: isRunning(conversation.id) }) : error("Conversa não encontrada.", 404);
}

export async function DELETE(_request: Request, context: Context) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  if (!access.userId) return error("Entre com sua conta para conversar com a Kally.", 401);
  const deleted = await deleteConversation(access.environment.id, access.userId, (await context.params).id);
  return deleted ? json({ ok: true }) : error("Conversa não encontrada.", 404);
}

export { preflight as OPTIONS } from "../../../../_lib/http";
