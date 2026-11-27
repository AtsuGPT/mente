import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import type { Access } from "@/server/environments";
import { ARTIFACT_KINDS, LIMITS, type ArtifactKind } from "./kinds";
import { validateArtifact, type ArtifactDraft } from "./validate";

/**
 * Armazenamento dos artefatos. Toda função recebe o Access de resolveAccess (o mesmo porteiro dos pensamentos), então
 * o isolamento entre ambientes e as permissões valem aqui do mesmo jeito:
 *
 *  - ver: quem vê o ambiente; artefato privado só para quem pode ver privados ou para quem o criou;
 *  - criar e duplicar: quem pode publicar;
 *  - editar (nova versão, restaurar, metadados) e apagar: quem gerencia o conteúdo, ou quem criou com "editar os
 *    próprios";
 *  - favoritar: qualquer pessoa com conta que vê o artefato.
 *
 * Artefato fora do ambiente, ou que a pessoa não pode ver, responde "não encontrado" (como os pensamentos).
 */

export class ArtifactError extends Error {
  constructor(message: string, readonly status: number, readonly details: string[] = []) {
    super(message);
  }
}

/** Filtro de visibilidade dentro do ambiente. */
export function visibleWhere(access: Access): Prisma.ArtifactWhereInput {
  if (access.scope.canSeePrivate) return { environmentId: access.environment.id };
  return { environmentId: access.environment.id, OR: [{ private: false }, ...(access.userId ? [{ authorId: access.userId }] : [])] };
}

export function canEditArtifact(access: Access, artifact: { authorId: string | null }) {
  if (access.permissions.manageContent) return true;
  return access.permissions.editOwn && !!access.userId && artifact.authorId === access.userId;
}

const cardSelect = {
  id: true,
  title: true,
  description: true,
  kind: true,
  format: true,
  category: true,
  private: true,
  version: true,
  authorId: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { displayName: true, username: true } },
} satisfies Prisma.ArtifactSelect;

type CardRow = Prisma.ArtifactGetPayload<{ select: typeof cardSelect }>;

function toCard(row: CardRow, access: Access, favorites: Set<string>) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    kind: row.kind as ArtifactKind,
    format: row.format,
    category: row.category,
    private: row.private,
    version: row.version,
    author: row.author ? { name: row.author.displayName, username: row.author.username, isMe: row.authorId === access.userId } : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    favorite: favorites.has(row.id),
    canEdit: canEditArtifact(access, row),
  };
}

export type ArtifactCard = ReturnType<typeof toCard>;

async function favoriteSet(access: Access, ids: string[]) {
  if (!access.userId || !ids.length) return new Set<string>();
  const rows = await db.artifactFavorite.findMany({ where: { userId: access.userId, artifactId: { in: ids } }, select: { artifactId: true } });
  return new Set(rows.map((r) => r.artifactId));
}

