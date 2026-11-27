"use dom";

import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChartNetwork, Maximize2, Minus, Network, PanelLeft, PanelRight, Plus, MapIcon } from "./icons";
import "@xyflow/react/dist/style.css";
import "./knowledge.css";
import { KIND_FILTERS, indexGraph, neighborhood, pathTo, visibleTree, type KindFilter, type KnowledgeGraph, type KnowledgeLink, type KnowledgeNode, type StudyLink } from "@/lib/knowledge";
import { Explorer, Inspector } from "./parts";
import { Starfield } from "./starfield";
import InstrumentSans400 from "@expo-google-fonts/instrument-sans/400Regular/InstrumentSans_400Regular.ttf";
import InstrumentSans500 from "@expo-google-fonts/instrument-sans/500Medium/InstrumentSans_500Medium.ttf";
import Newsreader500 from "@expo-google-fonts/newsreader/500Medium/Newsreader_500Medium.ttf";

/**
 * Mapa de Conhecimento (KNOWLEDGE-001): componente DOM (roda num webview no celular e direto na web). Explorador à
 * esquerda, canvas no centro (Estruturado: React Flow + ELK; Relacional: Sigma, carregado sob demanda) e inspetor à
 * direita. Os dois modos usam os mesmos dados, filtros e seleção. Em telas pequenas, o explorador vira menu e o
 * inspetor, folha de baixo.
 */

const RelationalMap = lazy(() => import("./relational"));
// O Estruturado (React Flow + ELK, ~1,4 MB) também só baixa quando é escolhido: o padrão é o Relacional.
const StructuredMap = lazy(() => import("./structured").then((m) => ({ default: m.StructuredMap })));

type Mode = "estruturado" | "relacional";
type CameraRequest = { seq: number; target: string | "all"; subtree?: boolean } | null;

