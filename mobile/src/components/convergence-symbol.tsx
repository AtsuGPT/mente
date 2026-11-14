import { useEffect, useId, useMemo } from "react";
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

/**
 * Convergência: o símbolo da Mente. Dois arcos orbitais que se cruzam: o de Kayk (violeta, oito pontos; o oitavo é
 * a emenda de um colar remendado) e o de Julia (fios finos, cobre só onde a luz toca as pontas). Onde eles se cruzam,
 * a luz acende: a conexão. Mesma geometria dos ícones (scripts/gerar-icones.py) e da peça de identidade.
 *
 * simple: para tamanhos pequenos (fios viram uma fita, os pontos somem, a emenda engrossa). Na abertura do app, as
 * interseções respiram devagar (paradas com "reduzir movimento"). focus: uma parte em destaque e o resto apagado
 * (posts que explicam o símbolo, bloco ```convergencia no Markdown).
 */

export type ConvergencePart = "tudo" | "kayk" | "julia" | "emenda" | "conexao";

const C = 500;
const K = { rx: 360, ry: 128, rot: (-14 * Math.PI) / 180 };
const J = { rx: 150, ry: 352, rot: (-28 * Math.PI) / 180 };
type Ellipse = typeof K;

function pt(E: Ellipse, t: number, d = 0): [number, number] {
  const x = (E.rx + d) * Math.cos(t);
  const y = (E.ry + d) * Math.sin(t);
  const c = Math.cos(E.rot);
  const s = Math.sin(E.rot);
  return [C + x * c - y * s, C + x * s + y * c];
}

