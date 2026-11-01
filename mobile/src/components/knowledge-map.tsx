import { forwardRef, useImperativeHandle, useMemo } from "react";
import { Canvas, Circle, DashPathEffect, Group, Path, RoundedRect, Skia, Text, useFont, type SkFont } from "@shopify/react-native-skia";
import { GestureDetector, useCompetingGestures, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from "react-native-gesture-handler";
import { Extrapolation, interpolate, useDerivedValue, useSharedValue, withTiming } from "react-native-reanimated";
import { hitTest, type LaidOutNode, type Layout } from "@/lib/graph-layout";
import { colors } from "@/theme/tokens";

/**
 * Mapa do arquivo desenhado com Skia. Arrastar move, pinça aproxima em torno
 * dos dedos e um toque seleciona o nó mais próximo. Só a transformação do
 * grupo muda durante os gestos (no thread de interface, via Reanimated).
 */

export type KnowledgeMapHandle = { focus: (id: string) => void; fit: () => void; zoomBy: (factor: number) => void };

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

const fontSource = require("@expo-google-fonts/instrument-sans/500Medium/InstrumentSans_500Medium.ttf");

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
};

export const KnowledgeMap = forwardRef<KnowledgeMapHandle, Props>(function KnowledgeMap({ layout, width, height, selectedId, onSelect, bottomInset = 0 }, ref) {
  const labelFont = useFont(fontSource, 11);
  const folderFont = useFont(fontSource, 14);

  const fitScale = useMemo(() => {
    const { minX, minY, maxX, maxY } = layout.bounds;
    const s = Math.min((width - 48) / Math.max(1, maxX - minX), (height - 120) / Math.max(1, maxY - minY));
    return Math.min(1.4, Math.max(MIN_SCALE, s));
  }, [layout, width, height]);
  const center = useMemo(() => ({ x: (layout.bounds.minX + layout.bounds.maxX) / 2, y: (layout.bounds.minY + layout.bounds.maxY) / 2 }), [layout]);

  const scale = useSharedValue(fitScale);
  const tx = useSharedValue(width / 2 - center.x * fitScale);
  const ty = useSharedValue(height / 2 - center.y * fitScale);

  const transform = useDerivedValue(() => [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }]);
  // Rótulos dos pensamentos aparecem conforme se aproxima.
  const labelOpacity = useDerivedValue(() => interpolate(scale.value, [0.75, 1.15], [0, 1], Extrapolation.CLAMP));

  const animateTo = (nextScale: number, worldX: number, worldY: number) => {
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
    scale.value = withTiming(s, { duration: 380 });
    tx.value = withTiming(width / 2 - worldX * s, { duration: 380 });
    ty.value = withTiming((height - bottomInset) / 2 - worldY * s, { duration: 380 });
  };

  useImperativeHandle(ref, () => ({
    focus: (id) => {
      const node = layout.byId.get(id);
      if (node) animateTo(Math.max(scale.value, node.kind === "pasta" ? 1.1 : 1.5), node.x, node.y);
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
      const hit = hitTest(layout, worldX, worldY, 14 / scale.value);
      onSelect(hit?.id ?? null);
    },
  });

  const gesture = useCompetingGestures(useSimultaneousGestures(pan, pinch), tap);

  const highlighted = useMemo(() => {
    if (!selectedId) return null;
    return new Set([selectedId, ...(layout.neighbors.get(selectedId) ?? [])]);
  }, [selectedId, layout]);

  const edgePaths = useMemo(() => {
    // Skia 2.x: SkPath é imutável; o PathBuilder monta e detach() entrega o caminho.
    const normal = Skia.PathBuilder.Make();
    const active = Skia.PathBuilder.Make();
    for (const edge of layout.edges) {
      const a = layout.byId.get(edge.source);
      const b = layout.byId.get(edge.target);
      if (!a || !b) continue;
      const builder = selectedId && (edge.source === selectedId || edge.target === selectedId) ? active : normal;
      builder.moveTo(a.x, a.y).lineTo(b.x, b.y);
    }
    return { normal: normal.detach(), active: active.detach() };
  }, [layout, selectedId]);

  return (
    <GestureDetector gesture={gesture}>
      <Canvas style={{ width, height }}>
        <Group transform={transform}>
          <Path path={edgePaths.normal} style="stroke" strokeWidth={0.9} color={colors.violet700} opacity={highlighted ? 0.25 : 0.7} />
          <Path path={edgePaths.active} style="stroke" strokeWidth={1.4} color={colors.violet400} />
          {layout.nodes.map((node) => (
            <MapNodeShape
              key={node.id}
              node={node}
              dimmed={!!highlighted && !highlighted.has(node.id)}
              selected={node.id === selectedId}
              labelFont={labelFont}
              folderFont={folderFont}
              labelOpacity={labelOpacity}
            />
          ))}
        </Group>
      </Canvas>
    </GestureDetector>
  );
});

