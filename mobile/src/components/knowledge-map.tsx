import { forwardRef, useEffect, useImperativeHandle, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Canvas, Circle, DashPathEffect, FontHinting, Group, Path, Points, RoundedRect, Skia, Text, useFont, vec, type SkFont, type SkPath } from "@shopify/react-native-skia";
import { GestureDetector, useCompetingGestures, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDecay,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { readableAccent } from "@shared/color";
import { RadialGlow } from "@/components/ui/surface";
import { hitTest, type LaidOutNode, type Layout } from "@/lib/graph-layout";
import { duration, easing, spring } from "@/theme/motion";
import { colors } from "@/theme/tokens";

/**
 * Mapa de conhecimento desenhado com Skia. Arrastar move (com inércia ao soltar, dentro de
 * limites), pinça aproxima em torno dos dedos, um toque seleciona. Caminhos, ícones e
 * posições são calculados uma vez; durante os gestos só a transformação do grupo muda (no
 * thread de interface, via Reanimated).
 *
 * Visual editorial e discreto: nós planos com borda fina, conexões finas, uma grade de pontos
 * quase apagada e cor só onde ela informa (a cor de cada pasta). O movimento existe para a
 * interação: seleção (as relações acendem e o resto recua), câmera e toque.
 *
 * Desempenho: nada no canvas anima sozinho. O fundo (uma troca muito lenta entre dois roxos
 * escuros) é uma camada separada, atrás do canvas, que só muda opacidade (compositor); assim o
 * mapa parado não é redesenhado, e durante os gestos só a câmera muda.
 */

export type KnowledgeMapHandle = { focus: (id: string) => void; reveal: (id: string, bottomInset: number) => void; fit: () => void; zoomBy: (factor: number) => void };

const MIN_SCALE = 0.2;
const MAX_SCALE = 3.5;
/** Quanto do conteúdo precisa continuar visível nas bordas ao arrastar (px). */
const EDGE = 72;

const fontMedium = require("@expo-google-fonts/instrument-sans/500Medium/InstrumentSans_500Medium.ttf");
const fontSemibold = require("@expo-google-fonts/instrument-sans/600SemiBold/InstrumentSans_600SemiBold.ttf");

/**
 * Ícones dos nós: os mesmos traços do conjunto do app (components/ui/icon, viewBox 24,
 * traço fino), para o mapa falar a mesma língua das outras telas.
 */
const ICON_PATHS: Record<string, string> = {
  brain: "M9.5 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5.2A3 3 0 0 0 6.5 18a2.8 2.8 0 0 0 3 2.5V4.5ZM14.5 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5.2 3 3 0 0 1-2 5.3 2.8 2.8 0 0 1-3 2.5V4.5ZM9.5 9H8M9.5 14H7.5M14.5 9H16M14.5 14h2",
  book: "M12 6.5c-2-1.6-4.6-2-8-2v13c3.4 0 6 .4 8 2 2-1.6 4.6-2 8-2v-13c-3.4 0-6 .4-8 2Zm0 0v13",
  folder: "M3 6.5h7l2 2h9v9.8a1.7 1.7 0 0 1-1.7 1.7H4.7A1.7 1.7 0 0 1 3 18.3V6.5ZM3.5 10h17",
  bulb: "M9 17.5h6M10 20.5h4M12 3.5a6 6 0 0 0-3.5 10.9c.6.5 1 1.3 1 2.1h5c0-.8.4-1.6 1-2.1A6 6 0 0 0 12 3.5Z",
  users: "M5.8 8.5a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0-6.4 0M3.5 19c.8-3 2.9-4.6 5.5-4.6s4.7 1.6 5.5 4.6M15.5 5.6a3 3 0 0 1 0 5.8M17 14.6c1.8.5 3 1.9 3.5 4.4",
  sparkle: "M12 3.5 13.8 10 20.5 12l-6.7 2L12 20.5 10.2 14 3.5 12l6.7-2L12 3.5Z",
  map: "M3.6 7a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0-4.8 0M16 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0M9.2 17.5a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0-5.6 0M8.2 8.2 10.4 15M16.6 7.6l-3.4 7.6M8.4 6.8l7.6-.6",
  doc: "M7 3.5h7l4.5 4.5v12.5h-11.5V3.5ZM14 3.5V8h4.5M9.5 12.5h6M9.5 16h4",
  edit: "M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4",
  lock: "M7 10.5h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2ZM8 10.5V8a4 4 0 0 1 8 0v2.5",
  image: "M5.5 4.5h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2ZM20.5 16l-5-5-8 8.5",
};
const iconCache = new Map<string, SkPath | null>();
function iconPath(name: string) {
  if (!iconCache.has(name)) iconCache.set(name, Skia.Path.MakeFromSVGString(ICON_PATHS[name] ?? ICON_PATHS.brain));
  return iconCache.get(name) ?? null;
}

function NodeIcon({ name, x, y, size, color, weight = 1.6 }: { name: string; x: number; y: number; size: number; color: string; weight?: number }) {
  const path = iconPath(name);
  if (!path) return null;
  const s = size / 24;
  return (
    <Group transform={[{ translateX: x - size / 2 }, { translateY: y - size / 2 }, { scale: s }]}>
      <Path path={path} style="stroke" strokeWidth={weight} strokeCap="round" strokeJoin="round" color={color} />
    </Group>
  );
}

/** #RRGGBB → rgba(). */
function rgba(hex: string, alpha: number) {
  const h = /^#[0-9a-f]{6}$/i.test(hex) ? hex : colors.violet500;
  return `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${alpha})`;
}

/**
 * Fonte para texto que muda de escala com o zoom: sem hinting e com posições
 * subpixel, senão as letras ficam espaçadas de forma irregular ao ampliar.
 */
function useMapFont(source: number, size: number) {
  const font = useFont(source, size);
  return useMemo(() => {
    if (!font) return null;
    font.setHinting(FontHinting.None);
    font.setSubpixel(true);
    font.setLinearMetrics(true);
    return font;
  }, [font]);
}

function truncate(label: string, max: number) {
  return label.length > max ? `${label.slice(0, max - 1).trimEnd()}…` : label;
}

/** Ponto na borda do nó, na direção de (tx, ty). */
function edgePoint(n: LaidOutNode, tx: number, ty: number) {
  const d = Math.hypot(tx - n.x, ty - n.y) || 1;
  return { x: n.x + ((tx - n.x) / d) * n.r, y: n.y + ((ty - n.y) / d) * n.r };
}

type Props = {
  layout: Layout;
  width: number;
  height: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Espaço reservado embaixo (painel de detalhes) ao centralizar um nó. */
  bottomInset?: number;
  /** Tela em foco e app em primeiro plano: sem isso o fundo para de oscilar. */
  active?: boolean;
};

export const KnowledgeMap = forwardRef<KnowledgeMapHandle, Props>(function KnowledgeMap({ layout, width, height, selectedId, onSelect, bottomInset = 0, active = true }, ref) {
  const labelFont = useMapFont(fontMedium, 11);
  const smallFont = useMapFont(fontMedium, 10);
  const folderFont = useMapFont(fontSemibold, 13);
  const hubFont = useMapFont(fontSemibold, 14);

  const fitScale = useMemo(() => {
    const { minX, minY, maxX, maxY } = layout.bounds;
    const s = Math.min((width - 40) / Math.max(1, maxX - minX), (height - 150) / Math.max(1, maxY - minY));
    return Math.min(1.1, Math.max(MIN_SCALE, s));
  }, [layout, width, height]);

  const scale = useSharedValue(fitScale);
  // Enquadra pelo centro do conteúdo (não pelo núcleo): um mapa com nós só de um lado
  // não fica cortado na borda.
  const center = useMemo(() => ({ x: (layout.bounds.minX + layout.bounds.maxX) / 2, y: (layout.bounds.minY + layout.bounds.maxY) / 2 }), [layout]);
  const tx = useSharedValue(width / 2 - center.x * fitScale);
  const ty = useSharedValue(height / 2 - center.y * fitScale);

  const transform = useDerivedValue(() => [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }]);

  const reduceMotion = useReducedMotion();
  const ambient = active && !reduceMotion;
  // Rótulos dos pensamentos surgem ao aproximar; os das pastas e do centro ficam sempre.
  const labelOpacity = useDerivedValue(() => interpolate(scale.value, [0.45, 0.75], [0, 1], Extrapolation.CLAMP));

  const { minX, minY, maxX, maxY } = layout.bounds;
  /** Faixa de translação que mantém parte do mapa visível nas bordas. */
  const range = (min: number, max: number, size: number, s: number): [number, number] => {
    "worklet";
    const lo = EDGE - max * s;
    const hi = size - EDGE - min * s;
    return lo <= hi ? [lo, hi] : [(lo + hi) / 2, (lo + hi) / 2];
  };
  const stopCamera = () => {
    "worklet";
    cancelAnimation(tx);
    cancelAnimation(ty);
    cancelAnimation(scale);
  };

  const animateTo = (nextScale: number, worldX: number, worldY: number) => {
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
    scale.value = withSpring(s, spring.camera);
    tx.value = withSpring(width / 2 - worldX * s, spring.camera);
    ty.value = withSpring((height - bottomInset) / 2 - worldY * s, spring.camera);
  };

  useImperativeHandle(ref, () => ({
    focus: (id) => {
      const node = layout.byId.get(id);
      if (node) animateTo(Math.max(scale.value, node.kind === "pensamento" || node.kind === "imagem" ? 1.4 : 0.9), node.x, node.y);
    },
    // Depois de um toque: só desloca (sem mudar o zoom) se o nó ficaria sob o painel ou rente à
    // borda; já visível, nada se mexe.
    reveal: (id, inset) => {
      const node = layout.byId.get(id);
      if (!node) return;
      const s = scale.value;
      const margin = 28 + node.r * s;
      const sx = tx.value + node.x * s;
      const sy = ty.value + node.y * s;
      const dx = sx < margin ? margin - sx : sx > width - margin ? width - margin - sx : 0;
      const bottom = height - inset - margin;
      const dy = sy > bottom ? bottom - sy : sy < margin ? margin - sy : 0;
      if (!dx && !dy) return;
      tx.value = withSpring(tx.value + dx, spring.camera);
      ty.value = withSpring(ty.value + dy, spring.camera);
    },
    fit: () => animateTo(fitScale, center.x, center.y),
    zoomBy: (factor) => {
      const worldX = (width / 2 - tx.value) / scale.value;
      const worldY = (height / 2 - ty.value) / scale.value;
      animateTo(scale.value * factor, worldX, worldY);
    },
  }));

  const pan = usePanGesture({
    minDistance: 6,
    onBegin: () => {
      "worklet";
      // Tocar segura o mapa na hora (interrompe inércia ou câmera em andamento).
      stopCamera();
    },
    onUpdate: (event) => {
      "worklet";
      tx.value += event.changeX;
      ty.value += event.changeY;
    },
    onDeactivate: (event) => {
      "worklet";
      // Inércia ao soltar, freando dentro dos limites (com retorno elástico se passou deles).
      tx.value = withDecay({ velocity: event.velocityX, clamp: range(minX, maxX, width, scale.value), rubberBandEffect: true, rubberBandFactor: 0.7, reduceMotion: ReduceMotion.System });
      ty.value = withDecay({ velocity: event.velocityY, clamp: range(minY, maxY, height, scale.value), rubberBandEffect: true, rubberBandFactor: 0.7, reduceMotion: ReduceMotion.System });
    },
  });

  const pinch = usePinchGesture({
    onBegin: () => {
      "worklet";
      stopCamera();
    },
    onUpdate: (event) => {
      "worklet";
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.value * event.scaleChange));
      const k = next / scale.value;
      // Mantém fixo o ponto do mundo que está sob os dedos.
      tx.value = event.focalX - (event.focalX - tx.value) * k;
      ty.value = event.focalY - (event.focalY - ty.value) * k;
      scale.value = next;
    },
    onDeactivate: () => {
      "worklet";
      // Se a pinça deixou o mapa fora dos limites, ele volta com mola.
      const [x0, x1] = range(minX, maxX, width, scale.value);
      const [y0, y1] = range(minY, maxY, height, scale.value);
      if (tx.value < x0 || tx.value > x1) tx.value = withSpring(Math.min(x1, Math.max(x0, tx.value)), spring.camera);
      if (ty.value < y0 || ty.value > y1) ty.value = withSpring(Math.min(y1, Math.max(y0, ty.value)), spring.camera);
    },
  });

  // Marca curta no ponto tocado: confirma o toque antes de o painel abrir.
  const ripple = useSharedValue(1);
  const rippleX = useSharedValue(0);
  const rippleY = useSharedValue(0);
  const rippleR = useDerivedValue(() => (6 + ripple.value * 16) / scale.value);
  const rippleOpacity = useDerivedValue(() => (1 - ripple.value) * 0.32);

  const tap = useTapGesture({
    runOnJS: true,
    maxDistance: 10,
    onActivate: (event) => {
      const worldX = (event.x - tx.value) / scale.value;
      const worldY = (event.y - ty.value) / scale.value;
      rippleX.value = worldX;
      rippleY.value = worldY;
      ripple.value = 0;
      ripple.value = withTiming(1, { duration: 380, easing: easing.decelerate, reduceMotion: ReduceMotion.System });
      const hit = hitTest(layout, worldX, worldY, 16 / scale.value);
      onSelect(hit?.id ?? null);
    },
  });

  const gesture = useCompetingGestures(useSimultaneousGestures(pan, pinch), tap);

  // Foco progressivo: as relações do nó acendem e o resto recua em ~260 ms; ao desmarcar, o
  // destaque some junto com o esmaecimento (sem corte).
  const [shownId, setShownId] = useState<string | null>(selectedId);
  const focus = useSharedValue(selectedId ? 1 : 0);
  const pop = useSharedValue(selectedId ? 1 : 0);
  useEffect(() => {
    if (selectedId) {
      setShownId(selectedId);
      focus.value = withTiming(1, { duration: duration.medium, easing: easing.standard, reduceMotion: ReduceMotion.System });
      pop.value = withSpring(1, spring.pop);
      return;
    }
    pop.value = withTiming(0, { duration: duration.short, easing: easing.accelerate, reduceMotion: ReduceMotion.System });
    focus.value = withTiming(0, { duration: duration.medium, easing: easing.standard, reduceMotion: ReduceMotion.System }, (finished) => {
      if (finished) scheduleOnRN(setShownId, null);
    });
  }, [selectedId, focus, pop]);
  const dimmed = useDerivedValue(() => 1 - focus.value * 0.76);

  const highlighted = useMemo(() => {
    if (!shownId) return null;
    return new Set([shownId, ...(layout.neighbors.get(shownId) ?? [])]);
  }, [shownId, layout]);

  // Grade de pontos quase apagada, no espaço do mapa (referência ao arrastar e aproximar).
  const grid = useMemo(() => {
    const points = [];
    const step = 48;
    for (let x = Math.floor((minX - 300) / step) * step; x <= maxX + 300; x += step) {
      for (let y = Math.floor((minY - 300) / step) * step; y <= maxY + 300; y += step) points.push(vec(x, y));
    }
    return points;
  }, [minX, minY, maxX, maxY]);

  // Conexões em curva Bézier, agrupadas por camada (cada camada é um caminho só).
  const paths = useMemo(() => {
    const builders = { root: Skia.PathBuilder.Make(), branch: Skia.PathBuilder.Make(), leaf: Skia.PathBuilder.Make(), extra: Skia.PathBuilder.Make(), active: Skia.PathBuilder.Make() };
    for (const edge of layout.edges) {
      const a = layout.byId.get(edge.source);
      const b = layout.byId.get(edge.target);
      if (!a || !b) continue;
      const start = edgePoint(a, b.x, b.y);
      const end = edgePoint(b, a.x, a.y);
      const isActive = !!shownId && (edge.source === shownId || edge.target === shownId);
      const layer = isActive ? builders.active : edge.secondary || edge.kind === "mencao" ? builders.extra : edge.kind === "raiz" ? builders.root : edge.kind === "imagem" ? builders.leaf : builders.branch;
      layer.moveTo(start.x, start.y);
      if (edge.kind === "imagem") {
        layer.lineTo(end.x, end.y);
      } else {
        // Curva suave: os controles seguem a direção radial de cada ponta.
        const pull = Math.hypot(end.x - start.x, end.y - start.y) * 0.42;
        const aa = a.kind === "ambiente" ? Math.atan2(b.y, b.x) : a.angle;
        const ba = b.angle;
        layer.cubicTo(start.x + Math.cos(aa) * pull, start.y + Math.sin(aa) * pull, end.x - Math.cos(ba) * pull, end.y - Math.sin(ba) * pull, end.x, end.y);
      }
    }
    return { root: builders.root.detach(), branch: builders.branch.detach(), leaf: builders.leaf.detach(), extra: builders.extra.detach(), active: builders.active.detach() };
  }, [layout, shownId]);

  const shown = shownId ? layout.byId.get(shownId) : undefined;
  const fonts = { labelFont, smallFont, folderFont, hubFont };
  const hubSubtitle = useMemo(
    () => `${layout.nodes.filter((n) => n.kind === "pasta").length} pastas · ${layout.nodes.filter((n) => n.kind === "pensamento").length} pensamentos`,
    [layout],
  );

  return (
    <View style={{ width, height }}>
      <MapBackdrop width={width} height={height} active={ambient} />
      <GestureDetector gesture={gesture}>
        <Canvas style={{ width, height }}>
          <Group transform={transform}>
            <Points points={grid} mode="points" strokeWidth={1.3} strokeCap="round" color="rgba(165,139,247,0.08)" />

            {/* Conexões: um traço fino por tipo. Recuam quando um nó está em foco. */}
            <Group opacity={dimmed}>
              <Path path={paths.root} style="stroke" strokeWidth={1.1} color={colors.violet500} opacity={0.5} />
              <Path path={paths.branch} style="stroke" strokeWidth={0.9} color={colors.violet600} opacity={0.55} />
              <Path path={paths.leaf} style="stroke" strokeWidth={0.8} color={colors.lineStrong} opacity={0.9} />
              <Path path={paths.extra} style="stroke" strokeWidth={0.8} color={colors.violet600} opacity={0.45}>
                <DashPathEffect intervals={[3, 4]} />
              </Path>
            </Group>

            {/* Relações do nó em foco: acendem, mais claras e um pouco mais grossas. */}
            <Group opacity={focus}>
              <Path path={paths.active} style="stroke" strokeWidth={1.4} color={colors.violet300} opacity={0.9} />
            </Group>

            {layout.nodes.map((node) => (
              <MapNodeShape
                key={node.id}
                node={node}
                opacity={highlighted && !highlighted.has(node.id) ? dimmed : 1}
                selected={node.id === selectedId}
                fonts={fonts}
                labelOpacity={labelOpacity}
                subtitle={node.kind === "ambiente" ? hubSubtitle : undefined}
              />
            ))}

            {/* Nó em foco por cima: cresce um pouco, sem balanço, e ganha um anel fino. */}
            {shown ? (
              <Group>
                <SelectionRing node={shown} pop={pop} />
                <Popped node={shown} pop={pop}>
                  <MapNodeShape node={shown} opacity={1} selected fonts={fonts} labelOpacity={labelOpacity} subtitle={shown.kind === "ambiente" ? hubSubtitle : undefined} />
                </Popped>
              </Group>
            ) : null}

            <Circle cx={rippleX} cy={rippleY} r={rippleR} style="stroke" strokeWidth={1.2} color={colors.violet300} opacity={rippleOpacity} />
          </Group>
        </Canvas>
      </GestureDetector>
    </View>
  );
});

