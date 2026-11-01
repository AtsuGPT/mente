import { SLUG_PATTERN } from "@/lib/slug";
import { db } from "@/lib/db";
import { canEditPost } from "@/server/environments";
import { getPublishedPostBySlug, listRelatedPosts } from "@/server/posts";
import { envAccess, error, json } from "../../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ env: string; slug: string }> };

/** Um pensamento publicado do ambiente e os relacionados. */
export async function GET(_request: Request, context: Context) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  const { slug } = await context.params;
  if (!SLUG_PATTERN.test(slug)) return error("Pensamento não encontrado.", 404);
  const post = await getPublishedPostBySlug(slug, access.scope);
  if (!post) return error("Pensamento não encontrado.", 404);
  const owner = await db.post.findUnique({ where: { id: post.id }, select: { authorId: true } });
  return json({ post, related: await listRelatedPosts(post, 3, access.scope), canEdit: canEditPost(access, { authorId: owner?.authorId ?? null }) });
}

export { preflight as OPTIONS } from "../../../../_lib/http";
