import "server-only";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { HEX_COLOR } from "@/lib/color";
import { slugify } from "@/lib/slug";
import { Prisma, type MemberRole } from "@/generated/prisma";
import { publiclyVisible } from "./categories";
import { getProfileImage, setProfileImage } from "./site-settings";
import { DEFAULT_ENVIRONMENT_ID, type Scope } from "./scope";

/**
 * Ambientes: espaços independentes, cada um com seus pensamentos, categorias,
 * participantes e convites. Toda decisão de acesso passa por resolveAccess(),
 * no servidor; o app só reflete as permissões que recebe.
 */

/* ------------------------------ Permissões ------------------------------ */

export type Permissions = {
  view: boolean;
  seePrivate: boolean;
  publish: boolean;
  editOwn: boolean;
  manageContent: boolean;
  manageMembers: boolean;
  manageSettings: boolean;
};

type Adjustable = Pick<Permissions, "seePrivate" | "publish" | "editOwn" | "manageContent" | "manageMembers">;

const ROLE_DEFAULTS: Record<MemberRole, Adjustable> = {
  OWNER: { seePrivate: true, publish: true, editOwn: true, manageContent: true, manageMembers: true },
  ADMIN: { seePrivate: true, publish: true, editOwn: true, manageContent: true, manageMembers: true },
  MEMBER: { seePrivate: true, publish: true, editOwn: true, manageContent: false, manageMembers: false },
  VIEWER: { seePrivate: true, publish: false, editOwn: false, manageContent: false, manageMembers: false },
};

const ROLE_RANK: Record<MemberRole, number> = { OWNER: 3, ADMIN: 2, MEMBER: 1, VIEWER: 0 };
export const MEMBER_ROLES = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const satisfies readonly MemberRole[];

type MembershipFlags = {
  role: MemberRole;
  canPublish: boolean | null;
  canEditOwn: boolean | null;
  canManageContent: boolean | null;
  canManageMembers: boolean | null;
  canSeePrivate: boolean | null;
};

export function permissionsFor(membership: MembershipFlags | null, guestAccess: boolean): Permissions {
  if (!membership) {
    return { view: guestAccess, seePrivate: false, publish: false, editOwn: false, manageContent: false, manageMembers: false, manageSettings: false };
  }
  const base = ROLE_DEFAULTS[membership.role];
  // O proprietário tem tudo; os ajustes só valem para os outros papéis.
  const pick = (flag: boolean | null, fallback: boolean) => (membership.role === "OWNER" ? true : flag ?? fallback);
  const manageContent = pick(membership.canManageContent, base.manageContent);
  return {
    view: true,
    // Quem gerencia todo o conteúdo já vê os privados na lista de gerenciar; não dá para esconder dele.
    seePrivate: manageContent || pick(membership.canSeePrivate, base.seePrivate),
    publish: pick(membership.canPublish, base.publish),
    editOwn: pick(membership.canEditOwn, base.editOwn),
    manageContent,
    manageMembers: pick(membership.canManageMembers, base.manageMembers),
    manageSettings: membership.role === "OWNER",
  };
}

/* ------------------------------- Acesso -------------------------------- */

/**
 * Dev da plataforma: a conta do administrador do .env (legacyKind "ADMIN"). Lê todos os
 * ambientes não arquivados, inclusive os fechados a visitantes e os pensamentos privados,
 * e as conversas salvas com a Kally. Só lê: publicar, editar e gerenciar continuam
 * dependendo da participação no ambiente.
 */
export async function isPlatformDev(userId: string | null) {
  if (!userId) return false;
  const user = await db.user.findUnique({ where: { id: userId }, select: { legacyKind: true } });
  return user?.legacyKind === "ADMIN";
}

const DEV_PERMISSIONS: Permissions = { view: true, seePrivate: true, publish: false, editOwn: false, manageContent: false, manageMembers: false, manageSettings: false };

const environmentSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  color: true,
  icon: true,
  guestAccess: true,
  ownerId: true,
  archivedAt: true,
  createdAt: true,
} satisfies Prisma.EnvironmentSelect;

export type EnvironmentRow = Prisma.EnvironmentGetPayload<{ select: typeof environmentSelect }>;

export type Access = {
  environment: EnvironmentRow;
  userId: string | null;
  /** "DEV": o dev da plataforma num ambiente do qual não participa (só leitura). */
  role: MemberRole | "GUEST" | "DEV";
  permissions: Permissions;
  scope: Scope;
  /** Dev da plataforma, participe ou não do ambiente. */
  platformDev: boolean;
};