/**
 * Fundo do mapa: dois roxos escuros que se alternam muito devagar (ciclo de ~40 s, variação
 * pequena), fora do canvas. Só opacidade anima (compositor); para fora de foco e com
 * "reduzir movimento".
 */
function MapBackdrop({ width, height, active }: { width: number; height: number; active: boolean }) {
  const mix = useSharedValue(0.5);
  useEffect(() => {
    if (!active) {
      cancelAnimation(mix);
      return;
    }
    mix.value = withRepeat(withTiming(mix.value < 0.5 ? 1 : 0, { duration: 20000, easing: easing.breathe }), -1, true);
    return () => cancelAnimation(mix);
  }, [active, mix]);
  const a = useAnimatedStyle(() => ({ opacity: 0.5 - mix.value * 0.18 }));
  const b = useAnimatedStyle(() => ({ opacity: 0.22 + mix.value * 0.2 }));
  const size = Math.max(width, height) * 1.2;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, overflow: "hidden" }]}>
      <Animated.View style={[{ position: "absolute", left: -size * 0.35, top: -size * 0.4 }, a]}>
        <RadialGlow size={size} color="#2B1760" opacity={0.6} />
      </Animated.View>
      <Animated.View style={[{ position: "absolute", left: width - size * 0.6, top: height - size * 0.55 }, b]}>
        <RadialGlow size={size} color="#1E1248" opacity={0.7} />
      </Animated.View>
    </View>
  );
}

