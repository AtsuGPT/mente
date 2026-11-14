import { memo, useEffect, useMemo, useState } from "react";
import { Pressable } from "react-native";
import { BlendMode, BlurStyle, Canvas, PaintStyle, Picture, Skia, StrokeCap, StrokeJoin, TileMode, createPicture, type SkPaint, type SkPicture, type SkShader } from "@shopify/react-native-skia";
import Animated, { useAnimatedStyle, useFrameCallback, useSharedValue, withSpring, type SharedValue } from "react-native-reanimated";
import { scheduleOnUI } from "react-native-worklets";
import { useAmbientActive } from "@/lib/use-ambient";
import { spring } from "@/theme/motion";
import type { KallyOrbitalState } from "./activity";
import { burst, geometry, makeParticles, PARTICLE_HEX, smoothstep, stepParticles, STROKE_HEX, STYLE, SWEEP_HEX, type Particles, type Stroke } from "./orbit-geometry";

/**
 * KallyOrbital: a presença da Kally (aprovada na prévia de 14/11/2026).
 *
 * Em repouso, cada estado é um desenho vetorial nítido nas cores da órbita original (degradê circular lavanda →
 * orquídea → roxo profundo, metade de trás apagada, cometa quase branco). Quando o estado muda, o desenho se desfaz em
 * partículas no lugar exato das linhas; elas flutuam, escorregam para o novo desenho cada uma no seu tempo e voltam a
 * ser linhas (~1,4 s). Partículas e física só existem durante a troca; no repouso, cada quadro desenha só as linhas.
 *
 * Tudo roda na UI thread: um useFrameCallback calcula o quadro e grava uma SkPicture (createPicture), que o <Picture>
 * desenha. O estado da física fica no runtime da UI (globalThis), por instância. Fora de foco, com o app em segundo
 * plano ou com "reduzir movimento", a órbita fica parada no desenho do estado (sem partículas).
 */

type Props = {
  size?: number;
  state?: KallyOrbitalState;
  /** Pulso do streaming (useKallyActivity): o texto chegando acelera as ondas. */
  activity?: SharedValue<number>;
  /** Amplitude real do áudio (0–1): microfone em listening. */
  level?: SharedValue<number>;
  /** Mantido por compatibilidade (o brilho agora vem do estado). */
  intensity?: number;
  /** Responde ao toque (compressão elástica). */
  interactive?: boolean;
  onPress?: () => void;
  /** Anuncia o estado aos leitores de tela. */
  announce?: boolean;
};

const SHAPE: Record<KallyOrbitalState, number> = { idle: 0, listening: 1, thinking: 2, responding: 3, speaking: 3, memory: 4, research: 5, docs: 6, post: 7, error: 8 };

const STATE_LABEL: Record<KallyOrbitalState, string> = {
  idle: "Kally pronta",
  listening: "Kally escutando",
  thinking: "Kally preparando a resposta",
  memory: "Kally consultando suas memórias",
  research: "Kally pesquisando",
  docs: "Kally lendo o documento",
  post: "Kally escrevendo o rascunho",
  responding: "Kally respondendo",
  speaking: "Kally falando",
  error: "Kally: a resposta falhou",
};

/** Brilho do halo por desenho (idle, listening, thinking, responding, memory, research, docs, post, error). */
const HALO = [0.45, 0.6, 0.85, 0.75, 0.6, 0.6, 0.6, 0.65, 0.25];
/** Raio da órbita em fração do tamanho (sobra espaço para o halo e o voo das partículas). */
const RADIUS = 0.36;
/** Duração da troca: linhas acendem entre LINE_IN e as partículas somem até PART_OUT (s). */
const LINE_IN = [0.7, 1.15] as const;
const PART_OUT = [0.95, 1.4] as const;
/** Instante desenhado quando a órbita está parada (reduzir movimento, fora de foco). */
const STILL_T = 2.2;

type Kit = {
  stroke: SkPaint;
  dot: SkPaint;
  glow: SkPaint;
  halo: SkPaint;
  solid: Record<number, Float32Array>;
  sweep: Float32Array[];
  dots: Float32Array[];
};
type Orb = { p: Particles; shape: number; since: number; last: number; lvl: number; act: number; halo: number; kit: Kit };
type Registry = Record<string, Orb>;

