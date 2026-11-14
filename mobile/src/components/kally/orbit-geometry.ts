/**
 * Geometria da órbita da Kally (aprovada na prévia de 14/11/2026). Cada estado é uma lista de traços em unidades da
 * órbita (raio externo = 1): os mesmos traços viram as linhas nítidas do repouso e os alvos das partículas durante a
 * troca de estado. Tudo aqui roda na UI thread (worklets), quadro a quadro.
 *
 * Traço: { p: [x0, y0, x1, y1, ...], c: fechado, w: espessura, a: opacidade, s: estilo, r: giro do degradê, k: centro }
 */

export const TAU = Math.PI * 2;

/** Estados visuais. "thinking" é o processando; "speaking" usa o desenho de "responding". */
export const ORB_STATES = ["idle", "listening", "thinking", "responding", "memory", "research", "docs", "post", "error"] as const;
export type OrbShape = (typeof ORB_STATES)[number];

/** Estilos de traço: sweep = degradê circular da órbita (lavanda → orquídea → roxo profundo). */
export const STYLE = { sweep: 0, core: 1, comet: 2, light: 3, dim: 4, fault: 5 } as const;

/** Cores das partículas, pelo estilo do traço de onde elas saíram. */
export const PARTICLE_HEX = ["#6236D4", "#8461F0", "#A58BF7", "#C7B7FA", "#E4DBFD", "#B65CF2", "#6E6787"] as const;
export const STROKE_HEX = { core: "#E4DBFD", comet: "#F4EFFF", light: "#C7B7FA", dim: "#A58BF7", fault: "#6E6787" } as const;
export const SWEEP_HEX = ["#C7B7FA", "#B65CF2", "#4A2B9B", "#C7B7FA"] as const;

export type Stroke = { p: number[]; c: boolean; w: number; a: number; s: number; r: number; k: boolean };

/** Anéis da órbita original: proporções, inclinação (graus), período de giro (s), sentido, espessura, cometa. */
const RINGS = [
  { rx: 0.58, ry: 0.215, tilt: 18, period: 2.5, dir: 1, w: 0.036, comet: 0.16, cs: 1.25, ph: 0 },
  { rx: 0.806, ry: 0.28, tilt: 116, period: 3.5, dir: -1, w: 0.029, comet: 0.12, cs: 0.95, ph: 1.9 },
  { rx: 1, ry: 0.232, tilt: -36, period: 5, dir: 1, w: 0.024, comet: 0.1, cs: 0.7, ph: 3.7 },
];

function ell(rx: number, ry: number, rot: number, a0: number, a1: number, steps: number) {
  "worklet";
  const p: number[] = [];
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    p.push(x * cr - y * sr, x * sr + y * cr);
  }
  return p;
}