/** Escala do nó selecionado em torno do próprio centro (curta, sem rebote). */
function Popped({ node, pop, children }: { node: LaidOutNode; pop: SharedValue<number>; children: ReactNode }) {
  const transform = useDerivedValue(() => [{ scale: 1 + pop.value * 0.06 }]);
  return (
    <Group origin={vec(node.x, node.y)} transform={transform}>
      {children}
    </Group>
  );
}

function SelectionRing({ node, pop }: { node: LaidOutNode; pop: SharedValue<number> }) {
  const extent = node.kind === "imagem" ? node.r * 1.5 : node.r;
  const r = useDerivedValue(() => (extent + 4 + pop.value * 2) * (1 + pop.value * 0.06));
  const opacity = useDerivedValue(() => pop.value * 0.85);
  return <Circle cx={node.x} cy={node.y} r={r} style="stroke" strokeWidth={1.2} color={colors.violet200} opacity={opacity} />;
}

type Fonts = { labelFont: SkFont | null; smallFont: SkFont | null; folderFont: SkFont | null; hubFont: SkFont | null };
type NodeOf<K extends LaidOutNode["kind"]> = Extract<LaidOutNode, { kind: K }>;
type NodeProps<N extends LaidOutNode = LaidOutNode> = { node: N; opacity: number | SharedValue<number>; selected: boolean; fonts: Fonts; labelOpacity: SharedValue<number>; subtitle?: string };