function arc(E: Ellipse, t0: number, t1: number, n: number, dfn?: (t: number) => number) {
  let p = "";
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    const q = pt(E, t, dfn ? dfn(t) : 0);
    p += `${i ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
  }
  return p;
}

const dot = (x: number, y: number, r: number) => `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

/** Tudo o que não muda com o tamanho: caminhos, pontos, emenda e interseções. */
function useGeometry() {
  return useMemo(() => {
    const PI = Math.PI;
    const offs = [-9, -3.2, 3.2, 9];
    const strands = offs.map((off, k) => ({
      front: arc(J, -PI / 2, PI / 2, 120, (t) => off + 2.6 * Math.sin(2 * t + k * 1.7)),
      back: arc(J, PI / 2, (3 * PI) / 2, 120, (t) => off + 2.6 * Math.sin(2 * t + k * 1.7)),
      width: k === 0 || k === 3 ? 2.8 : 2.3,
    }));
    const T0 = 0.42;
    let dotsFront = "";
    let dotsBack = "";
    for (let k = 1; k < 8; k++) {
      const t = T0 + (k * 2 * PI) / 8;
      const q = pt(K, t);
      if (Math.sin(t) > 0) dotsFront += dot(q[0], q[1], 4.2);
      else dotsBack += dot(q[0], q[1], 3.4);
    }
    const seam = pt(K, T0);
    const dx = -K.rx * Math.sin(T0);
    const dy = K.ry * Math.cos(T0);
    const tangent = (Math.atan2(dx * Math.sin(K.rot) + dy * Math.cos(K.rot), dx * Math.cos(K.rot) - dy * Math.sin(K.rot)) * 180) / PI;
    const hits: { x: number; y: number; front: number }[] = [];
    let prev: number | null = null;
    for (let i = 0; i <= 1440; i++) {
      const t = (2 * PI * i) / 1440;
      const q = pt(K, t);
      const c = Math.cos(J.rot);
      const s = Math.sin(J.rot);
      const lx = (q[0] - C) * c + (q[1] - C) * s;
      const ly = -(q[0] - C) * s + (q[1] - C) * c;
      const f = (lx / J.rx) ** 2 + (ly / J.ry) ** 2 - 1;
      if (prev !== null && prev < 0 !== f < 0) hits.push({ x: q[0], y: q[1], front: (Math.sin(t) > 0 ? 1 : 0) + (lx > 0 ? 1 : 0) });
      prev = f;
    }
    return {
      kaykLoop: arc(K, 0, 2 * PI, 180),
      kaykFront: arc(K, 0, PI, 90),
      kaykBack: arc(K, PI, 2 * PI, 90),
      kaykSheen: arc(K, 0.15, PI - 0.15, 80, () => -4),
      juliaFront: arc(J, -PI / 2, PI / 2, 120),
      juliaBack: arc(J, PI / 2, (3 * PI) / 2, 120),
      strands,
      dotsFront,
      dotsBack,
      seam,
      tangent,
      hits,
    };
  }, []);
}

const AnimatedG = Animated.createAnimatedComponent(G);

export function ConvergenceSymbol({ size = 160, simple = false, tile = false, breathe = false, focus = "tudo" }: { size?: number; simple?: boolean; tile?: boolean; breathe?: boolean; focus?: ConvergencePart }) {
  const g = useGeometry();
  // Nomes únicos para os degradês de cada cópia: com nomes repetidos, a página toda usava os da primeira cópia, e uma
  // cópia escondida (em outra aba) apagava os arcos das outras.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const ref = (name: string) => `cs-${name}-${uid}`;
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!breathe || reduceMotion) return;
    pulse.value = withRepeat(withTiming(1, { duration: 2_400, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [breathe, reduceMotion, pulse]);
  const flares = useAnimatedProps(() => ({ opacity: 0.72 + pulse.value * 0.28 }));
  const kw = simple ? 22 : 14;
  const sc = simple ? 1.6 : 1;
  // Destaque: a parte escolhida inteira; o resto apagado, para ela se ler sozinha.
  const kayk = focus === "julia" ? 0.1 : focus === "emenda" || focus === "conexao" ? 0.4 : 1;
  const julia = focus === "kayk" ? 0.1 : focus === "emenda" || focus === "conexao" ? 0.4 : 1;
  const seamOp = focus === "julia" ? 0.1 : 1;
  const light = focus === "conexao" ? 1 : focus === "tudo" ? 1 : 0.25;
  const grow = focus === "conexao" ? 1.3 : 1;

  return (
    <Svg width={size} height={size} viewBox="0 0 1000 1000" accessibilityRole="image" accessibilityLabel="Convergência, o símbolo da Mente">
      <Defs>
        <RadialGradient id={ref("tile")} cx="50%" cy="46%" r="72%">
          <Stop offset="0" stopColor="#06030B" />
          <Stop offset="0.58" stopColor="#0C0618" />
          <Stop offset="0.86" stopColor="#24105A" />
          <Stop offset="1" stopColor="#3D1A92" />
        </RadialGradient>
        <LinearGradient id={ref("kayk")} x1="0" y1="0.35" x2="1" y2="0.65">
          <Stop offset="0" stopColor="#6B45DE" />
          <Stop offset="0.3" stopColor="#A58BF7" />
          <Stop offset="0.52" stopColor="#E7DEFF" />
          <Stop offset="0.74" stopColor="#9A78F3" />
          <Stop offset="1" stopColor="#5A33CC" />
        </LinearGradient>
        <LinearGradient id={ref("julia")} x1="0.22" y1="0" x2="0.78" y2="1">
          <Stop offset="0" stopColor="#F7CBA8" />
          <Stop offset="0.16" stopColor="#E99A7E" />
          <Stop offset="0.36" stopColor="#C98BC8" />
          <Stop offset="0.5" stopColor="#9E74EA" />
          <Stop offset="0.64" stopColor="#C98BC8" />
          <Stop offset="0.84" stopColor="#E99A7E" />
          <Stop offset="1" stopColor="#F7CBA8" />
        </LinearGradient>
        <RadialGradient id={ref("flare")} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.95} />
          <Stop offset="0.18" stopColor="#F1E6FF" stopOpacity={0.75} />
          <Stop offset="0.5" stopColor="#B58CF5" stopOpacity={0.22} />
          <Stop offset="1" stopColor="#8461F0" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={ref("warm")} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#F2D7B8" stopOpacity={0.45} />
          <Stop offset="1" stopColor="#F2D7B8" stopOpacity={0} />
        </RadialGradient>
      </Defs>

      {tile ? <Rect x={36} y={36} width={928} height={928} rx={214} fill={`url(#${ref("tile")})`} stroke="rgba(165,139,247,0.22)" strokeWidth={2} /> : null}

      {/* Brilho largo (sem desfoque: traços largos e quase transparentes) */}
      <Path d={g.kaykLoop} fill="none" stroke="#8461F0" strokeWidth={46} strokeOpacity={0.07 * kayk} />
      <Path d={g.juliaFront} fill="none" stroke="#E7A08C" strokeWidth={38} strokeOpacity={0.08 * julia} />

      {/* Metades de trás */}
      <Path d={g.kaykBack} fill="none" stroke={`url(#${ref("kayk")})`} strokeWidth={kw} strokeOpacity={0.42 * kayk} strokeLinecap="round" />
      <G opacity={julia}>
      {simple ? (
        <Path d={g.juliaBack} fill="none" stroke={`url(#${ref("julia")})`} strokeWidth={20} strokeOpacity={0.45} strokeLinecap="round" />
      ) : (
        <G opacity={0.45}>
          {g.strands.map((s, i) => (
            <Path key={`b${i}`} d={s.back} fill="none" stroke={`url(#${ref("julia")})`} strokeWidth={s.width} strokeLinecap="round" />
          ))}
        </G>
      )}
      </G>
      {simple ? null : <Path d={g.dotsBack} fill="#EDE5FF" opacity={0.42 * kayk} />}

      {/* Metades da frente */}
      <G opacity={julia}>
      {simple ? (
        <Path d={g.juliaFront} fill="none" stroke={`url(#${ref("julia")})`} strokeWidth={20} strokeLinecap="round" />
      ) : (
        <G>
          <Path d={g.juliaFront} fill="none" stroke={`url(#${ref("julia")})`} strokeWidth={14} strokeOpacity={0.22} />
          {g.strands.map((s, i) => (
            <Path key={`f${i}`} d={s.front} fill="none" stroke={`url(#${ref("julia")})`} strokeWidth={s.width} strokeLinecap="round" />
          ))}
        </G>
      )}
      </G>
      <G opacity={kayk}>
        <Path d={g.kaykFront} fill="none" stroke={`url(#${ref("kayk")})`} strokeWidth={kw} strokeLinecap="round" />
        {simple ? null : (
          <>
            <Path d={g.kaykSheen} fill="none" stroke="#F6F1FF" strokeWidth={1.6} strokeOpacity={0.6} strokeLinecap="round" />
            <Path d={g.dotsFront} fill="#F7F3FF" opacity={0.9} />
          </>
        )}
      </G>

      {/* Emenda (8º ponto): um corte fino e duas faixas claras que o costuram */}
      {focus === "emenda" ? <Circle cx={g.seam[0]} cy={g.seam[1]} r={48} fill="none" stroke="#F2E6D8" strokeWidth={2} strokeDasharray="3 8" opacity={0.85} /> : null}
      <G opacity={seamOp} transform={`translate(${g.seam[0].toFixed(1)} ${g.seam[1].toFixed(1)}) rotate(${g.tangent.toFixed(1)}) scale(${focus === "emenda" ? sc * 1.5 : sc})`}>
        <Circle cx={0} cy={0} r={18} fill={`url(#${ref("warm")})`} />
        <Rect x={-0.8} y={-(kw + 1) / 2} width={1.6} height={kw + 1} fill="#120A1E" opacity={0.55} />
        <Rect x={-4.15} y={-(kw * 1.15) / 2} width={1.5} height={kw * 1.15} rx={0.75} fill="#FFF4E8" opacity={0.95} />
        <Rect x={2.65} y={-(kw * 1.15) / 2} width={1.5} height={kw * 1.15} rx={0.75} fill="#FFF4E8" opacity={0.95} />
      </G>

      {/* Interseções: a conexão */}
      <G opacity={light}>
        <AnimatedG animatedProps={flares}>
          {g.hits.map((h, i) => (
            <Circle key={i} cx={h.x} cy={h.y} r={((simple ? 44 : 34) + 9 * h.front) * grow} fill={`url(#${ref("flare")})`} opacity={0.45 + 0.275 * h.front} />
          ))}
        </AnimatedG>
      </G>
    </Svg>
  );
}
