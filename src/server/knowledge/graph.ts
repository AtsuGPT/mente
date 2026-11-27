/**
 * Mapa de Conhecimento (KNOWLEDGE-001, 27/11/2026): o grafo tipado do que a pessoa estuda, montado só com relações que
 * já existem nos dados, sem IA e sem relação inventada.
 *
 *   THEME    pasta (Category). Tópicos e pensamentos sem pasta ficam no grupo "Sem pasta" (virtual: true).
 *   TOPIC    tópico de estudo da pessoa (KallyLearningTopic.categoryId).                    THEME -CONTAINS-> TOPIC
 *   POST     pensamento visível para quem pede; um nó só, mesmo em várias pastas.           THEME -HAS_RESOURCE-> POST
 *   RESOURCE conversa da pessoa com a Kally e artefato criado nela.                          TOPIC -HAS_RESOURCE-> conversa
 *                                                                                            conversa -HAS_RESOURCE-> artefato
 *   RELATED_TO  link /pensamento/<slug> de um pensamento no outro; pensamento citado como fonte numa resposta da Kally.
 *
 * SUBTOPIC, DOCUMENT, NOTE e PREREQUISITE fazem parte do contrato e ficam vazios até haver dado de verdade (decisão de
 * 27/11: nada de banco novo agora). A visibilidade vem de quem chama: os dados já chegam filtrados (getKnowledgeGraph).
 */

export type KnowledgeNodeType = "THEME" | "TOPIC" | "SUBTOPIC" | "DOCUMENT" | "NOTE" | "POST" | "RESOURCE";
export type KnowledgeEdgeType = "CONTAINS" | "HAS_RESOURCE" | "RELATED_TO" | "PREREQUISITE";
export type Mastery = "estudando" | "dificuldade" | "dominado";

export type KnowledgeLink = { kind: "pasta"; slug: string } | { kind: "pensamento"; slug: string } | { kind: "conversa"; id: string } | { kind: "artefato"; id: string };

export type KnowledgeNode = {
  id: string;
  type: KnowledgeNodeType;
  label: string;
  /** tema principal (o primeiro, para quem está em vários): a cor e o agrupamento do modo relacional */
  themeId: string;
  color: string;
  /** onde abrir o material de verdade */
  link: KnowledgeLink | null;
  /** grupo "Sem pasta": não é uma pasta, só reúne o que não tem uma */
  virtual?: boolean;
  /** RESOURCE: conversa ou artefato */
  resource?: "conversa" | "artefato";
  /** THEME: contagens do que a pessoa vê; progress só com tópicos de verdade */
  counts?: { topics: number; materials: number };
  progress?: Record<Mastery, number>;
  /** TOPIC */
  mastery?: Mastery;
  /** POST */
  draft?: boolean;
  private?: boolean;
  excerpt?: string;
  /** a data que importa para o tipo: estudado, publicado, atualizado */
  date?: string | null;
};

export type KnowledgeEdge = { id: string; source: string; target: string; type: KnowledgeEdgeType };
export type KnowledgeGraph = { nodes: KnowledgeNode[]; edges: KnowledgeEdge[]; truncated: boolean };

export type GraphInput = {
  categories: { id: string; name: string; slug: string; color: string }[];
  topics: { id: string; title: string; categoryId: string | null; conversationId: string | null; mastery: string; lastStudiedAt: Date }[];
  posts: { id: string; title: string; slug: string; content: string; categoryIds: string[]; draft: boolean; private: boolean; excerpt: string; publishedAt: Date | null }[];
  conversations: { id: string; title: string; categoryId: string | null; updatedAt: Date; citedSlugs: string[] }[];
  artifacts: { id: string; title: string; conversationId: string | null; updatedAt: Date }[];
};

export const NO_THEME = "t:sem-pasta";
const NO_THEME_COLOR = "#867FA1";
const POST_LINK = /\]\(\/pensamento\/([a-z0-9-]+)\)/g;
/** teto de nós por pedido: acima disso o mapa avisa (truncated) em vez de travar o aparelho */
export const MAX_NODES = 2_000;

