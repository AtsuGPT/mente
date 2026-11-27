import { useEffect, useRef } from "react";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import Sigma from "sigma";
import { layerDashed, layerPlain, sdfCircle, sdfDiamond } from "sigma/rendering";
import { folderTone } from "@shared/color";
import { ownIconSvg, type OwnIconKind } from "./own-icons";
import { kindOf, passes, type GraphIndex, type KindFilter, type KnowledgeGraph } from "@/lib/knowledge";

/**
 * Modo Relacional (carregado só quando escolhido): agrupamentos orgânicos por tema, como no Obsidian. No tema novo
 * (27/11): cada pasta é uma cápsula de vidro escuro com borda e brilho no tom dela; tópicos são um ponto com o anel do
 * domínio (sálvia, lavanda, âmbar); materiais, losangos pequenos cor de ardósia. Hierarquia em linha fina tingida pelo
 * tom da pasta, relação entre conhecimentos tracejada. O layout (ForceAtlas2) roda um número fixo de iterações e para: nada fica se mexendo depois. Rótulos dos
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
  /** largura dos painéis abertos sobre o canvas: a câmera enquadra no espaço livre entre eles */
  insets: { left: number; right: number };
  onStats?: (s: { nodes: number; layoutMs: number }) => void;
};

const COLORS = {
  material: "#8F8AA6",
  label: "#F2EFFA",
  labelTopic: "#C9C3DA",
  labelFaint: "#948EAA",
  capsule: "rgba(16,14,22,0.92)",
  related: "rgba(199,183,250,0.75)",
  dim: "rgba(60,56,72,0.35)",
  transparent: "rgba(0,0,0,0)",
};
/** Domínio do tópico: os mesmos tons da aba Estudos. */
const MASTERY_TONE: Record<string, string> = { dominado: "#9CC4A4", estudando: "#B9A6F0", dificuldade: "#D4B07A" };