function circ(cx: number, cy: number, r: number, steps: number) {
  "worklet";
  const p: number[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * TAU;
    p.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return p;
}

/** Arco em pedaços com opacidade e espessura crescentes (cauda → cabeça). headStyle: estilo dos 30% finais. */
function trail(out: Stroke[], rx: number, ry: number, rot: number, a0: number, a1: number, pieces: number, w0: number, w1: number, alpha: number, style: number, headStyle: number, pow: number) {
  "worklet";
  for (let k = 0; k < pieces; k++) {
    const f = (k + 1) / pieces;
    out.push({
      p: ell(rx, ry, rot, a0 + ((a1 - a0) * k) / pieces, a0 + ((a1 - a0) * (k + 1)) / pieces, 4),
      c: false,
      w: w0 + (w1 - w0) * f,
      a: alpha * Math.pow(f, pow),
      s: f < 0.7 ? style : headStyle,
      r: rot,
      k: false,
    });
  }
}

/** Os traços do estado `shape` no instante `t` (s), com o nível da voz e a atividade do texto (0–1). */
export function geometry(shape: number, t: number, lvl: number, act: number): Stroke[] {
  "worklet";
  const S: Stroke[] = [];
  const add = (p: number[], c: boolean, w: number, a: number, s: number, r = 0, k = false) => {
    S.push({ p, c, w, a, s, r, k });
  };
  switch (shape) {
    case 0: {
      // idle: as três órbitas achatadas da Kally, com o cometa claro em cada anel, e a estrela de quatro pontas.
      const rots = RINGS.map((R) => (R.tilt * Math.PI) / 180 + R.dir * t * (TAU / R.period) * 0.3);
      for (let i = 0; i < 3; i++) add(ell(RINGS[i].rx, RINGS[i].ry, rots[i], Math.PI, TAU, 36), false, RINGS[i].w * 0.8, 0.28, STYLE.sweep, rots[i]);
      for (let i = 0; i < 3; i++) {
        const R = RINGS[i];
        add(ell(R.rx, R.ry, rots[i], 0, Math.PI, 36), false, R.w, 0.9, STYLE.sweep, rots[i]);
        const head = R.ph + t * R.cs * 1.7 * R.dir;
        const span = R.comet * TAU * R.dir;
        const front = Math.sin(((head % TAU) + TAU) % TAU) > 0 ? 1 : 0.35;
        trail(S, R.rx, R.ry, rots[i], head - span, head, 6, R.w * 0.6, R.w * 1.5, 0.95 * front, STYLE.comet, STYLE.comet, 1.4);
      }
      const sc = 0.2 * (1 + 0.04 * Math.sin(t * 1.4));
      const rot = t * 0.25;
      const p: number[] = [];
      for (let k = 0; k < 72; k++) {
        const a = (k / 72) * TAU;
        const x = sc * Math.cos(a) ** 3;
        const y = sc * Math.sin(a) ** 3;
        p.push(x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot));
      }
      add(p, true, 0.03, 0.95, STYLE.core, 0, true);
      add(circ(0, 0, 0.026, 12), true, 0.03, 0.9, STYLE.core, 0, true);
      break;
    }
    case 1: {
      // listening: a borda ondula com a voz; cinco barras seguem as sílabas.
      const p: number[] = [];
      for (let k = 0; k < 140; k++) {
        const th = (k / 140) * TAU;
        const r = 0.96 + lvl * (0.16 * Math.sin(5 * th - t * 5) + 0.1 * Math.sin(8 * th + t * 3.7) + 0.06 * Math.sin(3 * th + t * 2.1));
        p.push(Math.cos(th) * r, Math.sin(th) * r);
      }
      add(circ(0, 0, 0.8, 72), true, 0.016, 0.14 + 0.1 * lvl, STYLE.sweep, -t * 0.4);
      add(p, true, 0.032, 0.6 + 0.4 * lvl, STYLE.sweep, t * 0.6);
      const weights = [0.6, 0.85, 1, 0.85, 0.6];
      for (let k = 0; k < 5; k++) {
        const x = -0.24 + k * 0.12;
        const h = 0.05 + lvl * 0.34 * weights[k] * (0.55 + 0.45 * Math.sin(t * 8.5 + k * 1.9));
        add([x, -h, x, h], false, 0.05, 0.95, STYLE.core, 0, true);
      }
      break;
    }
    case 2: {
      // thinking: cometa girando, anel pontilhado por dentro, três pontos orbitando o centro.
      add(circ(0, 0, 1, 96), true, 0.018, 0.12, STYLE.sweep, t * 0.5);
      const h = t * 3.3 + 0.7 * Math.sin(t * 1.3);
      trail(S, 1, 1, 0, h - 1.55 * Math.PI, h, 16, 0.014, 0.042, 1, STYLE.sweep, STYLE.comet, 1.6);
      for (let k = 0; k < 22; k++) {
        const a = (k / 22) * TAU - t * 0.9;
        add(ell(0.74, 0.74, 0, a, a + 0.11, 3), false, 0.02, 0.3, STYLE.dim);
      }
      for (let d = 0; d < 3; d++) {
        const a = t * 2.6 + (d * TAU) / 3;
        add(circ(Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0.042 + 0.016 * Math.sin(t * 4 + d * 2), 14), true, 0.032, 0.95, STYLE.core, 0, true);
      }
      break;
    }
    case 3: {
      // responding: ondas saem no ritmo do texto; três linhas vão sendo escritas.
      add(circ(0, 0, 1, 96), true, 0.02, 0.24, STYLE.sweep, t * 0.3);
      for (let o = 0; o < 3; o++) {
        const ph = (t * (0.3 + 0.35 * act) + o / 3) % 1;
        add(circ(0, 0, 0.72 + ph * 0.42, 84), true, 0.022, (1 - ph) * 0.8 * (ph < 0.12 ? ph / 0.12 : 1), STYLE.sweep, t * 0.2 * (o % 2 ? -1 : 1));
      }
      const pr = Math.min(1, (t * (0.42 + act * 0.3)) % 1.25);
      const widths = [0.52, 0.4, 0.46];
      let cx = -0.22;
      let cy = -0.13;
      for (let l = 0; l < 3; l++) {
        const vis = Math.max(0, Math.min(1, pr * 3 - l)) * widths[l];
        const y = -0.13 + l * 0.13;
        if (vis > 0.01) {
          add([-0.26, y, -0.26 + vis, y], false, 0.036, 0.95, STYLE.core, 0, true);
          cx = -0.26 + vis + 0.04;
          cy = y;
        }
      }
      add([cx, cy - 0.055, cx, cy + 0.055], false, 0.026, Math.sin(t * 9) > 0 ? 1 : 0.5, STYLE.comet, 0, true);
      break;
    }
    case 4: {
      // memory: constelação de sete nós ligados; no centro, uma pequena rede.
      const rot = t * 0.16;
      const nodes: number[] = [];
      for (let k = 0; k < 7; k++) {
        const a = rot + (k / 7) * TAU;
        nodes.push(Math.cos(a), Math.sin(a));
      }
      for (let k = 0; k < 7; k++) {
        const j = (k + 2) % 7;
        add([nodes[k * 2], nodes[k * 2 + 1], nodes[j * 2], nodes[j * 2 + 1]], false, 0.014, 0.22 + 0.12 * Math.sin(t * 2 + k), STYLE.sweep, rot);
      }
      for (let k = 0; k < 7; k++) add(circ(nodes[k * 2], nodes[k * 2 + 1], 0.055, 14), true, 0.03, 0.95, STYLE.light);
      const v: number[] = [];
      const r2 = t * 0.35;
      for (let k = 0; k < 6; k++) {
        const a = r2 + (k / 6) * TAU;
        v.push(Math.cos(a) * 0.21, Math.sin(a) * 0.21);
      }
      add(v, true, 0.028, 0.95, STYLE.core, 0, true);
      for (let k = 0; k < 6; k += 2) add([0, 0, v[k * 2], v[k * 2 + 1]], false, 0.022, 0.7, STYLE.core, 0, true);
      add(circ(0, 0, 0.035, 12), true, 0.03, 0.95, STYLE.core, 0, true);
      break;
    }
    case 5: {
      // research: globo com meridianos girando e uma lupa que varre o centro.
      add(circ(0, 0, 1, 96), true, 0.026, 0.6, STYLE.sweep, t * 0.4);
      add(ell(Math.cos(t * 0.9), 1, 0, 0, TAU, 60), true, 0.016, 0.32, STYLE.light);
      add(ell(Math.cos(t * 0.9 + Math.PI / 2), 1, 0, 0, TAU, 60), true, 0.016, 0.32, STYLE.light);
      add(ell(1, 0.2, 0, 0, TAU, 60), true, 0.016, 0.28, STYLE.light);
      const cx = -0.06 + 0.05 * Math.cos(t * 1.5);
      const cy = -0.06 + 0.05 * Math.sin(t * 1.5);
      const r = 0.16;
      const d = Math.SQRT1_2;
      add(circ(cx, cy, r, 32), true, 0.036, 0.95, STYLE.core, 0, true);
      add([cx + r * d, cy + r * d, cx + 0.38 * d, cy + 0.38 * d], false, 0.05, 0.95, STYLE.core, 0, true);
      break;
    }
    case 6: {
      // docs: página com a linha de leitura; a borda acende na mesma altura.
      const w = 0.34;
      const h = 0.44;
      const f = 0.09;
      const x0 = -w / 2;
      const y0 = -h / 2;
      const ys = y0 + (0.5 + 0.5 * Math.sin(t * 2.1)) * h;
      const yn = Math.max(-1, Math.min(1, ys / 0.22));
      add(circ(0, 0, 1, 96), true, 0.022, 0.26, STYLE.sweep, t * 0.12);
      const th = Math.asin(yn * 0.98);
      add(ell(1, 1, 0, th - 0.3, th + 0.3, 10), false, 0.034, 0.9, STYLE.comet);
      add(ell(1, 1, 0, Math.PI - th - 0.3, Math.PI - th + 0.3, 10), false, 0.034, 0.9, STYLE.comet);
      add([x0, y0, w / 2 - f, y0, w / 2, y0 + f, w / 2, h / 2, x0, h / 2], true, 0.028, 0.95, STYLE.core, 0, true);
      add([w / 2 - f, y0, w / 2 - f, y0 + f, w / 2, y0 + f], false, 0.022, 0.7, STYLE.core, 0, true);
      add([x0 + 0.06, -0.08, w / 2 - 0.08, -0.08], false, 0.022, 0.45, STYLE.light, 0, true);
      add([x0 + 0.06, 0.02, w / 2 - 0.06, 0.02], false, 0.022, 0.45, STYLE.light, 0, true);
      add([x0 + 0.06, 0.12, 0.02, 0.12], false, 0.022, 0.45, STYLE.light, 0, true);
      add([x0 - 0.07, ys, w / 2 + 0.07, ys], false, 0.03, 1, STYLE.comet, 0, true);
      break;
    }
    case 7: {
      // post: uma pena escreve uma linha no centro; uma luz percorre a órbita.
      add(circ(0, 0, 1, 96), true, 0.022, 0.3, STYLE.sweep, t * 0.25);
      const head = t * 1.8;
      trail(S, 1, 1, 0, head - 0.9, head, 8, 0.02, 0.04, 1, STYLE.comet, STYLE.comet, 1.4);
      const pr = (t * 0.32) % 1;
      const sq: number[] = [];
      const x0 = -0.3;
      const x1 = x0 + 0.6 * Math.max(0.02, pr);
      for (let k = 0; k <= 30; k++) {
        const x = x0 + ((x1 - x0) * k) / 30;
        sq.push(x, 0.2 + 0.035 * Math.sin(x * 38));
      }
      const ex = sq[sq.length - 2];
      const ey = sq[sq.length - 1];
      const dx = 0.16;
      const dy = -0.32;
      const L = Math.hypot(dx, dy);
      const nx = (-dy / L) * 0.05;
      const ny = (dx / L) * 0.05;
      add(sq, false, 0.03, 0.95, STYLE.core, 0, true);
      add([ex, ey, ex + dx + nx, ey + dy + ny, ex + dx - nx, ey + dy - ny], true, 0.028, 0.95, STYLE.core, 0, true);
      add([ex, ey, ex + dx * 0.55, ey + dy * 0.55], false, 0.02, 0.6, STYLE.core, 0, true);
      break;
    }
    default: {
      // error: a órbita se parte em arcos apagados; o centro vira uma linha reta.
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU + t * 0.04;
        add(ell(0.97, 0.97, 0, a, a + (TAU / 5) * 0.74, 16), false, 0.022, 0.34, STYLE.fault);
      }
      add([-0.18, 0, 0.18, 0], false, 0.03, 0.55, STYLE.fault, 0, true);
    }
  }
  return S;
}