function MapNodeShape(props: NodeProps) {
  switch (props.node.kind) {
    case "ambiente":
      return <HubNode {...props} node={props.node} />;
    case "pasta":
      return <FolderNode {...props} node={props.node} />;
    case "imagem":
      return <ImageNode {...props} node={props.node} />;
    default:
      return <ThoughtNode {...props} node={props.node} />;
  }
}

const centered = (font: SkFont | null, text: string) => (font ? font.measureText(text).width / 2 : 0);

/** Centro: o ambiente, com a cor dele só no tom do fundo e na borda; nome embaixo. */
function HubNode({ node, opacity, selected, fonts, subtitle }: NodeProps<NodeOf<"ambiente">>) {
  const name = truncate(node.label, 22);
  const accent = readableAccent(node.color);
  return (
    <Group opacity={opacity}>
      <Circle cx={node.x} cy={node.y} r={node.r} color={colors.surfaceRaised} />
      <Circle cx={node.x} cy={node.y} r={node.r} color={rgba(node.color, 0.14)} />
      <Circle cx={node.x} cy={node.y} r={node.r} style="stroke" strokeWidth={selected ? 1.8 : 1.4} color={accent} opacity={0.85} />
      <NodeIcon name={node.icon} x={node.x} y={node.y} size={26} color={accent} />
      {fonts.hubFont ? <Text x={node.x - centered(fonts.hubFont, name)} y={node.y + node.r + 21} text={name} font={fonts.hubFont} color={colors.text} /> : null}
      {subtitle && fonts.smallFont ? <Text x={node.x - centered(fonts.smallFont, subtitle)} y={node.y + node.r + 37} text={subtitle} font={fonts.smallFont} color={colors.faint} /> : null}
    </Group>
  );
}