export type AccessError = { error: string; status: number };

/**
 * Quem pode o quê neste ambiente. Conhecer o id não basta: sem participação,
 * só se lê um ambiente que aceita convidados, e apenas os pensamentos públicos.
 */
export async function resolveAccess(environmentRef: string, userId: string | null): Promise<Access | AccessError> {
  const environment = await db.environment.findFirst({
    where: { OR: [{ id: environmentRef }, { slug: environmentRef }] },
    select: environmentSelect,
  });
  if (!environment) return { error: "Ambiente não encontrado.", status: 404 };

  const membership = userId
    ? await db.membership.findUnique({ where: { environmentId_userId: { environmentId: environment.id, userId } } })
    : null;

  if (environment.archivedAt && membership?.role !== "OWNER") return { error: "Ambiente não encontrado.", status: 404 };

  const platformDev = await isPlatformDev(userId);
  const asDev = !membership && platformDev;
  const permissions = asDev ? DEV_PERMISSIONS : permissionsFor(membership, environment.guestAccess);
  if (!permissions.view) {
    return userId
      ? { error: "Você não participa deste ambiente. Peça um convite a quem o administra.", status: 403 }
      : { error: "Este ambiente é privado. Entre com sua conta para acessá-lo.", status: 401 };
  }
  return {
    environment,
    userId,
    role: membership?.role ?? (asDev ? "DEV" : "GUEST"),
    permissions,
    scope: { environmentId: environment.id, canSeePrivate: permissions.seePrivate, viewerId: userId },
    platformDev,
  };
}

export function isAccessError(value: Access | AccessError): value is AccessError {
  return "error" in value;
}

/** Pensamento que esta pessoa pode editar: quem gerencia o conteúdo, ou o autor com "editar os próprios". */
export function canEditPost(access: Access, post: { authorId: string | null }) {
  if (access.permissions.manageContent) return true;
  return access.permissions.editOwn && !!access.userId && post.authorId === access.userId;
}

/* ------------------------------ Listagem ------------------------------- */

/**
 * Contagem de pensamentos visível para quem pede: participantes contam os publicados
 * (inclusive privados); visitantes, só os públicos. Assim a lista não revela quantos
 * pensamentos privados existem num ambiente do qual a pessoa não participa.
 */
async function counts(environmentIds: string[], publicOnly: boolean) {
  if (!environmentIds.length) return new Map<string, { posts: number; members: number }>();
  const visible = { ...publiclyVisible(), ...(publicOnly ? { private: false } : {}) };
  const rows = await db.environment.findMany({
    where: { id: { in: environmentIds } },
    select: { id: true, _count: { select: { posts: { where: visible }, members: true } } },
  });
  return new Map(rows.map((r) => [r.id, { posts: r._count.posts, members: r._count.members }]));
}

export async function environmentImage(environment: { id: string }) {
  if (environment.id === DEFAULT_ENVIRONMENT_ID) return getProfileImage();
  const row = await db.environment.findUnique({ where: { id: environment.id }, select: { imageData: true } });
  return row?.imageData ?? null;
}

/**
 * Ambientes de quem pede (participação) e os abertos a convidados, sem duplicar.
 * Para o dev da plataforma, também os fechados a visitantes dos quais não participa (dev).
 */
