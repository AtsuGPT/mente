import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import ELK, { type ElkExtendedEdge, type ElkNode } from "elkjs/lib/elk.bundled.js";
import { ChevronRight } from "lucide-react";
import { childCount, type GraphIndex, type KindFilter, type KnowledgeNode } from "@/lib/knowledge";
import { NodeGlyph } from "./parts";

/**
 * Modo Estruturado: Tema → Tópico → Material, em camadas da esquerda para a direita (ELK "layered"), com arestas
 * ortogonais roteadas pelo próprio ELK (sem atravessar nós) e espaçamento constante. O layout só é recalculado quando
 * muda o que está visível; cada resultado fica em cache, e os nós deslizam da posição antiga para a nova.
 */

const elk = new ELK();
const ELK_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.spacing.nodeNodeBetweenLayers": "72",
  "elk.spacing.nodeNode": "14",
  "elk.layered.spacing.edgeNodeBetweenLayers": "18",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  // A ordem do servidor (temas pela posição da pasta, tópicos por data) vale como desempate: menos saltos entre layouts.
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.separateConnectedComponents": "false",
  // Arestas que saem do mesmo nó dividem um tronco (como um organograma) em vez de um pente de linhas paralelas.
  "elk.layered.mergeEdges": "true",
};

/** Altura de cada tipo de nó; a largura vem do texto (medido), com teto. */
const HEIGHT = { THEME: 56, TOPIC: 34, OTHER: 30 } as const;
const heightOf = (n: KnowledgeNode) => (n.type === "THEME" ? HEIGHT.THEME : n.type === "TOPIC" || n.type === "SUBTOPIC" ? HEIGHT.TOPIC : HEIGHT.OTHER);

/** Mede o texto só com a fonte do app carregada (senão o nó nasce estreito e o nome sai cortado). Teto de 1,5 s. */
let fontsLoaded: Promise<unknown> | null = null;
function fontsReady() {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  fontsLoaded ??= Promise.race([
    Promise.all(["500 15px 'Instrument Sans'", "500 13.5px 'Instrument Sans'", "13px 'Instrument Sans'"].map((f) => document.fonts.load(f))),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
  return fontsLoaded;
}

let measureCtx: CanvasRenderingContext2D | null = null;
function textWidth(text: string, font: string) {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 7.5;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}
/**
 * Largura do nó = texto medido + as partes fixas do CSS (knowledge.css): recuos de .kn (7 + 12; tema 11 + 12), glifo,
 * vão entre itens (10; tema 12), selo "+N" (~34) e 6 px de folga para a fonte não cortar.
 */
function widthOf(n: KnowledgeNode, extra: string, hasChildren: boolean) {
  const badge = hasChildren ? 34 : 0;
  if (n.type === "THEME") {
    const text = Math.max(textWidth(n.label, "500 15px 'Instrument Sans'"), textWidth(extra, "12px 'Instrument Sans'"));
    return Math.min(340, Math.ceil(text + 23 + 34 + 12 * (hasChildren ? 2 : 1) + badge + 6));
  }
  const gaps = 10 * (hasChildren ? 2 : 1);
  if (n.type === "TOPIC" || n.type === "SUBTOPIC") return Math.min(300, Math.ceil(textWidth(n.label, "500 13.5px 'Instrument Sans'") + 19 + 16 + gaps + badge + 6));
  return Math.min(280, Math.ceil(textWidth(n.label, "13px 'Instrument Sans'") + 19 + 22 + gaps + badge + 6));
}

export const themeSummary = (n: KnowledgeNode) => {
  const c = n.counts;
  if (!c) return "";
  return [c.topics ? `${c.topics} ${c.topics === 1 ? "tópico" : "tópicos"}` : "", c.materials ? `${c.materials} ${c.materials === 1 ? "material" : "materiais"}` : ""].filter(Boolean).join(" · ") || "vazio";
};

type Layout = { positions: Map<string, { x: number; y: number; w: number; h: number }>; routes: Map<string, { x: number; y: number }[]> };
const layoutCache = new Map<string, Layout>();

async function runLayout(index: GraphIndex, ids: string[], edges: { id: string; source: string; target: string }[]): Promise<Layout> {
  const key = ids.join("|") + "#" + edges.map((e) => e.id).join("|");
  const cached = layoutCache.get(key);
  if (cached) return cached;
  await fontsReady();
  const graph: ElkNode = {
    id: "root",
    layoutOptions: ELK_OPTIONS,
    children: ids.map((id) => {
      const n = index.byId.get(id)!;
      return { id, width: widthOf(n, themeSummary(n), (index.children.get(id)?.length ?? 0) > 0), height: heightOf(n) };
    }),
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })) as ElkExtendedEdge[],
  };
  const out = await elk.layout(graph);
  const positions = new Map((out.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0, w: c.width ?? 0, h: c.height ?? 0 }]));
  const routes = new Map<string, { x: number; y: number }[]>();
  for (const e of (out.edges ?? []) as ElkExtendedEdge[]) {
    const s = e.sections?.[0];
    if (s) routes.set(e.id, [s.startPoint, ...(s.bendPoints ?? []), s.endPoint]);
  }
  const layout = { positions, routes };
  if (layoutCache.size > 40) layoutCache.delete(layoutCache.keys().next().value!);
  layoutCache.set(key, layout);
  return layout;
}