/** Pasta: a cor da pasta identifica (tom de fundo, borda e ícone), sem brilho. */
function FolderNode({ node, opacity, selected, fonts }: NodeProps<NodeOf<"pasta">>) {
  const name = truncate(node.label, 22);
  const conn = `${node.degree} ${node.degree === 1 ? "conexão" : "conexões"}`;
  const accent = readableAccent(node.color);
  return (
    <Group opacity={opacity}>
      <Circle cx={node.x} cy={node.y} r={node.r} color={colors.surface} />
      <Circle cx={node.x} cy={node.y} r={node.r} color={rgba(node.color, 0.16)} />
      <Circle cx={node.x} cy={node.y} r={node.r} style="stroke" strokeWidth={selected ? 1.6 : 1.2} color={accent} opacity={0.85} />
      <NodeIcon name="folder" x={node.x} y={node.y} size={18} color={accent} />
      {fonts.folderFont ? <Text x={node.x - centered(fonts.folderFont, name)} y={node.y + node.r + 18} text={name} font={fonts.folderFont} color={colors.text} /> : null}
      {fonts.smallFont ? <Text x={node.x - centered(fonts.smallFont, conn)} y={node.y + node.r + 32} text={conn} font={fonts.smallFont} color={colors.faint} /> : null}
    </Group>
  );
}