/** Cor da partícula pelo estilo do traço (sweep varia como o degradê). */
export function particleColor(style: number, seed: number) {
  "worklet";
  if (style === STYLE.core || style === STYLE.comet) return 4;
  if (style === STYLE.light) return 3;
  if (style === STYLE.dim) return 2;
  if (style === STYLE.fault) return 6;
  return seed < 0.4 ? 3 : seed < 0.65 ? 5 : seed < 0.85 ? 1 : 0;
}

export type Particles = {
  n: number;
  core: number;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  tx: Float32Array;
  ty: Float32Array;
  b: Float32Array;
  seed: Float32Array;
  delay: Float32Array;
  size: Float32Array;
  col: Uint8Array;
  colGoal: Uint8Array;
};

/**
 * Distribui `n` partículas ao longo dos traços (do centro ou da órbita), pelo comprimento, a partir do índice `off`.
 * A ordem é estável: a partícula i ocupa sempre a mesma fração do desenho, e a troca de forma fica coerente.
 */
export function sample(strokes: Stroke[], wantCore: boolean, n: number, off: number, o: Particles) {
  "worklet";
  const segs: number[] = [];
  let total = 0;
  for (let si = 0; si < strokes.length; si++) {
    const s = strokes[si];
    if (s.k !== wantCore) continue;
    const p = s.p;
    const m = p.length / 2;
    const count = s.c ? m : m - 1;
    for (let k = 0; k < count; k++) {
      const a = k * 2;
      const b = ((k + 1) % m) * 2;
      const L = Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1]);
      segs.push(p[a], p[a + 1], p[b], p[b + 1], L, s.a, s.s);
      total += L;
    }
  }
  const cnt = segs.length / 7;
  if (!cnt || total < 1e-6) {
    for (let i = 0; i < n; i++) {
      o.tx[off + i] = 0;
      o.ty[off + i] = 0;
      o.b[off + i] = 0;
    }
    return;
  }
  let si = 0;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const d = ((i + 0.5) / n) * total;
    while (si < cnt - 1 && acc + segs[si * 7 + 4] < d) {
      acc += segs[si * 7 + 4];
      si++;
    }
    const s = si * 7;
    const L = segs[s + 4] || 1e-6;
    const f = Math.min(1, Math.max(0, (d - acc) / L));
    const j = off + i;
    o.tx[j] = segs[s] + (segs[s + 2] - segs[s]) * f;
    o.ty[j] = segs[s + 1] + (segs[s + 3] - segs[s + 1]) * f;
    o.b[j] = Math.max(0.3, segs[s + 5]);
    o.colGoal[j] = particleColor(segs[s + 6], o.seed[j]);
  }
}