function makeKit(): Kit {
  "worklet";
  const stroke = Skia.Paint();
  stroke.setAntiAlias(true);
  stroke.setStyle(PaintStyle.Stroke);
  stroke.setStrokeCap(StrokeCap.Round);
  stroke.setStrokeJoin(StrokeJoin.Round);
  stroke.setBlendMode(BlendMode.Plus);
  const dot = Skia.Paint();
  dot.setAntiAlias(true);
  dot.setBlendMode(BlendMode.Plus);
  const glow = Skia.Paint();
  glow.setAntiAlias(true);
  glow.setBlendMode(BlendMode.Plus);
  glow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 0.022, true));
  const halo = Skia.Paint();
  halo.setAntiAlias(true);
  halo.setShader(
    Skia.Shader.MakeRadialGradient(
      { x: 0, y: 0 },
      1.38,
      [Skia.Color("rgba(98,54,212,0.5)"), Skia.Color("rgba(98,54,212,0.22)"), Skia.Color("rgba(98,54,212,0.05)"), Skia.Color("rgba(98,54,212,0)")],
      [0, 0.42, 0.75, 1],
      TileMode.Clamp,
    ),
  );
  return {
    stroke,
    dot,
    glow,
    halo,
    solid: {
      [STYLE.core]: Skia.Color(STROKE_HEX.core),
      [STYLE.comet]: Skia.Color(STROKE_HEX.comet),
      [STYLE.light]: Skia.Color(STROKE_HEX.light),
      [STYLE.dim]: Skia.Color(STROKE_HEX.dim),
      [STYLE.fault]: Skia.Color(STROKE_HEX.fault),
    },
    sweep: SWEEP_HEX.map((hex) => Skia.Color(hex)),
    dots: PARTICLE_HEX.map((hex) => Skia.Color(hex)),
  };
}

/** Grava o quadro: halo, linhas (opacidade lineA) e partículas (opacidade partA). */
function paint(orb: Orb, strokes: Stroke[], size: number, lineA: number, partA: number): SkPicture {
  "worklet";
  const { kit, p } = orb;
  return createPicture(
    (canvas) => {
      const R = size * RADIUS;
      canvas.save();
      canvas.translate(size / 2, size / 2);
      canvas.scale(R, R);
      kit.halo.setAlphaf(Math.min(1, orb.halo));
      canvas.drawCircle(0, 0, 1.38, kit.halo);

      if (lineA > 0.01) {
        const minW = 0.9 / R;
        const shaders: Record<string, SkShader> = {};
        const paintStroke = kit.stroke;
        for (let i = 0; i < strokes.length; i++) {
          const s = strokes[i];
          if (s.a < 0.01) continue;
          const pts = s.p;
          const b = Skia.PathBuilder.Make();
          b.moveTo(pts[0], pts[1]);
          for (let k = 2; k < pts.length; k += 2) b.lineTo(pts[k], pts[k + 1]);
          if (s.c) b.close();
          const path = b.detach();
          if (s.s === STYLE.sweep) {
            const key = s.r.toFixed(3);
            let shader = shaders[key];
            if (!shader) {
              shader = Skia.Shader.MakeSweepGradient(0, 0, kit.sweep, [0, 0.33, 0.66, 1], TileMode.Clamp, Skia.Matrix().rotate(s.r));
              shaders[key] = shader;
            }
            paintStroke.setShader(shader);
          } else {
            paintStroke.setShader(null);
            paintStroke.setColor(kit.solid[s.s]);
          }
          const w = Math.max(minW, s.w);
          if (s.a > 0.5 || s.k) {
            paintStroke.setStrokeWidth(w * 3.6);
            paintStroke.setAlphaf(s.a * 0.14 * lineA);
            canvas.drawPath(path, paintStroke);
          }
          paintStroke.setStrokeWidth(w);
          paintStroke.setAlphaf(Math.min(1, s.a) * lineA);
          canvas.drawPath(path, paintStroke);
        }
      }

      if (partA > 0.01) {
        // Partículas agrupadas por cor e brilho: poucas chamadas de desenho por quadro.
        const unit = 1 / R;
        const base = Math.max(0.8, Math.min(1.5, size / 160)) * unit;
        const builders: ReturnType<typeof Skia.PathBuilder.Make>[] = [];
        for (let i = 0; i < p.n; i++) {
          const bb = p.b[i] * partA;
          if (bb < 0.02) continue;
          const slot = p.col[i] * 2 + (bb > 0.55 ? 1 : 0);
          let builder = builders[slot];
          if (!builder) {
            builder = Skia.PathBuilder.Make();
            builders[slot] = builder;
          }
          builder.addCircle(p.x[i], p.y[i], base * p.size[i] * (0.9 + bb * 0.7));
        }
        for (let slot = 0; slot < builders.length; slot++) {
          const builder = builders[slot];
          if (!builder) continue;
          const path = builder.detach();
          const alpha = (slot % 2 ? 0.95 : 0.5) * partA;
          const color = kit.dots[Math.floor(slot / 2)];
          kit.glow.setColor(color);
          kit.glow.setAlphaf(alpha * 0.6);
          canvas.drawPath(path, kit.glow);
          kit.dot.setColor(color);
          kit.dot.setAlphaf(alpha);
          canvas.drawPath(path, kit.dot);
        }
      }
      canvas.restore();
    },
    { width: size, height: size },
  );
}

