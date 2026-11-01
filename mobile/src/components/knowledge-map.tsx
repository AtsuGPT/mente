import { forwardRef, useEffect, useImperativeHandle, useMemo, type ReactNode } from "react";
import {
  BlurMask,
  Canvas,
  Circle,
  DashPathEffect,
  FontHinting,
  Group,
  Path,
  Points,
  RoundedRect,
  Skia,
  Text,
  useFont,
  vec,
  type SkFont,
  type SkPath,
} from "@shopify/react-native-skia";
import { GestureDetector, useCompetingGestures, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from "react-native-gesture-handler";
import { Easing, Extrapolation, interpolate, useDerivedValue, useReducedMotion, useSharedValue, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";
import { readableAccent } from "@shared/color";
import { hitTest, type LaidOutNode, type Layout } from "@/lib/graph-layout";
import { colors } from "@/theme/tokens";

/**
 * Mapa de conhecimento desenhado com Skia. Arrastar move, pinça aproxima em torno dos
 * dedos, um toque seleciona. Caminhos, ícones e posições são calculados uma vez; durante
 * os gestos só a transformação do grupo muda (no thread de interface, via Reanimated).
 */

export type KnowledgeMapHandle = { focus: (id: string) => void; fit: () => void; zoomBy: (factor: number) => void };

const MIN_SCALE = 0.2;
const MAX_SCALE = 3.5;

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
};

export const KnowledgeMap = forwardRef<KnowledgeMapHandle, Props>(function KnowledgeMap({ layout, width, height, selectedId, onSelect, bottomInset = 0 }, ref) {
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

  // Movimento ambiente: um relógio de 0 a 1 em laço (9 s). Os nós oscilam 1–2 px, a luz
  // percorre as conexões e o halo central pulsa. As posições de toque continuam fixas.
  const reduceMotion = useReducedMotion();
  const clock = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    clock.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.linear }), -1, false);
  }, [clock, reduceMotion]);
  const flow = useDerivedValue(() => -clock.value * 264);
  const hubPulse = useDerivedValue(() => 0.75 + Math.sin(clock.value * Math.PI * 4) * 0.2);
  // Rótulos dos pensamentos surgem ao aproximar; os das pastas e do centro ficam sempre.
  const labelOpacity = useDerivedValue(() => interpolate(scale.value, [0.45, 0.75], [0, 1], Extrapolation.CLAMP));

  const animateTo = (nextScale: number, worldX: number, worldY: number) => {
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
    scale.value = withTiming(s, { duration: 420 });
    tx.value = withTiming(width / 2 - worldX * s, { duration: 420 });
    ty.value = withTiming((height - bottomInset) / 2 - worldY * s, { duration: 420 });
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
    onUpdate: (event) => {
      "worklet";
      tx.value += event.changeX;
      ty.value += event.changeY;
    },
  });

  const pinch = usePinchGesture({
    onUpdate: (event) => {
      "worklet";
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.value * event.scaleChange));
      const k = next / scale.value;
      // Mantém fixo o ponto do mundo que está sob os dedos.
      tx.value = event.focalX - (event.focalX - tx.value) * k;
      ty.value = event.focalY - (event.focalY - ty.value) * k;
      scale.value = next;
    },
  });

  const tap = useTapGesture({
    runOnJS: true,
    maxDistance: 10,
    onActivate: (event) => {
      const worldX = (event.x - tx.value) / scale.value;
      const worldY = (event.y - ty.value) / scale.value;
      const hit = hitTest(layout, worldX, worldY, 16 / scale.value);
      onSelect(hit?.id ?? null);
    },
  });

  const gesture = useCompetingGestures(useSimultaneousGestures(pan, pinch), tap);

  const highlighted = useMemo(() => {
    if (!selectedId) return null;
    return new Set([selectedId, ...(layout.neighbors.get(selectedId) ?? [])]);
  }, [selectedId, layout]);

  // Fundo: grade de pontos e partículas no espaço do mapa (dão profundidade ao mover).
  const backdrop = useMemo(() => {
    const { minX, minY, maxX, maxY } = layout.bounds;
    const grid = [];
    const step = 42;
    for (let x = Math.floor((minX - 300) / step) * step; x <= maxX + 300; x += step) {
      for (let y = Math.floor((minY - 300) / step) * step; y <= maxY + 300; y += step) grid.push(vec(x, y));
    }
    const random = mulberry32(7331);
    const particles = Array.from({ length: 70 }, () => vec(minX - 200 + random() * (maxX - minX + 400), minY - 200 + random() * (maxY - minY + 400)));
    return { grid, particles };
  }, [layout]);

  // Conexões em curva, agrupadas por camada (cada camada é um caminho só).
  const paths = useMemo(() => {
    const builders = { root: Skia.PathBuilder.Make(), branch: Skia.PathBuilder.Make(), leaf: Skia.PathBuilder.Make(), extra: Skia.PathBuilder.Make(), active: Skia.PathBuilder.Make() };
    const dots: ReturnType<typeof vec>[] = [];
    for (const edge of layout.edges) {
      const a = layout.byId.get(edge.source);
      const b = layout.byId.get(edge.target);
      if (!a || !b) continue;
      const start = edgePoint(a, b.x, b.y);
      const end = edgePoint(b, a.x, a.y);
      const isActive = !!selectedId && (edge.source === selectedId || edge.target === selectedId);
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
  }, [layout, selectedId]);

  const dim = highlighted ? 0.18 : 1;
  const hub = layout.byId.get(layout.hubId);

  return (
    <GestureDetector gesture={gesture}>
      <Canvas style={{ width, height, backgroundColor: colors.bg }}>
        <Group transform={transform}>
          <Points points={backdrop.grid} mode="points" strokeWidth={1.6} strokeCap="round" color={colors.line} />
          <Points points={backdrop.particles} mode="points" strokeWidth={2.2} strokeCap="round" color={colors.violet800} opacity={0.7} />

          {/* Halo central de profundidade */}
          {hub ? (
            <Circle cx={hub.x} cy={hub.y} r={hub.r * 3.2} color={colors.violet950} opacity={hubPulse}>
              <BlurMask blur={60} style="normal" />
            </Circle>
          ) : null}

          {/* Conexões: brilho largo e desfocado + traço fino por cima */}
          <Group opacity={dim}>
            <Path path={paths.root} style="stroke" strokeWidth={7} color={colors.violet500} opacity={0.22}>
              <BlurMask blur={7} style="normal" />
            </Path>
            <Path path={paths.root} style="stroke" strokeWidth={1.6} color={colors.violet400} opacity={0.85} />
            <Path path={paths.branch} style="stroke" strokeWidth={5} color={colors.violet600} opacity={0.16}>
              <BlurMask blur={5} style="normal" />
            </Path>
            <Path path={paths.branch} style="stroke" strokeWidth={1.1} color={colors.violet500} opacity={0.75} />
            <Path path={paths.leaf} style="stroke" strokeWidth={0.9} color={colors.violet700} opacity={0.8} />
            <Path path={paths.extra} style="stroke" strokeWidth={0.9} color={colors.violet600} opacity={0.45}>
              <DashPathEffect intervals={[4, 4]} />
            </Path>
            <Points points={paths.dots} mode="points" strokeWidth={4.5} strokeCap="round" color={colors.violet400} />
            {/* Luz percorrendo as conexões principais */}
            {!reduceMotion ? (
              <>
                <Path path={paths.root} style="stroke" strokeWidth={3} strokeCap="round" color={colors.violet200} opacity={0.55}>
                  <DashPathEffect intervals={[10, 122]} phase={flow} />
                  <BlurMask blur={2} style="solid" />
                </Path>
                <Path path={paths.branch} style="stroke" strokeWidth={2.2} strokeCap="round" color={colors.violet300} opacity={0.4}>
                  <DashPathEffect intervals={[8, 124]} phase={flow} />
                </Path>
              </>
            ) : null}
          </Group>
          <Path path={paths.active} style="stroke" strokeWidth={8} color={colors.violet400} opacity={0.35}>
            <BlurMask blur={8} style="normal" />
          </Path>
          <Path path={paths.active} style="stroke" strokeWidth={1.8} color={colors.violet200} />

          {layout.nodes.map((node) => (
            <Drift key={node.id} clock={clock} seed={node.id} amplitude={reduceMotion || node.kind === "ambiente" ? 0 : node.kind === "pasta" ? 1.1 : 1.8}>
            <MapNodeShape
              node={node}
              opacity={highlighted && !highlighted.has(node.id) ? dim : 1}
              selected={node.id === selectedId}
              fonts={{ labelFont, smallFont, folderFont, hubFont }}
              labelOpacity={labelOpacity}
              subtitle={node.kind === "ambiente" ? `${layout.nodes.filter((n) => n.kind === "pasta").length} pastas · ${layout.nodes.filter((n) => n.kind === "pensamento").length} pensamentos` : undefined}
            />
            </Drift>
          ))}
        </Group>
      </Canvas>
    </GestureDetector>
  );
});

