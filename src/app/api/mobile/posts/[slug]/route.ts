import { SLUG_PATTERN } from "@/lib/slug";
import { getPublishedPostBySlug, listRelatedPosts } from "@/server/posts";
import { error, json, requireRole } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Um pensamento publicado e os relacionados ("Continue lendo"). */
export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const role = await requireRole();
  if (role instanceof Response) return role;

  const { slug } = await context.params;
  if (!SLUG_PATTERN.test(slug)) return error("Pensamento não encontrado.", 404);

  const post = await getPublishedPostBySlug(slug);
  if (!post) return error("Pensamento não encontrado.", 404);

  return json({ post, related: await listRelatedPosts(post, 3) });
}

export { preflight as OPTIONS } from "../../_lib/http";
