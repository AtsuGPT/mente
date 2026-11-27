import { useEffect, useRef } from "react";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import Sigma from "sigma";
import { layerDashed, layerPlain, sdfCircle, sdfSquare } from "sigma/rendering";
import { kindOf, passes, type GraphIndex, type KindFilter, type KnowledgeGraph } from "@/lib/knowledge";

/**
 * Modo Relacional (carregado só quando escolhido): agrupamentos orgânicos por tema, como no Obsidian. Temas maiores,
 * tópicos menores, materiais como quadradinhos discretos; hierarquia em linha contínua, relação entre conhecimentos
 * tracejada. O layout (ForceAtlas2) roda um número fixo de iterações e para: nada fica se mexendo depois. Rótulos dos
 * tópicos e materiais aparecem conforme a aproximação.
 */

export type RelationalProps = {
  graph: KnowledgeGraph;
  index: GraphIndex;
  kinds: Set<KindFilter>;
  selected: string | null;
  focus: Set<string> | null;
  camera: { seq: number; target: string | "all"; subtree?: boolean } | null;
  onNodeClick: (id: string) => void;
  onPaneClick: () => void;
  onReady: (api: { zoomIn: () => void; zoomOut: () => void; fit: () => void }) => void;
  onStats?: (s: { nodes: number; layoutMs: number }) => void;
};

const COLORS = {
  theme: "#8461F0",
  topic: "#B9A6F9",
  material: "#8A84A3",
  label: "#E9E4F7",
  labelFaint: "#AAA4BF",
  tree: "rgba(165,139,247,0.22)",
  related: "rgba(199,183,250,0.75)",
  dim: "rgba(60,56,72,0.35)",
  dimEdge: "rgba(60,56,72,0.12)",
  transparent: "rgba(0,0,0,0)",
};

/** Posições guardadas por recorte do grafo: trocar de modo e voltar não reorganiza tudo. */
const positionCache = new Map<string, Map<string, { x: number; y: number }>>();

function hash01(id: string, salt: number) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

function buildGraph(data: KnowledgeGraph, index: GraphIndex, kinds: Set<KindFilter>) {
  const g = new Graph({ type: "undirected", multi: false });
  const themes = index.themes.filter((t) => passes(index.byId.get(t)!, kinds));
  const angleOf = new Map(themes.map((t, i) => [t, (i / Math.max(1, themes.length)) * Math.PI * 2]));
  const R = 60 + themes.length * 18;
  for (const n of data.nodes) {
    if (!passes(n, kinds)) continue;
    const kind = kindOf(n);
    const a = angleOf.get(n.themeId) ?? hash01(n.themeId, 1) * Math.PI * 2;
    // Ponto de partida: cada tema no seu setor do círculo, os filhos perto dele (determinístico, sem Math.random).
    const spread = n.type === "THEME" ? 0 : 22 + hash01(n.id, 2) * 34;
    const jitter = hash01(n.id, 3) * Math.PI * 2;
    g.addNode(n.id, {
      x: Math.cos(a) * R + Math.cos(jitter) * spread,
      y: Math.sin(a) * R + Math.sin(jitter) * spread,
      size: n.type === "THEME" ? 12 : kind === "topic" ? 5.5 : 3.2,
      color: n.type === "THEME" ? COLORS.theme : kind === "topic" ? COLORS.topic : COLORS.material,
      shape: n.type === "THEME" || kind === "topic" ? "circle" : "square",
      label: n.label,
      labelColor: n.type === "THEME" ? COLORS.label : COLORS.labelFaint,
      labelSize: n.type === "THEME" ? 14 : 12,
      kind: n.type,
    });
  }
  for (const e of data.edges) {
    if (!g.hasNode(e.source) || !g.hasNode(e.target) || g.hasEdge(e.source, e.target)) continue;
    const related = e.type === "RELATED_TO" || e.type === "PREREQUISITE";
    g.addEdge(e.source, e.target, {
      related,
      color: related ? COLORS.transparent : COLORS.tree,
      dashColor: related ? COLORS.related : COLORS.transparent,
      dash: related ? 4 : 0,
      gap: related ? 4 : 0,
      size: related ? 1.5 : 1,
      // Hierarquia puxa mais (mantém o agrupamento); relação entre temas puxa pouco (aproxima sem misturar).
      weight: related ? 0.25 : 1,
    });
  }
  return g;
}

function layout(g: Graph, key: string) {
  const cached = positionCache.get(key);
  if (cached) {
    g.forEachNode((n) => {
      const p = cached.get(n);
      if (p) g.mergeNodeAttributes(n, p);
    });
    return 0;
  }
  const started = performance.now();
  const settings = forceAtlas2.inferSettings(g);
  forceAtlas2.assign(g, {
    iterations: 200,
    getEdgeWeight: "weight",
    // Medido no grafo de 500 nós (distância média ao próprio tema ÷ distância entre temas): 0,65 com LinLog + hubs
    // distribuídos (temas no centro, materiais num anel) e 0,22 com estes valores, cada tema cercado dos seus itens.
    settings: { ...settings, linLogMode: false, gravity: 0.3, scalingRatio: 20, slowDown: 3, adjustSizes: false, barnesHutOptimize: g.order > 300, outboundAttractionDistribution: false },
  });
  const positions = new Map<string, { x: number; y: number }>();
  g.forEachNode((n, a) => positions.set(n, { x: a.x, y: a.y }));
  if (positionCache.size > 12) positionCache.delete(positionCache.keys().next().value!);
  positionCache.set(key, positions);
  return Math.round(performance.now() - started);
}

