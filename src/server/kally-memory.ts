import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { stripMarkdown, stripMarkdownLines } from "@/lib/text";
import { embedDocuments, embedProfile, embedQueries } from "./ai";
import { publiclyVisible, scopeFilter } from "./categories";
import type { Scope } from "./scope";

/**
 * Memória da Kally por ambiente (a evolução da busca da Fase 1, no mesmo lugar):
 *
 *  1. pensamentos do ambiente (pastas com "projeto" no nome aparecem como projetos), e os
 *     rascunhos que a pessoa pode editar (os próprios, ou todos para quem gerencia conteúdo);
 *  2. imagens dos pensamentos, pela descrição (texto alternativo) dentro do próprio texto;
 *  3. conversas salvas da própria pessoa com a Kally.
 *
 * Pontuação = significado (embeddings, se o modelo estiver disponível) + palavras
 * + relações (mesma pasta e links entre pensamentos de quem já foi encontrado).
 * O índice (KallyChunk) é conferido a cada busca: o que mudou é recalculado e o
 * que foi apagado ou despublicado sai. O escopo de quem pergunta filtra tudo.
 */

export type MemoryKind = "post" | "projeto" | "rascunho" | "conversa";
export type Retrieved = {
  kind: MemoryKind;
  title: string;
  /** slug do pensamento ou id da conversa */
  slug: string;
  categories: string[];
  excerpt: string;
  score: number;
  /** quem escreveu o pensamento (nulo nas conversas) */
  authorId?: string | null;
  author?: string | null;
  /** títulos de outros resultados ligados a este (mesma pasta ou link) */
  related: string[];
};

const MAX_CANDIDATES = 400;
const CHUNK = 900;
// A escala das notas depende do modelo de embeddings (embedProfile em server/ai.ts): abaixo do
// mínimo, o significado não conta (conversa solta não puxa posts).

const STOP_WORDS = new Set([
  "a", "as", "o", "os", "um", "uma", "uns", "umas", "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas",
  "por", "para", "com", "sem", "que", "qual", "quais", "como", "porque", "sobre", "isso", "este", "esta", "esse", "essa",
  "me", "mim", "eu", "voce", "ele", "ela", "eles", "elas", "ou", "mas", "ao", "aos", "ser", "ter", "faz", "fazer",
  "pensamento", "pensamentos", "post", "posts", "escreveu", "escrevi", "publicou", "kally", "algum", "alguma", "tem", "existe",
  "quero", "aprender", "explique", "explica", "fale", "sei", "tudo", "bem", "conta", "conte", "ola", "obrigado", "obrigada",
  "beleza", "rapida", "rapido", "favor", "pode", "voces", "gente", "coisa", "algo", "curiosidade",
]);

const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");
const terms = (text: string) => [...new Set(normalize(text).match(/[\p{L}\p{N}]{3,}/gu) ?? [])].filter((t) => !STOP_WORDS.has(t)).slice(0, 12);
// O modelo entra no hash: trocar de modelo reindexa tudo, e vetores de modelos diferentes nunca se misturam.
const hashOf = (text: string) => createHash("sha1").update(`${embedProfile().model}
${text}`).digest("hex");

/** Texto indexável do pensamento: título, pastas, corpo e as descrições das imagens. */
function documentText(post: { title: string; content: string; categories: { name: string }[] }) {
  const images = [...post.content.matchAll(/!\[([^\]]{3,})\]\([^)]+\)/g)].map((m) => `Imagem: ${m[1]}`);
  // Uma linha por parágrafo: com stripMarkdown o post virava uma linha só e os trechos eram cortados a cada 900
  // caracteres no meio das frases (o 1º trecho do guia da simulação era só o título). Medido com os posts reais
  // da simulação (eval/simulacao/analisar-busca.mjs): post certo passando de 23/24 para 24/24, posts errados no
  // contexto 0,21 → 0,17 por pergunta. O texto muda, então o índice se refaz sozinho (hash).
  return [post.title, post.categories.map((c) => c.name).join(", "), stripMarkdownLines(post.content), ...images].filter(Boolean).join("\n");
}

