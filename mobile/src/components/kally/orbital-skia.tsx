import { memo, useCallback, useEffect, useMemo } from "react";
import { Pressable, StyleSheet } from "react-native";
import { Canvas, Circle, DashPathEffect, Group, Path, RadialGradient, Skia, SweepGradient, vec, type SkPath } from "@shopify/react-native-skia";
import Animated, {
  type FrameInfo,
  cancelAnimation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useAmbientActive } from "@/lib/use-ambient";
import { easing, spring } from "@/theme/motion";
import { colors } from "@/theme/tokens";
import type { KallyOrbitalState } from "./activity";

/**
 * KallyOrbital: a identidade da Kally. Um núcleo em forma de olho, com brilho difuso, e três
 * anéis elípticos em inclinações diferentes orbitando em volta dele.
 *
 * Movimento: cada anel gira no próprio plano com velocidade angular constante (interno uma
 * volta a cada 2,5 s, intermediário 3,5 s em sentido contrário, externo 5 s), multiplicada pelo
 * estado. O ângulo é integrado quadro a quadro na UI thread (useFrameCallback), nunca
 * reiniciado nem reduzido por módulo: mudar de estado muda a velocidade sem salto, e completar
 * uma volta não tem emenda. As fases da luz também são integradas (mudar a frequência não
 * pula a fase).
 *
 * Profundidade: a metade de trás de cada anel é desenhada antes do núcleo e mais apagada; a da
 * frente, depois e mais nítida. Cometas de luz percorrem os anéis (traço tracejado com fase
 * animada) e o gradiente de cada anel gira com ele.
 *
 * Desempenho: caminhos e geometria são calculados uma vez por tamanho; por quadro só mudam
 * transformações, cores e fases (valores compartilhados, sem setState). Nenhum desfoque: os
 * brilhos são degradês radiais. Pausa fora de foco; com "reduzir movimento" fica parada e o
 * estado aparece só por cor e brilho.
 */

type Props = {
  size?: number;
  state?: KallyOrbitalState;
  /** Pulso do streaming (useKallyActivity): cada pedaço de texto acelera e acende um pouco. */
  activity?: SharedValue<number>;
  /** Amplitude real do áudio (0–1): microfone em listening, reprodução em speaking. */
  level?: SharedValue<number>;
  /** Escala geral do brilho (0–1.5). */
  intensity?: number;
  /** Responde ao toque (compressão elástica; segurar intensifica o brilho). */
  interactive?: boolean;
  onPress?: () => void;
  /** Anuncia o estado aos leitores de tela. */
  announce?: boolean;
};

/** Parâmetros por estado. speed multiplica as velocidades base; energy acende e pulsa;
 * hue vai do violeta profundo (0) ao lavanda (1); glow é o halo; dim desbota (erro). */
const TARGET: Record<KallyOrbitalState, { speed: number; energy: number; hue: number; glow: number; dim: number }> = {
  idle: { speed: 1, energy: 0.25, hue: 0.32, glow: 0.55, dim: 0 },
  listening: { speed: 1.15, energy: 0.55, hue: 0.55, glow: 0.75, dim: 0 },
  thinking: { speed: 1.75, energy: 0.85, hue: 0.45, glow: 0.9, dim: 0 },
  responding: { speed: 1.35, energy: 1, hue: 0.8, glow: 1, dim: 0 },
  speaking: { speed: 1.3, energy: 0.95, hue: 0.92, glow: 1, dim: 0 },
  error: { speed: 0.45, energy: 0.12, hue: 0.12, glow: 0.3, dim: 1 },
};

const STATE_LABEL: Record<KallyOrbitalState, string> = {
  idle: "Kally pronta",
  listening: "Kally escutando",
  thinking: "Kally preparando a resposta",
  responding: "Kally respondendo",
  speaking: "Kally falando",
  error: "Kally: a resposta falhou",
};

/** Anéis: raios (fração do tamanho), inclinação inicial, período (s), sentido, espessura, cometa. */
const RINGS = [
  { rx: 0.27, ry: 0.1, tilt: 18, period: 2.5, dir: 1, width: 0.017, comet: 0.16, cometSpeed: 1.25, phase: 0 },
  { rx: 0.375, ry: 0.13, tilt: 116, period: 3.5, dir: -1, width: 0.0135, comet: 0.12, cometSpeed: 0.95, phase: 1.9 },
  { rx: 0.465, ry: 0.108, tilt: -36, period: 5, dir: 1, width: 0.011, comet: 0.1, cometSpeed: 0.7, phase: 3.7 },
] as const;