export default function RelationalMap(props: RelationalProps) {
  const container = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const highlight = useRef<{ center: string | null; set: Set<string> | null; focus: Set<string> | null }>({ center: null, set: null, focus: null });
  const propsRef = useRef(props);
  propsRef.current = props;

  const kindsKey = [...props.kinds].sort().join(",");
  useEffect(() => {
    if (!container.current) return;
    const g = buildGraph(props.graph, props.index, props.kinds);
    const key = `${props.graph.nodes.length}:${props.graph.edges.length}:${kindsKey}`;
    const layoutMs = layout(g, key);
    props.onStats?.({ nodes: g.order, layoutMs });

    const renderer = new Sigma(g, container.current, {
      primitives: {
        nodes: { shapes: [sdfCircle(), sdfSquare()] },
        edges: {
          layers: [
            layerPlain({ color: { attribute: "color" } }),
            layerDashed({ dashSize: { attribute: "dash", default: 0 }, gapSize: { attribute: "gap", default: 0 }, dashColor: { attribute: "dashColor" } }),
          ],
        },
      },
      styles: {
        nodes: [
          {
            color: { attribute: "color" },
            size: { attribute: "size" },
            shape: { attribute: "shape" },
            label: { attribute: "label" },
            labelColor: { attribute: "labelColor" },
            labelSize: { attribute: "labelSize" },
            labelFont: "Instrument Sans, system-ui, sans-serif",
            labelPosition: "below",
          },
        ],
        edges: [{ color: { attribute: "color" }, size: { attribute: "size" } }],
      },
      settings: {
        // Tamanhos em pixels no zoom padrão (o padrão da v4 mede no espaço das posições e os nós ficavam enormes).
        itemSizesReference: "screen",
        autoRescaleContent: "nodes",
        labelRenderedSizeThreshold: 7,
        labelDensity: 0.6,
        labelGridCellSize: 90,
        hideEdgesOnMove: false,
        minCameraRatio: 0.08,
        maxCameraRatio: 4,
        stagePadding: 40,
        zoomDuration: 220,
      },
      nodeReducer: (key, computed) => {
        const h = highlight.current;
        const inFocus = !h.focus || h.focus.has(key);
        if (!inFocus) return { ...computed, color: COLORS.dim, label: "", labelVisibility: "hidden" };
        if (!h.set) return computed;
        if (key === h.center) return { ...computed, labelVisibility: "visible", depth: "topNodes", size: (computed.size ?? 6) * 1.25 };
        // Vizinhos: tema e tópico com nome sempre; material só com zoom (senão os nomes se encavalam).
        if (h.set.has(key)) return { ...computed, labelVisibility: (computed.size ?? 0) >= 5 ? "visible" : "auto", depth: "topNodes" };
        return { ...computed, color: COLORS.dim, labelVisibility: "hidden" };
      },
      edgeReducer: (key, computed, _attrs, _state, _gs, graph) => {
        const h = highlight.current;
        const [s, t] = graph.extremities(key);
        if (h.focus && (!h.focus.has(s) || !h.focus.has(t))) return { ...computed, visibility: "hidden" };
        if (!h.set || !h.center) return computed;
        if (s === h.center || t === h.center) return { ...computed, depth: "topEdges", size: (computed.size ?? 1) * 1.6 };
        return { ...computed, visibility: "hidden" };
      },
    });
    sigmaRef.current = renderer;

    const setHighlight = (center: string | null) => {
      highlight.current.center = center;
      highlight.current.set = center ? new Set([center, ...g.neighbors(center)]) : null;
      renderer.refresh({ skipIndexation: true });
    };
    renderer.on("clickNode", ({ node }) => propsRef.current.onNodeClick(node));
    renderer.on("clickStage", () => propsRef.current.onPaneClick());
    renderer.on("enterNode", ({ node }) => setHighlight(node));
    renderer.on("leaveNode", () => setHighlight(propsRef.current.selected && g.hasNode(propsRef.current.selected) ? propsRef.current.selected : null));

    const camera = renderer.getCamera();
    props.onReady({
      zoomIn: () => void camera.zoomIn({ duration: 220 }),
      zoomOut: () => void camera.zoomOut({ duration: 220 }),
      fit: () => void camera.reset({ duration: 450 }),
    });
    setHighlight(props.selected && g.hasNode(props.selected) ? props.selected : null);
    return () => {
      renderer.kill();
      sigmaRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.graph, props.index, kindsKey]);

  // Seleção e foco vindos de fora (explorador, inspetor): realça e leva a câmera até o nó.
  useEffect(() => {
    const renderer = sigmaRef.current;
    if (!renderer) return;
    const g = renderer.getGraph();
    const center = props.selected && g.hasNode(props.selected) ? props.selected : null;
    highlight.current.center = center;
    highlight.current.set = center ? new Set([center, ...g.neighbors(center)]) : null;
    highlight.current.focus = props.focus;
    renderer.refresh({ skipIndexation: true });
  }, [props.selected, props.focus]);

  useEffect(() => {
    const renderer = sigmaRef.current;
    if (!renderer || !props.camera) return;
    const camera = renderer.getCamera();
    if (props.camera.target === "all") {
      void camera.reset({ duration: 450 });
      return;
    }
    const d = renderer.getNodeDisplayData(props.camera.target);
    if (d) void camera.animate({ x: d.x, y: d.y, ratio: Math.min(camera.ratio, 0.6) }, { duration: 450 });
  }, [props.camera?.seq]);

  return <div ref={container} className="ksigma" aria-label="Mapa relacional" role="img" />;
}
