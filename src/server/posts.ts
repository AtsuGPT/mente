import "server-only";
import { db } from "@/lib/db";
import { Prisma, type PostStatus } from "@/generated/prisma/client";
import { excerpt } from "@/lib/text";
import { publiclyVisible, type CategorySummary, type MutationResult } from "./categories";
import type { PostInput } from "./validation";

const categorySelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  color: true,
  position: true,
} satisfies Prisma.CategorySelect;

const categoryOrder = [{ position: "asc" }, { name: "asc" }] as const;

const postSelect = {
  id: true,
  number: true,
  title: true,
  slug: true,
  content: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  categories: { select: categorySelect, orderBy: [...categoryOrder] },
} satisfies Prisma.PostSelect;

type PostRow = Prisma.PostGetPayload<{ select: typeof postSelect }>;

export type PostCard = {
  id: string;
  number: number;
  title: string;
  slug: string;
  excerpt: string;
  publishedAt: Date;
  categories: CategorySummary[];
};

export type PostFull = PostCard & { content: string };

function toCard(row: PostRow): PostCard {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    slug: row.slug,
    excerpt: excerpt(row.content),
    publishedAt: row.publishedAt ?? row.createdAt,
    categories: row.categories,
  };
}

function toFull(row: PostRow): PostFull {
  return { ...toCard(row), content: row.content };
}

/* ------------------------------------------------------------------ */
/* Leitura pública — nunca devolve rascunhos nem publicações futuras.  */
/* ------------------------------------------------------------------ */

export const FEED_PAGE_SIZE = 10;

export async function listPublishedPosts(options: { categorySlug?: string; page?: number; pageSize?: number } = {}) {
  const pageSize = options.pageSize ?? FEED_PAGE_SIZE;
  const requested = Math.max(1, Math.floor(options.page ?? 1));
  const where: Prisma.PostWhereInput = {
    ...publiclyVisible(),
    ...(options.categorySlug ? { categories: { some: { slug: options.categorySlug } } } : {}),
  };

  const total = await db.post.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requested, pageCount);

  const rows = await db.post.findMany({
    where,
    select: postSelect,
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return { posts: rows.map(toCard), total, page, pageCount, pageSize };
}

export async function listLatestPosts(limit = 6): Promise<PostCard[]> {
  const rows = await db.post.findMany({
    where: publiclyVisible(),
    select: postSelect,
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
  return rows.map(toCard);
}

export async function countPublishedPosts(): Promise<number> {
  return db.post.count({ where: publiclyVisible() });
}

export async function getPublishedPostBySlug(slug: string): Promise<PostFull | null> {
  const row = await db.post.findFirst({ where: { slug, ...publiclyVisible() }, select: postSelect });
  return row ? toFull(row) : null;
}

/** Outros pensamentos que compartilham categoria, do mais recente ao mais antigo. */
export async function listRelatedPosts(post: Pick<PostCard, "id" | "categories">, limit = 3): Promise<PostCard[]> {
  if (post.categories.length === 0) return [];
  const rows = await db.post.findMany({
    where: {
      ...publiclyVisible(),
      id: { not: post.id },
      categories: { some: { id: { in: post.categories.map((c) => c.id) } } },
    },
    select: postSelect,
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
  return rows.map(toCard);
}

export async function listSitemapEntries() {
  return db.post.findMany({
    where: publiclyVisible(),
    select: { slug: true, updatedAt: true, publishedAt: true },
    orderBy: { publishedAt: "desc" },
  });
}

/* ------------------------------------------------------------------ */
/* Administração — chamadas apenas após requireAdmin().                */
/* ------------------------------------------------------------------ */

export type AdminStatusFilter = "all" | "draft" | "published";
export const ADMIN_PAGE_SIZE = 20;

export type AdminPostRow = {
  id: string;
  number: number;
  title: string;
  slug: string;
  status: PostStatus;
  publishedAt: Date | null;
  updatedAt: Date;
  categories: CategorySummary[];
};

export async function listAdminPosts(options: {
  q?: string;
  status?: AdminStatusFilter;
  categoryId?: string;
  page?: number;
}) {
  const q = options.q?.trim();
  const where: Prisma.PostWhereInput = {
    ...(options.status === "draft" ? { status: "DRAFT" } : {}),
    ...(options.status === "published" ? { status: "PUBLISHED" } : {}),
    ...(options.categoryId ? { categories: { some: { id: options.categoryId } } } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { content: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const total = await db.post.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(options.page ?? 1)), pageCount);

  const rows = await db.post.findMany({
    where,
    select: {
      id: true,
      number: true,
      title: true,
      slug: true,
      status: true,
      publishedAt: true,
      updatedAt: true,
      categories: { select: categorySelect, orderBy: [...categoryOrder] },
    },
    orderBy: [{ updatedAt: "desc" }],
    skip: (page - 1) * ADMIN_PAGE_SIZE,
    take: ADMIN_PAGE_SIZE,
  });

  return { posts: rows satisfies AdminPostRow[], total, page, pageCount };
}

export type AdminPost = {
  id: string;
  number: number;
  title: string;
  slug: string;
  content: string;
  status: PostStatus;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  categories: CategorySummary[];
};

export async function getAdminPost(id: string): Promise<AdminPost | null> {
  return db.post.findUnique({ where: { id }, select: postSelect });
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

const SLUG_TAKEN = { slug: ["Já existe um pensamento com este endereço."] };

async function existingCategoryIds(ids: string[]) {
  if (ids.length === 0) return [];
  const found = await db.category.findMany({ where: { id: { in: ids } }, select: { id: true } });
  return found.map((c) => ({ id: c.id }));
}

function resolveState(input: PostInput, existing?: { status: PostStatus; publishedAt: Date | null }) {
  let status: PostStatus = existing?.status ?? "DRAFT";
  let publishedAt = input.publishedAt ?? existing?.publishedAt ?? null;

  if (input.intent === "publish") {
    status = "PUBLISHED";
    publishedAt = publishedAt ?? new Date();
  } else if (input.intent === "unpublish") {
    status = "DRAFT";
  }
  return { status, publishedAt };
}

export async function createPost(input: PostInput): Promise<MutationResult<{ id: string }>> {
  const categories = await existingCategoryIds(input.categoryIds);
  const { status, publishedAt } = resolveState(input);
  try {
    const created = await db.post.create({
      data: {
        title: input.title,
        slug: input.slug,
        content: input.content,
        status,
        publishedAt,
        categories: { connect: categories },
      },
      select: { id: true },
    });
    return { ok: true, data: created };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, fieldErrors: SLUG_TAKEN };
    throw error;
  }
}

export async function updatePost(id: string, input: PostInput): Promise<MutationResult<{ id: string }>> {
  const existing = await db.post.findUnique({ where: { id }, select: { status: true, publishedAt: true } });
  if (!existing) return { ok: false, message: "Pensamento não encontrado." };

  const categories = await existingCategoryIds(input.categoryIds);
  const { status, publishedAt } = resolveState(input, existing);
  try {
    const updated = await db.post.update({
      where: { id },
      data: {
        title: input.title,
        slug: input.slug,
        content: input.content,
        status,
        publishedAt,
        categories: { set: categories },
      },
      select: { id: true },
    });
    return { ok: true, data: updated };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, fieldErrors: SLUG_TAKEN };
    throw error;
  }
}

export async function deletePost(id: string): Promise<MutationResult> {
  try {
    await db.post.delete({ where: { id } });
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { ok: false, message: "Pensamento não encontrado." };
    }
    throw error;
  }
}