function ImageNode({ node, opacity, selected }: NodeProps<NodeOf<"imagem">>) {
  const s = node.r * 2;
  return (
    <Group opacity={opacity}>
      <RoundedRect x={node.x - s / 2} y={node.y - s / 2} width={s} height={s} r={2.5} color={colors.surface} />
      <RoundedRect x={node.x - s / 2} y={node.y - s / 2} width={s} height={s} r={2.5} style="stroke" strokeWidth={1} color={selected ? colors.violet200 : colors.faint} />
    </Group>
  );
}

/**
 * Pensamento: nó pequeno e neutro; o ícone diz o tipo (publicado, rascunho, privado) e o
 * rascunho ganha borda tracejada âmbar. Rótulo ao lado, para fora do centro.
 */
function ThoughtNode({ node, opacity, selected, fonts, labelOpacity }: NodeProps<NodeOf<"pensamento">>) {
  const label = truncate(node.label, 28);
  const width = fonts.labelFont?.measureText(label).width ?? 0;
  const outward = Math.cos(node.angle) >= 0;
  const lx = outward ? node.x + node.r + 7 : node.x - node.r - 7 - width;
  const stroke = node.draft ? colors.warning : selected ? colors.violet200 : colors.violet400;
  const icon = node.draft ? "edit" : node.private ? "lock" : "doc";
  return (
    <Group opacity={opacity}>
      <Circle cx={node.x} cy={node.y} r={node.r} color={colors.surfaceRaised} />
      <Circle cx={node.x} cy={node.y} r={node.r} style="stroke" strokeWidth={selected ? 1.4 : 1} color={stroke} opacity={0.9}>
        {node.draft ? <DashPathEffect intervals={[2.5, 2]} /> : null}
      </Circle>
      <NodeIcon name={icon} x={node.x} y={node.y} size={11} color={node.draft ? colors.warning : colors.violet200} weight={1.8} />
      {fonts.labelFont ? (
        <Group opacity={selected ? 1 : labelOpacity}>
          <Text x={lx} y={node.y + 4} text={label} font={fonts.labelFont} color={selected ? colors.violet200 : colors.muted} />
        </Group>
      ) : null}
    </Group>
  );
}