type NodeData = { node: KnowledgeNode; expanded: boolean; hidden: number; selected: boolean; dim: boolean; summary: string };
type EdgeData = { points?: { x: number; y: number }[]; related?: boolean; active?: boolean; dim?: boolean };

const KnowledgeFlowNode = memo(function KnowledgeFlowNode({ data }: NodeProps<Node<NodeData>>) {
  const { node, expanded, hidden, selected, dim, summary } = data;
  const cls = `kn kn-${node.type.toLowerCase()}${selected ? " is-selected" : ""}${dim ? " is-dim" : ""}${node.virtual ? " is-virtual" : ""}`;
  return (
    <div className={cls} title={node.label}>
      <Handle type="target" position={Position.Left} className="kn-handle" isConnectable={false} />
      <NodeGlyph node={node} />
      <div className="kn-text">
        <span className="kn-label">{node.label}</span>
        {node.type === "THEME" ? <span className="kn-sub">{summary}</span> : null}
      </div>
      {node.type === "THEME" && node.progress ? <Progress progress={node.progress} /> : null}
      {hidden > 0 ? (
        <span className={`kn-more${expanded ? " is-open" : ""}`} aria-hidden>
          {expanded ? <ChevronRight size={13} strokeWidth={2} /> : `+${hidden}`}
        </span>
      ) : null}
      <Handle type="source" position={Position.Right} className="kn-handle" isConnectable={false} />
    </div>
  );
});

function Progress({ progress }: { progress: NonNullable<KnowledgeNode["progress"]> }) {
  const total = progress.dominado + progress.estudando + progress.dificuldade;
  return (
    <span className="kn-progress" aria-label={`${progress.dominado} dominados, ${progress.estudando} estudando, ${progress.dificuldade} com dificuldade`}>
      {(["dominado", "estudando", "dificuldade"] as const).map((m) => (progress[m] ? <i key={m} className={`m-${m}`} style={{ flexGrow: progress[m] / total }} /> : null))}
    </span>
  );
}

/** Aresta que segue a rota do ELK, com cantos arredondados; as relações entre conhecimentos são tracejadas e curvas. */
const RoutedEdge = memo(function RoutedEdge({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<Edge<EdgeData>>) {
  let path: string;
  if (data?.related) {
    const dx = Math.max(40, Math.abs(targetX - sourceX) / 2);
    path = `M${sourceX},${sourceY} C${sourceX + dx},${sourceY} ${targetX - dx},${targetY} ${targetX},${targetY}`;
  } else if (data?.points && data.points.length >= 2) {
    path = roundedPolyline(data.points, 8);
  } else {
    const mx = (sourceX + targetX) / 2;
    path = `M${sourceX},${sourceY} H${mx} V${targetY} H${targetX}`;
  }
  const cls = data?.related ? "ke ke-related" : `ke${data?.active ? " is-active" : ""}${data?.dim ? " is-dim" : ""}`;
  return <BaseEdge id={id} path={path} className={cls} />;
});

function roundedPolyline(points: { x: number; y: number }[], r: number) {
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i - 1], c = points[i], n = points[i + 1];
    const inLen = Math.hypot(c.x - p.x, c.y - p.y), outLen = Math.hypot(n.x - c.x, n.y - c.y);
    const rr = Math.min(r, inLen / 2, outLen / 2);
    const a = { x: c.x - ((c.x - p.x) / inLen) * rr, y: c.y - ((c.y - p.y) / inLen) * rr };
    const b = { x: c.x + ((n.x - c.x) / outLen) * rr, y: c.y + ((n.y - c.y) / outLen) * rr };
    d += ` L${a.x},${a.y} Q${c.x},${c.y} ${b.x},${b.y}`;
  }
  const last = points[points.length - 1];
  return d + ` L${last.x},${last.y}`;
}

const nodeTypes = { knowledge: KnowledgeFlowNode };
const edgeTypes = { routed: RoutedEdge };

export type StructuredProps = {
  index: GraphIndex;
  relatedEdges: { id: string; source: string; target: string }[];
  tree: { nodes: string[]; edges: { id: string; source: string; target: string }[] };
  expanded: Set<string>;
  kinds: Set<KindFilter>;
  selected: string | null;
  focus: Set<string> | null;
  showMinimap: boolean;
  /** pedido de câmera: centralizar num nó, ou enquadrar tudo */
  camera: { seq: number; target: string | "all"; subtree?: boolean } | null;
  onNodeClick: (id: string) => void;
  onPaneClick: () => void;
  onReady: (api: { zoomIn: () => void; zoomOut: () => void; fit: () => void }) => void;
  onStats?: (s: { nodes: number; layoutMs: number }) => void;
};

