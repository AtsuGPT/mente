import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma";
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

const ordering = [{ position: "asc" }, { name: "asc" }] as const;

export async function listCategories(): Promise<CategorySummary[]> {
  return db.category.findMany({ select: summarySelect, orderBy: [...ordering] });
}

export async function listCategoriesWithPublicCounts() {
  const rows = await db.category.findMany({
    select: {
      ...summarySelect,
      _count: { select: { posts: { where: publiclyVisible() } } },
    },
    orderBy: [...ordering],
  });
  return rows.map(({ _count, ...c }) => ({ ...c, count: _count.posts }));
}

export async function getCategoryBySlug(slug: string): Promise<CategorySummary | null> {
  return db.category.findUnique({ where: { slug }, select: summarySelect });
}

export async function listCategoriesWithAllCounts() {
  const rows = await db.category.findMany({
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

export async function createCategory(input: CategoryInput): Promise<MutationResult<CategorySummary>> {
  try {
    const created = await db.category.create({ data: input, select: summarySelect });
    return { ok: true, data: created };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, fieldErrors: { slug: ["Já existe uma categoria com este endereço."] } };
    }
    throw error;
  }
}

export async function updateCategory(id: string, input: CategoryInput): Promise<MutationResult<CategorySummary>> {
  try {
    const updated = await db.category.update({ where: { id }, data: input, select: summarySelect });
    return { ok: true, data: updated };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, fieldErrors: { slug: ["Já existe uma categoria com este endereço."] } };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { ok: false, message: "Categoria não encontrada." };
    }
    throw error;
  }
}

/** Remove a categoria; os pensamentos continuam existindo, apenas sem ela. */
export async function deleteCategory(id: string): Promise<MutationResult> {
  try {
    await db.category.delete({ where: { id } });
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { ok: false, message: "Categoria não encontrada." };
    }
    throw error;
  }
}