function MapNodeShape({
  node,
  dimmed,
  selected,
  labelFont,
  folderFont,
  labelOpacity,
}: {
  node: LaidOutNode;
  dimmed: boolean;
  selected: boolean;
  labelFont: SkFont | null;
  folderFont: SkFont | null;
  labelOpacity: ReturnType<typeof useDerivedValue<number>>;
}) {
  const opacity = dimmed ? 0.22 : 1;

  if (node.kind === "pasta") {
    const label = truncate(node.label, 22);
    const w = folderFont?.measureText(label).width ?? 0;
    return (
      <Group opacity={opacity}>
        {selected ? <Circle cx={node.x} cy={node.y} r={node.r + 9} color={node.color} opacity={0.16} /> : null}
        <Circle cx={node.x} cy={node.y} r={node.r} color={colors.violet950} />
        <Circle cx={node.x} cy={node.y} r={node.r} style="stroke" strokeWidth={selected ? 2.2 : 1.5} color={node.color} />
        <Circle cx={node.x} cy={node.y} r={4.5} color={node.color} />
        {folderFont ? <Text x={node.x - w / 2} y={node.y + node.r + 18} text={label} font={folderFont} color={colors.text} /> : null}
      </Group>
    );
  }

  if (node.kind === "imagem") {
    const s = node.r * 2;
    return (
      <Group opacity={opacity}>
        {selected ? <RoundedRect x={node.x - s / 2 - 5} y={node.y - s / 2 - 5} width={s + 10} height={s + 10} r={5} color={colors.violet400} opacity={0.2} /> : null}
        <RoundedRect x={node.x - s / 2} y={node.y - s / 2} width={s} height={s} r={3} color={colors.bg} />
        <RoundedRect x={node.x - s / 2} y={node.y - s / 2} width={s} height={s} r={3} style="stroke" strokeWidth={1.1} color={selected ? colors.violet300 : colors.muted} />
      </Group>
    );
  }

  const label = truncate(node.label, 26);
  const w = labelFont?.measureText(label).width ?? 0;
  // Roxo é a identidade; a cor da categoria fica só no nó da pasta, onde tem função.
  const stroke = node.draft ? colors.warning : colors.violet500;
  return (
    <Group opacity={opacity}>
      {selected ? <Circle cx={node.x} cy={node.y} r={node.r + 7} color={colors.violet400} opacity={0.22} /> : null}
      <Circle cx={node.x} cy={node.y} r={node.r} color={colors.surfaceRaised} />
      <Circle cx={node.x} cy={node.y} r={node.r} style="stroke" strokeWidth={selected ? 2 : 1.3} color={selected ? colors.violet300 : stroke}>
        {node.draft ? <DashPathEffect intervals={[3, 2.5]} /> : null}
      </Circle>
      {node.private ? <Circle cx={node.x} cy={node.y} r={2.4} color={colors.violet300} /> : null}
      {labelFont ? (
        <Group opacity={selected ? 1 : labelOpacity}>
          <Text x={node.x - w / 2} y={node.y + node.r + 13} text={label} font={labelFont} color={selected ? colors.violet200 : colors.muted} />
        </Group>
      ) : null}
    </Group>
  );
}
