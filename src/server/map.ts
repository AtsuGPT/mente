import "server-only";
import { db } from "@/lib/db";
import { excerpt } from "@/lib/text";
import { POST_IMAGE_NAME } from "@/lib/uploads";
import { publiclyVisible, scopeFilter } from "./categories";
import type { Scope } from "./scope";

/**
 * Grafo do arquivo, montado só a partir de relações que já existem nos dados:
 *  - pensamento → pasta (categorias do post);
 *  - pensamento → imagem (imagens /uploads/posts/ citadas no Markdown);
 *  - pensamento → pensamento (links /pensamento/<slug> no texto).
 */

export type MapNode =
  | { id: string; kind: "pasta"; label: string; slug: string; color: string; description: string }
  | {
      id: string;
      kind: "pensamento";
      label: string;
      slug: string;
      number: number;
      color: string | null;
      excerpt: string;
      publishedAt: Date | null;
      draft: boolean;
      private: boolean;
    }
  | { id: string; kind: "imagem"; label: string; src: string };

export type MapEdge = { source: string; target: string; kind: "pasta" | "imagem" | "mencao" };

const IMAGE_IN_MARKDOWN = /\/uploads\/posts\/([^)\s?"#]+)/g;
const POST_LINK_IN_MARKDOWN = /\]\(\/pensamento\/([a-z0-9-]+)\)/g;

/** includeDrafts: quem gerencia o conteúdo do ambiente também vê os rascunhos no mapa. */
export async function getKnowledgeMap(scope: Scope, options: { includeDrafts?: boolean } = {}): Promise<{ nodes: MapNode[]; edges: MapEdge[] }> {

  const [categories, posts] = await Promise.all([
    db.category.findMany({
      where: { environmentId: scope.environmentId },
      select: { id: true, name: true, slug: true, color: true, description: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    }),
    db.post.findMany({
      where: options.includeDrafts ? { environmentId: scope.environmentId } : { ...publiclyVisible(), ...scopeFilter(scope) },
      select: {
        id: true,
        number: true,
        title: true,
        slug: true,
        content: true,
        status: true,
        private: true,
        publishedAt: true,
        categories: { select: { id: true, color: true }, orderBy: [{ position: "asc" }, { name: "asc" }] },
      },
      orderBy: { number: "asc" },
    }),
  ]);

  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];
  const usedCategories = new Set(posts.flatMap((post) => post.categories.map((category) => category.id)));
  const postIdBySlug = new Map(posts.map((post) => [post.slug, post.id]));
  const images = new Set<string>();

  for (const category of categories) {
    // Pastas vazias para este papel não revelam nada nem poluem o mapa.
    if (!usedCategories.has(category.id)) continue;
    nodes.push({
      id: `c:${category.id}`,
      kind: "pasta",
      label: category.name,
      slug: category.slug,
      color: category.color,
      description: category.description,
    });
  }

  for (const post of posts) {
    const postNode = `p:${post.id}`;
    nodes.push({
      id: postNode,
      kind: "pensamento",
      label: post.title,
      slug: post.slug,
      number: post.number,
      color: post.categories[0]?.color ?? null,
      excerpt: excerpt(post.content, 140),
      publishedAt: post.publishedAt,
      draft: post.status !== "PUBLISHED" || !post.publishedAt || post.publishedAt > new Date(),
      private: post.private,
    });

    for (const category of post.categories) edges.push({ source: postNode, target: `c:${category.id}`, kind: "pasta" });

    for (const [, file] of post.content.matchAll(IMAGE_IN_MARKDOWN)) {
      if (!POST_IMAGE_NAME.test(file)) continue;
      if (!images.has(file)) {
        images.add(file);
        nodes.push({ id: `i:${file}`, kind: "imagem", label: file, src: `/uploads/posts/${file}` });
      }
      edges.push({ source: postNode, target: `i:${file}`, kind: "imagem" });
    }

    const linked = new Set<string>();
    for (const [, slug] of post.content.matchAll(POST_LINK_IN_MARKDOWN)) {
      const target = postIdBySlug.get(slug);
      if (!target || target === post.id || linked.has(target)) continue;
      linked.add(target);
      edges.push({ source: postNode, target: `p:${target}`, kind: "mencao" });
    }
  }

  return { nodes, edges };
}