const DEEP = [colors.violet800, colors.violet700, colors.violet600] as const;
const LIGHT = [colors.violet400, colors.violet300, colors.violet200] as const;

export const KallyOrbitalSkia = memo(function KallyOrbitalSkia({ size = 48, state = "idle", activity, level, intensity = 1, interactive = false, onPress, announce = false }: Props) {
  const active = useAmbientActive();
  const zero = useSharedValue(0);
  const pulse = activity ?? zero;
  const amp = level ?? zero;

  // Parâmetros do estado, interpolados (desacelerar ao terminar é mais lento que acelerar).
  const target = TARGET[state];
  const speed = useSharedValue(target.speed);
  const energy = useSharedValue(target.energy);
  const hue = useSharedValue(target.hue);
  const glow = useSharedValue(target.glow);
  const dim = useSharedValue(target.dim);
  useEffect(() => {
    const t = TARGET[state];
    const slowDown = t.speed < speed.value;
    speed.value = withTiming(t.speed, { duration: slowDown ? 1400 : 650, easing: easing.standard });
    energy.value = withTiming(t.energy, { duration: 700, easing: easing.standard });
    hue.value = withTiming(t.hue, { duration: 900, easing: easing.standard });
    glow.value = withTiming(t.glow, { duration: 800, easing: easing.standard });
    dim.value = withTiming(t.dim, { duration: 900, easing: easing.standard });
  }, [state, speed, energy, hue, glow, dim]);

  // Relógio e fases integradas na UI thread.
  const time = useSharedValue(0);
  const a0 = useSharedValue(0);
  const a1 = useSharedValue(0);
  const a2 = useSharedValue(0);
  const c0 = useSharedValue(0);
  const c1 = useSharedValue(0);
  const c2 = useSharedValue(0);
  const glowPhase = useSharedValue(0);
  const corePhase = useSharedValue(0);
  const onFrame = useCallback((info: FrameInfo) => {
    "worklet";
    const dt = Math.min(info.timeSincePreviousFrame ?? 16, 48) / 1000;
    time.value += dt;
    // Variação discreta de velocidade enquanto responde, puxada pelos eventos reais do streaming.
    const wobble = energy.value * 0.05 * Math.sin(time.value * 5.3) + pulse.value * 0.35 + amp.value * 0.25;
    const s = speed.value * (1 + wobble);
    a0.value += dt * (360 / RINGS[0].period) * RINGS[0].dir * s;
    a1.value += dt * (360 / RINGS[1].period) * RINGS[1].dir * s;
    a2.value += dt * (360 / RINGS[2].period) * RINGS[2].dir * s;
    c0.value += dt * RINGS[0].cometSpeed * s;
    c1.value += dt * RINGS[1].cometSpeed * s;
    c2.value += dt * RINGS[2].cometSpeed * s;
    // Luz: ciclo de ~3,6 s em repouso até ~2,1 s com energia máxima.
    glowPhase.value += dt * ((Math.PI * 2) / (3.6 - energy.value * 1.5));
    corePhase.value += dt * ((Math.PI * 2) / (2.6 - energy.value * 1.4));
  }, [time, energy, pulse, amp, speed, a0, a1, a2, c0, c1, c2, glowPhase, corePhase]);
  const frame = useFrameCallback(onFrame, false);
  useEffect(() => {
    frame.setActive(active);
  }, [active, frame]);
  useEffect(
    () => () => {
      for (const v of [speed, energy, hue, glow, dim]) cancelAnimation(v);
    },
    [speed, energy, hue, glow, dim],
  );

  // Toque: compressão elástica; segurar intensifica o brilho.
  const press = useSharedValue(0);
  const hold = useSharedValue(0);
  const container = useAnimatedStyle(() => ({ transform: [{ scale: 1 - press.value * 0.08 }] }));

  const c = size / 2;
  const geometry = useMemo(() => {
    return RINGS.map((ring) => {
      const rx = size * ring.rx;
      const ry = size * ring.ry;
      const rect = { x: c - rx, y: c - ry, width: rx * 2, height: ry * 2 };
      const full = Skia.PathBuilder.Make().addOval(rect).detach();
      const back = Skia.PathBuilder.Make().addArc(rect, 180, 180).detach();
      const front = Skia.PathBuilder.Make().addArc(rect, 0, 180).detach();
      // Perímetro da elipse (Ramanujan), para o cometa ter comprimento proporcional.
      const h = ((rx - ry) * (rx - ry)) / ((rx + ry) * (rx + ry));
      const perimeter = Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
      return { full, back, front, perimeter, width: Math.max(0.9, size * ring.width), tilt: (ring.tilt * Math.PI) / 180 };
    });
  }, [size, c]);
  const eye = useMemo(() => {
    const w = size * 0.24;
    const hh = size * 0.075;
    return Skia.PathBuilder.Make().moveTo(c - w / 2, c).quadTo(c, c - hh * 2, c + w / 2, c).quadTo(c, c + hh * 2, c - w / 2, c).close().detach();
  }, [size, c]);

  const angles = [a0, a1, a2];
  const comets = [c0, c1, c2];

  // Halo e núcleo.
  const haloOpacity = useDerivedValue(() => Math.min(1, intensity * (glow.value * (0.62 + 0.38 * Math.sin(glowPhase.value)) + hold.value * 0.35 + pulse.value * 0.2 + amp.value * 0.3)));
  const haloColors = useDerivedValue(() => {
    const tone = interpolateColor(dim.value, [0, 1], [interpolateColor(hue.value, [0, 1], ["rgba(98,54,212,0.55)", "rgba(165,139,247,0.5)"]), "rgba(74,43,155,0.3)"]);
    return [tone, "rgba(98,54,212,0.16)", "rgba(19,11,38,0)"];
  });
  const pupilR = useDerivedValue(() => size * (0.05 + energy.value * 0.012 * (0.5 + 0.5 * Math.sin(corePhase.value)) + amp.value * 0.02 + pulse.value * 0.008 + hold.value * 0.006));
  const pupilColors = useDerivedValue(() => [
    "#FFFFFF",
    interpolateColor(dim.value, [0, 1], [interpolateColor(hue.value, [0, 1], [colors.violet300, colors.violet200]), colors.faint]),
    interpolateColor(dim.value, [0, 1], [colors.violet500, colors.violet800]),
  ]);
  const eyeColor = useDerivedValue(() => interpolateColor(dim.value, [0, 1], [interpolateColor(hue.value, [0, 1], [colors.violet300, colors.violet200]), colors.faint]));

  return (
    <Animated.View
      style={[{ width: size, height: size }, container]}
      accessible={announce}
      accessibilityRole={announce ? "image" : undefined}
      accessibilityLabel={announce ? STATE_LABEL[state] : undefined}
      accessibilityLiveRegion={announce ? "polite" : undefined}
      aria-hidden={!announce}
    >
      <Canvas style={{ width: size, height: size }} pointerEvents="none">
        <Circle cx={c} cy={c} r={c} opacity={haloOpacity}>
          <RadialGradient c={vec(c, c)} r={c} colors={haloColors} positions={[0, 0.5, 1]} />
        </Circle>

        {/* Metades de trás: passam por trás do núcleo, mais apagadas */}
        {geometry.map((ring, i) => (
          <RingHalf key={`b${i}`} path={ring.back} width={ring.width} tilt={ring.tilt} c={c} angle={angles[i]} energy={energy} hue={hue} dim={dim} glowPhase={glowPhase} phase={RINGS[i].phase} back />
        ))}

        {/* Núcleo: olho e pupila luminosa */}
        <Path path={eye} style="stroke" strokeWidth={Math.max(1, size * 0.016)} strokeJoin="round" color={eyeColor} />
        <Circle cx={c} cy={c} r={pupilR}>
          <RadialGradient c={vec(c - size * 0.012, c - size * 0.012)} r={size * 0.075} colors={pupilColors} positions={[0, 0.45, 1]} />
        </Circle>

        {/* Metades da frente e cometas de luz */}
        {geometry.map((ring, i) => (
          <Group key={`f${i}`}>
            <RingHalf path={ring.front} width={ring.width} tilt={ring.tilt} c={c} angle={angles[i]} energy={energy} hue={hue} dim={dim} glowPhase={glowPhase} phase={RINGS[i].phase} />
            <Comet path={ring.full} width={ring.width} tilt={ring.tilt} c={c} angle={angles[i]} travel={comets[i]} perimeter={ring.perimeter} fraction={RINGS[i].comet} energy={energy} pulse={pulse} dim={dim} />
          </Group>
        ))}
      </Canvas>
      {interactive ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole={onPress ? "button" : undefined}
          accessibilityLabel={onPress ? STATE_LABEL[state] : undefined}
          onPress={onPress}
          onPressIn={() => {
            press.value = withSpring(1, spring.press);
          }}
          onPressOut={() => {
            press.value = withSpring(0, { duration: 420, dampingRatio: 0.42 });
            hold.value = withTiming(0, { duration: 600, easing: easing.standard });
          }}
          onLongPress={() => {
            hold.value = withTiming(1, { duration: 700, easing: easing.standard });
          }}
          delayLongPress={280}
        />
      ) : null}
    </Animated.View>
  );
});