export function makeParticles(n: number): Particles {
  "worklet";
  const core = Math.floor(n * 0.3);
  const p: Particles = {
    n,
    core,
    x: new Float32Array(n),
    y: new Float32Array(n),
    vx: new Float32Array(n),
    vy: new Float32Array(n),
    tx: new Float32Array(n),
    ty: new Float32Array(n),
    b: new Float32Array(n),
    seed: new Float32Array(n),
    delay: new Float32Array(n),
    size: new Float32Array(n),
    col: new Uint8Array(n),
    colGoal: new Uint8Array(n),
  };
  for (let i = 0; i < n; i++) {
    const s = Math.random();
    const a = Math.random() * TAU;
    const r = 0.3 + Math.random() * 1.1;
    p.seed[i] = s;
    p.x[i] = Math.cos(a) * r;
    p.y[i] = Math.sin(a) * r;
    p.delay[i] = 0.04 + 0.34 * ((i * 0.6180339 + s * 0.25) % 1);
    p.size[i] = 0.75 + Math.random() * 0.5;
    p.col[i] = 3;
    p.colGoal[i] = 3;
  }
  return p;
}

/** Antes da troca: o desenho atual vira partículas no lugar exato das linhas, e cada uma recebe um empurrão. */
export function burst(p: Particles, strokes: Stroke[] | null) {
  "worklet";
  if (strokes) {
    sample(strokes, true, p.core, 0, p);
    sample(strokes, false, p.n - p.core, p.core, p);
    for (let i = 0; i < p.n; i++) {
      p.x[i] = p.tx[i];
      p.y[i] = p.ty[i];
      p.vx[i] = 0;
      p.vy[i] = 0;
      p.col[i] = p.colGoal[i];
    }
  }
  for (let i = 0; i < p.n; i++) {
    const x = p.x[i];
    const y = p.y[i];
    const L = Math.hypot(x, y) || 1;
    const s = p.seed[i];
    const out = (0.7 + s * 1.1) * 1.25;
    p.vx[i] += (x / L) * out - (y / L) * 0.55 * (s - 0.5);
    p.vy[i] += (y / L) * out + (x / L) * 0.55 * (s - 0.5);
  }
}

