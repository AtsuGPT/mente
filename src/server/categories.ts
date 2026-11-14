import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
import { DEFAULT_ENVIRONMENT_ID, resolveScope, type Scope } from "./scope";
import type { CategoryInput } from "./validation";

export type CategorySummary = {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  position: number;
};

const summarySelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  color: true,
  position: true,
} satisfies Prisma.CategorySelect;

/** Filtro de visibilidade pública: publicado e com data já alcançada. */
export function publiclyVisible(now = new Date()): Prisma.PostWhereInput {
  return { status: "PUBLISHED", publishedAt: { lte: now } };
}

/** Pensamentos do ambiente do escopo; privados só para quem pode vê-los (e para o autor, nos dele). */
export function scopeFilter(scope: Scope): Prisma.PostWhereInput {
  if (scope.canSeePrivate) return { environmentId: scope.environmentId };
  if (!scope.viewerId) return { environmentId: scope.environmentId, private: false };
  // AND, para não colidir com um OR de quem espalha este filtro (kally-memory).
  return { environmentId: scope.environmentId, AND: [{ OR: [{ private: false }, { authorId: scope.viewerId }] }] };
}

const ordering = [{ position: "asc" }, { name: "asc" }] as const;

export async function listCategories(environmentId = DEFAULT_ENVIRONMENT_ID): Promise<CategorySummary[]> {
  return db.category.findMany({ where: { environmentId }, select: summarySelect, orderBy: [...ordering] });
}

export async function listCategoriesWithPublicCounts(scopeArg?: Scope) {
  const scope = await resolveScope(scopeArg);
  const rows = await db.category.findMany({
    where: { environmentId: scope.environmentId },
    select: {
      ...summarySelect,
      _count: { select: { posts: { where: { ...publiclyVisible(), ...scopeFilter(scope) } } } },
    },
    orderBy: [...ordering],
  });
  return rows.map(({ _count, ...c }) => ({ ...c, count: _count.posts }));
}

export async function listCategoriesWithAllCounts(environmentId = DEFAULT_ENVIRONMENT_ID) {
  const rows = await db.category.findMany({
    where: { environmentId },
    select: { ...summarySelect, _count: { select: { posts: true } } },
    orderBy: [...ordering],
  });
  return rows.map(({ _count, ...c }) => ({ ...c, count: _count.posts }));
}

export type MutationResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; fieldErrors?: Record<string, string[]>; message?: string };

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

const SLUG_TAKEN = { slug: ["Já existe uma categoria com este endereço."] };
const NOT_FOUND = { ok: false as const, message: "Categoria não encontrada." };

/** A categoria precisa pertencer ao ambiente: um id de outro ambiente é tratado como inexistente. */
async function belongs(id: string, environmentId: string) {
  return !!(await db.category.findFirst({ where: { id, environmentId }, select: { id: true } }));
}

export async function createCategory(input: CategoryInput, environmentId = DEFAULT_ENVIRONMENT_ID): Promise<MutationResult<CategorySummary>> {
  try {
    const created = await db.category.create({ data: { ...input, environmentId }, select: summarySelect });
    return { ok: true, data: created };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, fieldErrors: SLUG_TAKEN };
    throw error;
  }
}

export async function updateCategory(id: string, input: CategoryInput, environmentId = DEFAULT_ENVIRONMENT_ID): Promise<MutationResult<CategorySummary>> {
  if (!(await belongs(id, environmentId))) return NOT_FOUND;
  try {
    const updated = await db.category.update({ where: { id }, data: input, select: summarySelect });
    return { ok: true, data: updated };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, fieldErrors: SLUG_TAKEN };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return NOT_FOUND;
    throw error;
  }
}

/** Remove a categoria; os pensamentos continuam existindo, apenas sem ela. */
export async function deleteCategory(id: string, environmentId = DEFAULT_ENVIRONMENT_ID): Promise<MutationResult> {
  if (!(await belongs(id, environmentId))) return NOT_FOUND;
  try {
    await db.category.delete({ where: { id } });
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return NOT_FOUND;
    throw error;
  }
}