/** Um quadro da órbita `id`. still: parada no desenho do estado (sem partículas nem tempo correndo). */
function frame(id: string, shapeNow: number, lvlNow: number, actNow: number, size: number, count: number, t: number, dt: number, still: boolean): SkPicture {
  "worklet";
  const g = globalThis as unknown as { __kallyOrbs?: Registry };
  const registry = (g.__kallyOrbs ??= {});
  let orb = registry[id];
  if (!orb || orb.p.n !== count) {
    orb = { p: makeParticles(count), shape: shapeNow, since: t, last: t, lvl: 0, act: 0, halo: HALO[shapeNow], kit: orb?.kit ?? makeKit() };
    registry[id] = orb;
  }
  orb.lvl += (lvlNow - orb.lvl) * Math.min(1, dt * (lvlNow > orb.lvl ? 18 : 6));
  orb.act += (actNow - orb.act) * Math.min(1, dt * 3);
  if (still) {
    orb.shape = shapeNow;
    orb.since = -10;
    orb.halo = HALO[shapeNow];
    return paint(orb, geometry(shapeNow, STILL_T, 0.35, 0.3), size, 1, 0);
  }
  if (shapeNow !== orb.shape) {
    // O desenho atual (se já assentado) vira partículas exatamente sobre as linhas; senão, elas seguem de onde estão.
    const settled = t - orb.since > PART_OUT[1];
    burst(orb.p, settled ? geometry(orb.shape, t, orb.lvl, orb.act) : null);
    orb.shape = shapeNow;
    orb.since = t;
  }
  const since = t - orb.since;
  const lineA = smoothstep(LINE_IN[0], LINE_IN[1], since);
  const partA = 1 - smoothstep(PART_OUT[0], PART_OUT[1], since);
  const strokes = geometry(orb.shape, t, orb.lvl, orb.act);
  if (partA > 0) stepParticles(orb.p, strokes, since, t, dt);
  const goal = HALO[orb.shape] + (orb.shape === 1 ? 0.4 * orb.lvl : orb.shape === 3 ? 0.25 * orb.act : 0);
  orb.halo += (goal - orb.halo) * Math.min(1, dt * 4);
  return paint(orb, strokes, size, lineA, partA);
}

let seq = 0;

export const KallyOrbitalSkia = memo(function KallyOrbitalSkia({ size = 48, state = "idle", activity, level, interactive = false, onPress, announce = false }: Props) {
  const active = useAmbientActive();
  const [id] = useState(() => `orb-${++seq}`);
  const zero = useSharedValue(0);
  const pulse = activity ?? zero;
  const amp = level ?? zero;
  const shape = useSharedValue(SHAPE[state]);
  // Menos partículas nos tamanhos pequenos: a forma continua legível e o quadro fica mais leve.
  const count = size >= 180 ? 460 : size >= 110 ? 320 : 200;
  const empty = useMemo(() => createPicture(() => undefined, { width: size, height: size }), [size]);
  const picture = useSharedValue<SkPicture>(empty);

  useEffect(() => {
    shape.value = SHAPE[state];
  }, [state, shape]);

  const ticker = useFrameCallback((info) => {
    "worklet";
    const dt = Math.min(info.timeSincePreviousFrame ?? 16, 48) / 1000;
    picture.value = frame(id, shape.value, amp.value, pulse.value, size, count, info.timestamp / 1000, dt, false);
  }, false);

  useEffect(() => {
    ticker.setActive(active);
    if (!active) {
      // Parada (fora de foco, app em segundo plano, "reduzir movimento"): um quadro só, com o desenho do estado.
      scheduleOnUI(() => {
        "worklet";
        picture.value = frame(id, shape.value, 0, 0, size, count, 0, 0.016, true);
      });
    }
  }, [active, ticker, picture, id, shape, size, count, state]);

  useEffect(
    () => () => {
      scheduleOnUI(() => {
        "worklet";
        const g = globalThis as unknown as { __kallyOrbs?: Registry };
        if (g.__kallyOrbs) delete g.__kallyOrbs[id];
      });
    },
    [id],
  );

  // Toque: compressão elástica.
  const press = useSharedValue(0);
  const container = useAnimatedStyle(() => ({ transform: [{ scale: 1 - press.value * 0.08 }] }));

  const body = (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      <Picture picture={picture} />
    </Canvas>
  );

  return (
    <Animated.View
      style={[{ width: size, height: size }, container]}
      accessible={announce}
      accessibilityRole={announce ? "image" : undefined}
      accessibilityLabel={announce ? STATE_LABEL[state] : undefined}
      accessibilityLiveRegion={announce ? "polite" : undefined}
      aria-hidden={!announce}
    >
      {interactive ? (
        <Pressable
          onPress={onPress}
          onPressIn={() => {
            press.value = withSpring(1, spring.press);
          }}
          onPressOut={() => {
            press.value = withSpring(0, spring.release);
          }}
          accessibilityRole={onPress ? "button" : undefined}
        >
          {body}
        </Pressable>
      ) : (
        body
      )}
    </Animated.View>
  );
});

export const KallyOrbital = KallyOrbitalSkia;
