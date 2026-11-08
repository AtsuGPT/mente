import { forwardRef, useEffect, useImperativeHandle, useMemo, useState, type ReactNode } from "react";
import {
  Canvas,
  Circle,
  DashPathEffect,
  FontHinting,
  Group,
  Path,
  Points,
  RadialGradient,
  Rect,
  RoundedRect,
  Skia,
  Text,
  useFont,
  vec,
  type SkFont,
  type SkPath,
} from "@shopify/react-native-skia";
import { GestureDetector, useCompetingGestures, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from "react-native-gesture-handler";
import {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  interpolateColor,
  ReduceMotion,
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
import { hitTest, type LaidOutNode, type Layout } from "@/lib/graph-layout";
import { duration, easing, spring } from "@/theme/motion";
import { colors } from "@/theme/tokens";

/**
 * Mapa de conhecimento desenhado com Skia. Arrastar move (com inércia ao soltar, dentro de
 * limites), pinça aproxima em torno dos dedos, um toque seleciona. Caminhos, ícones e
 * posições são calculados uma vez; durante os gestos só a transformação do grupo muda (no
 * thread de interface, via Reanimated).
 *
 * Profundidade em camadas: (1) fundo em tela, com manchas de luz em degradê radial que
 * derivam devagar e alternam o tom de roxo; (2) partículas com paralaxe (andam a meia
 * velocidade); (3) grade, conexões e nós no espaço do mapa.
 *
 * Desempenho: nenhum BlurMask é redesenhado a cada quadro (os brilhos são degradês radiais,
 * muito mais baratos); só as conexões do nó em foco recebem fluxo de luz intenso; o relógio
 * ambiente para fora de foco e com "reduzir movimento"; com muitos nós a oscilação dos
 * pensamentos é desligada.
 */

export type KnowledgeMapHandle = { focus: (id: string) => void; fit: () => void; zoomBy: (factor: number) => void };

const MIN_SCALE = 0.2;
const MAX_SCALE = 3.5;
/** Quanto do conteúdo precisa continuar visível nas bordas ao arrastar (px). */
const EDGE = 72;
/** Acima disto, os pensamentos param de oscilar (centenas de transformações por quadro). */
const DRIFT_LIMIT = 220;
const TAU = Math.PI * 2;

const fontMedium = require("@expo-google-fonts/instrument-sans/500Medium/InstrumentSans_500Medium.ttf");
const fontSemibold = require("@expo-google-fonts/instrument-sans/600SemiBold/InstrumentSans_600SemiBold.ttf");

/** Ícones (viewBox 24, traço) desenhados dentro dos nós. */
const ICON_PATHS: Record<string, string> = {
  brain: "M9.5 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5.2A3 3 0 0 0 6.5 18a2.8 2.8 0 0 0 3 2.5V4.5ZM14.5 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5.2 3 3 0 0 1-2 5.3 2.8 2.8 0 0 1-3 2.5V4.5ZM9.5 9H8M9.5 14H7.5M14.5 9H16M14.5 14h2",
  book: "M12 6.5c-2-1.6-4.6-2-8-2v13c3.4 0 6 .4 8 2 2-1.6 4.6-2 8-2v-13c-3.4 0-6 .4-8 2Zm0 0v13",
  folder: "M3 6.5h7l2 2h9v9.8a1.7 1.7 0 0 1-1.7 1.7H4.7A1.7 1.7 0 0 1 3 18.3V6.5ZM3.5 10h17",
  bulb: "M9 17.5h6M10 20.5h4M12 3.5a6 6 0 0 0-3.5 10.9c.6.5 1 1.3 1 2.1h5c0-.8.4-1.6 1-2.1A6 6 0 0 0 12 3.5Z",
  users: "M5.8 8.5a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0-6.4 0M3.5 19c.8-3 2.9-4.6 5.5-4.6s4.7 1.6 5.5 4.6M15.5 5.6a3 3 0 0 1 0 5.8M17 14.6c1.8.5 3 1.9 3.5 4.4",
  sparkle: "M12 3.5 13.8 10 20.5 12l-6.7 2L12 20.5 10.2 14 3.5 12l6.7-2L12 3.5Z",
  map: "M3.6 7a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0-4.8 0M16 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0M9.2 17.5a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0-5.6 0M8.2 8.2 10.4 15M16.6 7.6l-3.4 7.6M8.4 6.8l7.6-.6",
  doc: "M7 3.5h7l4.5 4.5v12.5h-11.5V3.5ZM14 3.5V8h4.5M9.5 12.5h6M9.5 16h4",
  image: "M5.5 4.5h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2ZM20.5 16l-5-5-8 8.5",
};
const iconCache = new Map<string, SkPath | null>();
function iconPath(name: string) {
  if (!iconCache.has(name)) iconCache.set(name, Skia.Path.MakeFromSVGString(ICON_PATHS[name] ?? ICON_PATHS.brain));
  return iconCache.get(name) ?? null;
}

function NodeIcon({ name, x, y, size, color }: { name: string; x: number; y: number; size: number; color: string }) {
  const path = iconPath(name);
  if (!path) return null;
  const s = size / 24;
  return (
    <Group transform={[{ translateX: x - size / 2 }, { translateY: y - size / 2 }, { scale: s }]}>
      <Path path={path} style="stroke" strokeWidth={1.6} strokeCap="round" strokeJoin="round" color={color} />
    </Group>
  );
}

/** #RRGGBB → rgba(): degradês terminam na mesma cor transparente (sem franja cinza). */
function rgba(hex: string, alpha: number) {
  const h = /^#[0-9a-f]{6}$/i.test(hex) ? hex : colors.violet500;
  return `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${alpha})`;
}

/** Brilho suave ao redor de um ponto: degradê radial (barato), no lugar de um desfoque. */
function Glow({ x, y, r, color, strength, opacity }: { x: number; y: number; r: number; color: string; strength: number; opacity?: number | SharedValue<number> }) {
  const stops = useMemo(() => [rgba(color, strength), rgba(color, strength * 0.35), rgba(color, 0)], [color, strength]);
  return (
    <Circle cx={x} cy={y} r={r} opacity={opacity}>
      <RadialGradient c={vec(x, y)} r={r} colors={stops} positions={[0, 0.45, 1]} />
    </Circle>
  );
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

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fase estável por id (cada nó respira no seu tempo). */
function phaseOf(seed: string) {
  return ([...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) / 997) * TAU;
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
  /** Tela em foco e app em primeiro plano: sem isso o movimento ambiente para. */
  active?: boolean;
};

export const KnowledgeMap = forwardRef<KnowledgeMapHandle, Props>(function KnowledgeMap({ layout, width, height, selectedId, onSelect, bottomInset = 0, active = true }, ref) {
  const labelFont = useMapFont(fontMedium, 11);
  const smallFont = useMapFont(fontMedium, 10);
  const folderFont = useMapFont(fontSemibold, 13.5);
  const hubFont = useMapFont(fontSemibold, 14);

  const fitScale = useMemo(() => {
    const { minX, minY, maxX, maxY } = layout.bounds;
    const s = Math.min((width - 24) / Math.max(1, maxX - minX), (height - 60) / Math.max(1, maxY - minY));
    return Math.min(1.1, Math.max(MIN_SCALE, s));
  }, [layout, width, height]);

  const scale = useSharedValue(fitScale);
  const tx = useSharedValue(width / 2);
  const ty = useSharedValue(height / 2);

  const transform = useDerivedValue(() => [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }]);
  // Camada distante: anda a meia velocidade e aproxima menos (paralaxe).
  const farTransform = useDerivedValue(() => [
    { translateX: width / 2 + (tx.value - width / 2) * 0.5 },
    { translateY: height / 2 + (ty.value - height / 2) * 0.5 },
    { scale: 0.5 + scale.value * 0.5 },
  ]);

  // Movimento ambiente: um relógio de 0 a 1 em laço (12 s). Pausa sem salto fora de foco.
  const reduceMotion = useReducedMotion();
  const ambient = active && !reduceMotion;
  const clock = useSharedValue(0);
  useEffect(() => {
    if (!ambient) {
      cancelAnimation(clock);
      return;
    }
    const from = clock.value;
    // Continua de onde parou: o primeiro trecho completa o ciclo, depois repete do zero.
    clock.value = withTiming(1, { duration: (1 - from) * 12000, easing: Easing.linear }, (finished) => {
      if (finished) {
        clock.value = 0;
        clock.value = withRepeat(withTiming(1, { duration: 12000, easing: Easing.linear }), -1, false);
      }
    });
    return () => cancelAnimation(clock);
  }, [clock, ambient]);

  const hubPulse = useDerivedValue(() => 0.75 + Math.sin(clock.value * TAU * 3) * 0.2);
  // Rótulos dos pensamentos surgem ao aproximar; os das pastas e do centro ficam sempre.
  const labelOpacity = useDerivedValue(() => interpolate(scale.value, [0.45, 0.75], [0, 1], Extrapolation.CLAMP));

  // Fundo: duas manchas de luz que derivam e trocam de tom devagar.
  const blobA = useDerivedValue(() => ({ x: width * (0.28 + 0.07 * Math.sin(clock.value * TAU)), y: height * (0.3 + 0.06 * Math.cos(clock.value * TAU)) }));
  const blobB = useDerivedValue(() => ({ x: width * (0.74 + 0.06 * Math.cos(clock.value * TAU + 1.3)), y: height * (0.72 + 0.07 * Math.sin(clock.value * TAU + 1.3)) }));
  const blobAColors = useDerivedValue(() => [interpolateColor(0.5 + 0.5 * Math.sin(clock.value * TAU * 2), [0, 1], ["rgba(91,58,174,0.24)", "rgba(67,42,128,0.16)"]), "rgba(67,42,128,0)"]);
  const blobBColors = useDerivedValue(() => [interpolateColor(0.5 + 0.5 * Math.cos(clock.value * TAU * 2), [0, 1], ["rgba(44,28,85,0.3)", "rgba(124,92,224,0.14)"]), "rgba(44,28,85,0)"]);
  const blobRadius = Math.max(width, height) * 0.62;

  // Gestos: um leve realce das partículas enquanto se arrasta ou aproxima (sinal de resposta).
  const gesturing = useSharedValue(0);
  const particleOpacity = useDerivedValue(() => 0.5 + gesturing.value * 0.3);

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
    fit: () => animateTo(fitScale, 0, 0),
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
    onActivate: () => {
      "worklet";
      gesturing.value = withTiming(1, { duration: duration.micro });
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
    onFinalize: () => {
      "worklet";
      gesturing.value = withTiming(0, { duration: duration.medium });
    },
  });

  const pinch = usePinchGesture({
    onBegin: () => {
      "worklet";
      stopCamera();
      gesturing.value = withTiming(1, { duration: duration.micro });
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
    onFinalize: () => {
      "worklet";
      gesturing.value = withTiming(0, { duration: duration.medium });
    },
  });

  // Onda curta no ponto tocado: confirma o toque antes de o painel abrir.
  const ripple = useSharedValue(1);
  const rippleX = useSharedValue(0);
  const rippleY = useSharedValue(0);
  const rippleR = useDerivedValue(() => (8 + ripple.value * 26) / scale.value);
  const rippleOpacity = useDerivedValue(() => (1 - ripple.value) * 0.55);

  const tap = useTapGesture({
    runOnJS: true,
    maxDistance: 10,
    onActivate: (event) => {
      const worldX = (event.x - tx.value) / scale.value;
      const worldY = (event.y - ty.value) / scale.value;
      rippleX.value = worldX;
      rippleY.value = worldY;
      ripple.value = 0;
      ripple.value = withTiming(1, { duration: 520, easing: easing.decelerate, reduceMotion: ReduceMotion.System });
      const hit = hitTest(layout, worldX, worldY, 16 / scale.value);
      onSelect(hit?.id ?? null);
    },
  });

  const gesture = useCompetingGestures(useSimultaneousGestures(pan, pinch), tap);

  // Foco progressivo: o resto do mapa esmaece em ~260 ms; ao desmarcar, o destaque some
  // junto com o esmaecimento (o nó continua destacado até o fim, sem corte).
  const [shownId, setShownId] = useState<string | null>(selectedId);
  const focus = useSharedValue(selectedId ? 1 : 0);
  const pop = useSharedValue(selectedId ? 1 : 0);
  useEffect(() => {
    if (selectedId) {
      setShownId(selectedId);
      focus.value = withTiming(1, { duration: duration.medium, easing: easing.standard, reduceMotion: ReduceMotion.System });
      pop.value = 0;
      pop.value = withSpring(1, spring.pop);
      return;
    }
    pop.value = withTiming(0, { duration: duration.short, easing: easing.accelerate, reduceMotion: ReduceMotion.System });
    focus.value = withTiming(0, { duration: duration.medium, easing: easing.standard, reduceMotion: ReduceMotion.System }, (finished) => {
      if (finished) scheduleOnRN(setShownId, null);
    });
  }, [selectedId, focus, pop]);
  const dimmed = useDerivedValue(() => 1 - focus.value * 0.82);
  const activeFlow = useDerivedValue(() => -clock.value * 520);
  const ambientFlow = useDerivedValue(() => -clock.value * 264);

  const highlighted = useMemo(() => {
    if (!shownId) return null;
    return new Set([shownId, ...(layout.neighbors.get(shownId) ?? [])]);
  }, [shownId, layout]);

  // Fundo: grade de pontos (espaço do mapa) e partículas (camada distante).
  const backdrop = useMemo(() => {
    const grid = [];
    const step = 42;
    for (let x = Math.floor((minX - 300) / step) * step; x <= maxX + 300; x += step) {
      for (let y = Math.floor((minY - 300) / step) * step; y <= maxY + 300; y += step) grid.push(vec(x, y));
    }
    const random = mulberry32(7331);
    const particles = Array.from({ length: 70 }, () => vec(minX - 200 + random() * (maxX - minX + 400), minY - 200 + random() * (maxY - minY + 400)));
    return { grid, particles };
  }, [minX, minY, maxX, maxY]);

  // Conexões em curva Bézier, agrupadas por camada (cada camada é um caminho só).
  const paths = useMemo(() => {
    const builders = { root: Skia.PathBuilder.Make(), branch: Skia.PathBuilder.Make(), leaf: Skia.PathBuilder.Make(), extra: Skia.PathBuilder.Make(), active: Skia.PathBuilder.Make() };
    const dots: ReturnType<typeof vec>[] = [];
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
      if (edge.kind !== "imagem") dots.push(vec(start.x, start.y), vec(end.x, end.y));
    }
    return { root: builders.root.detach(), branch: builders.branch.detach(), leaf: builders.leaf.detach(), extra: builders.extra.detach(), active: builders.active.detach(), dots };
  }, [layout, shownId]);

  const hub = layout.byId.get(layout.hubId);
  const shown = shownId ? layout.byId.get(shownId) : undefined;
  const crowded = layout.nodes.length > DRIFT_LIMIT;
  const fonts = { labelFont, smallFont, folderFont, hubFont };
  const hubSubtitle = useMemo(
    () => `${layout.nodes.filter((n) => n.kind === "pasta").length} pastas · ${layout.nodes.filter((n) => n.kind === "pensamento").length} pensamentos`,
    [layout],
  );
  const driftOf = (node: LaidOutNode) => (!ambient || node.kind === "ambiente" ? 0 : node.kind === "pasta" ? 1.1 : crowded ? 0 : 1.8);

  return (
    <GestureDetector gesture={gesture}>
      <Canvas style={{ width, height, backgroundColor: colors.bg }}>
        {/* (1) Fundo em tela: manchas de luz em degradê, sem desfoque */}
        <Rect x={0} y={0} width={width} height={height}>
          <RadialGradient c={blobA} r={blobRadius} colors={blobAColors} />
        </Rect>
        <Rect x={0} y={0} width={width} height={height}>
          <RadialGradient c={blobB} r={blobRadius * 0.85} colors={blobBColors} />
        </Rect>

        {/* (2) Partículas distantes, com paralaxe */}
        <Group transform={farTransform}>
          <Points points={backdrop.particles} mode="points" strokeWidth={2.2} strokeCap="round" color={colors.violet800} opacity={particleOpacity} />
        </Group>

        {/* (3) Espaço do mapa */}
        <Group transform={transform}>
          <Points points={backdrop.grid} mode="points" strokeWidth={1.6} strokeCap="round" color={colors.line} />

          {hub ? <Glow x={hub.x} y={hub.y} r={hub.r * 3.4} color={colors.violet600} strength={0.32} opacity={hubPulse} /> : null}

          {/* Conexões: halo largo e translúcido + traço fino por cima. Esmaecem no foco. */}
          <Group opacity={dimmed}>
            <Path path={paths.root} style="stroke" strokeWidth={7} color={colors.violet500} opacity={0.07} />
            <Path path={paths.root} style="stroke" strokeWidth={3.4} color={colors.violet500} opacity={0.12} />
            <Path path={paths.root} style="stroke" strokeWidth={1.6} color={colors.violet400} opacity={0.85} />
            <Path path={paths.branch} style="stroke" strokeWidth={4} color={colors.violet600} opacity={0.1} />
            <Path path={paths.branch} style="stroke" strokeWidth={1.1} color={colors.violet500} opacity={0.72} />
            <Path path={paths.leaf} style="stroke" strokeWidth={0.9} color={colors.violet700} opacity={0.8} />
            <Path path={paths.extra} style="stroke" strokeWidth={0.9} color={colors.violet600} opacity={0.42}>
              <DashPathEffect intervals={[4, 4]} />
            </Path>
            <Points points={paths.dots} mode="points" strokeWidth={4.5} strokeCap="round" color={colors.violet400} />
            {/* Luz discreta percorrendo só os ramos principais */}
            {ambient ? (
              <Path path={paths.root} style="stroke" strokeWidth={2.6} strokeCap="round" color={colors.violet200} opacity={0.32}>
                <DashPathEffect intervals={[10, 122]} phase={ambientFlow} />
              </Path>
            ) : null}
          </Group>

          {/* Conexões do nó em foco: acendem e ganham fluxo de luz */}
          <Group opacity={focus}>
            <Path path={paths.active} style="stroke" strokeWidth={7} color={colors.violet400} opacity={0.14} />
            <Path path={paths.active} style="stroke" strokeWidth={1.8} color={colors.violet200} />
            {ambient ? (
              <Path path={paths.active} style="stroke" strokeWidth={3} strokeCap="round" color="#FFFFFF" opacity={0.55}>
                <DashPathEffect intervals={[6, 34]} phase={activeFlow} />
              </Path>
            ) : null}
          </Group>

          {layout.nodes.map((node) => (
            <Drift key={node.id} clock={clock} seed={node.id} amplitude={driftOf(node)}>
              <MapNodeShape
                node={node}
                opacity={highlighted && !highlighted.has(node.id) ? dimmed : 1}
                selected={node.id === selectedId}
                fonts={fonts}
                labelOpacity={labelOpacity}
                clock={clock}
                subtitle={node.kind === "ambiente" ? hubSubtitle : undefined}
              />
            </Drift>
          ))}

          {/* Nó em foco por cima: cresce com mola e ganha um halo que respira */}
          {shown ? (
            <Drift clock={clock} seed={shown.id} amplitude={driftOf(shown)}>
              <SelectionHalo node={shown} pop={pop} clock={clock} />
              <Popped node={shown} pop={pop}>
                <MapNodeShape node={shown} opacity={1} selected fonts={fonts} labelOpacity={labelOpacity} clock={clock} subtitle={shown.kind === "ambiente" ? hubSubtitle : undefined} />
              </Popped>
            </Drift>
          ) : null}

          <Circle cx={rippleX} cy={rippleY} r={rippleR} style="stroke" strokeWidth={1.4} color={colors.violet300} opacity={rippleOpacity} />
        </Group>
      </Canvas>
    </GestureDetector>
  );
});

/** Oscilação suave de um nó (fase própria por id), calculada no thread de interface. */
function Drift({ clock, seed, amplitude, children }: { clock: SharedValue<number>; seed: string; amplitude: number; children: ReactNode }) {
  const phase = useMemo(() => phaseOf(seed), [seed]);
  const transform = useDerivedValue(() => {
    const t = clock.value * TAU;
    return [{ translateX: Math.sin(t + phase) * amplitude }, { translateY: Math.cos(t * 2 + phase) * amplitude * 0.8 }];
  });
  if (!amplitude) return <>{children}</>;
  return <Group transform={transform}>{children}</Group>;
}

/** Escala do nó selecionado em torno do próprio centro. */
function Popped({ node, pop, children }: { node: LaidOutNode; pop: SharedValue<number>; children: ReactNode }) {
  const transform = useDerivedValue(() => [{ scale: 1 + pop.value * 0.09 }]);
  return (
    <Group origin={vec(node.x, node.y)} transform={transform}>
      {children}
    </Group>
  );
}

function SelectionHalo({ node, pop, clock }: { node: LaidOutNode; pop: SharedValue<number>; clock: SharedValue<number> }) {
  const extent = node.kind === "imagem" ? node.r * 1.5 : node.r;
  const r = useDerivedValue(() => extent + 6 + pop.value * 3 + Math.sin(clock.value * TAU * 4) * 1.2);
  const ring = useDerivedValue(() => pop.value * (0.7 + 0.3 * Math.sin(clock.value * TAU * 4)));
  return (
    <Group>
      <Glow x={node.x} y={node.y} r={extent * 2.6} color={node.kind === "pasta" ? node.color : colors.violet400} strength={0.4} opacity={pop} />
      <Circle cx={node.x} cy={node.y} r={r} style="stroke" strokeWidth={1.4} color={colors.violet300} opacity={ring} />
    </Group>
  );
}

type Fonts = { labelFont: SkFont | null; smallFont: SkFont | null; folderFont: SkFont | null; hubFont: SkFont | null };
type NodeOf<K extends LaidOutNode["kind"]> = Extract<LaidOutNode, { kind: K }>;
type NodeProps<N extends LaidOutNode = LaidOutNode> = { node: N; opacity: number | SharedValue<number>; selected: boolean; fonts: Fonts; labelOpacity: SharedValue<number>; clock: SharedValue<number>; subtitle?: string };

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

function HubNode({ node, opacity, selected, fonts, subtitle }: NodeProps<NodeOf<"ambiente">>) {
  const name = truncate(node.label, 16);
  return (
    <Group opacity={opacity}>
      <Glow x={node.x} y={node.y} r={node.r + 34} color={colors.violet500} strength={selected ? 0.5 : 0.34} />
      <Circle cx={node.x} cy={node.y} r={node.r} color={colors.violet950} />
      <Circle cx={node.x} cy={node.y} r={node.r} style="stroke" strokeWidth={2.4} color={colors.violet400} />
      <Circle cx={node.x} cy={node.y} r={node.r - 7} style="stroke" strokeWidth={1} color={colors.violet800} />
      <NodeIcon name={node.icon} x={node.x} y={node.y - 12} size={30} color={colors.violet200} />
      {fonts.hubFont ? <Text x={node.x - centered(fonts.hubFont, name)} y={node.y + 20} text={name} font={fonts.hubFont} color={colors.text} /> : null}
      {subtitle && fonts.smallFont ? <Text x={node.x - centered(fonts.smallFont, subtitle)} y={node.y + node.r + 20} text={subtitle} font={fonts.smallFont} color={colors.muted} /> : null}
    </Group>
  );
}

function FolderNode({ node, opacity, selected, fonts, clock }: NodeProps<NodeOf<"pasta">>) {
  const name = truncate(node.label, 22);
  const conn = `${node.degree} ${node.degree === 1 ? "conexão" : "conexões"}`;
  const accent = readableAccent(node.color);
  // Pastas respiram de leve, cada uma no seu tempo.
  const phase = useMemo(() => phaseOf(node.id), [node.id]);
  const breathe = useDerivedValue(() => 0.75 + 0.25 * Math.sin(clock.value * TAU * 2 + phase));
  return (
    <Group opacity={opacity}>
      <Glow x={node.x} y={node.y} r={node.r + 22} color={node.color} strength={selected ? 0.55 : 0.3} opacity={breathe} />
      <Circle cx={node.x} cy={node.y} r={node.r} color={colors.surface} />
      <Circle cx={node.x} cy={node.y} r={node.r} style="stroke" strokeWidth={selected ? 2.6 : 1.8} color={node.color} />
      <NodeIcon name="folder" x={node.x} y={node.y} size={24} color={accent} />
      {fonts.folderFont ? <Text x={node.x - centered(fonts.folderFont, name)} y={node.y + node.r + 19} text={name} font={fonts.folderFont} color={colors.text} /> : null}
      {fonts.smallFont ? <Text x={node.x - centered(fonts.smallFont, conn)} y={node.y + node.r + 33} text={conn} font={fonts.smallFont} color={colors.muted} /> : null}
    </Group>
  );
}

function ImageNode({ node, opacity, selected }: NodeProps<NodeOf<"imagem">>) {
  const s = node.r * 2;
  return (
    <Group opacity={opacity}>
      {selected ? <Glow x={node.x} y={node.y} r={s} color={colors.violet400} strength={0.4} /> : null}
      <RoundedRect x={node.x - s / 2} y={node.y - s / 2} width={s} height={s} r={3} color={colors.bg} />
      <RoundedRect x={node.x - s / 2} y={node.y - s / 2} width={s} height={s} r={3} style="stroke" strokeWidth={1.1} color={selected ? colors.violet200 : colors.muted} />
    </Group>
  );
}

// Pensamento: rótulo ao lado, para fora do centro.
function ThoughtNode({ node, opacity, selected, fonts, labelOpacity }: NodeProps<NodeOf<"pensamento">>) {
  const label = truncate(node.label, 28);
  const width = fonts.labelFont?.measureText(label).width ?? 0;
  const outward = Math.cos(node.angle) >= 0;
  const lx = outward ? node.x + node.r + 7 : node.x - node.r - 7 - width;
  const stroke = node.draft ? colors.warning : selected ? colors.violet200 : colors.violet500;
  return (
    <Group opacity={opacity}>
      <Glow x={node.x} y={node.y} r={node.r + 10} color={colors.violet500} strength={selected ? 0.5 : 0.16} />
      <Circle cx={node.x} cy={node.y} r={node.r} color={colors.surfaceRaised} />
      <Circle cx={node.x} cy={node.y} r={node.r} style="stroke" strokeWidth={selected ? 2 : 1.3} color={stroke}>
        {node.draft ? <DashPathEffect intervals={[3, 2.5]} /> : null}
      </Circle>
      <NodeIcon name="doc" x={node.x} y={node.y} size={13} color={node.private ? colors.violet200 : colors.violet300} />
      {fonts.labelFont ? (
        <Group opacity={selected ? 1 : labelOpacity}>
          <Text x={lx} y={node.y + 4} text={label} font={fonts.labelFont} color={selected ? colors.violet200 : colors.muted} />
        </Group>
      ) : null}
    </Group>
  );
}