function StructuredInner(props: StructuredProps) {
  const { index, tree, expanded, kinds, selected, focus, camera } = props;
  const flow = useReactFlow();
  const [layout, setLayout] = useState<Layout | null>(null);
  const [layoutKey, setLayoutKey] = useState("");
  const pending = useRef(0);

  // Recalcula só quando muda o conjunto visível (não na seleção nem no hover).
  const visibleKey = tree.nodes.join("|") + "#" + tree.edges.length;
  useEffect(() => {
    const ticket = ++pending.current;
    const started = performance.now();
    void runLayout(index, tree.nodes, tree.edges).then((l) => {
      if (ticket !== pending.current) return;
      setLayout(l);
      setLayoutKey(visibleKey);
      props.onStats?.({ nodes: tree.nodes.length, layoutMs: Math.round(performance.now() - started) });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey, index]);

  const neighborsOfSelected = useMemo(() => (selected ? index.neighbors.get(selected) ?? new Set<string>() : null), [selected, index]);

  const nodes = useMemo<Node<NodeData>[]>(() => {
    if (!layout) return [];
    return tree.nodes.flatMap((id) => {
      const p = layout.positions.get(id);
      const node = index.byId.get(id);
      if (!p || !node) return [];
      const hidden = childCount(index, id, kinds);
      const dim = (!!focus && !focus.has(id)) || (!!selected && id !== selected && !neighborsOfSelected?.has(id));
      return [{
        id,
        type: "knowledge",
        position: { x: p.x, y: p.y },
        width: p.w,
        height: p.h,
        data: { node, expanded: expanded.has(id), hidden, selected: id === selected, dim, summary: themeSummary(node) },
        draggable: false,
        connectable: false,
        selectable: false,
      }];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, layoutKey, expanded, selected, focus, kinds, neighborsOfSelected]);

  const edges = useMemo<Edge<EdgeData>[]>(() => {
    if (!layout) return [];
    const shown = new Set(tree.nodes);
    const structural = tree.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "routed",
      data: { points: layout.routes.get(e.id), active: !!selected && (e.source === selected || e.target === selected), dim: !!selected && e.source !== selected && e.target !== selected },
      selectable: false,
      focusable: false,
    }));
    // Relações entre conhecimentos: só as do nó selecionado, e só entre nós que estão na tela.
    const related = props.relatedEdges
      .filter((e) => selected && (e.source === selected || e.target === selected) && shown.has(e.source) && shown.has(e.target))
      .map((e) => ({ id: `rel:${e.id}`, source: e.source, target: e.target, type: "routed", data: { related: true }, selectable: false, focusable: false }));
    return [...structural, ...related];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, layoutKey, selected, props.relatedEdges]);

  // Câmera: enquadra tudo na primeira vez e quando pedem; centraliza num nó quando a seleção vem de fora do canvas.
  const firstFit = useRef(false);
  useEffect(() => {
    if (!layout || firstFit.current) return;
    firstFit.current = true;
    requestAnimationFrame(() => void flow.fitView({ padding: 0.2, maxZoom: 1.1, duration: 0 }));
  }, [layout, flow]);
  useEffect(() => {
    if (!camera || !layout) return;
    if (camera.target === "all") {
      void flow.fitView({ padding: 0.2, maxZoom: 1.1, duration: 450 });
      return;
    }
    if (camera.subtree) {
      // Grupo recém-aberto: enquadra o nó e os filhos visíveis.
      const ids = [camera.target, ...(index.children.get(camera.target) ?? [])].filter((id) => layout.positions.has(id));
      void flow.fitView({ nodes: ids.map((id) => ({ id })), padding: 0.25, maxZoom: 1.05, duration: 450 });
      return;
    }
    const p = layout.positions.get(camera.target);
    if (p) void flow.setCenter(p.x + p.w / 2, p.y + p.h / 2, { zoom: Math.max(flow.getZoom(), 0.9), duration: 450 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera?.seq, layoutKey]);

  useEffect(() => {
    props.onReady({
      zoomIn: () => void flow.zoomIn({ duration: 200 }),
      zoomOut: () => void flow.zoomOut({ duration: 200 }),
      fit: () => void flow.fitView({ padding: 0.2, maxZoom: 1.1, duration: 450 }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={(_, n) => props.onNodeClick(n.id)}
      onPaneClick={props.onPaneClick}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      minZoom={0.15}
      maxZoom={2.2}
      zoomOnDoubleClick={false}
      colorMode="dark"
      className="kflow"
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgba(199,183,250,0.07)" />
      {props.showMinimap ? (
        <MiniMap pannable zoomable className="kminimap" maskColor="rgba(0,0,0,0.72)" nodeColor={(n) => ((n.data as NodeData).node.type === "THEME" ? "#6236D4" : "#2F1C64")} nodeStrokeWidth={0} position="bottom-left" />
      ) : null}
    </ReactFlow>
  );
}

export function StructuredMap(props: StructuredProps) {
  return (
    <ReactFlowProvider>
      <StructuredInner {...props} />
    </ReactFlowProvider>
  );
}
