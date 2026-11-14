import { MEMBER_ROLES, removeMember, updateMember, type MemberUpdate } from "@/server/environments";
import { envAccess, error, json, readJson } from "../../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ env: string; userId: string }> };

const FLAGS = ["canSeePrivate", "canPublish", "canEditOwn", "canManageContent", "canManageMembers"] as const;

/** Papel e ajustes de permissão de um participante. */
export async function PATCH(request: Request, context: Context) {
  const access = await envAccess(context, "manageMembers");
  if (access instanceof Response) return access;
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const update: MemberUpdate = {};
  if (body.role !== undefined) {
    if (!(MEMBER_ROLES as readonly string[]).includes(String(body.role))) return error("Papel inválido.", 400);
    update.role = body.role as MemberUpdate["role"];
  }
  for (const flag of FLAGS) {
    if (body[flag] === undefined) continue;
    if (body[flag] !== null && typeof body[flag] !== "boolean") return error("Permissão inválida.", 400);
    update[flag] = body[flag] as boolean | null;
  }
  const result = await updateMember(access, (await context.params).userId, update);
  return result.ok ? json({ ok: true }) : error(result.error, result.status);
}

export async function DELETE(_request: Request, context: Context) {
  const access = await envAccess(context, "manageMembers");
  if (access instanceof Response) return access;
  const result = await removeMember(access, (await context.params).userId);
  return result.ok ? json({ ok: true }) : error(result.error, result.status);
}

export { preflight as OPTIONS } from "../../../../_lib/http";