/** Metade de um anel: gira com o anel; o gradiente varre o traço e oscila entre os roxos. */
function RingHalf({
  path,
  width,
  tilt,
  c,
  angle,
  energy,
  hue,
  dim,
  glowPhase,
  phase,
  back = false,
}: {
  path: SkPath;
  width: number;
  tilt: number;
  c: number;
  angle: SharedValue<number>;
  energy: SharedValue<number>;
  hue: SharedValue<number>;
  dim: SharedValue<number>;
  glowPhase: SharedValue<number>;
  phase: number;
  back?: boolean;
}) {
  const transform = useDerivedValue(() => [{ rotate: tilt + (angle.value * Math.PI) / 180 }]);
  const sweep = useDerivedValue(() => {
    // Cada anel oscila em fase própria: os tons nunca mudam todos juntos.
    const mix = 0.5 + 0.5 * Math.sin(glowPhase.value + phase);
    const k = Math.min(1, Math.max(0, hue.value + (mix - 0.5) * 0.5));
    const deep = interpolateColor(k, [0, 0.5, 1], [DEEP[0], DEEP[1], DEEP[2]]);
    const light = interpolateColor(k, [0, 0.5, 1], [LIGHT[0], LIGHT[1], LIGHT[2]]);
    const orchid = interpolateColor(dim.value, [0, 1], [colors.orchid, colors.violet800]);
    return [interpolateColor(dim.value, [0, 1], [light, colors.faint]), orchid, deep, interpolateColor(dim.value, [0, 1], [light, colors.faint])];
  });
  const opacity = useDerivedValue(() => (back ? 0.26 + energy.value * 0.12 : 0.78 + energy.value * 0.22) * (1 - dim.value * 0.35));
  return (
    <Group origin={vec(c, c)} transform={transform} opacity={opacity}>
      <Path path={path} style="stroke" strokeWidth={width} strokeCap="round">
        <SweepGradient c={vec(c, c)} colors={sweep} />
      </Path>
    </Group>
  );
}

