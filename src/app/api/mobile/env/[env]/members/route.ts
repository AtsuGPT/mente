import { listMembers, permissionsFor } from "@/server/environments";
import { envAccess, error, json, type EnvContext } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Participantes (só para quem participa, e para o dev da plataforma, que só lê). */
export async function GET(_request: Request, context: EnvContext) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  if (access.role === "GUEST") return error("Só participantes veem a lista de participantes.", 403);
  const members = await listMembers(access.environment.id);
  return json({
    members: members.map((m) => ({ ...m, permissions: permissionsFor(m, access.environment.guestAccess) })),
    canManage: access.permissions.manageMembers,
    myRole: access.role,
  });
}

export { preflight as OPTIONS } from "../../../_lib/http";
