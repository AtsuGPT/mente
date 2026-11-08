import { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from "react-native-svg";
import Animated, {
  cancelAnimation,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useAmbientActive } from "@/lib/use-ambient";
import { easing } from "@/theme/motion";
import { colors } from "@/theme/tokens";

/**
 * Órbita da Kally: um olho no centro e duas fitas elípticas abertas (afinando nas pontas,
 * sombreadas de lavanda a violeta) girando em torno dele, em ângulos e velocidades diferentes.
 *
 *  - idle: giro contínuo e calmo, luz respirando em roxo escuro.
 *  - thinking (preparando a resposta): giro mais rápido, luz oscilando, pupila pulsando.
 *  - speaking (texto chegando): tons até o lavanda; cada pedaço real do streaming dá um
 *    impulso curto de velocidade e brilho (useKallyActivity). Não há áudio no app, então
 *    nada simula sincronia com voz.
 *
 * Geometria calculada uma vez por tamanho; por quadro só mudam rotação, opacidade e cor, na
 * UI thread (useFrameCallback integra o ângulo: trocar de estado muda a velocidade sem saltos).
 * Pausa fora de foco; com "reduzir movimento" fica parada e o estado aparece só por cor.
 */

export type KallyOrbState = "idle" | "thinking" | "speaking";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** graus por segundo da primeira fita em repouso (uma volta em ~7 s) */
const BASE_SPEED = 52;
const TARGET: Record<KallyOrbState, { speed: number; energy: number; talk: number }> = {
  idle: { speed: 1, energy: 0, talk: 0 },
  thinking: { speed: 2.2, energy: 1, talk: 0 },
  speaking: { speed: 1.6, energy: 0.75, talk: 1 },
};

/** Duas fitas: ângulo inicial (cruzadas, como na referência), fator de velocidade e fase da luz. */
const RIBBONS = [
  { offset: -8, factor: 1, phase: 0 },
  { offset: 84, factor: 0.78, phase: 2.1 },
] as const;

/** Pulso de atividade: chame kick() a cada pedaço de texto recebido. */
export function useKallyActivity() {
  const activity = useSharedValue(0);
  return useMemo(
    () => ({
      activity,
      kick: () => {
        activity.value = withSequence(withTiming(1, { duration: 90, easing: easing.standard }), withTiming(0, { duration: 900, easing: easing.decelerate }));
      },
    }),
    [activity],
  );
}

/**
 * Fita elíptica aberta: contorno de largura variável ao longo do arco (fina nas pontas, mais
 * cheia perto do fim), como um anel visto de lado. Centro na origem.
 */
function ribbonPath(size: number) {
  const rx = size * 0.46;
  const ry = size * 0.125;
  const maxW = size * 0.034;
  const minW = size * 0.004;
  const start = 0.12 * Math.PI;
  const end = 1.93 * Math.PI;
  const steps = 64;
  const outer: string[] = [];
  const inner: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const p = i / steps;
    const t = start + (end - start) * p;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    const nx = ry * Math.cos(t);
    const ny = rx * Math.sin(t);
    const len = Math.hypot(nx, ny) || 1;
    const w = minW + (maxW - minW) * Math.pow(Math.sin(Math.PI * p), 0.8) * (0.45 + 0.55 * p);
    outer.push(`${(x + (nx / len) * w / 2).toFixed(2)},${(y + (ny / len) * w / 2).toFixed(2)}`);
    inner.push(`${(x - (nx / len) * w / 2).toFixed(2)},${(y - (ny / len) * w / 2).toFixed(2)}`);
  }
  return `M${outer.join("L")}L${inner.reverse().join("L")}Z`;
}

/** Olho amendoado (traço) centrado na origem. */
function eyePath(size: number) {
  const w = size * 0.25;
  const h = size * 0.08;
  return `M${-w / 2},0Q0,${-h * 2} ${w / 2},0Q0,${h * 2} ${-w / 2},0Z`;
}

const STATE_LABEL: Record<KallyOrbState, string> = { idle: "Kally pronta", thinking: "Kally preparando a resposta", speaking: "Kally respondendo" };