const asMastery = (m: string): Mastery => (m === "dominado" || m === "dificuldade" ? m : "estudando");
const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function buildKnowledgeGraph(input: GraphInput): KnowledgeGraph {
  const nodes = new Map<string, KnowledgeNode>();
  const edges = new Map<string, KnowledgeEdge>();
  const edge = (source: string, target: string, type: KnowledgeEdgeType) => {
    if (source === target || !nodes.has(source) || !nodes.has(target)) return;
    const id = `${type}:${source}>${target}`;
    // RELATED_TO não tem direção: A→B e B→A são a mesma relação.
    if (type === "RELATED_TO" && edges.has(`${type}:${target}>${source}`)) return;
    edges.set(id, { id, source, target, type });
  };

  const theme = new Map(input.categories.map((c) => [c.id, c]));
  const themeOf = (categoryId: string | null) => (categoryId && theme.has(categoryId) ? `t:${categoryId}` : NO_THEME);
  const colorOf = (themeId: string) => (themeId === NO_THEME ? NO_THEME_COLOR : theme.get(themeId.slice(2))!.color);
  const ensureNoTheme = () => {
    if (!nodes.has(NO_THEME)) nodes.set(NO_THEME, { id: NO_THEME, type: "THEME", label: "Sem pasta", themeId: NO_THEME, color: NO_THEME_COLOR, link: null, virtual: true });
  };

  for (const c of input.categories) nodes.set(`t:${c.id}`, { id: `t:${c.id}`, type: "THEME", label: c.name, themeId: `t:${c.id}`, color: c.color, link: { kind: "pasta", slug: c.slug } });

  // Tópicos: dentro do tema; os sem pasta, no grupo.
  for (const t of input.topics) {
    const themeId = themeOf(t.categoryId);
    if (themeId === NO_THEME) ensureNoTheme();
    nodes.set(`k:${t.id}`, { id: `k:${t.id}`, type: "TOPIC", label: t.title, themeId, color: colorOf(themeId), link: null, mastery: asMastery(t.mastery), date: iso(t.lastStudiedAt) });
    edge(themeId, `k:${t.id}`, "CONTAINS");
  }

  // Pensamentos: um nó só, ligado a cada pasta em que está.
  for (const p of input.posts) {
    const themes = p.categoryIds.filter((id) => theme.has(id)).map((id) => `t:${id}`);
    if (!themes.length) ensureNoTheme();
    const themeId = themes[0] ?? NO_THEME;
    nodes.set(`p:${p.id}`, { id: `p:${p.id}`, type: "POST", label: p.title, themeId, color: colorOf(themeId), link: { kind: "pensamento", slug: p.slug }, draft: p.draft, private: p.private, excerpt: p.excerpt, date: iso(p.publishedAt) });
    for (const t of themes.length ? themes : [NO_THEME]) edge(t, `p:${p.id}`, "HAS_RESOURCE");
  }

  // Conversas: debaixo dos tópicos que nasceram nelas; sem tópico, direto no tema da conversa.
  const topicsByConversation = new Map<string, string[]>();
  for (const t of input.topics) if (t.conversationId) topicsByConversation.set(t.conversationId, [...(topicsByConversation.get(t.conversationId) ?? []), `k:${t.id}`]);
  for (const c of input.conversations) {
    const parents = topicsByConversation.get(c.id) ?? [];
    if (!parents.length && !c.categoryId) continue; // conversa solta, sem tópico nem pasta: não é material de estudo
    const themeId = parents.length ? nodes.get(parents[0])!.themeId : themeOf(c.categoryId);
    if (themeId === NO_THEME) ensureNoTheme();
    nodes.set(`r:${c.id}`, { id: `r:${c.id}`, type: "RESOURCE", resource: "conversa", label: c.title, themeId, color: colorOf(themeId), link: { kind: "conversa", id: c.id }, date: iso(c.updatedAt) });
    for (const parent of parents.length ? parents : [themeId]) edge(parent, `r:${c.id}`, "HAS_RESOURCE");
  }

  // Artefatos: dentro da conversa em que nasceram (só se a conversa está no mapa).
  for (const a of input.artifacts) {
    const conversation = a.conversationId ? nodes.get(`r:${a.conversationId}`) : undefined;
    if (!conversation) continue;
    nodes.set(`a:${a.id}`, { id: `a:${a.id}`, type: "RESOURCE", resource: "artefato", label: a.title, themeId: conversation.themeId, color: conversation.color, link: { kind: "artefato", id: a.id }, date: iso(a.updatedAt) });
    edge(conversation.id, `a:${a.id}`, "HAS_RESOURCE");
  }

  // Relações reais: links entre pensamentos e pensamentos citados nas conversas.
  const postBySlug = new Map(input.posts.map((p) => [p.slug, `p:${p.id}`]));
  for (const p of input.posts) for (const [, slug] of p.content.matchAll(POST_LINK)) {
    const target = postBySlug.get(slug);
    if (target) edge(`p:${p.id}`, target, "RELATED_TO");
  }
  for (const c of input.conversations) for (const slug of c.citedSlugs) {
    const target = postBySlug.get(slug);
    if (target) edge(`r:${c.id}`, target, "RELATED_TO");
  }

  // Contagens e progresso de cada tema, só com o que está no grafo (o que a pessoa pode ver).
  for (const node of nodes.values()) {
    if (node.type !== "THEME") continue;
    const children = [...edges.values()].filter((e) => e.source === node.id && e.type !== "RELATED_TO").map((e) => nodes.get(e.target)!);
    const topics = children.filter((n) => n.type === "TOPIC");
    const materials = new Set(children.filter((n) => n.type !== "TOPIC").map((n) => n.id));
    for (const t of topics) for (const e of edges.values()) if (e.source === t.id && e.type === "HAS_RESOURCE") materials.add(e.target);
    node.counts = { topics: topics.length, materials: materials.size };
    if (topics.length) {
      node.progress = { estudando: 0, dificuldade: 0, dominado: 0 };
      for (const t of topics) node.progress[t.mastery!] += 1;
    }
  }

  // Pasta sem nada que esta pessoa veja (nem tópico, nem material): fica fora, como no mapa antigo.
  for (const node of [...nodes.values()]) if (node.type === "THEME" && !node.counts!.topics && !node.counts!.materials) nodes.delete(node.id);

  const list = [...nodes.values()];
  const truncated = list.length > MAX_NODES;
  const kept = truncated ? new Set(list.slice(0, MAX_NODES).map((n) => n.id)) : null;
  return {
    nodes: kept ? list.filter((n) => kept.has(n.id)) : list,
    edges: [...edges.values()].filter((e) => !kept || (kept.has(e.source) && kept.has(e.target))),
    truncated,
  };
}
