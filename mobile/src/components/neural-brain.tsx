import { useEffect } from "react";
import Svg, { Circle, Defs, G, Line, Path, RadialGradient, Stop } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { colors } from "@/theme/tokens";

/**
 * Cérebro de perfil desenhado como rede neural: pontos dentro da silhueta,
 * ligados aos vizinhos mais próximos. Determinístico (semente fixa).
 */

const W = 300;
const H = 230;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number) {
  return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
}

/** Hemisfério + cerebelo + tronco encefálico. */
function insideBrain(x: number, y: number) {
  const cerebrum = inEllipse(x, y, 146, 100, 118, 78) && y < 158 - Math.max(0, (x - 150) * 0.25);
  const frontal = inEllipse(x, y, 86, 112, 62, 56);
  const cerebellum = inEllipse(x, y, 206, 160, 46, 27);
  const stem = x > 150 && x < 176 && y > 140 && y < 214 - (x - 150) * 0.4;
  return cerebrum || frontal || cerebellum || stem;
}

type Point = { x: number; y: number };

const graph = (() => {
  const random = mulberry32(20261031);
  const points: Point[] = [];
  for (let attempt = 0; attempt < 4000 && points.length < 78; attempt++) {
    const p = { x: 22 + random() * 256, y: 18 + random() * 200 };
    if (!insideBrain(p.x, p.y)) continue;
    if (points.some((q) => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 < 17 ** 2)) continue;
    points.push(p);
  }
  const edges: [number, number][] = [];
  const seen = new Set<string>();
  points.forEach((p, i) => {
    points
      .map((q, j) => ({ j, d: (q.x - p.x) ** 2 + (q.y - p.y) ** 2 }))
      .filter(({ j, d }) => j !== i && d < 42 ** 2)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .forEach(({ j }) => {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push([i, j]);
        }
      });
  });
  // Alguns nós "acendem" em sequência, espalhados pela forma.
  const pulses = points.map((_, i) => i).filter((i) => i % 9 === 4).slice(0, 8);
  return { points, edges, pulses };
})();

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function Pulse({ point, delay }: { point: Point; delay: number }) {
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 2200 }),
        ),
        -1,
      ),
    );
  }, [delay, glow]);
  return (
    <>
      <AnimatedHalo glow={glow} point={point} />
      <AnimatedCore glow={glow} point={point} />
    </>
  );
}

function AnimatedHalo({ glow, point }: { glow: SharedValue<number>; point: Point }) {
  const props = useAnimatedProps(() => ({ r: 5 + glow.value * 9, opacity: glow.value * 0.55 }));
  return <AnimatedCircle cx={point.x} cy={point.y} fill="url(#halo)" animatedProps={props} />;
}

function AnimatedCore({ glow, point }: { glow: SharedValue<number>; point: Point }) {
  const props = useAnimatedProps(() => ({ opacity: 0.35 + glow.value * 0.65 }));
  return <AnimatedCircle cx={point.x} cy={point.y} r={2.6} fill={colors.violet200} animatedProps={props} />;
}

export function NeuralBrain({ width = 300 }: { width?: number }) {
  const { points, edges, pulses } = graph;
  return (
    <Svg width={width} height={(width * H) / W} viewBox={`0 0 ${W} ${H}`} accessibilityLabel="Ilustração de um cérebro formado por conexões">
      <Defs>
        <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={colors.violet400} stopOpacity={0.9} />
          <Stop offset="1" stopColor={colors.violet500} stopOpacity={0} />
        </RadialGradient>
      </Defs>

      <G opacity={0.9}>
        {edges.map(([a, b]) => (
          <Line
            key={`${a}-${b}`}
            x1={points[a].x}
            y1={points[a].y}
            x2={points[b].x}
            y2={points[b].y}
            stroke={colors.violet600}
            strokeOpacity={0.45}
            strokeWidth={0.8}
          />
        ))}
      </G>

      {/* Sulcos: sugerem a anatomia sem desenhar um contorno fechado. */}
      <G stroke={colors.violet400} strokeOpacity={0.35} strokeWidth={1} fill="none" strokeLinecap="round">
        <Path d="M150 30 C140 60 158 82 146 112" />
        <Path d="M70 128 C110 120 150 128 196 112" />
        <Path d="M176 150 C190 152 214 150 236 160" />
      </G>

      {points.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={1.7} fill={colors.violet300} opacity={0.75} />
      ))}

      {pulses.map((index, order) => (
        <Pulse key={index} point={points[index]} delay={order * 650} />
      ))}
    </Svg>
  );
}
