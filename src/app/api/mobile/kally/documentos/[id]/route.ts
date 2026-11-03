import { deleteDocument } from "@/server/kally/documents";
import { findUserById } from "@/server/users";
import { error, json, requireUser } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Remove um documento da base (e os trechos dele). Sem permissão, responde como se não existisse. */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  if (userId instanceof Response) return userId;
  const { id } = await context.params;
  const platformAdmin = (await findUserById(userId))?.legacyKind === "ADMIN";
  if (!(await deleteDocument(id, userId, platformAdmin))) return error("Documento não encontrado.", 404);
  return json({ ok: true });
}

export { preflight as OPTIONS } from "../../../_lib/http";