function chunks(text: string): string[] {
  const parts: string[] = [];
  let current = "";
  for (const paragraph of text.split(/\n+/)) {
    if ((current + "\n" + paragraph).length > CHUNK && current) {
      parts.push(current.trim());
      current = "";
    }
    current += `\n${paragraph}`;
    while (current.length > CHUNK * 1.5) {
      parts.push(current.slice(0, CHUNK).trim());
      current = current.slice(CHUNK);
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts.slice(0, 12);
}

function cosine(a: number[], b: number[]) {
  // Vetor de outro modelo (ainda não reindexado): não compara.
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

type Doc = { refId: string; kind: "post" | "conversa"; userId: string | null; text: string };

const indexing = globalThis as typeof globalThis & { __kallyIndexing?: Set<string> };

/**
 * Recalcula só o que mudou e remove o que não existe mais. Falha do modelo = sem índice.
 * Poucos textos novos (o caso comum) são indexados na hora. Muitos (primeira vez ou troca de
 * modelo: ~1,3 s por trecho na CPU) vão para segundo plano, para a pergunta não esperar
 * minutos; enquanto isso a busca usa o que já está indexado com o modelo atual.
 */
async function syncIndex(environmentId: string, docs: Doc[], kind: "post" | "conversa", userId?: string) {
  const existing = await db.kallyChunk.findMany({
    where: { environmentId, kind, ...(kind === "conversa" ? { userId } : {}) },
    select: { refId: true, hash: true },
    distinct: ["refId"],
  });
  const known = new Map(existing.map((e) => [e.refId, e.hash]));
  const live = new Set(docs.map((d) => d.refId));
  const stale = existing.filter((e) => !live.has(e.refId)).map((e) => e.refId);
  if (stale.length) await db.kallyChunk.deleteMany({ where: { environmentId, kind, refId: { in: stale } } });

  const pending = docs.filter((doc) => known.get(doc.refId) !== hashOf(doc.text));
  if (!pending.length) return;
  const run = async () => {
    for (const doc of pending) {
      const hash = hashOf(doc.text);
      const parts = chunks(doc.text);
      const vectors = await embedDocuments(parts);
      await db.$transaction([
        db.kallyChunk.deleteMany({ where: { kind, refId: doc.refId } }),
        db.kallyChunk.createMany({
          data: parts.map((text, chunk) => ({ environmentId, kind, refId: doc.refId, userId: doc.userId, chunk, hash, text, vector: JSON.stringify(vectors[chunk]) })),
        }),
      ]);
    }
  };
  if (pending.length <= 3) return run();
  const key = `${environmentId}:${kind}:${userId ?? ""}`;
  indexing.__kallyIndexing ??= new Set();
  if (indexing.__kallyIndexing.has(key)) return;
  indexing.__kallyIndexing.add(key);
  console.info(`Kally memory: reindexando ${pending.length} textos em segundo plano (${kind}).`);
  void run()
    .catch((cause) => console.error("Kally memory: reindexação falhou:", cause instanceof Error ? cause.message : cause))
    .finally(() => indexing.__kallyIndexing?.delete(key));
}

/**
 * Busca na memória do ambiente. Nunca sai do escopo: os pensamentos vêm filtrados por
 * environmentId e privacidade, e as conversas só da própria pessoa (userId).
 */
export async function recall(
  scope: Scope,
  query: string,
  options: { limit?: number; userId?: string | null; draftAuthorId?: string | null; excludeConversationId?: string | null; allDrafts?: boolean } = {},
): Promise<Retrieved[]> {
  const limit = options.limit ?? 5;
  const draftAuthor = options.draftAuthorId ?? options.userId;
  const drafts = options.allDrafts ? { status: "DRAFT" as const } : draftAuthor ? { status: "DRAFT" as const, authorId: draftAuthor } : null;
  const posts = await db.post.findMany({
    where: { ...scopeFilter(scope), OR: [publiclyVisible(), ...(drafts ? [drafts] : [])] },
    select: { id: true, title: true, slug: true, status: true, content: true, categories: { select: { id: true, name: true } }, authorId: true, author: { select: { displayName: true } } },
    orderBy: { publishedAt: "desc" },
    take: MAX_CANDIDATES,
  });

  // Significado: índice + vetor da pergunta. Sem o modelo, segue só com palavras.
  let semantic = new Map<string, { score: number; text: string }>();
  let queryVector: number[] | null = null;
  try {
    // O índice guarda publicados e rascunhos do ambiente; a busca usa só os que esta pessoa vê.
    const allPublished = await db.post.findMany({
      where: { environmentId: scope.environmentId, OR: [publiclyVisible(), { status: "DRAFT" }] },
      select: { id: true, title: true, content: true, categories: { select: { name: true } } },
      take: MAX_CANDIDATES,
    });
    await syncIndex(scope.environmentId, allPublished.map((p) => ({ refId: p.id, kind: "post" as const, userId: null, text: documentText(p) })), "post");
    [queryVector] = await embedQueries([query]);
    const rows = await db.kallyChunk.findMany({ where: { environmentId: scope.environmentId, kind: "post", refId: { in: posts.map((p) => p.id) } }, select: { refId: true, text: true, vector: true } });
    semantic = new Map();
    for (const row of rows) {
      const score = cosine(queryVector, JSON.parse(row.vector) as number[]);
      const best = semantic.get(row.refId);
      if (!best || score > best.score) semantic.set(row.refId, { score, text: row.text });
    }
  } catch (cause) {
    console.error("Kally memory: busca por significado indisponível:", cause instanceof Error ? cause.message : cause);
  }

  const words = terms(query);
  const profile = embedProfile();
  const scored = posts.map((post) => {
    const title = normalize(post.title);
    const cats = normalize(post.categories.map((c) => c.name).join(" "));
    const text = normalize(post.content);
    // Nome de quem escreveu pesa como o título: "o EP do Theo", "o estudo da Luíza". O nome não está no texto do
    // post, e sem isso essas perguntas não passavam do filtro da conversa (simulação, rodada 1: post certo passando
    // no filtro de 18/24 para 21/24, com o mesmo número de posts errados; eval/simulacao/analisar-busca.mjs).
    // A pasta vale 1 (era 3): "o limite de um post na pasta Diário" puxava qualquer post que está no Diário em vez do
    // guia que fala sobre ele. Medido com os posts reais da simulação: mesmo post certo passando (24/24) e menos posts
    // errados no contexto (0,25 → 0,17 por pergunta).
    const author = new Set(normalize(post.author?.displayName ?? "").match(/[\p{L}\p{N}]{3,}/gu) ?? []);
    let lexical = 0;
    for (const term of words) lexical += (title.includes(term) ? 5 : 0) + (cats.includes(term) ? 1 : 0) + (text.includes(term) ? 1 : 0) + (author.has(term) ? 5 : 0);
    const sem = semantic.get(post.id);
    const meaning = sem && sem.score >= profile.min ? Math.min((sem.score - profile.floor) / profile.span, 1) : 0;
    // Com um modelo fraco em português (nomic), as palavras no título/pasta pesam mais (weight menor).
    const score = meaning * profile.weight + Math.min(lexical / 8, 1) * (1 - profile.weight);
    return { post, score, excerpt: sem?.text ?? stripMarkdown(post.content).slice(0, CHUNK) };
  });

  // Relações: quem divide pasta ou tem link com os melhores resultados ganha um empurrão.
  const top = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
  const topCats = new Set(top.flatMap((t) => t.post.categories.map((c) => c.id)));
  for (const item of scored) {
    if (item.score === 0 || top.includes(item)) continue;
    const sharesFolder = item.post.categories.some((c) => topCats.has(c.id));
    const linked = top.some((t) => t.post.content.includes(item.post.slug) || item.post.content.includes(t.post.slug));
    item.score += (sharesFolder ? 0.08 : 0) + (linked ? 0.15 : 0);
  }

  const results: Retrieved[] = scored
    .filter((s) => s.score >= 0.12)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ post, score, excerpt }, _, all) => ({
      kind: post.status === "DRAFT" ? "rascunho" : post.categories.some((c) => /projeto/i.test(c.name)) ? "projeto" : "post",
      title: post.title,
      slug: post.slug,
      categories: post.categories.map((c) => c.name),
      excerpt,
      score,
      authorId: post.authorId,
      author: post.author?.displayName ?? null,
      related: all
        .filter((o) => o.post.id !== post.id && (o.post.categories.some((c) => post.categories.some((pc) => pc.id === c.id)) || o.post.content.includes(post.slug) || post.content.includes(o.post.slug)))
        .map((o) => o.post.title),
    }));

  // Conversas salvas da própria pessoa: a fonte de menor prioridade, só se parecida o bastante.
  if (options.userId && queryVector) {
    try {
      const conversations = await db.kallyConversation.findMany({
        where: { environmentId: scope.environmentId, userId: options.userId, ...(options.excludeConversationId ? { id: { not: options.excludeConversationId } } : {}) },
        select: { id: true, title: true, messages: { select: { role: true, content: true }, orderBy: { createdAt: "asc" }, take: 8 } },
        orderBy: { updatedAt: "desc" },
        take: 30,
      });
      await syncIndex(
        scope.environmentId,
        conversations.map((c) => ({ refId: c.id, kind: "conversa" as const, userId: options.userId!, text: `${c.title}\n${c.messages.map((m) => `${m.role === "user" ? "Pessoa" : "Kally"}: ${m.content}`).join("\n")}`.slice(0, 4_000) })),
        "conversa",
        options.userId,
      );
      const rows = await db.kallyChunk.findMany({ where: { environmentId: scope.environmentId, kind: "conversa", userId: options.userId, refId: { in: conversations.map((c) => c.id) } }, select: { refId: true, text: true, vector: true } });
      const best = new Map<string, { score: number; text: string }>();
      for (const row of rows) {
        const score = cosine(queryVector, JSON.parse(row.vector) as number[]);
        if (score > (best.get(row.refId)?.score ?? 0)) best.set(row.refId, { score, text: row.text });
      }
      const titles = new Map(conversations.map((c) => [c.id, c.title]));
      [...best.entries()]
        .filter(([, v]) => v.score >= profile.conversationMin)
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, 2)
        .forEach(([id, v]) => results.push({ kind: "conversa", title: titles.get(id) ?? "Conversa", slug: id, categories: [], excerpt: v.text.slice(0, 700), score: v.score * 0.5, related: [] }));
    } catch (cause) {
      console.error("Kally memory: conversas indisponíveis:", cause instanceof Error ? cause.message : cause);
    }
  }
  return results;
}
