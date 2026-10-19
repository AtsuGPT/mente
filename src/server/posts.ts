import "server-only";
import { db } from "@/lib/db";
import { getAccessRole } from "@/lib/auth/session";
import type { Role } from "@/lib/auth/role";
import { Prisma, type PostStatus } from "@/generated/prisma";
import { excerpt } from "@/lib/text";
import { publiclyVisible, type CategorySummary, type MutationResult } from "./categories";
import type { PostInput } from "./validation";

const visibilityFilter = (role: Role) => {
  if (role === "ADMIN" || role === "INTIMO") {
    return {};
  }
  return { private: false };
};


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
  private: true,
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

export type PostFull = PostCard & { content: string; updatedAt: Date };

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
  return { ...toCard(row), content: row.content, updatedAt: row.updatedAt };
}

/* ------------------------------------------------------------------ */
/* Leitura pública — nunca devolve rascunhos nem publicações futuras.  */
/* ------------------------------------------------------------------ */

export const FEED_PAGE_SIZE = 10;

function parseSearchDate(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return undefined;

  const dayValue = new Date(`${value}T00:00:00-03:00`);
  if (endOfDay) dayValue.setTime(dayValue.getTime() + 24 * 60 * 60 * 1000);
  return dayValue;
}

export async function listPublishedPosts(options: {
  categorySlug?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const role = (await getAccessRole()) ?? "CONVIDADO";
  const pageSize = options.pageSize ?? FEED_PAGE_SIZE;
  const requested = Math.max(1, Math.floor(options.page ?? 1));
  const query = options.q?.trim().slice(0, 100);
  const from = parseSearchDate(options.from);
  const toExclusive = parseSearchDate(options.to, true);
  const where: Prisma.PostWhereInput = {
    ...publiclyVisible(),
    ...visibilityFilter(role),
    ...(options.categorySlug ? { categories: { some: { slug: options.categorySlug } } } : {}),
    ...(query
      ? {
          OR: [
            { title: { contains: query } },
            { content: { contains: query } },
          ],
        }
      : {}),
    ...((from || toExclusive)
      ? { publishedAt: { lte: new Date(), ...(from ? { gte: from } : {}), ...(toExclusive ? { lt: toExclusive } : {}) } }
      : {}),
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

export async function searchPublishedPostsByTerms(terms: string[], limit = 100): Promise<PostFull[]> {
  const role = (await getAccessRole()) ?? "CONVIDADO";
  const normalizedTerms = [...new Set(terms.map((term) => term.trim()).filter(Boolean))].slice(0, 8);
  if (!normalizedTerms.length) return [];

  const rows = await db.post.findMany({
    where: {
      ...publiclyVisible(),
      ...visibilityFilter(role),
      OR: normalizedTerms.flatMap((term) => [
        { title: { contains: term } },
        { content: { contains: term } },
      ]),
    },
    select: postSelect,
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: Math.min(Math.max(1, limit), 100),
  });
  return rows.map(toFull);
}

export async function listLatestPosts(limit = 6, categorySlug?: string): Promise<PostCard[]> {
  const role = (await getAccessRole()) ?? "CONVIDADO";
  const rows = await db.post.findMany({
    where: {
      ...publiclyVisible(),
      ...visibilityFilter(role),
      ...(categorySlug ? { categories: { some: { slug: categorySlug } } } : {}),
    },
    select: postSelect,
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
  return rows.map(toCard);
}

export async function countPublishedPosts(): Promise<number> {
  const role = (await getAccessRole()) ?? "CONVIDADO";
  return db.post.count({ where: { ...publiclyVisible(), ...visibilityFilter(role) } });
}

export async function getPublishedPostBySlug(slug: string): Promise<PostFull | null> {
  const role = (await getAccessRole()) ?? "CONVIDADO";
  const row = await db.post.findFirst({
    where: { slug, ...publiclyVisible(), ...visibilityFilter(role) },
    select: postSelect,
  });
  return row ? toFull(row) : null;
}

/** Outros pensamentos que compartilham categoria, do mais recente ao mais antigo. */
export async function listRelatedPosts(post: Pick<PostCard, "id" | "categories">, limit = 3): Promise<PostCard[]> {
  const role = (await getAccessRole()) ?? "CONVIDADO";
  if (post.categories.length === 0) return [];
  const rows = await db.post.findMany({
    where: {
      ...publiclyVisible(),
      ...visibilityFilter(role),
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
    where: { ...publiclyVisible(), ...visibilityFilter("CONVIDADO") },
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
  private: boolean;
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
            { title: { contains: q } },
            { content: { contains: q } },
            { slug: { contains: q } },
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
      private: true,
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
  private: boolean;
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

async function existingCategories(ids: string[]) {
  if (ids.length === 0) return [];
  const found = await db.category.findMany({ where: { id: { in: ids } }, select: { id: true } });
  return found.map((category) => ({ id: category.id }));
}

async function nextPostNumber(client: Prisma.TransactionClient): Promise<number> {
  const counter = await client.postCounter.upsert({
    where: { id: "posts" },
    update: { value: { increment: 1 } },
    create: { id: "posts", value: 1 },
    select: { value: true },
  });
  return counter.value;
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
  const categories = await existingCategories(input.categoryIds);
  const { status, publishedAt } = resolveState(input);
  try {
    const created = await db.$transaction(async (tx) => {
      const number = await nextPostNumber(tx);
      const post = await tx.post.create({
        data: {
          number,
          title: input.title,
          slug: input.slug,
          content: input.content,
          private: input.private,
          status,
          publishedAt,
          categories: { connect: categories },
        },
        select: { id: true },
      });
      return post;
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

  const categories = await existingCategories(input.categoryIds);
  const { status, publishedAt } = resolveState(input, existing);
  try {
    const updated = await db.$transaction(async (tx) => {
      const post = await tx.post.update({
        where: { id },
        data: {
          title: input.title,
          slug: input.slug,
          content: input.content,
          private: input.private,
          status,
          publishedAt,
          categories: { set: categories },
        },
        select: { id: true },
      });
      return post;
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
