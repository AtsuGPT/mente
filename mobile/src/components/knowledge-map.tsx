import { forwardRef, useEffect, useImperativeHandle, useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import { Canvas, Circle, DashPathEffect, FontHinting, Group, Path, Points, RadialGradient, RoundedRect, Skia, Text, useFont, vec, type SkFont, type SkPath } from "@shopify/react-native-skia";
import { GestureDetector, useCompetingGestures, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from "react-native-gesture-handler";
import {
  cancelAnimation,
  Extrapolation,
  interpolate,
  ReduceMotion,
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withDecay,
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
 * Mapa de conexões como uma constelação de pensamentos, desenhado com Skia. Arrastar move (com
 * inércia ao soltar, dentro de limites), pinça aproxima em torno dos dedos, um toque seleciona.
 * Caminhos, posições e profundidades são calculados uma vez; a câmera é uma transformação de
 * grupo no thread de interface (Reanimated).
 *
 * Profundidade 2.5D (sem 3D de verdade): cada nó recebe uma profundidade fixa e cai numa de três
 * camadas. A profundidade muda tamanho, luz (esfera com reflexo no alto) e nitidez da borda; as
 * camadas flutuam alguns pixels em fases opostas, bem devagar, o que dá o efeito de paralaxe.
 * As conexões ligam os centros e passam por baixo dos nós (opacos), então a flutuação nunca
 * descola uma linha do seu nó. O fundo é preto com estrelas apagadas na camada mais distante.
 * O centro é o ambiente como a estrela principal (sem cérebro).
 *
 * Desempenho: a flutuação é lenta, então o relógio dela só publica ~20 vezes por segundo (o
 * canvas não redesenha a 60 fps à toa). Para durante gestos, fora de foco e com "reduzir
 * movimento".
 */

export type KnowledgeMapHandle = { focus: (id: string) => void; reveal: (id: string, bottomInset: number) => void; fit: () => void; zoomBy: (factor: number) => void };

const MIN_SCALE = 0.2;
const MAX_SCALE = 3.5;
/** Quanto do conteúdo precisa continuar visível nas bordas ao arrastar (px). */
const EDGE = 72;
/** Flutuação das camadas, em px de tela (perto, longe) e quantas vezes por segundo ela publica. */
const FLOAT = { near: 2.6, far: 1.3, hz: 20 } as const;

const fontMedium = require("@expo-google-fonts/instrument-sans/500Medium/InstrumentSans_500Medium.ttf");
const fontSemibold = require("@expo-google-fonts/instrument-sans/600SemiBold/InstrumentSans_600SemiBold.ttf");

/** Ícones dos nós: os mesmos traços do conjunto do app (components/ui/icon, viewBox 24, traço fino). */
const ICON_PATHS: Record<string, string> = {
  folder: "M3 6.5h7l2 2h9v9.8a1.7 1.7 0 0 1-1.7 1.7H4.7A1.7 1.7 0 0 1 3 18.3V6.5ZM3.5 10h17",
  sparkle: "M12 3.5 13.8 10 20.5 12l-6.7 2L12 20.5 10.2 14 3.5 12l6.7-2L12 3.5Z",
  doc: "M7 3.5h7l4.5 4.5v12.5h-11.5V3.5ZM14 3.5V8h4.5M9.5 12.5h6M9.5 16h4",
  edit: "M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4",
  lock: "M7 10.5h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2ZM8 10.5V8a4 4 0 0 1 8 0v2.5",
};
const iconCache = new Map<string, SkPath | null>();
function iconPath(name: string) {
  if (!iconCache.has(name)) iconCache.set(name, Skia.Path.MakeFromSVGString(ICON_PATHS[name] ?? ICON_PATHS.doc));
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

/** Número estável em [0, 1) a partir do id (FNV-1a): o mapa sai igual a cada abertura. */
function hash01(id: string, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** Profundidade de -1 (longe) a 1 (perto). O centro e as pastas ficam no plano do meio. */
function depthOf(node: LaidOutNode) {
  if (node.kind === "ambiente") return 0.25;
  if (node.kind === "pasta") return (hash01(node.id) - 0.5) * 0.5;
  return hash01(node.id) * 2 - 1;
}

type Layer = 0 | 1 | 2;
const layerOf = (z: number): Layer => (z < -0.34 ? 0 : z > 0.34 ? 2 : 1);

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

type Props = {
  layout: Layout;
  width: number;
  height: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Espaço reservado embaixo (painel de detalhes) ao centralizar um nó. */
  bottomInset?: number;
  /** Tela em foco e app em primeiro plano: sem isso a constelação para de flutuar. */
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

  // Dedos no mapa: a flutuação congela (nada se mexe além do que a pessoa move).
  const touching = useSharedValue(0);

  const pan = usePanGesture({
    minDistance: 6,
    onBegin: () => {
      "worklet";
      // Tocar segura o mapa na hora (interrompe inércia ou câmera em andamento).
      stopCamera();
      touching.value = 1;
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
      touching.value = 0;
    },
  });

  const pinch = usePinchGesture({
    onBegin: () => {
      "worklet";
      stopCamera();
      touching.value = 1;
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
      touching.value = 0;
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

  // Flutuação: um relógio próprio (não reinicia ao pausar, então nada salta ao voltar) que só
  // publica para o canvas ~20 vezes por segundo.
  const clock = useSharedValue(0);
  const drift = useSharedValue(0);
  const float = useFrameCallback((info) => {
    "worklet";
    if (touching.value) return;
    clock.value += Math.min(info.timeSincePreviousFrame ?? 16, 48) / 1000;
    if (clock.value - drift.value >= 1 / FLOAT.hz) drift.value = clock.value;
  }, false);
  useEffect(() => {
    float.setActive(ambient);
  }, [ambient, float]);

  // Camadas: perto e longe flutuam em fases opostas (paralaxe); o meio fica parado. O desvio é
  // em px de tela (dividido pela escala), igual em qualquer zoom.
  const nearShift = useDerivedValue(() => [
    { translateX: (Math.sin(drift.value * 0.29) * FLOAT.near) / scale.value },
    { translateY: (Math.cos(drift.value * 0.23) * FLOAT.near * 0.8) / scale.value },
  ]);
  const farShift = useDerivedValue(() => [
    { translateX: (-Math.sin(drift.value * 0.29) * FLOAT.far) / scale.value },
    { translateY: (-Math.cos(drift.value * 0.23) * FLOAT.far * 0.8) / scale.value },
  ]);
  const midShift = useDerivedValue(() => [{ translateX: 0 }]);
  const shifts = [farShift, midShift, nearShift] as const;
  // Luz: a camada próxima respira um pouco (6%) num ciclo longo; o centro brilha de leve.
  const nearLight = useDerivedValue(() => 0.94 + 0.06 * Math.sin(drift.value * 0.5));
  const hubGlow = useDerivedValue(() => 0.8 + 0.2 * Math.sin(drift.value * 0.42));

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
  const dimmed = useDerivedValue(() => 1 - focus.value * 0.78);

  const highlighted = useMemo(() => {
    if (!shownId) return null;
    return new Set([shownId, ...(layout.neighbors.get(shownId) ?? [])]);
  }, [shownId, layout]);

  // Profundidade de cada nó e os nós de cada camada (de longe para perto, para a sobreposição).
  const depth = useMemo(() => {
    const z = new Map<string, number>();
    const layers: [LaidOutNode[], LaidOutNode[], LaidOutNode[]] = [[], [], []];
    for (const node of layout.nodes) {
      const d = depthOf(node);
      z.set(node.id, d);
      layers[layerOf(d)].push(node);
    }
    for (const list of layers) list.sort((a, b) => (z.get(a.id) ?? 0) - (z.get(b.id) ?? 0));
    return { z, layers };
  }, [layout]);

  // Estrelas: pontos fixos e apagados, na camada distante (dão escala e profundidade ao fundo).
  const stars = useMemo(() => {
    const pad = 420;
    const area = (maxX - minX + pad * 2) * (maxY - minY + pad * 2);
    const count = Math.min(320, Math.round(area / 9000));
    const dim: { x: number; y: number }[] = [];
    const bright: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
      const key = `star${i}`;
      const point = vec(minX - pad + hash01(key, 1) * (maxX - minX + pad * 2), minY - pad + hash01(key, 2) * (maxY - minY + pad * 2));
      (hash01(key, 3) > 0.86 ? bright : dim).push(point);
    }
    return { dim, bright };
  }, [minX, minY, maxX, maxY]);

  // Conexões entre centros (passam por baixo dos nós), agrupadas por tipo: cada tipo é um caminho.
  const paths = useMemo(() => {
    const builders = { root: Skia.PathBuilder.Make(), branch: Skia.PathBuilder.Make(), leaf: Skia.PathBuilder.Make(), extra: Skia.PathBuilder.Make(), active: Skia.PathBuilder.Make() };
    for (const edge of layout.edges) {
      const a = layout.byId.get(edge.source);
      const b = layout.byId.get(edge.target);
      if (!a || !b) continue;
      const isActive = !!shownId && (edge.source === shownId || edge.target === shownId);
      const layer = isActive ? builders.active : edge.secondary || edge.kind === "mencao" ? builders.extra : edge.kind === "raiz" ? builders.root : edge.kind === "imagem" ? builders.leaf : builders.branch;
      layer.moveTo(a.x, a.y);
      if (edge.kind === "imagem") {
        layer.lineTo(b.x, b.y);
      } else {
        // Curva suave: os controles seguem a direção radial de cada ponta.
        const pull = Math.hypot(b.x - a.x, b.y - a.y) * 0.4;
        const aa = a.kind === "ambiente" ? Math.atan2(b.y, b.x) : a.angle;
        const ba = b.angle;
        layer.cubicTo(a.x + Math.cos(aa) * pull, a.y + Math.sin(aa) * pull, b.x - Math.cos(ba) * pull, b.y - Math.sin(ba) * pull, b.x, b.y);
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
  const node = (n: LaidOutNode, opacity: number | SharedValue<number>, selected: boolean) => (
    <MapNodeShape key={n.id} node={n} z={depth.z.get(n.id) ?? 0} opacity={opacity} selected={selected} fonts={fonts} labelOpacity={labelOpacity} hubGlow={hubGlow} subtitle={n.kind === "ambiente" ? hubSubtitle : undefined} />
  );

  return (
    <View style={{ width, height, backgroundColor: colors.bg }}>
      <GestureDetector gesture={gesture}>
        <Canvas style={{ width, height }}>
          <Group transform={transform}>
            <Group transform={farShift}>
              <Points points={stars.dim} mode="points" strokeWidth={1.2} strokeCap="round" color="rgba(228,219,253,0.13)" />
              <Points points={stars.bright} mode="points" strokeWidth={1.8} strokeCap="round" color="rgba(228,219,253,0.3)" />
            </Group>

            {/* Conexões: um traço fino por tipo. Recuam quando um nó está em foco. */}
            <Group opacity={dimmed}>
              <Path path={paths.root} style="stroke" strokeWidth={1} color={colors.violet500} opacity={0.42} />
              <Path path={paths.branch} style="stroke" strokeWidth={0.85} color={colors.violet600} opacity={0.5} />
              <Path path={paths.leaf} style="stroke" strokeWidth={0.75} color={colors.lineStrong} opacity={0.9} />
              <Path path={paths.extra} style="stroke" strokeWidth={0.75} color={colors.violet600} opacity={0.4}>
                <DashPathEffect intervals={[3, 4]} />
              </Path>
            </Group>

            {/* Relações do nó em foco: acendem, mais claras e um pouco mais grossas. */}
            <Group opacity={focus}>
              <Path path={paths.active} style="stroke" strokeWidth={1.4} color={colors.violet300} opacity={0.9} />
            </Group>

            {/* Nós, de longe para perto; cada camada flutua com a sua fase. */}
            {depth.layers.map((list, layer) => (
              <Group key={layer} transform={shifts[layer]} opacity={layer === 2 ? nearLight : 1}>
                {/* O nó em foco é desenhado só por cima (senão o rótulo aparece duas vezes). */}
                {list.map((n) => (n.id === shownId ? null : node(n, highlighted && !highlighted.has(n.id) ? dimmed : 1, n.id === selectedId)))}
              </Group>
            ))}

            {/* Nó em foco por cima, na mesma camada (acompanha a flutuação): cresce um pouco e ganha um anel fino. */}
            {shown ? (
              <Group transform={shifts[layerOf(depth.z.get(shown.id) ?? 0)]}>
                <SelectionRing node={shown} z={depth.z.get(shown.id) ?? 0} pop={pop} />
                <Popped node={shown} pop={pop}>
                  {node(shown, 1, true)}
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

/** Escala do nó selecionado em torno do próprio centro (curta, sem rebote). */
function Popped({ node, pop, children }: { node: LaidOutNode; pop: SharedValue<number>; children: ReactNode }) {
  const transform = useDerivedValue(() => [{ scale: 1 + pop.value * 0.06 }]);
  return (
    <Group origin={vec(node.x, node.y)} transform={transform}>
      {children}
    </Group>
  );
}

function SelectionRing({ node, z, pop }: { node: LaidOutNode; z: number; pop: SharedValue<number> }) {
  const extent = (node.kind === "imagem" ? node.r * 1.5 : node.r) * sizeFor(z);
  const r = useDerivedValue(() => (extent + 4 + pop.value * 2) * (1 + pop.value * 0.06));
  const opacity = useDerivedValue(() => pop.value * 0.85);
  return <Circle cx={node.x} cy={node.y} r={r} style="stroke" strokeWidth={1.2} color={colors.violet200} opacity={opacity} />;
}

/** Perto, o nó é um pouco maior; longe, menor. */
const sizeFor = (z: number) => 1 + z * 0.16;
/** Perto, a borda é nítida; longe, apagada (perspectiva atmosférica). */
const rimFor = (z: number) => 0.45 + ((z + 1) / 2) * 0.5;

type Fonts = { labelFont: SkFont | null; smallFont: SkFont | null; folderFont: SkFont | null; hubFont: SkFont | null };
type NodeOf<K extends LaidOutNode["kind"]> = Extract<LaidOutNode, { kind: K }>;
type NodeProps<N extends LaidOutNode = LaidOutNode> = {
  node: N;
  z: number;
  opacity: number | SharedValue<number>;
  selected: boolean;
  fonts: Fonts;
  labelOpacity: SharedValue<number>;
  hubGlow: SharedValue<number>;
  subtitle?: string;
};

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

/** Rótulo com um contorno preto por baixo: as conexões que passam atrás não cortam as letras. */
function Label({ x, y, text, font, color }: { x: number; y: number; text: string; font: SkFont; color: string }) {
  return (
    <Group>
      <Text x={x} y={y} text={text} font={font} color={colors.bg} style="stroke" strokeWidth={4} strokeJoin="round" />
      <Text x={x} y={y} text={text} font={font} color={color} />
    </Group>
  );
}

/** Esfera: base opaca e uma luz difusa vinda do alto à esquerda. */
function Sphere({ x, y, r, light, base = "#0E0D12" }: { x: number; y: number; r: number; light: [string, string, string]; base?: string }) {
  return (
    <Group>
      <Circle cx={x} cy={y} r={r} color={base} />
      <Circle cx={x} cy={y} r={r}>
        <RadialGradient c={vec(x - r * 0.38, y - r * 0.42)} r={r * 1.4} colors={light} positions={[0, 0.55, 1]} />
      </Circle>
    </Group>
  );
}

/** Centro: o ambiente como a estrela principal da constelação, com um brilho contido que respira devagar. */
function HubNode({ node, opacity, selected, fonts, subtitle, hubGlow }: NodeProps<NodeOf<"ambiente">>) {
  const name = truncate(node.label, 22);
  const accent = readableAccent(node.color);
  const glowR = node.r * 2.3;
  return (
    <Group opacity={opacity}>
      <Circle cx={node.x} cy={node.y} r={glowR} opacity={hubGlow}>
        <RadialGradient c={vec(node.x, node.y)} r={glowR} colors={["rgba(132,97,240,0.26)", "rgba(132,97,240,0.07)", "rgba(0,0,0,0)"]} positions={[0, 0.45, 1]} />
      </Circle>
      <Sphere x={node.x} y={node.y} r={node.r} light={["rgba(165,139,247,0.5)", "rgba(74,43,155,0.22)", "rgba(0,0,0,0)"]} base="#0F0C18" />
      <Circle cx={node.x} cy={node.y} r={node.r} style="stroke" strokeWidth={selected ? 1.6 : 1.2} color={accent} opacity={0.75} />
      <NodeIcon name="sparkle" x={node.x} y={node.y} size={22} color={colors.violet200} weight={1.4} />
      {fonts.hubFont ? <Label x={node.x - centered(fonts.hubFont, name)} y={node.y + node.r + 21} text={name} font={fonts.hubFont} color={colors.text} /> : null}
      {subtitle && fonts.smallFont ? <Label x={node.x - centered(fonts.smallFont, subtitle)} y={node.y + node.r + 37} text={subtitle} font={fonts.smallFont} color={colors.faint} /> : null}
    </Group>
  );
}

/** Pasta: esfera tingida com a cor da pasta (a cor identifica), borda fina e ícone. */
function FolderNode({ node, z, opacity, selected, fonts }: NodeProps<NodeOf<"pasta">>) {
  const name = truncate(node.label, 22);
  const conn = `${node.degree} ${node.degree === 1 ? "conexão" : "conexões"}`;
  const accent = readableAccent(node.color);
  const r = node.r * sizeFor(z);
  return (
    <Group opacity={opacity}>
      <Sphere x={node.x} y={node.y} r={r} light={[rgba(node.color, 0.42), rgba(node.color, 0.12), "rgba(0,0,0,0)"]} />
      <Circle cx={node.x} cy={node.y} r={r} style="stroke" strokeWidth={selected ? 1.5 : 1.1} color={accent} opacity={rimFor(z) + 0.1} />
      <NodeIcon name="folder" x={node.x} y={node.y} size={17} color={accent} />
      {fonts.folderFont ? <Label x={node.x - centered(fonts.folderFont, name)} y={node.y + r + 18} text={name} font={fonts.folderFont} color={colors.text} /> : null}
      {fonts.smallFont ? <Label x={node.x - centered(fonts.smallFont, conn)} y={node.y + r + 32} text={conn} font={fonts.smallFont} color={colors.faint} /> : null}
    </Group>
  );
}

function ImageNode({ node, z, opacity, selected }: NodeProps<NodeOf<"imagem">>) {
  const s = node.r * 2 * sizeFor(z);
  return (
    <Group opacity={opacity}>
      <RoundedRect x={node.x - s / 2} y={node.y - s / 2} width={s} height={s} r={2.5} color={colors.surfaceRaised} />
      <RoundedRect x={node.x - s / 2} y={node.y - s / 2} width={s} height={s} r={2.5} style="stroke" strokeWidth={1} color={selected ? colors.violet200 : colors.faint} opacity={rimFor(z)} />
    </Group>
  );
}

/**
 * Pensamento: pequena esfera escura com reflexo violeta; o ícone diz o tipo (publicado, rascunho,
 * privado) e o rascunho ganha borda tracejada âmbar. Rótulo ao lado, para fora do centro.
 */
function ThoughtNode({ node, z, opacity, selected, fonts, labelOpacity }: NodeProps<NodeOf<"pensamento">>) {
  const label = truncate(node.label, 28);
  const r = node.r * sizeFor(z);
  const width = fonts.labelFont?.measureText(label).width ?? 0;
  const outward = Math.cos(node.angle) >= 0;
  const lx = outward ? node.x + r + 7 : node.x - r - 7 - width;
  const stroke = node.draft ? colors.warning : selected ? colors.violet200 : colors.violet400;
  const icon = node.draft ? "edit" : node.private ? "lock" : "doc";
  const near = (z + 1) / 2;
  return (
    <Group opacity={opacity}>
      <Sphere x={node.x} y={node.y} r={r} light={[`rgba(165,139,247,${(0.2 + near * 0.22).toFixed(2)})`, "rgba(74,43,155,0.08)", "rgba(0,0,0,0)"]} />
      <Circle cx={node.x} cy={node.y} r={r} style="stroke" strokeWidth={selected ? 1.4 : 1} color={stroke} opacity={selected ? 1 : rimFor(z)}>
        {node.draft ? <DashPathEffect intervals={[2.5, 2]} /> : null}
      </Circle>
      <NodeIcon name={icon} x={node.x} y={node.y} size={r} color={node.draft ? colors.warning : colors.violet200} weight={1.8} />
      {fonts.labelFont ? (
        <Group opacity={selected ? 1 : labelOpacity}>
          <Label x={lx} y={node.y + 4} text={label} font={fonts.labelFont} color={selected ? colors.violet200 : near > 0.6 ? colors.muted : colors.faint} />
        </Group>
      ) : null}
    </Group>
  );
}
