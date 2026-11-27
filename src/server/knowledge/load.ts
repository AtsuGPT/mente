import "server-only";
import { db } from "@/lib/db";
import { excerpt } from "@/lib/text";
import { publiclyVisible, scopeFilter } from "@/server/categories";
import { visibleWhere } from "@/server/artifacts/store";
import type { Access } from "@/server/environments";
import { buildKnowledgeGraph, type KnowledgeGraph } from "./graph";

/**
 * Carrega, com a visibilidade de quem pede, os dados do Mapa de Conhecimento e monta o grafo (graph.ts).
 *  - pastas: as do ambiente;
 *  - pensamentos: os mesmos do mapa antigo (quem gerencia o conteúdo vê também os rascunhos; os outros, só o publicado
 *    que o papel deixa ver, inclusive privados só com canSeePrivate);
 *  - tópicos e conversas: só os da própria pessoa (cada um vê o seu estudo, mesmo numa pasta compartilhada);
 *  - artefatos: a mesma regra da biblioteca de artefatos.
 * Nenhuma chamada de IA.
 */
export async function getKnowledgeGraph(access: Access): Promise<KnowledgeGraph> {
  const environmentId = access.environment.id;
  const userId = access.userId;
  const [categories, posts, topics, conversations, artifacts] = await Promise.all([
    db.category.findMany({ where: { environmentId }, select: { id: true, name: true, slug: true, color: true }, orderBy: [{ position: "asc" }, { name: "asc" }] }),
    db.post.findMany({
      where: access.permissions.manageContent ? { environmentId } : { ...publiclyVisible(), ...scopeFilter(access.scope) },
      select: { id: true, title: true, slug: true, content: true, status: true, private: true, publishedAt: true, categories: { select: { id: true } } },
      orderBy: { number: "asc" },
    }),
    userId
      ? db.kallyLearningTopic.findMany({ where: { environmentId, userId }, select: { id: true, title: true, categoryId: true, conversationId: true, mastery: true, lastStudiedAt: true }, orderBy: { lastStudiedAt: "desc" } })
      : [],
    userId
      ? db.kallyConversation.findMany({
          // Só conversas de estudo: as que estão numa pasta ou deram origem a um tópico.
          where: { environmentId, userId, OR: [{ categoryId: { not: null } }, { topics: { some: {} } }] },
          select: { id: true, title: true, categoryId: true, updatedAt: true, messages: { where: { role: "assistant" }, select: { sources: true } } },
          orderBy: { updatedAt: "desc" },
          take: 300,
        })
      : [],
    db.artifact.findMany({ where: { ...visibleWhere(access), conversationId: { not: null } }, select: { id: true, title: true, conversationId: true, updatedAt: true } }),
  ]);

  const now = new Date();
  return buildKnowledgeGraph({
    categories,
    topics,
    posts: posts.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      content: p.content,
      categoryIds: p.categories.map((c) => c.id),
      draft: p.status !== "PUBLISHED" || !p.publishedAt || p.publishedAt > now,
      private: p.private,
      excerpt: excerpt(p.content, 160),
      publishedAt: p.publishedAt,
    })),
    conversations: conversations.map((c) => ({ id: c.id, title: c.title, categoryId: c.categoryId, updatedAt: c.updatedAt, citedSlugs: citedPosts(c.messages.map((m) => m.sources)) })),
    artifacts,
  });
}

/** Pensamentos citados como fonte nas respostas da Kally (o JSON de sources de cada mensagem). */
function citedPosts(raw: string[]) {
  const slugs = new Set<string>();
  for (const sources of raw) {
    try {
      for (const s of JSON.parse(sources) as { slug?: string; kind?: string }[]) if (s.slug && (s.kind === "post" || s.kind === "rascunho" || s.kind === "projeto")) slugs.add(s.slug);
    } catch {
      // fonte antiga em outro formato: ignora
    }
  }
  return [...slugs];
}
