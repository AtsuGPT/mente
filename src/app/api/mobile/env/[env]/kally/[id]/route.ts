import { deleteConversation, getConversation } from "@/server/kally";
import { envAccess, error, json } from "../../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ env: string; id: string }> };

/** Retoma uma conversa: só a própria pessoa, no mesmo ambiente. */
export async function GET(_request: Request, context: Context) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  if (!access.userId) return error("Entre com sua conta para conversar com a Kally.", 401);
  const conversation = await getConversation(access.environment.id, access.userId, (await context.params).id);
  return conversation ? json(conversation) : error("Conversa não encontrada.", 404);
}

export async function DELETE(_request: Request, context: Context) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  if (!access.userId) return error("Entre com sua conta para conversar com a Kally.", 401);
  const deleted = await deleteConversation(access.environment.id, access.userId, (await context.params).id);
  return deleted ? json({ ok: true }) : error("Conversa não encontrada.", 404);
}

export { preflight as OPTIONS } from "../../../../_lib/http";
