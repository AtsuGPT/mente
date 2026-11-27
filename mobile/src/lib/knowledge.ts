/**
 * Mapa de Conhecimento: o contrato do grafo (o mesmo de src/server/knowledge/graph.ts) e a lógica pura que os dois modos
 * compartilham, sem DOM: o que está visível com os grupos abertos, filtros, busca, caminho até um nó e vizinhança.
 */

export type KnowledgeNodeType = "THEME" | "TOPIC" | "SUBTOPIC" | "DOCUMENT" | "NOTE" | "POST" | "RESOURCE";
export type KnowledgeEdgeType = "CONTAINS" | "HAS_RESOURCE" | "RELATED_TO" | "PREREQUISITE";
export type Mastery = "estudando" | "dificuldade" | "dominado";
export type KnowledgeLink = { kind: "pasta"; slug: string } | { kind: "pensamento"; slug: string } | { kind: "conversa"; id: string } | { kind: "artefato"; id: string };
/** Ação do app (não vem do servidor): conversa nova com a Kally sobre um tópico, já na pasta do tema. */
export type StudyLink = { kind: "estudo"; categoryId: string; folderName: string; topic: string };

export type KnowledgeNode = {
  id: string;
  type: KnowledgeNodeType;
  label: string;
  themeId: string;
  color: string;
  link: KnowledgeLink | null;
  virtual?: boolean;
  resource?: "conversa" | "artefato";
  counts?: { topics: number; materials: number };
  progress?: Record<Mastery, number>;
  mastery?: Mastery;
  draft?: boolean;
  private?: boolean;
  excerpt?: string;
  date?: string | null;
};
export type KnowledgeEdge = { id: string; source: string; target: string; type: KnowledgeEdgeType };
export type KnowledgeGraph = { nodes: KnowledgeNode[]; edges: KnowledgeEdge[]; truncated: boolean };

/** Filtros do explorador: o que aparece além dos temas. */
export type KindFilter = "topic" | "post" | "conversa" | "artefato";
export const KIND_FILTERS: { id: KindFilter; label: string }[] = [
  { id: "topic", label: "Tópicos" },
  { id: "post", label: "Pensamentos" },
  { id: "conversa", label: "Conversas" },
  { id: "artefato", label: "Artefatos" },
];

export function kindOf(n: KnowledgeNode): KindFilter | "theme" | "other" {
  if (n.type === "THEME") return "theme";
  if (n.type === "TOPIC" || n.type === "SUBTOPIC") return "topic";
  if (n.type === "POST") return "post";
  if (n.type === "RESOURCE") return n.resource === "artefato" ? "artefato" : "conversa";
  return "other";
}

export const TYPE_LABEL: Record<KnowledgeNodeType, string> = {
  THEME: "Tema",
  TOPIC: "Tópico",
  SUBTOPIC: "Subtópico",
  DOCUMENT: "Documento",
  NOTE: "Anotação",
  POST: "Pensamento",
  RESOURCE: "Recurso",
};
export const labelOfType = (n: KnowledgeNode) => (n.type === "RESOURCE" ? (n.resource === "artefato" ? "Artefato" : "Conversa com a Kally") : n.virtual ? "Grupo" : TYPE_LABEL[n.type]);
export const MASTERY_LABEL: Record<Mastery, string> = { dominado: "dominado", estudando: "estudando", dificuldade: "dificuldade" };

/** Índices do grafo, feitos uma vez por carga. */
export type GraphIndex = {
  byId: Map<string, KnowledgeNode>;
  /** filhos estruturais (CONTAINS e HAS_RESOURCE), na ordem do servidor */
  children: Map<string, string[]>;
  parents: Map<string, string[]>;
  /** vizinhos por qualquer relação, sem direção */
  neighbors: Map<string, Set<string>>;
  themes: string[];
};

export function indexGraph(graph: KnowledgeGraph): GraphIndex {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  const neighbors = new Map<string, Set<string>>();
  const add = <T,>(map: Map<string, T[]>, key: string, value: T) => map.set(key, [...(map.get(key) ?? []), value]);
  for (const e of graph.edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    if (e.type === "CONTAINS" || e.type === "HAS_RESOURCE") {
      add(children, e.source, e.target);
      add(parents, e.target, e.source);
    }
    if (!neighbors.has(e.source)) neighbors.set(e.source, new Set());
    if (!neighbors.has(e.target)) neighbors.set(e.target, new Set());
    neighbors.get(e.source)!.add(e.target);
    neighbors.get(e.target)!.add(e.source);
  }
  return { byId, children, parents, neighbors, themes: graph.nodes.filter((n) => n.type === "THEME").map((n) => n.id) };
}

