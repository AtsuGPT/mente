import { siteUrl } from "@/lib/env";
import { createInvite, listInvites, MEMBER_ROLES } from "@/server/environments";
import type { MemberRole } from "@/generated/prisma";
import { envAccess, error, json, readJson, type EnvContext } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const withLink = <T extends { code: string }>(invite: T) => ({ ...invite, link: `${siteUrl()}/convite/${invite.code}` });

export async function GET(_request: Request, context: EnvContext) {
  const access = await envAccess(context, "manageMembers");
  if (access instanceof Response) return access;
  return json({ invites: (await listInvites(access.environment.id)).map(withLink) });
}

/** { role, maxUses (null = ilimitado), expiresInDays (null = sem validade) } */
export async function POST(request: Request, context: EnvContext) {
  const access = await envAccess(context, "manageMembers");
  if (access instanceof Response) return access;
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const role = String(body.role ?? "VIEWER");
  if (!(MEMBER_ROLES as readonly string[]).includes(role)) return error("Papel inválido.", 400);
  const maxUses = body.maxUses === null || body.maxUses === undefined ? null : Math.floor(Number(body.maxUses));
  const expiresInDays = body.expiresInDays === null || body.expiresInDays === undefined ? null : Math.floor(Number(body.expiresInDays));
  if (maxUses !== null && !(maxUses >= 1 && maxUses <= 1000)) return error("Limite de usos entre 1 e 1000.", 400);
  if (expiresInDays !== null && !(expiresInDays >= 1 && expiresInDays <= 365)) return error("Validade entre 1 e 365 dias.", 400);
  const result = await createInvite(access, { role: role as MemberRole, maxUses, expiresInDays });
  return result.ok ? json({ invite: withLink(result.invite) }, { status: 201 }) : error(result.error, result.status);
}

export { preflight as OPTIONS } from "../../../_lib/http";