/** Oscilação suave de um nó (fase própria por id), calculada no thread de interface. */
function Drift({ clock, seed, amplitude, children }: { clock: SharedValue<number>; seed: string; amplitude: number; children: ReactNode }) {
  const phase = useMemo(() => [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) / 997 * Math.PI * 2, [seed]);
  const transform = useDerivedValue(() => {
    const t = clock.value * Math.PI * 2;
    return [{ translateX: Math.sin(t + phase) * amplitude }, { translateY: Math.cos(t * 2 + phase) * amplitude * 0.8 }];
  });
  if (!amplitude) return <>{children}</>;
  return <Group transform={transform}>{children}</Group>;
}

type Fonts = { labelFont: SkFont | null; smallFont: SkFont | null; folderFont: SkFont | null; hubFont: SkFont | null };

function MapNodeShape({ node, opacity, selected, fonts, labelOpacity, subtitle }: { node: LaidOutNode; opacity: number; selected: boolean; fonts: Fonts; labelOpacity: SharedValue<number>; subtitle?: string }) {
  const centered = (font: SkFont | null, text: string) => (font ? font.measureText(text).width / 2 : 0);

  if (node.kind === "ambiente") {
    const name = truncate(node.label, 16);
    return (
      <Group opacity={opacity}>
        <Circle cx={node.x} cy={node.y} r={node.r + 22} color={colors.violet500} opacity={selected ? 0.45 : 0.3}>
          <BlurMask blur={24} style="normal" />
        </Circle>
        <Circle cx={node.x} cy={node.y} r={node.r} color={colors.violet950} />
        <Circle cx={node.x} cy={node.y} r={node.r} style="stroke" strokeWidth={2.4} color={colors.violet400} />
        <Circle cx={node.x} cy={node.y} r={node.r - 7} style="stroke" strokeWidth={1} color={colors.violet800} />
        <NodeIcon name={node.icon} x={node.x} y={node.y - 12} size={30} color={colors.violet200} />
        {fonts.hubFont ? <Text x={node.x - centered(fonts.hubFont, name)} y={node.y + 20} text={name} font={fonts.hubFont} color={colors.text} /> : null}
        {subtitle && fonts.smallFont ? <Text x={node.x - centered(fonts.smallFont, subtitle)} y={node.y + node.r + 20} text={subtitle} font={fonts.smallFont} color={colors.muted} /> : null}
      </Group>
    );
  }

  if (node.kind === "pasta") {
    const name = truncate(node.label, 22);
    const conn = `${node.degree} ${node.degree === 1 ? "conexão" : "conexões"}`;
    const accent = readableAccent(node.color);
    return (
      <Group opacity={opacity}>
        <Circle cx={node.x} cy={node.y} r={node.r + 12} color={node.color} opacity={selected ? 0.5 : 0.22}>
          <BlurMask blur={14} style="normal" />
        </Circle>
        <Circle cx={node.x} cy={node.y} r={node.r} color={colors.surface} />
        <Circle cx={node.x} cy={node.y} r={node.r} style="stroke" strokeWidth={selected ? 2.6 : 1.8} color={node.color} />
        <NodeIcon name="folder" x={node.x} y={node.y} size={24} color={accent} />
        {fonts.folderFont ? <Text x={node.x - centered(fonts.folderFont, name)} y={node.y + node.r + 19} text={name} font={fonts.folderFont} color={colors.text} /> : null}
        {fonts.smallFont ? <Text x={node.x - centered(fonts.smallFont, conn)} y={node.y + node.r + 33} text={conn} font={fonts.smallFont} color={colors.muted} /> : null}
      </Group>
    );
  }

  if (node.kind === "imagem") {
    const s = node.r * 2;
    return (
      <Group opacity={opacity}>
        {selected ? (
          <RoundedRect x={node.x - s / 2 - 6} y={node.y - s / 2 - 6} width={s + 12} height={s + 12} r={6} color={colors.violet400} opacity={0.35}>
            <BlurMask blur={6} style="normal" />
          </RoundedRect>
        ) : null}
        <RoundedRect x={node.x - s / 2} y={node.y - s / 2} width={s} height={s} r={3} color={colors.bg} />
        <RoundedRect x={node.x - s / 2} y={node.y - s / 2} width={s} height={s} r={3} style="stroke" strokeWidth={1.1} color={selected ? colors.violet200 : colors.muted} />
      </Group>
    );
  }

  // Pensamento: rótulo ao lado, para fora do centro.
  const label = truncate(node.label, 28);
  const width = fonts.labelFont?.measureText(label).width ?? 0;
  const outward = Math.cos(node.angle) >= 0;
  const lx = outward ? node.x + node.r + 7 : node.x - node.r - 7 - width;
  const stroke = node.draft ? colors.warning : selected ? colors.violet200 : colors.violet500;
  return (
    <Group opacity={opacity}>
      <Circle cx={node.x} cy={node.y} r={node.r + 6} color={colors.violet500} opacity={selected ? 0.5 : 0.12}>
        <BlurMask blur={8} style="normal" />
      </Circle>
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