export default function KnowledgeMap(props: {
  graph: KnowledgeGraph;
  environmentName: string;
  /** abre o material de verdade (pensamento, pasta, conversa, artefato) no app */
  onOpen: (link: KnowledgeLink | StudyLink) => Promise<void>;
  dom?: import("expo/dom").DOMProps;
}) {
  const { graph } = props;
  const index = useMemo(() => indexGraph(graph), [graph]);
  // Relacional é o padrão (pedido do Atsu, 27/11): abre o grafo das conexões; o Estruturado fica a um clique.
  const [mode, setMode] = useState<Mode>("relacional");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [kinds, setKinds] = useState<Set<KindFilter>>(() => new Set(KIND_FILTERS.map((k) => k.id)));
  const [selected, setSelected] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [depth, setDepth] = useState(1);
  const [camera, setCamera] = useState<CameraRequest>(null);
  const [minimap, setMinimap] = useState(false);
  const narrow = useNarrow();
  const [explorerOpen, setExplorerOpen] = useState(() => !isNarrowNow());
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [controls, setControls] = useState<{ zoomIn: () => void; zoomOut: () => void; fit: () => void } | null>(null);
  const [stats, setStats] = useState<{ nodes: number; layoutMs: number } | null>(null);

  const focus = useMemo(() => (focusId ? neighborhood(index, focusId, depth) : null), [focusId, depth, index]);
  const tree = useMemo(() => {
    if (!focus) return visibleTree(index, expanded, kinds, null);
    // Explorando as conexões de um nó: só a vizinhança, com a hierarquia entre esses nós.
    const nodes = [...focus].filter((id) => index.byId.has(id));
    const set = new Set(nodes);
    const edges = nodes.flatMap((id) => (index.children.get(id) ?? []).filter((c) => set.has(c)).map((c) => ({ id: `${id}>${c}`, source: id, target: c })));
    return { nodes, edges };
  }, [index, expanded, kinds, focus]);
  const relatedEdges = useMemo(() => graph.edges.filter((e) => e.type === "RELATED_TO" || e.type === "PREREQUISITE"), [graph]);

  const toggle = useCallback((id: string) => setExpanded((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }), []);
  const reveal = useCallback((id: string) => {
    // Abre o caminho do tema até o nó, para ele aparecer no modo estruturado.
    const path = pathTo(index, id);
    setExpanded((cur) => new Set([...cur, ...path.slice(0, -1)]));
  }, [index]);
  const moveCamera = useCallback((target: string | "all", subtree = false) => setCamera((c) => ({ seq: (c?.seq ?? 0) + 1, target, subtree })), []);

  const select = useCallback((id: string, from: "canvas" | "explorer" | "search" | "inspector") => {
    setSelected(id);
    setInspectorOpen(true);
    if (from === "canvas") {
      if (mode === "estruturado" && !focusId && (index.children.get(id)?.length ?? 0) > 0) {
        const opening = !expanded.has(id);
        toggle(id);
        if (opening) moveCamera(id, true);
      }
      return;
    }
    reveal(id);
    moveCamera(id);
    if (narrow && from !== "inspector") setExplorerOpen(false);
  }, [mode, focusId, index, toggle, reveal, moveCamera, narrow, expanded]);

  const explore = useCallback((id: string | null) => {
    setFocusId(id);
    if (id) setDepth(1);
    moveCamera(id ?? "all");
  }, [moveCamera]);

  // Só em desenvolvimento: abrir e fechar tudo de uma vez, para as baterias de desempenho com 500 nós.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as Record<string, unknown>).__kmap = {
      expandAll: () => setExpanded(new Set([...index.children.keys()])),
      collapseAll: () => setExpanded(new Set()),
      setMode,
    };
  }, [index]);

  useEffect(() => {
    // Seleção que sumiu com um filtro: limpa, para o inspetor não mostrar algo que não está no mapa.
    if (selected && !index.byId.has(selected)) setSelected(null);
  }, [index, selected]);

  const selectedNode = selected ? index.byId.get(selected) ?? null : null;
  const open = useCallback((node: KnowledgeNode) => {
    if (node.link) void props.onOpen(node.link);
  }, [props]);

  if (!graph.nodes.length) {
    return (
      <div className="kmap">
        <div className="kmap-empty">
          <h2>Seu mapa começa aqui</h2>
          <p>Ele cresce com o que você estuda: tópicos das conversas com a Kally guardadas em pastas, e pensamentos dentro das pastas.</p>
        </div>
      </div>
    );
  }

  const insets = { left: explorerOpen && !narrow ? 292 : 0, right: selectedNode && inspectorOpen && !narrow ? 340 : 0 };
  const shared = {
    index,
    kinds,
    selected,
    focus,
    camera,
    onNodeClick: (id: string) => select(id, "canvas"),
    onPaneClick: () => setSelected(null),
    onReady: setControls,
    onStats: setStats,
  };

  return (
    <div className={`kmap${narrow ? " is-narrow" : ""}`} data-mode={mode} data-nodes={stats?.nodes ?? 0} data-layout-ms={stats?.layoutMs ?? 0}>
      <div className="kcanvas">
        <Starfield />
        {mode === "estruturado" ? (
          <Suspense fallback={<div className="kloading">Carregando o modo estruturado…</div>}>
            <StructuredMap {...shared} tree={tree} expanded={expanded} relatedEdges={relatedEdges} showMinimap={minimap && !narrow} narrow={narrow} insets={insets} />
          </Suspense>
        ) : (
          <RelationalBoundary onFallback={() => setMode("estruturado")}>
            <Suspense fallback={<div className="kloading">Carregando o modo relacional…</div>}>
              <RelationalMap {...shared} graph={graph} insets={insets} />
            </Suspense>
          </RelationalBoundary>
        )}
      </div>

      {/* Topo: painéis e modo */}
      <div className="kbar kbar-top">
        <button className={`kbtn${explorerOpen ? " is-on" : ""}`} onClick={() => setExplorerOpen((v) => !v)} aria-label={explorerOpen ? "Recolher o explorador" : "Abrir o explorador"} aria-pressed={explorerOpen}>
          <PanelLeft size={16} />
        </button>
        <div className="kseg" role="tablist" aria-label="Modo do mapa">
          {(["relacional", "estruturado"] as const).map((m) => {
            const Icon = m === "relacional" ? ChartNetwork : Network;
            return (
              <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? "is-on" : ""} onClick={() => setMode(m)}>
                <Icon size={15} strokeWidth={1.8} aria-hidden />
                <span>{m === "estruturado" ? "Estruturado" : "Relacional"}</span>
              </button>
            );
          })}
        </div>
        {focusId ? (
          <button className="kpill" onClick={() => explore(null)}>
            Conexões de {index.byId.get(focusId)?.label ?? ""} · ver tudo
          </button>
        ) : null}
        {graph.truncated ? <span className="kpill is-warn">Mapa grande: mostrando os primeiros 2.000 itens</span> : null}
        {selectedNode && !narrow ? (
          <button className={`kbtn kbtn-right${inspectorOpen ? " is-on" : ""}`} onClick={() => setInspectorOpen((v) => !v)} aria-label={inspectorOpen ? "Recolher o inspetor" : "Abrir o inspetor"} aria-pressed={inspectorOpen}>
            <PanelRight size={16} />
          </button>
        ) : null}
      </div>

      {/* Controles de câmera: canto de baixo */}
      <div className="kbar kbar-zoom" role="group" aria-label="Câmera">
        <button className="kbtn" onClick={() => controls?.zoomIn()} aria-label="Aproximar"><Plus size={16} /></button>
        <button className="kbtn" onClick={() => controls?.zoomOut()} aria-label="Afastar"><Minus size={16} /></button>
        <button className="kbtn" onClick={() => controls?.fit()} aria-label="Centralizar o mapa"><Maximize2 size={15} /></button>
        {mode === "estruturado" && !narrow ? (
          <button className={`kbtn${minimap ? " is-on" : ""}`} onClick={() => setMinimap((v) => !v)} aria-label="Minimapa" aria-pressed={minimap}><MapIcon size={15} /></button>
        ) : null}
      </div>

      {explorerOpen ? (
        <>
          {narrow ? <button className="kscrim" aria-label="Fechar o explorador" onClick={() => setExplorerOpen(false)} /> : null}
          <Explorer
            graph={graph}
            index={index}
            kinds={kinds}
            expanded={expanded}
            selected={selected}
            onToggleKind={(k) => setKinds((cur) => {
              const next = new Set(cur);
              if (next.has(k)) next.delete(k);
              else next.add(k);
              return next;
            })}
            onToggle={toggle}
            onSelect={(id, from) => select(id, from)}
            onClose={narrow ? () => setExplorerOpen(false) : undefined}
          />
        </>
      ) : null}

      {selectedNode && inspectorOpen ? (
        <Inspector
          graph={graph}
          index={index}
          id={selectedNode.id}
          focused={focusId === selectedNode.id}
          depth={depth}
          onDepth={setDepth}
          onSelect={(id) => select(id, "inspector")}
          onOpen={open}
          onStudy={(link) => void props.onOpen(link)}
          onExplore={explore}
          onClose={() => (narrow ? setSelected(null) : setInspectorOpen(false))}
        />
      ) : null}
    </div>
  );
}