export function KallyOrb({ size = 40, state = "idle", activity, announce = false }: { size?: number; state?: KallyOrbState; activity?: SharedValue<number>; announce?: boolean }) {
  const active = useAmbientActive();
  const fallback = useSharedValue(0);
  const pulse = activity ?? fallback;

  const time = useSharedValue(0);
  const angle = useSharedValue(0);
  const speed = useSharedValue(TARGET[state].speed);
  const energy = useSharedValue(TARGET[state].energy);
  const talk = useSharedValue(TARGET[state].talk);

  const geometry = useMemo(() => ({ ribbon: ribbonPath(size), eye: eyePath(size) }), [size]);

  // Troca de estado em ~0,7 s: acelera e muda de cor sem corte.
  useEffect(() => {
    const target = TARGET[state];
    const config = { duration: 700, easing: easing.standard };
    speed.value = withTiming(target.speed, config);
    energy.value = withTiming(target.energy, config);
    talk.value = withTiming(target.talk, { duration: 900, easing: easing.standard });
  }, [state, speed, energy, talk]);

  const frame = useFrameCallback((info) => {
    "worklet";
    // Quadros longos (aba em segundo plano) não viram um salto de posição.
    const dt = Math.min(info.timeSincePreviousFrame ?? 16, 48) / 1000;
    time.value += dt;
    // Sem módulo: as fitas giram com fatores diferentes e "dar a volta" apareceria como salto.
    angle.value += dt * BASE_SPEED * (speed.value + pulse.value * 0.9);
  }, false);

  useEffect(() => {
    frame.setActive(active);
  }, [active, frame]);

  useEffect(
    () => () => {
      cancelAnimation(speed);
      cancelAnimation(energy);
      cancelAnimation(talk);
    },
    [speed, energy, talk],
  );

  const halo = useAnimatedStyle(() => {
    const t = time.value;
    const breathe = 0.5 + 0.5 * Math.sin(t * 1.1);
    const flicker = 0.5 + 0.5 * Math.sin(t * 3.4);
    return {
      opacity: 0.55 + breathe * 0.2 + energy.value * flicker * 0.2 + pulse.value * 0.2,
      transform: [{ scale: 0.94 + breathe * 0.04 + energy.value * 0.04 + pulse.value * 0.06 }],
    };
  });

  // Olho: traço e pupila mudam de tom com o estado; a pupila pulsa ao pensar.
  const eye = useAnimatedProps(() => ({
    stroke: interpolateColor(talk.value, [0, 1], [interpolateColor(energy.value, [0, 1], [colors.violet400, colors.violet300]), colors.violet200]),
  }));
  const pupil = useAnimatedProps(() => {
    const beat = 0.5 + 0.5 * Math.sin(time.value * 4.6);
    return {
      r: size * (0.03 + energy.value * 0.008 * beat + pulse.value * 0.01),
      fill: interpolateColor(talk.value, [0, 1], [interpolateColor(energy.value, [0, 1], [colors.violet400, colors.violet300]), colors.violet200]),
    };
  });

  const c = size / 2;
  return (
    <View
      style={{ width: size, height: size }}
      accessible={announce}
      accessibilityRole={announce ? "image" : undefined}
      accessibilityLabel={announce ? STATE_LABEL[state] : undefined}
      accessibilityLiveRegion={announce ? "polite" : undefined}
      aria-hidden={!announce}
      pointerEvents="none"
    >
      <Animated.View style={[StyleSheet.absoluteFill, halo]}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id="kally-halo" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={colors.violet700} stopOpacity={0.5} />
              <Stop offset="0.6" stopColor={colors.violet900} stopOpacity={0.3} />
              <Stop offset="1" stopColor={colors.violet950} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={c} cy={c} r={c} fill="url(#kally-halo)" />
        </Svg>
      </Animated.View>

      {RIBBONS.map((ribbon, index) => (
        <Ribbon key={index} size={size} d={geometry.ribbon} ribbon={ribbon} index={index} angle={angle} time={time} energy={energy} talk={talk} pulse={pulse} />
      ))}

      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <AnimatedPath d={geometry.eye} transform={`translate(${c} ${c})`} fill="none" strokeWidth={Math.max(1, size * 0.014)} strokeLinejoin="round" animatedProps={eye} />
        <AnimatedCircle cx={c} cy={c} animatedProps={pupil} />
      </Svg>
    </View>
  );
}

function Ribbon({
  size,
  d,
  ribbon,
  index,
  angle,
  time,
  energy,
  talk,
  pulse,
}: {
  size: number;
  d: string;
  ribbon: (typeof RIBBONS)[number];
  index: number;
  angle: SharedValue<number>;
  time: SharedValue<number>;
  energy: SharedValue<number>;
  talk: SharedValue<number>;
  pulse: SharedValue<number>;
}) {
  const id = `kally-ribbon-${index}`;
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value * ribbon.factor + ribbon.offset}deg` }] }));

  // Brilho por cima do sombreado fixo: cada fita oscila em fase própria (nunca as duas juntas).
  const glow = useAnimatedProps(() => {
    const t = time.value;
    const mix = 0.5 + 0.5 * Math.sin(t * (0.7 + energy.value * 1.3 + talk.value * 0.6) + ribbon.phase);
    const deep = interpolateColor(energy.value, [0, 1], [colors.violet700, colors.violet500]);
    const light = interpolateColor(talk.value, [0, 1], [interpolateColor(energy.value, [0, 1], [colors.violet500, colors.violet400]), colors.violet200]);
    return {
      fill: interpolateColor(mix, [0, 1], [deep, light]),
      fillOpacity: 0.25 + 0.2 * (0.5 + 0.5 * Math.sin(t * 0.9 + index * 1.7)) + pulse.value * 0.2,
    };
  });

  const c = size / 2;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, spin]}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.violet300} />
            <Stop offset="0.55" stopColor={colors.violet400} />
            <Stop offset="1" stopColor={colors.violet600} />
          </LinearGradient>
        </Defs>
        <Path d={d} transform={`translate(${c} ${c})`} fill={`url(#${id})`} />
        <AnimatedPath d={d} transform={`translate(${c} ${c})`} animatedProps={glow} />
      </Svg>
    </Animated.View>
  );
}