/** Um passo da física: mola até o alvo (cada partícula no seu tempo) e uma deriva suave enquanto ela está solta. */
export function stepParticles(p: Particles, strokes: Stroke[], since: number, t: number, dt: number) {
  "worklet";
  sample(strokes, true, p.core, 0, p);
  sample(strokes, false, p.n - p.core, p.core, p);
  const K = 58;
  const D = 2 * Math.sqrt(K) * 0.7;
  for (let i = 0; i < p.n; i++) {
    const tau = since - p.delay[i];
    const q = Math.min(1, Math.max(0, tau / 0.6));
    const m = tau <= 0 ? 0.03 : 0.03 + 0.97 * q * q * (3 - 2 * q);
    if (m > 0.5) p.col[i] = p.colGoal[i];
    const s = p.seed[i];
    const k = K * m * (0.75 + s * 0.5);
    const x = p.x[i];
    const y = p.y[i];
    const dm = D * Math.sqrt(m);
    const drift = (1 - m) * 1.4;
    const ax = k * (p.tx[i] - x) - dm * p.vx[i] + Math.sin(y * 4 + t * 1.7 + s * 6.28) * drift - (1 - m) * 0.9 * p.vx[i];
    const ay = k * (p.ty[i] - y) - dm * p.vy[i] + Math.cos(x * 4 - t * 1.3 + s * 3.1) * drift - (1 - m) * 0.9 * p.vy[i];
    p.vx[i] += ax * dt;
    p.vy[i] += ay * dt;
    p.x[i] += p.vx[i] * dt;
    p.y[i] += p.vy[i] * dt;
  }
}

export function smoothstep(a: number, b: number, v: number) {
  "worklet";
  const x = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return x * x * (3 - 2 * x);
}
