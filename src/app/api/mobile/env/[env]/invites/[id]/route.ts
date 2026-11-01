import { revokeInvite } from "@/server/environments";
import { envAccess, error, json } from "../../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ env: string; id: string }> };

/** Revoga o convite: deixa de funcionar na hora; quem já entrou continua participando. */
export async function DELETE(_request: Request, context: Context) {
  const access = await envAccess(context, "manageMembers");
  if (access instanceof Response) return access;
  const result = await revokeInvite(access, (await context.params).id);
  return result.ok ? json({ ok: true }) : error(result.error, result.status);
}

export { preflight as OPTIONS } from "../../../../_lib/http";