/** Se o modo relacional falhar (WebGL indisponível, erro do Sigma), mostra o motivo e oferece o estruturado. */
class RelationalBoundary extends Component<{ children: ReactNode; onFallback: () => void }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="kloading" role="alert">
        <div style={{ display: "grid", gap: 12, justifyItems: "center", textAlign: "center", maxWidth: 360 }}>
          <span>O modo relacional não abriu neste aparelho.</span>
          <button className="kpill" onClick={() => { this.setState({ error: null }); this.props.onFallback(); }}>Abrir o Estruturado</button>
        </div>
      </div>
    );
  }
}

const NARROW = 760;
const isNarrowNow = () => typeof window !== "undefined" && window.innerWidth < NARROW;
function useNarrow() {
  const [narrow, setNarrow] = useState(isNarrowNow);
  useEffect(() => {
    const on = () => setNarrow(isNarrowNow());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return narrow;
}

/**
 * No webview do celular as fontes do app não existem: registra as mesmas a partir dos arquivos do pacote. Roda ao
 * carregar o módulo (antes do primeiro layout, que mede o texto com elas).
 */
injectFonts();
function injectFonts() {
  if (typeof document === "undefined" || document.getElementById("kmap-fonts")) return;
  {
    const url = (m: unknown) => (typeof m === "string" ? m : (m as { uri?: string; default?: string } | null)?.uri ?? (m as { default?: string } | null)?.default ?? null);
    const faces = [
      ["Instrument Sans", 400, url(InstrumentSans400)],
      ["Instrument Sans", 500, url(InstrumentSans500)],
      ["Newsreader", 500, url(Newsreader500)],
    ].filter(([, , src]) => !!src);
    const style = document.createElement("style");
    style.id = "kmap-fonts";
    style.textContent = faces.map(([family, weight, src]) => `@font-face{font-family:'${family}';font-weight:${weight};font-display:swap;src:url('${src}') format('truetype')}`).join("");
    document.head.appendChild(style);
  }
}