export async function listEnvironmentsFor(userId: string | null) {
  const memberships = userId
    ? await db.membership.findMany({
        where: { userId, environment: { OR: [{ archivedAt: null }, { ownerId: userId }] } },
        select: { role: true, canPublish: true, canEditOwn: true, canManageContent: true, canManageMembers: true, canSeePrivate: true, environment: { select: environmentSelect } },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const mineIds = new Set(memberships.map((m) => m.environment.id));
  const open = await db.environment.findMany({
    where: { guestAccess: true, archivedAt: null, id: { notIn: [...mineIds] } },
    select: environmentSelect,
    orderBy: { createdAt: "asc" },
  });
  const closed = (await isPlatformDev(userId))
    ? await db.environment.findMany({
        where: { guestAccess: false, archivedAt: null, id: { notIn: [...mineIds] } },
        select: environmentSelect,
        orderBy: { createdAt: "asc" },
      })
    : [];
  // Quem não vê os privados também não vê quantos existem: conta como visitante.
  const seesPrivate = new Set(memberships.filter((m) => permissionsFor(m, m.environment.guestAccess).seePrivate).map((m) => m.environment.id));
  const memberStats = await counts([...seesPrivate, ...closed.map((e) => e.id)], false);
  const openStats = await counts([...open.map((e) => e.id), ...[...mineIds].filter((id) => !seesPrivate.has(id))], true);

  const shape = async (environment: EnvironmentRow, role: MemberRole | "GUEST" | "DEV", permissions: Permissions) => ({
    ...environment,
    role,
    permissions,
    stats: (permissions.seePrivate ? memberStats : openStats).get(environment.id) ?? { posts: 0, members: 0 },
    image: await environmentImage(environment),
  });

  return {
    mine: await Promise.all(memberships.map((m) => shape(m.environment, m.role, permissionsFor(m, m.environment.guestAccess)))),
    open: await Promise.all(open.map((e) => shape(e, "GUEST", permissionsFor(null, true)))),
    dev: await Promise.all(closed.map((e) => shape(e, "DEV", DEV_PERMISSIONS))),
  };
}

/* ------------------------- Criação e configuração ------------------------ */

export const ENVIRONMENT_ICONS = ["brain", "book", "folder", "bulb", "users", "sparkle", "map", "doc"] as const;

export type EnvironmentInput = { name: string; description: string; color: string; icon: string; guestAccess: boolean };

export function parseEnvironmentInput(raw: Record<string, unknown>): { ok: true; data: EnvironmentInput } | { ok: false; fieldErrors: Record<string, string[]> } {
  const name = String(raw.name ?? "").trim().slice(0, 60);
  const description = String(raw.description ?? "").trim();
  const color = String(raw.color ?? "#7C5CE0").trim();
  const icon = String(raw.icon ?? "brain");
  const fieldErrors: Record<string, string[]> = {};
  if (!name) fieldErrors.name = ["Dê um nome ao ambiente."];
  if (description.length > 280) fieldErrors.description = ["No máximo 280 caracteres."];
  if (!HEX_COLOR.test(color)) fieldErrors.color = ["Use o formato #RRGGBB."];
  if (!(ENVIRONMENT_ICONS as readonly string[]).includes(icon)) fieldErrors.icon = ["Ícone inválido."];
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  return { ok: true, data: { name, description, color, icon, guestAccess: raw.guestAccess === true || raw.guestAccess === "on" } };
}

async function uniqueSlug(name: string) {
  const base = slugify(name, 48) || "ambiente";
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${randomInt(1000, 9999)}`;
    if (!(await db.environment.findUnique({ where: { slug: candidate }, select: { id: true } }))) return candidate;
  }
  throw new Error("Não foi possível gerar um endereço para o ambiente.");
}

const MAX_OWNED_ENVIRONMENTS = 20;

/** Cria o ambiente e torna quem criou seu proprietário. */
export async function createEnvironment(userId: string, input: EnvironmentInput) {
  const owned = await db.environment.count({ where: { ownerId: userId, archivedAt: null } });
  if (owned >= MAX_OWNED_ENVIRONMENTS) return { ok: false as const, error: `Limite de ${MAX_OWNED_ENVIRONMENTS} ambientes por pessoa.` };
  const environment = await db.environment.create({
    data: { ...input, slug: await uniqueSlug(input.name), ownerId: userId, members: { create: { userId, role: "OWNER" } } },
    select: environmentSelect,
  });
  return { ok: true as const, environment };
}

export async function updateEnvironment(environmentId: string, input: EnvironmentInput) {
  return db.environment.update({ where: { id: environmentId }, data: input, select: environmentSelect });
}

/** Foto do ambiente. No original ela é a mesma foto de perfil do site. */
export async function setEnvironmentImage(environmentId: string, dataUrl: string | null) {
  if (environmentId === DEFAULT_ENVIRONMENT_ID) return setProfileImage(dataUrl);
  await db.environment.update({ where: { id: environmentId }, data: { imageData: dataUrl } });
}

/** Arquivar não apaga nada: o ambiente some das listas e só o proprietário o vê. */
export async function setArchived(environmentId: string, archived: boolean) {
  if (environmentId === DEFAULT_ENVIRONMENT_ID) return { ok: false as const, error: "O ambiente Minha Mente é o do site e não pode ser arquivado." };
  await db.environment.update({ where: { id: environmentId }, data: { archivedAt: archived ? new Date() : null } });
  return { ok: true as const };
}

/* ------------------------------ Participantes ------------------------------ */

export async function listMembers(environmentId: string) {
  return db.membership.findMany({
    where: { environmentId },
    select: {
      userId: true,
      role: true,
      canPublish: true,
      canEditOwn: true,
      canManageContent: true,
      canManageMembers: true,
      canSeePrivate: true,
      createdAt: true,
      user: { select: { username: true, displayName: true } },
    },
    orderBy: [{ createdAt: "asc" }],
  });
}

/** Quem gerencia: o proprietário mexe em todos (menos nele mesmo); um ADMIN só em MEMBER e VIEWER. */
function canManageTarget(actor: Access, target: { role: MemberRole; userId: string }, nextRole?: MemberRole) {
  if (!actor.permissions.manageMembers || target.role === "OWNER" || target.userId === actor.userId) return false;
  if (actor.role === "OWNER") return nextRole !== "OWNER";
  return ROLE_RANK[target.role] < ROLE_RANK.ADMIN && (!nextRole || ROLE_RANK[nextRole] < ROLE_RANK.ADMIN);
}

export type MemberUpdate = {
  role?: MemberRole;
  canPublish?: boolean | null;
  canEditOwn?: boolean | null;
  canManageContent?: boolean | null;
  canManageMembers?: boolean | null;
  canSeePrivate?: boolean | null;
};

export async function updateMember(actor: Access, userId: string, update: MemberUpdate) {
  const target = await db.membership.findUnique({ where: { environmentId_userId: { environmentId: actor.environment.id, userId } } });
  if (!target) return { ok: false as const, status: 404, error: "Participante não encontrado." };
  if (!canManageTarget(actor, target, update.role)) return { ok: false as const, status: 403, error: "Você não pode alterar este participante." };
  // Só o proprietário concede "gerenciar participantes".
  if (update.canManageMembers !== undefined && actor.role !== "OWNER") return { ok: false as const, status: 403, error: "Só o proprietário define quem gerencia participantes." };
  const member = await db.membership.update({
    where: { id: target.id },
    data: {
      ...(update.role ? { role: update.role } : {}),
      ...(update.canPublish !== undefined ? { canPublish: update.canPublish } : {}),
      ...(update.canEditOwn !== undefined ? { canEditOwn: update.canEditOwn } : {}),
      ...(update.canManageContent !== undefined ? { canManageContent: update.canManageContent } : {}),
      ...(update.canManageMembers !== undefined ? { canManageMembers: update.canManageMembers } : {}),
      ...(update.canSeePrivate !== undefined ? { canSeePrivate: update.canSeePrivate } : {}),
    },
  });
  return { ok: true as const, member };
}

export async function removeMember(actor: Access, userId: string) {
  const target = await db.membership.findUnique({ where: { environmentId_userId: { environmentId: actor.environment.id, userId } } });
  if (!target) return { ok: false as const, status: 404, error: "Participante não encontrado." };
  if (!canManageTarget(actor, target)) return { ok: false as const, status: 403, error: "Você não pode remover este participante." };
  await db.membership.delete({ where: { id: target.id } });
  return { ok: true as const };
}

/** Sair por conta própria. O proprietário não sai (o ambiente ficaria sem dono). */
export async function leaveEnvironment(access: Access) {
  if (!access.userId || access.role === "GUEST" || access.role === "DEV") return { ok: false as const, status: 400, error: "Você não participa deste ambiente." };
  if (access.role === "OWNER") return { ok: false as const, status: 400, error: "O proprietário não pode sair do próprio ambiente. Arquive-o se não for mais usá-lo." };
  await db.membership.delete({ where: { environmentId_userId: { environmentId: access.environment.id, userId: access.userId } } });
  return { ok: true as const };
}

/* -------------------------------- Convites -------------------------------- */

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sem 0/O, 1/I/L

function newCode() {
  const pick = () => Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  return `${pick()}-${pick()}`;
}

/** Aceita o código puro ("ABCD-EFGH", com ou sem hífen) ou um link que termine em /convite/<código>. */
export function normalizeInviteCode(input: unknown) {
  const text = String(input ?? "").trim();
  const fromLink = /convite\/([A-Za-z0-9-]+)/.exec(text)?.[1] ?? text;
  const compact = fromLink.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return compact.length === 8 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : null;
}

export async function createInvite(actor: Access, input: { role: MemberRole; maxUses: number | null; expiresInDays: number | null }) {
  if (!actor.permissions.manageMembers) return { ok: false as const, status: 403, error: "Você não pode convidar pessoas para este ambiente." };
  if (input.role === "OWNER") return { ok: false as const, status: 400, error: "Um convite não pode conceder o papel de proprietário." };
  if (actor.role !== "OWNER" && ROLE_RANK[input.role] >= ROLE_RANK.ADMIN) return { ok: false as const, status: 403, error: "Só o proprietário convida administradores." };
  const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000) : null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const invite = await db.invite.create({
        data: { code: newCode(), environmentId: actor.environment.id, role: input.role, maxUses: input.maxUses, expiresAt, createdById: actor.userId },
      });
      return { ok: true as const, invite };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }
  throw new Error("Não foi possível gerar um código de convite.");
}

export async function listInvites(environmentId: string) {
  return db.invite.findMany({ where: { environmentId }, orderBy: { createdAt: "desc" }, take: 50 });
}

export async function revokeInvite(actor: Access, inviteId: string) {
  if (!actor.permissions.manageMembers) return { ok: false as const, status: 403, error: "Você não pode revogar convites." };
  const result = await db.invite.updateMany({ where: { id: inviteId, environmentId: actor.environment.id, revokedAt: null }, data: { revokedAt: new Date() } });
  return result.count ? { ok: true as const } : { ok: false as const, status: 404, error: "Convite não encontrado." };
}

type InviteState = "valid" | "invalid" | "revoked" | "expired" | "used";

function inviteState(invite: { revokedAt: Date | null; expiresAt: Date | null; maxUses: number | null; uses: number; environment: { archivedAt: Date | null } } | null): InviteState {
  if (!invite || invite.environment.archivedAt) return "invalid";
  if (invite.revokedAt) return "revoked";
  if (invite.expiresAt && invite.expiresAt <= new Date()) return "expired";
  if (invite.maxUses !== null && invite.uses >= invite.maxUses) return "used";
  return "valid";
}

const INVITE_MESSAGES: Record<Exclude<InviteState, "valid">, string> = {
  invalid: "Código de convite inválido.",
  revoked: "Este convite foi revogado.",
  expired: "Este convite expirou.",
  used: "Este convite já foi usado.",
};

/** Prévia segura de um convite: só o nome e a identidade do ambiente, nunca o conteúdo. */
export async function previewInvite(rawCode: unknown) {
  const code = normalizeInviteCode(rawCode);
  const invite = code
    ? await db.invite.findUnique({ where: { code }, include: { environment: { select: { name: true, description: true, color: true, icon: true, archivedAt: true } } } })
    : null;
  const state = inviteState(invite);
  if (state !== "valid" || !invite) return { ok: false as const, error: INVITE_MESSAGES[state as Exclude<InviteState, "valid">] };
  const { archivedAt: _archived, ...environment } = invite.environment;
  return { ok: true as const, code: invite.code, role: invite.role, environment };
}

/** Aceita o convite: cria a participação (ou eleva o papel, nunca rebaixa) e conta um uso. */
export async function redeemInvite(rawCode: unknown, userId: string) {
  const code = normalizeInviteCode(rawCode);
  if (!code) return { ok: false as const, status: 400, error: INVITE_MESSAGES.invalid };
  return db.$transaction(async (tx) => {
    const invite = await tx.invite.findUnique({ where: { code }, include: { environment: { select: { archivedAt: true } } } });
    const state = inviteState(invite);
    if (state !== "valid" || !invite) return { ok: false as const, status: 400, error: INVITE_MESSAGES[state as Exclude<InviteState, "valid">] };

    const existing = await tx.membership.findUnique({ where: { environmentId_userId: { environmentId: invite.environmentId, userId } } });
    if (existing && ROLE_RANK[existing.role] >= ROLE_RANK[invite.role]) {
      return { ok: true as const, environmentId: invite.environmentId, alreadyMember: true };
    }
    // Conta o uso só se ainda houver vaga (protege contra dois aceites simultâneos).
    const claimed = await tx.invite.updateMany({
      where: { id: invite.id, revokedAt: null, ...(invite.maxUses !== null ? { uses: { lt: invite.maxUses } } : {}) },
      data: { uses: { increment: 1 } },
    });
    if (!claimed.count) return { ok: false as const, status: 400, error: INVITE_MESSAGES.used };
    if (existing) await tx.membership.update({ where: { id: existing.id }, data: { role: invite.role } });
    else await tx.membership.create({ data: { environmentId: invite.environmentId, userId, role: invite.role } });
    return { ok: true as const, environmentId: invite.environmentId, alreadyMember: false };
  });
}