/** Cometa: um trecho curto e claro que percorre o anel; mais forte com o streaming. */
function Comet({
  path,
  width,
  tilt,
  c,
  angle,
  travel,
  perimeter,
  fraction,
  energy,
  pulse,
  dim,
}: {
  path: SkPath;
  width: number;
  tilt: number;
  c: number;
  angle: SharedValue<number>;
  travel: SharedValue<number>;
  perimeter: number;
  fraction: number;
  energy: SharedValue<number>;
  pulse: SharedValue<number>;
  dim: SharedValue<number>;
}) {
  const transform = useDerivedValue(() => [{ rotate: tilt + (angle.value * Math.PI) / 180 }]);
  const dashPhase = useDerivedValue(() => -travel.value * perimeter);
  const opacity = useDerivedValue(() => interpolate(energy.value, [0, 1], [0.18, 0.85]) * (1 - dim.value) + pulse.value * 0.25);
  const intervals = useMemo(() => [perimeter * fraction, perimeter * (1 - fraction)], [perimeter, fraction]);
  return (
    <Group origin={vec(c, c)} transform={transform} opacity={opacity}>
      <Path path={path} style="stroke" strokeWidth={width * 1.6} strokeCap="round" color="#FFFFFF">
        <DashPathEffect intervals={intervals} phase={dashPhase} />
      </Path>
    </Group>
  );
}

/** Mantém o mesmo nome de import nos dois lados (celular e web). */
export const KallyOrbital = KallyOrbitalSkia;

