import { useCallback, useMemo, useRef } from "react";
import { View, type HostInstance } from "react-native";
import Svg, { Defs, LinearGradient, Path, RadialGradient, Stop } from "react-native-svg";
import Animated, { useAnimatedProps, useDerivedValue, useFrameCallback, useReducedMotion, useSharedValue, type SharedValue } from "react-native-reanimated";
import { colors } from "@/theme/tokens";
import { LAYERS, symbolFrame, type KallySymbolKind, type LayerFill } from "./geometry";

export { KALLY_SYMBOLS, type KallySymbolKind } from "./geometry";

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * O que a tela informa ao símbolo: onde está o dedo e quando a pessoa digita.
 * Os valores ficam em shared values para o símbolo reagir sem re-renderizar a tela.
 */
export type KallyInput = {
  pointerX: SharedValue<number>;
  pointerY: SharedValue<number>;
  pointerOn: SharedValue<number>;
  typing: SharedValue<number>;
  /** posição do dedo em coordenadas de tela (pageX/pageY) */
  touch: (pageX: number, pageY: number) => void;
  release: () => void;
  /** chame a cada tecla: dá um "impulso" que decai sozinho */
  keystroke: () => void;
  /** centro do símbolo na tela, medido pelo próprio componente */
  center: SharedValue<{ x: number; y: number; r: number }>;
  /** o componente registra aqui como se medir (a tela pode ter rolado ou o teclado aberto) */
  measure: { current: (() => void) | null };
};

export function useKallyInput(): KallyInput {
  const pointerX = useSharedValue(0);
  const pointerY = useSharedValue(0);
  const pointerOn = useSharedValue(0);
  const typing = useSharedValue(0);
  const center = useSharedValue({ x: 0, y: 0, r: 0 });
  const measure = useRef<(() => void) | null>(null);
  const touch = useCallback(
    (pageX: number, pageY: number) => {
      if (!pointerOn.value) measure.current?.();
      const c = center.value;
      if (!c.r) return;
      // normaliza em relação ao centro; o alcance é maior que o símbolo para reagir na tela toda
      const reach = c.r * 2.6;
      pointerX.value = Math.max(-1, Math.min(1, (pageX - c.x) / reach));
      pointerY.value = Math.max(-1, Math.min(1, (pageY - c.y) / reach));
      pointerOn.value = 1;
    },
    [center, pointerX, pointerY, pointerOn],
  );
  const release = useCallback(() => {
    pointerOn.value = 0;
  }, [pointerOn]);
  const keystroke = useCallback(() => {
    typing.value = Math.min(1, typing.value + 0.3);
  }, [typing]);
  return useMemo(() => ({ pointerX, pointerY, pointerOn, typing, touch, release, keystroke, center, measure }), [pointerX, pointerY, pointerOn, typing, touch, release, keystroke, center]);
}

const FILLS: Record<LayerFill, string> = {
  grad: "url(#kallyGrad)",
  deep: colors.violet500,
  bg: colors.bg,
  hi: "#F3EEFF",
};

/**
 * Símbolo animado da Kally. Respira sozinho, segue o dedo e se agita quando a pessoa
 * digita. Com "reduzir movimento" ligado, fica parado no primeiro quadro.
 */
export function KallySymbol({ kind, size = 132, input }: { kind: KallySymbolKind; size?: number; input?: KallyInput }) {
  const reduceMotion = useReducedMotion();
  const time = useSharedValue(0);
  const px = useSharedValue(0);
  const py = useSharedValue(0);
  const pa = useSharedValue(0);
  const energy = useSharedValue(0);
  const glow = useSharedValue(0);

  useFrameCallback((frame) => {
    "worklet";
    const dt = Math.min(0.05, (frame.timeSincePreviousFrame ?? 16) / 1000);
    time.value += dt;
    const ease = Math.min(1, dt * 5);
    if (input) {
      px.value += (input.pointerX.value - px.value) * ease;
      py.value += (input.pointerY.value - py.value) * ease;
      pa.value += (input.pointerOn.value - pa.value) * Math.min(1, dt * 3);
      // a energia de digitação decai sozinha
      input.typing.value *= Math.exp(-dt * 1.4);
      energy.value += (input.typing.value - energy.value) * Math.min(1, dt * 8);
    }
    glow.value = 0.5 + 0.5 * Math.sin(time.value * 1.1);
  }, !reduceMotion);

  const frame = useDerivedValue(() => symbolFrame(kind, { t: time.value, px: px.value, py: py.value, pa: pa.value, energy: energy.value }), [kind]);
  const box = useRef<HostInstance>(null);
  const measureBox = useCallback(() => {
    box.current?.measure((_x, _y, w, h, pageX, pageY) => {
      if (input && w) input.center.value = { x: pageX + w / 2, y: pageY + h / 2, r: w / 2 };
    });
  }, [input]);
  if (input) input.measure.current = measureBox;
  const glowProps = useAnimatedProps(() => ({ opacity: 0.32 + glow.value * 0.18 + energy.value * 0.3 }));

  return (
    <View
      ref={box}
      // mede a posição na tela para converter o toque em coordenadas do símbolo
      onLayout={measureBox}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Símbolo da Kally"
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox="0 0 200 200">
        <Defs>
          <LinearGradient id="kallyGrad" x1="30" y1="20" x2="170" y2="180" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={colors.violet200} />
            <Stop offset="0.5" stopColor={colors.violet400} />
            <Stop offset="1" stopColor={colors.violet600} />
          </LinearGradient>
          <RadialGradient id="kallyGlow" cx="100" cy="100" r="100" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={colors.violet600} stopOpacity={0.55} />
            <Stop offset="0.55" stopColor={colors.violet700} stopOpacity={0.18} />
            <Stop offset="1" stopColor={colors.violet800} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <AnimatedPath d="M0 100a100 100 0 1 0 200 0a100 100 0 1 0 -200 0Z" fill="url(#kallyGlow)" animatedProps={glowProps} />
        {LAYERS[kind].map((layer, i) => (
          <Layer key={`${kind}-${i}`} frame={frame} index={i} fill={FILLS[layer.fill]} opacity={layer.opacity ?? 1} evenOdd={!!layer.evenOdd} />
        ))}
      </Svg>
    </View>
  );
}

function Layer({ frame, index, fill, opacity, evenOdd }: { frame: SharedValue<string[]>; index: number; fill: string; opacity: number; evenOdd: boolean }) {
  const props = useAnimatedProps(() => ({ d: frame.value[index] ?? "M0 0Z" }));
  return <AnimatedPath animatedProps={props} fill={fill} opacity={opacity} fillRule={evenOdd ? "evenodd" : "nonzero"} />;
}