export async function listArtifacts(access: Access, filters: { q?: string; kind?: string; category?: string; favorites?: boolean; mine?: boolean } = {}) {
  const and: Prisma.ArtifactWhereInput[] = [visibleWhere(access)];
  const q = filters.q?.trim().slice(0, 80);
  if (q) and.push({ OR: [{ title: { contains: q } }, { description: { contains: q } }, { category: { contains: q } }] });
  if (filters.kind && (ARTIFACT_KINDS as readonly string[]).includes(filters.kind)) and.push({ kind: filters.kind });
  if (filters.category) and.push({ category: filters.category });
  if (filters.mine && access.userId) and.push({ authorId: access.userId });
  if (filters.favorites) and.push(access.userId ? { favorites: { some: { userId: access.userId } } } : { id: "__nenhum__" });
  const rows = await db.artifact.findMany({ where: { AND: and }, select: cardSelect, orderBy: { updatedAt: "desc" }, take: 120 });
  const favorites = await favoriteSet(access, rows.map((r) => r.id));
  // Pastas: as categorias usadas nos artefatos que esta pessoa vê (para os filtros).
  const groups = await db.artifact.groupBy({ by: ["category"], where: visibleWhere(access), _count: { _all: true } });
  return {
    artifacts: rows.map((r) => toCard(r, access, favorites)),
    categories: groups.filter((g) => g.category).map((g) => ({ name: g.category, count: g._count._all })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    canCreate: access.permissions.publish,
  };
}

async function findVisible(access: Access, id: string) {
  const row = await db.artifact.findFirst({ where: { AND: [{ id }, visibleWhere(access)] }, select: { ...cardSelect, conversationId: true, sourceArtifactId: true } });
  if (!row) throw new ArtifactError("Artefato não encontrado.", 404);
  return row;
}

export async function getArtifact(access: Access, id: string) {
  const row = await findVisible(access, id);
  const versions = await db.artifactVersion.findMany({
    where: { artifactId: id },
    select: { number: true, note: true, origin: true, createdAt: true, authorId: true, author: { select: { displayName: true } } },
    orderBy: { number: "desc" },
  });
  // Código escrito à mão por OUTRA pessoa (em qualquer versão até a atual, ou copiado de outro artefato): o app pede um
  // toque em "Rodar" antes de executar. A caixa de areia já isola; isto protege de interface enganosa e de travamento.
  const handBy = versions.find((v) => v.number <= row.version && (v.origin === "manual" || v.origin === "duplicacao") && v.authorId !== access.userId);
  const handWrittenBy = handBy ? handBy.author?.displayName ?? "outra pessoa" : null;
  const current = await db.artifactVersion.findUnique({ where: { artifactId_number: { artifactId: id, number: row.version } }, select: { source: true, config: true } });
  const favorites = await favoriteSet(access, [id]);
  return {
    artifact: {
      ...toCard(row, access, favorites),
      source: current?.source ?? "",
      config: current?.config ?? "{}",
      sourceArtifactId: row.sourceArtifactId,
      canDuplicate: access.permissions.publish,
      canFavorite: !!access.userId,
      handWrittenBy,
    },
    versions: versions.map((v) => ({ number: v.number, note: v.note, origin: v.origin, createdAt: v.createdAt.toISOString(), author: v.author?.displayName ?? null })),
  };
}

export async function getVersion(access: Access, id: string, number: number) {
  await findVisible(access, id);
  const v = await db.artifactVersion.findUnique({ where: { artifactId_number: { artifactId: id, number } }, select: { number: true, source: true, note: true, origin: true, createdAt: true } });
  if (!v) throw new ArtifactError("Versão não encontrada.", 404);
  return { ...v, createdAt: v.createdAt.toISOString() };
}

function check(draft: ArtifactDraft) {
  const result = validateArtifact(draft);
  if (!result.ok) throw new ArtifactError("O artefato não passou na validação.", 422, result.errors);
  return result;
}

export type CreateInput = ArtifactDraft & { private?: boolean; note?: string; origin?: string; conversationId?: string | null; sourceArtifactId?: string | null };

export async function createArtifact(access: Access, input: CreateInput) {
  if (!access.userId) throw new ArtifactError("Entre com sua conta para salvar artefatos.", 401);
  if (!access.permissions.publish) throw new ArtifactError("Você não pode criar artefatos neste ambiente.", 403);
  const { artifact, warnings } = check(input);
  const created = await db.artifact.create({
    data: {
      environmentId: access.environment.id,
      authorId: access.userId,
      title: artifact.title,
      description: artifact.description,
      kind: artifact.kind,
      format: artifact.format,
      category: artifact.category,
      private: !!input.private,
      version: 1,
      conversationId: input.conversationId ?? null,
      sourceArtifactId: input.sourceArtifactId ?? null,
      versions: { create: { number: 1, source: artifact.source, note: (input.note ?? "Primeira versão").slice(0, LIMITS.note), origin: input.origin ?? "manual", authorId: access.userId } },
    },
    select: { id: true, version: true },
  });
  return { ...created, warnings };
}

async function editable(access: Access, id: string) {
  const row = await findVisible(access, id);
  if (!canEditArtifact(access, row)) throw new ArtifactError("Você não pode editar este artefato.", 403);
  return row;
}

export async function addVersion(access: Access, id: string, input: { source: string; note?: string; origin?: string; title?: string; description?: string }) {
  const row = await editable(access, id);
  const { artifact, warnings } = check({ title: input.title || row.title, kind: row.kind, description: input.description ?? row.description, category: row.category, format: row.format, source: input.source });
  // Número da versão dentro de uma transação: duas gravações ao mesmo tempo não pegam o mesmo número.
  const version = await db.$transaction(async (tx) => {
    const fresh = await tx.artifact.findUniqueOrThrow({ where: { id }, select: { version: true } });
    const number = fresh.version + 1;
    await tx.artifactVersion.create({ data: { artifactId: id, number, source: artifact.source, note: (input.note || "Nova versão").slice(0, LIMITS.note), origin: input.origin ?? "manual", authorId: access.userId } });
    await tx.artifact.update({ where: { id }, data: { version: number, ...(input.title ? { title: artifact.title } : {}), ...(input.description !== undefined ? { description: artifact.description } : {}) } });
    return number;
  });
  return { id, version, warnings };
}

export async function restoreVersion(access: Access, id: string, number: number) {
  await editable(access, id);
  const old = await db.artifactVersion.findUnique({ where: { artifactId_number: { artifactId: id, number } }, select: { source: true } });
  if (!old) throw new ArtifactError("Versão não encontrada.", 404);
  // Restaurar não apaga nada: a versão antiga volta como uma versão nova.
  return addVersion(access, id, { source: old.source, note: `Restaurada a versão ${number}`, origin: "restauracao" });
}

export async function updateArtifact(access: Access, id: string, input: { title?: string; description?: string; category?: string; private?: boolean; kind?: string }) {
  await editable(access, id);
  const data: Prisma.ArtifactUpdateInput = {};
  if (typeof input.title === "string" && input.title.trim()) data.title = input.title.replace(/\s+/g, " ").trim().slice(0, LIMITS.title);
  if (typeof input.description === "string") data.description = input.description.replace(/\s+/g, " ").trim().slice(0, LIMITS.description);
  if (typeof input.category === "string") data.category = input.category.replace(/\s+/g, " ").trim().slice(0, LIMITS.category);
  if (typeof input.private === "boolean") data.private = input.private;
  if (typeof input.kind === "string" && (ARTIFACT_KINDS as readonly string[]).includes(input.kind)) data.kind = input.kind;
  await db.artifact.update({ where: { id }, data });
  return { ok: true as const };
}

export async function deleteArtifact(access: Access, id: string) {
  await editable(access, id);
  await db.artifact.delete({ where: { id } });
  return { ok: true as const };
}

export async function duplicateArtifact(access: Access, id: string) {
  const row = await findVisible(access, id);
  const current = await db.artifactVersion.findUnique({ where: { artifactId_number: { artifactId: id, number: row.version } }, select: { source: true } });
  return createArtifact(access, {
    title: `${row.title} (cópia)`.slice(0, LIMITS.title),
    kind: row.kind,
    description: row.description,
    category: row.category,
    format: row.format,
    source: current?.source ?? "",
    private: row.private,
    note: `Cópia de "${row.title}" (v${row.version})`,
    origin: "duplicacao",
    sourceArtifactId: id,
  });
}

export async function setFavorite(access: Access, id: string, on: boolean) {
  if (!access.userId) throw new ArtifactError("Entre com sua conta para favoritar.", 401);
  await findVisible(access, id);
  if (on) await db.artifactFavorite.upsert({ where: { userId_artifactId: { userId: access.userId, artifactId: id } }, create: { userId: access.userId, artifactId: id }, update: {} });
  else await db.artifactFavorite.deleteMany({ where: { userId: access.userId, artifactId: id } });
  return { favorite: on };
}

/* ------------------------------ Para a Kally ------------------------------ */

/** Código atual de um artefato visível (a base de um refinamento), ou null. */
export async function artifactForKally(access: Access, id: string) {
  try {
    const { artifact } = await getArtifact(access, id);
    return artifact;
  } catch {
    return null;
  }
}

const fold = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const STOP = new Set(["de", "da", "do", "das", "dos", "e", "o", "a", "os", "as", "um", "uma", "para", "com", "em", "no", "na"]);

/**
 * Artefato salvo que a mensagem cita pelo nome ("muda o simulador de circuito RC que salvei"). Compara as palavras do
 * título com as da mensagem: precisa de pelo menos 60% das palavras significativas do título (e duas, se houver).
 */
export async function findArtifactByMention(access: Access, message: string) {
  const words = new Set(fold(message).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2));
  const rows = await db.artifact.findMany({ where: visibleWhere(access), select: { id: true, title: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 200 });
  let best: { id: string; score: number } | null = null;
  for (const r of rows) {
    const t = fold(r.title).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2 && !STOP.has(w));
    if (!t.length) continue;
    const hit = t.filter((w) => words.has(w)).length;
    const score = hit / t.length;
    if (score >= 0.6 && hit >= Math.min(2, t.length) && (!best || score > best.score)) best = { id: r.id, score };
  }
  return best ? artifactForKally(access, best.id) : null;
}
