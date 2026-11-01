import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import type { KnowledgeMap, MapEdge, MapNode } from "./types";

/**
 * Posições do mapa por simulação de forças (d3-force), calculadas uma vez.
 * Pastas são nós grandes que atraem seus pensamentos, formando "bairros" por assunto;
 * as posições iniciais do d3 são determinísticas, então o mapa sai igual a cada abertura.
 */

export type LaidOutNode = MapNode & { x: number; y: number; r: number };
export type Layout = {
  nodes: LaidOutNode[];
  edges: MapEdge[];
  byId: Map<string, LaidOutNode>;
  neighbors: Map<string, Set<string>>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

export const NODE_RADIUS: Record<MapNode["kind"], number> = { pasta: 24, pensamento: 10, imagem: 6 };

type SimNode = SimulationNodeDatum & { id: string; kind: MapNode["kind"]; r: number };

export function layoutGraph(map: KnowledgeMap): Layout {
  const sim: SimNode[] = map.nodes.map((node) => ({ id: node.id, kind: node.kind, r: NODE_RADIUS[node.kind] }));
  const links = map.edges.map((edge) => ({ source: edge.source, target: edge.target, kind: edge.kind }));

  forceSimulation(sim)
    .force(
      "link",
      forceLink<SimNode, (typeof links)[number]>(links)
        .id((d) => d.id)
        .distance((l) => (l.kind === "pasta" ? 90 : l.kind === "imagem" ? 34 : 70))
        .strength((l) => (l.kind === "mencao" ? 0.3 : 0.7)),
    )
    .force("charge", forceManyBody<SimNode>().strength((d) => (d.kind === "pasta" ? -520 : d.kind === "pensamento" ? -150 : -40)))
    .force("collide", forceCollide<SimNode>((d) => d.r + (d.kind === "pasta" ? 26 : 12)))
    .force("x", forceX(0).strength(0.035))
    .force("y", forceY(0).strength(0.035))
    .stop()
    .tick(300);

  const nodes: LaidOutNode[] = map.nodes.map((node, i) => ({ ...node, x: sim[i].x ?? 0, y: sim[i].y ?? 0, r: sim[i].r }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const neighbors = new Map<string, Set<string>>(nodes.map((n) => [n.id, new Set()]));
  for (const edge of map.edges) {
    neighbors.get(edge.source)?.add(edge.target);
    neighbors.get(edge.target)?.add(edge.source);
  }

  const bounds = nodes.reduce(
    (b, n) => ({ minX: Math.min(b.minX, n.x - n.r), minY: Math.min(b.minY, n.y - n.r), maxX: Math.max(b.maxX, n.x + n.r), maxY: Math.max(b.maxY, n.y + n.r) }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  if (!nodes.length) Object.assign(bounds, { minX: -100, minY: -100, maxX: 100, maxY: 100 });

  return { nodes, edges: map.edges, byId, neighbors, bounds };
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
