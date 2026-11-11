import { getConversation } from "@/server/kally";
import { stopRunning } from "@/server/kally/running";
import { envAccess, error, json, readJson, type EnvContext } from "../../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Botão "Parar" do app: cancela no servidor a resposta em andamento de uma conversa salva (a temporária para
 * sozinha quando o app fecha a conexão). Só a dona da conversa para. A parte já escrita fica gravada.
 *   { conversationId } → { stopped }
 */
export async function POST(request: Request, context: EnvContext) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  if (!access.userId) return error("Entre com sua conta.", 401);
  const body = await readJson(request, 2_000);
  if (body instanceof Response) return body;
  const id = typeof body.conversationId === "string" ? body.conversationId : "";
  if (!id || !(await getConversation(access.environment.id, access.userId, id))) return error("Conversa não encontrada.", 404);
  return json({ stopped: stopRunning(id) });
}

export { preflight as OPTIONS } from "../../../../_lib/http";
