import type { KnowledgeMap, MapEdge, MapNode } from "./types";

/**
 * Layout radial hierárquico do mapa (inspirado num mapa de conhecimento):
 *   ambiente (centro) → pastas (anel) → pensamentos (leque para fora) → imagens (folhas).
 * Pastas com mais conteúdo recebem um setor maior do círculo; pensamentos sem pasta
 * ligam-se direto ao centro. É determinístico: o mapa sai igual a cada abertura.
 */

export type HubNode = { id: string; kind: "ambiente"; label: string; color: string; icon: string };
export type LaidOutNode = (MapNode | HubNode) & { x: number; y: number; r: number; angle: number; degree: number };
export type LayoutEdge = { source: string; target: string; kind: MapEdge["kind"] | "raiz"; /** ligação extra (pensamento em várias pastas) */ secondary?: boolean };

export type Layout = {
  nodes: LaidOutNode[];
  edges: LayoutEdge[];
  byId: Map<string, LaidOutNode>;
  neighbors: Map<string, Set<string>>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  hubId: string;
};

/** Raios visuais (o espaçamento do layout não depende deles): hierarquia clara e discreta. */
export const NODE_RADIUS = { ambiente: 40, pasta: 24, pensamento: 11, imagem: 6 } as const;

const TAU = Math.PI * 2;

export function layoutGraph(map: KnowledgeMap): Layout {
  const hubId = `env:${map.environment.id}`;
  const nodeById = new Map(map.nodes.map((n) => [n.id, n]));
  const folders = map.nodes.filter((n) => n.kind === "pasta");
  const posts = map.nodes.filter((n): n is Extract<MapNode, { kind: "pensamento" }> => n.kind === "pensamento");

  // Pasta principal de cada pensamento: a primeira ligação "pasta" (ordem das categorias).
  const primary = new Map<string, string>();
  const extraFolders: LayoutEdge[] = [];
  for (const edge of map.edges) {
    if (edge.kind !== "pasta") continue;
    if (!primary.has(edge.source)) primary.set(edge.source, edge.target);
    else extraFolders.push({ source: edge.source, target: edge.target, kind: "pasta", secondary: true });
  }
  const imagesOf = new Map<string, string[]>();
  for (const edge of map.edges) {
    if (edge.kind === "imagem") imagesOf.set(edge.source, [...(imagesOf.get(edge.source) ?? []), edge.target]);
  }

  // Grupos ao redor do centro: as pastas e, se houver, os pensamentos sem pasta.
  type Group = { id: string | null; posts: typeof posts };
  const groups: Group[] = folders.map((f) => ({ id: f.id, posts: posts.filter((p) => primary.get(p.id) === f.id) }));
  const loose = posts.filter((p) => !primary.has(p.id));
  if (loose.length) groups.push({ id: null, posts: loose });

  const weights = groups.map((g) => Math.sqrt(g.posts.length + 1) + 0.6);
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
  const ringRadius = Math.max(250, 70 * folders.length);

  const out: LaidOutNode[] = [];
  const edges: LayoutEdge[] = [];
  const place = (node: MapNode | HubNode, x: number, y: number, r: number, angle: number) => out.push({ ...node, x, y, r, angle, degree: 0 });

  place({ id: hubId, kind: "ambiente", label: map.environment.name, color: map.environment.color, icon: map.environment.icon }, 0, 0, NODE_RADIUS.ambiente, 0);

  let cursor = -Math.PI / 2; // começa no topo, sentido horário
  groups.forEach((group, index) => {
    const sector = (weights[index] / totalWeight) * TAU;
    const angle = cursor + sector / 2;
    cursor += sector;

    // Pensamentos em leque: anéis concêntricos dentro do setor da pasta.
    const placePosts = (anchorRadius: number) => {
      const usable = Math.max(sector * 0.86, 0.35);
      let row = 0;
      let placed = 0;
      while (placed < group.posts.length) {
        const radius = anchorRadius + 150 + row * 74;
        const capacity = Math.max(1, Math.floor((usable * radius) / 62));
        const batch = group.posts.slice(placed, placed + capacity);
        batch.forEach((post, i) => {
          const t = batch.length === 1 ? 0 : i / (batch.length - 1) - 0.5;
          const a = angle + t * Math.min(usable, (batch.length - 1) * (62 / radius));
          place(post, Math.cos(a) * radius, Math.sin(a) * radius, NODE_RADIUS.pensamento, a);
          // Imagens: folhas curtas para fora do pensamento.
          (imagesOf.get(post.id) ?? []).forEach((imageId, k, all) => {
            const image = nodeById.get(imageId);
            if (!image || out.some((n) => n.id === imageId)) return;
            const spread = (k - (all.length - 1) / 2) * 0.09;
            const ir = radius + 46;
            place(image, Math.cos(a + spread) * ir, Math.sin(a + spread) * ir, NODE_RADIUS.imagem, a + spread);
          });
        });
        placed += batch.length;
        row += 1;
      }
    };

    if (group.id) {
      const folder = nodeById.get(group.id)!;
      place(folder, Math.cos(angle) * ringRadius, Math.sin(angle) * ringRadius, NODE_RADIUS.pasta, angle);
      edges.push({ source: hubId, target: group.id, kind: "raiz" });
      group.posts.forEach((p) => edges.push({ source: group.id!, target: p.id, kind: "pasta" }));
      placePosts(ringRadius);
    } else {
      // Sem pasta: ligados direto ao centro, num anel mais próximo.
      group.posts.forEach((p) => edges.push({ source: hubId, target: p.id, kind: "raiz" }));
      placePosts(ringRadius - 120);
    }
  });

  // Imagens que ficaram sem lugar (citadas por pensamentos não posicionados) e ligações restantes.
  for (const edge of map.edges) {
    if (edge.kind === "imagem") edges.push(edge);
    if (edge.kind === "mencao") edges.push(edge);
  }
  edges.push(...extraFolders);

  const byId = new Map(out.map((n) => [n.id, n]));
  const valid = edges.filter((e) => byId.has(e.source) && byId.has(e.target));
  const neighbors = new Map<string, Set<string>>(out.map((n) => [n.id, new Set()]));
  for (const edge of valid) {
    neighbors.get(edge.source)?.add(edge.target);
    neighbors.get(edge.target)?.add(edge.source);
  }
  for (const node of out) node.degree = neighbors.get(node.id)?.size ?? 0;

  const bounds = out.reduce(
    (b, n) => ({ minX: Math.min(b.minX, n.x - n.r - 90), minY: Math.min(b.minY, n.y - n.r - 30), maxX: Math.max(b.maxX, n.x + n.r + 90), maxY: Math.max(b.maxY, n.y + n.r + 40) }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );

  return { nodes: out, edges: valid, byId, neighbors, bounds, hubId };
}

/** Nó mais próximo de um ponto do mundo, dentro de uma tolerância (para toques). */
export function hitTest(layout: Layout, x: number, y: number, tolerance: number): LaidOutNode | null {
  let best: LaidOutNode | null = null;
  let bestDistance = Infinity;
  for (const node of layout.nodes) {
    const d = Math.hypot(node.x - x, node.y - y) - node.r;
    if (d < tolerance && d < bestDistance) {
      best = node;
      bestDistance = d;
    }
  }
  return best;
}
