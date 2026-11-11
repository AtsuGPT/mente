import { clearMemories, deleteMemory, listMemories, memoryEnabled } from "@/server/kally/memory";
import { envAccess, error, json, type EnvContext } from "../../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Memória da Kally da própria pessoa neste ambiente (painel da Kally). Ninguém mais lista nem apaga. */
export async function GET(_request: Request, context: EnvContext) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  if (!access.userId) return error("Entre com sua conta para ver a memória da Kally.", 401);
  return json({ enabled: memoryEnabled(), memories: await listMemories(access.environment.id, access.userId) });
}

/** DELETE ?id=… apaga um item; sem id, apaga toda a memória da pessoa neste ambiente. */
export async function DELETE(request: Request, context: EnvContext) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  if (!access.userId) return error("Entre com sua conta para apagar a memória da Kally.", 401);
  const id = new URL(request.url).searchParams.get("id");
  if (id) return (await deleteMemory(access.environment.id, access.userId, id)) ? json({ ok: true, deleted: 1 }) : error("Item não encontrado.", 404);
  return json({ ok: true, deleted: await clearMemories(access.environment.id, access.userId) });
}

export { preflight as OPTIONS } from "../../../../_lib/http";