function withAlpha(hex: string, a: number) {
  const h = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#A3A0B8";
  return `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`;
}

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
    const tone = folderTone(index.byId.get(n.themeId)?.color ?? n.color);
    const isTheme = n.type === "THEME";
    const isTopic = kind === "topic";
    const mastery = MASTERY_TONE[n.mastery ?? "estudando"];
    g.addNode(n.id, {
      x: Math.cos(a) * R + Math.cos(jitter) * spread,
      y: Math.sin(a) * R + Math.sin(jitter) * spread,
      size: isTheme ? 6.5 : isTopic ? 4.5 : 3.4,
      // A pasta é desenhada pelo ícone dentro da cápsula; o ponto do nó some nela (fica só como âncora das linhas).
      color: isTheme ? COLORS.capsule : isTopic ? mastery : COLORS.material,
      shape: isTheme || isTopic ? "circle" : "diamond",
      label: n.label,
      labelColor: isTheme ? COLORS.label : isTopic ? COLORS.labelTopic : COLORS.labelFaint,
      labelSize: isTheme ? 14 : isTopic ? 12.5 : 11.5,
      labelPos: isTheme ? "right" : "below",
      // Cápsula de vidro (pasta) e anel do domínio (tópico): o fundo do nó desenhado pelo Sigma.
      bdVis: isTheme || isTopic ? "visible" : "hidden",
      bdArea: isTheme ? "both" : "node",
      bdColor: isTheme ? COLORS.capsule : COLORS.transparent,
      bdBorder: isTheme ? withAlpha(tone, 0.55) : withAlpha(mastery, 0.6),
      bdBorderWidth: isTheme ? 1.2 : 1.4,
      bdShadow: isTheme ? withAlpha(tone, 0.32) : COLORS.transparent,
      bdBlur: isTheme ? 18 : 0,
      bdPadding: isTheme ? 7 : 3,
      bdRadius: isTheme ? 15 : 7.5,
      tone,
      kind: n.type,
      // Ícone próprio ao lado do nome: pasta (no tom dela) e o tipo de cada material. Tópico já é o anel do domínio.
      attach: isTopic ? null : "icone",
      iconKind: (isTheme ? (n.virtual ? "grupo" : "pastas") : n.type === "POST" ? (n.draft ? "rascunho" : "pensamentos") : n.resource === "artefato" ? "artefatos" : n.resource === "conversa" ? "conversas" : "materiais") as OwnIconKind,
      iconColor: isTheme ? tone : COLORS.labelFaint,
    });
  }
  for (const e of data.edges) {
    if (!g.hasNode(e.source) || !g.hasNode(e.target) || g.hasEdge(e.source, e.target)) continue;
    const related = e.type === "RELATED_TO" || e.type === "PREREQUISITE";
    const tone = (g.getNodeAttribute(e.source, "tone") as string) ?? "#A3A0B8";
    g.addEdge(e.source, e.target, {
      related,
      color: related ? COLORS.transparent : withAlpha(tone, 0.22),
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
  let i = 0;
  g.forEachNode((n, a) => {
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) g.mergeNodeAttributes(n, { x: Math.cos(i) * 10, y: Math.sin(i) * 10 });
    i += 1;
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

  /** Leva a câmera para enquadrar os nós (ou centrar um, com zoom fixo) no espaço livre entre os painéis. */
  const frame = (renderer: Sigma, nodes: string[] | "all", options: { ratio?: number; duration?: number } = {}) => {
    const keys = nodes === "all" ? renderer.getGraph().nodes() : nodes;
    const points = keys.flatMap((k) => {
      const d = renderer.getNodeDisplayData(k);
      return d && Number.isFinite(d.x) && Number.isFinite(d.y) ? [{ x: d.x, y: d.y }] : [];
    });
    if (!points.length) return;
    const { width, height } = renderer.getDimensions();
    const { left, right } = propsRef.current.insets;
    const free = { x0: left + 36, x1: width - right - 36, y0: 64, y1: height - 36 };
    if (free.x1 - free.x0 < 80 || free.y1 - free.y0 < 80) return;
    const view = (p: { x: number; y: number }, state: { x: number; y: number; ratio: number; angle: number }) => renderer.framedGraphToViewport(p, { cameraState: state });
    const bbox = (state: { x: number; y: number; ratio: number; angle: number }) => {
      const ps = points.map((p) => view(p, state));
      const xs = ps.map((p) => p.x);
      const ys = ps.map((p) => p.y);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    };
    let ratio = options.ratio;
    if (ratio == null) {
      const b = bbox({ x: 0.5, y: 0.5, ratio: 1, angle: 0 });
      const k = Math.min((free.x1 - free.x0) / Math.max(1, b.x1 - b.x0), (free.y1 - free.y0) / Math.max(1, b.y1 - b.y0));
      ratio = Math.min(4, Math.max(0.08, 1 / k));
    }
    const state = { x: 0.5, y: 0.5, ratio, angle: 0 };
    const b = bbox(state);
    // Pixels por unidade do grafo enquadrado, em cada eixo (o y da tela é invertido).
    const o = view({ x: 0.5, y: 0.5 }, state);
    const ux = (view({ x: 0.6, y: 0.5 }, state).x - o.x) / 0.1;
    const uy = (view({ x: 0.5, y: 0.6 }, state).y - o.y) / 0.1;
    state.x += ((b.x0 + b.x1) / 2 - (free.x0 + free.x1) / 2) / ux;
    state.y += ((b.y0 + b.y1) / 2 - (free.y0 + free.y1) / 2) / uy;
    const camera = renderer.getCamera();
    // Conta que não fechou (tela sem tamanho, nó único): volta ao enquadramento padrão em vez de sumir com o mapa.
    if (![state.x, state.y, state.ratio].every(Number.isFinite)) {
      void camera.reset({ duration: options.duration ?? 0 });
      return;
    }
    if (options.duration) void camera.animate(state, { duration: options.duration });
    else camera.setState(state);
  };

  const kindsKey = [...props.kinds].sort().join(",");
  useEffect(() => {
    if (!container.current) return;
    const g = buildGraph(props.graph, props.index, props.kinds);
    const key = `${props.graph.nodes.length}:${props.graph.edges.length}:${kindsKey}`;
    const layoutMs = layout(g, key);
    props.onStats?.({ nodes: g.order, layoutMs });

    const renderer = new Sigma(g, container.current, {
      primitives: {
        nodes: {
          shapes: [sdfCircle(), sdfDiamond()],
          labelAttachments: {
            icone: (ctx) => {
              const a = ctx.attributes as { iconKind?: OwnIconKind; iconColor?: string; kind?: string };
              const px = (a.kind === "THEME" ? 16 : 13) * ctx.pixelRatio;
              return { type: "svg", svg: ownIconSvg(a.iconKind ?? "materiais", a.iconColor ?? COLORS.labelFaint, px, 1.8) };
            },
          },
        },
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
            labelPosition: { attribute: "labelPos", defaultValue: "below" },
            labelAttachment: { attribute: "attach", defaultValue: null },
            labelAttachmentPlacement: "left",
            backdropVisibility: { attribute: "bdVis", defaultValue: "hidden" },
            backdropArea: { attribute: "bdArea", defaultValue: "node" },
            backdropColor: { attribute: "bdColor", defaultValue: "rgba(0,0,0,0)" },
            backdropBorderColor: { attribute: "bdBorder", defaultValue: "rgba(0,0,0,0)" },
            backdropBorderWidth: { attribute: "bdBorderWidth", defaultValue: 0 },
            backdropShadowColor: { attribute: "bdShadow", defaultValue: "rgba(0,0,0,0)" },
            backdropShadowBlur: { attribute: "bdBlur", defaultValue: 0 },
            backdropPadding: { attribute: "bdPadding", defaultValue: 0 },
            // O raio não pode passar da metade da altura do fundo: maior que isso, o Sigma incha a caixa em vez de arredondá-la.
            backdropCornerRadius: { attribute: "bdRadius", defaultValue: 0 },
            backdropLabelPadding: 6,
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
        // O contêiner pode nascer sem altura (webview do app, troca de tela): sem isto o Sigma lança erro e o mapa fica preto.
        allowInvalidContainer: true,
      },
      nodeReducer: (key, computed, attrs) => {
        const h = highlight.current;
        const inFocus = !h.focus || h.focus.has(key);
        if (!inFocus) return { ...computed, color: COLORS.dim, label: "", labelVisibility: "hidden", backdropVisibility: "hidden" };
        if (!h.set) return attrs.kind === "THEME" ? { ...computed, labelVisibility: "visible" } : computed;
        // Pasta em foco fica na camada dela: subindo, a cápsula cobria o próprio nome.
        if (key === h.center) return attrs.kind === "THEME" ? { ...computed, labelVisibility: "visible", size: (computed.size ?? 6) * 1.25 } : { ...computed, labelVisibility: "visible", depth: "topNodes", size: (computed.size ?? 6) * 1.25 };
        // Vizinhos: tema e tópico com nome sempre; material só com zoom (senão os nomes se encavalam).
        if (h.set.has(key)) return { ...computed, labelVisibility: (computed.size ?? 0) >= 5 ? "visible" : "auto", depth: "topNodes" };
        return { ...computed, color: COLORS.dim, labelVisibility: "hidden", backdropVisibility: "hidden" };
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
      fit: () => frame(renderer, "all", { duration: 450 }),
    });
    // O Sigma só se redimensiona com a janela; aqui ele acompanha o próprio contêiner e enquadra quando ganha tamanho.
    let framed = false;
    const fitIfSized = () => {
      const { width, height } = renderer.getDimensions();
      if (!framed && width > 80 && height > 80) {
        framed = true;
        frame(renderer, "all");
      }
    };
    fitIfSized();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
      renderer.resize();
      renderer.refresh();
      fitIfSized();
    }) : null;
    if (container.current) observer?.observe(container.current);
    setHighlight(props.selected && g.hasNode(props.selected) ? props.selected : null);
    return () => {
      observer?.disconnect();
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
      frame(renderer, "all", { duration: 450 });
      return;
    }
    frame(renderer, [props.camera.target], { ratio: Math.min(camera.ratio, 0.6), duration: 450 });
  }, [props.camera?.seq]);

  return <div ref={container} className="ksigma" aria-label="Mapa relacional" role="img" />;
}