/** O nó passa nos filtros de tipo (temas sempre passam). */
export const passes = (n: KnowledgeNode, kinds: Set<KindFilter>) => {
  const k = kindOf(n);
  return k === "theme" || k === "other" || kinds.has(k);
};

/**
 * Árvore visível no modo estruturado: os temas, e os filhos de cada nó aberto (que também esteja visível). Um material
 * em dois temas aparece uma vez só, ligado aos dois quando ambos estão abertos.
 */
export function visibleTree(index: GraphIndex, expanded: Set<string>, kinds: Set<KindFilter>, only: Set<string> | null) {
  const allowed = (id: string) => {
    const n = index.byId.get(id);
    return !!n && passes(n, kinds) && (!only || only.has(id));
  };
  const visible: string[] = [];
  const seen = new Set<string>();
  const queue = index.themes.filter(allowed);
  for (const id of queue) seen.add(id);
  while (queue.length) {
    const id = queue.shift()!;
    visible.push(id);
    if (!expanded.has(id)) continue;
    for (const child of index.children.get(id) ?? []) {
      if (seen.has(child) || !allowed(child)) continue;
      seen.add(child);
      queue.push(child);
    }
  }
  const set = new Set(visible);
  const edges: { id: string; source: string; target: string }[] = [];
  for (const id of visible) {
    if (!expanded.has(id)) continue;
    for (const child of index.children.get(id) ?? []) if (set.has(child)) edges.push({ id: `${id}>${child}`, source: id, target: child });
  }
  return { nodes: visible, edges };
}

/** Quantos filhos estruturais o nó tem passando nos filtros (o "+N" do nó recolhido). */
export const childCount = (index: GraphIndex, id: string, kinds: Set<KindFilter>) =>
  (index.children.get(id) ?? []).filter((c) => passes(index.byId.get(c)!, kinds)).length;

/** Caminho de um tema até o nó (para abrir os grupos certos ao selecionar pela busca). */
export function pathTo(index: GraphIndex, id: string): string[] {
  const path: string[] = [];
  let current: string | undefined = id;
  const guard = new Set<string>();
  while (current && !guard.has(current)) {
    guard.add(current);
    path.unshift(current);
    current = index.parents.get(current)?.[0];
  }
  return path;
}

/** Vizinhança até `depth` saltos, por qualquer relação (o "explorar conexões" e o modo local do relacional). */
export function neighborhood(index: GraphIndex, id: string, depth: number) {
  const result = new Set([id]);
  let frontier = [id];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const n of frontier) for (const m of index.neighbors.get(n) ?? []) if (!result.has(m)) {
      result.add(m);
      next.push(m);
    }
    frontier = next;
  }
  return result;
}

/** Busca por nome, sem acento nem caixa; temas e tópicos primeiro. */
export function search(graph: KnowledgeGraph, query: string, limit = 30) {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const q = norm(query.trim());
  if (!q) return [];
  const rank = (n: KnowledgeNode) => (n.type === "THEME" ? 0 : n.type === "TOPIC" ? 1 : 2);
  return graph.nodes
    .filter((n) => norm(n.label).includes(q))
    .sort((a, b) => rank(a) - rank(b) || Number(!norm(a.label).startsWith(q)) - Number(!norm(b.label).startsWith(q)) || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/** Relações diretas de um nó, para o inspetor: o que ele contém, onde está e com o que se relaciona. */
export function connectionsOf(graph: KnowledgeGraph, index: GraphIndex, id: string) {
  const contains: KnowledgeNode[] = [];
  const within: KnowledgeNode[] = [];
  const related: KnowledgeNode[] = [];
  for (const e of graph.edges) {
    if (e.type === "RELATED_TO" || e.type === "PREREQUISITE") {
      if (e.source === id) related.push(index.byId.get(e.target)!);
      else if (e.target === id) related.push(index.byId.get(e.source)!);
    } else if (e.source === id) contains.push(index.byId.get(e.target)!);
    else if (e.target === id) within.push(index.byId.get(e.source)!);
  }
  return { contains: contains.filter(Boolean), within: within.filter(Boolean), related: related.filter(Boolean) };
}
