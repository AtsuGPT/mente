/**
 * Geometria dos símbolos da Kally, calculada quadro a quadro.
 *
 * Tudo é desenhado numa caixa 200×200 (centro em 100,100) e devolvido como strings de
 * caminho SVG, uma por camada. As funções são worklets: rodam na thread de UI pelo
 * Reanimated no app e funcionam como JavaScript comum na web.
 *
 * Entrada de cada quadro:
 *  - t: segundos desde o início
 *  - px, py: posição do dedo/ponteiro em relação ao centro do símbolo (-1..1, suavizada)
 *  - pa: o quanto o dedo está presente (0..1, suavizado)
 *  - energy: "energia" de digitação (sobe a cada tecla e decai sozinha, 0..1)
 */

export type KallySymbolKind = "constelacao" | "onda" | "orbita" | "cacho";

export type SymbolInput = { t: number; px: number; py: number; pa: number; energy: number };

/** Como pintar cada camada: gradiente roxo, cor do fundo (recorte) ou brilho claro. */
export type LayerFill = "grad" | "deep" | "bg" | "hi";
export type LayerSpec = { fill: LayerFill; opacity?: number; evenOdd?: boolean };

export const KALLY_SYMBOLS: { kind: KallySymbolKind; label: string }[] = [
  { kind: "constelacao", label: "Constelação" },
  { kind: "onda", label: "Onda" },
  { kind: "orbita", label: "Órbita" },
  { kind: "cacho", label: "Cacho" },
];

export const LAYERS: Record<KallySymbolKind, LayerSpec[]> = {
  constelacao: [{ fill: "grad" }],
  onda: [{ fill: "grad" }],
  orbita: [
    { fill: "grad" }, // anel 1
    { fill: "grad" }, // anel 2
    { fill: "bg" }, // recorte em volta do olho
    { fill: "grad", evenOdd: true }, // contorno do olho
    { fill: "deep" }, // íris
    { fill: "bg" }, // pupila
    { fill: "hi" }, // brilho
  ],
  cacho: [
    { fill: "deep", opacity: 0.75 }, // voltas de trás
    { fill: "grad" }, // voltas da frente
    { fill: "grad" }, // brilho-estrela na ponta
  ],
};

const TAU = Math.PI * 2;

function f(n: number) {
  "worklet";
  return Math.round(n * 100) / 100;
}

function smooth(e0: number, e1: number, x: number) {
  "worklet";
  const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return k * k * (3 - 2 * k);
}

/**
 * Estrela de quatro pontas com lados côncavos: agulhas finas que engrossam num corpo
 * arredondado. Cada ponta tem o próprio comprimento (esquerda, direita, cima, baixo).
 * "body" controla o quanto o corpo é cheio (0.3 fino … 0.6 gordo).
 */
function sparkle(cx: number, cy: number, l: number, r: number, u: number, d: number, body: number, rot: number, ox: number, oy: number) {
  "worklet";
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const P = (x: number, y: number) => {
    // gira em torno do centro do quadro (100,100) e desloca
    const dx = x - 100;
    const dy = y - 100;
    return `${f(100 + dx * cos - dy * sin + ox)} ${f(100 + dx * sin + dy * cos + oy)}`;
  };
  const a = 0.02; // quanto a agulha se afasta do eixo
  const b = body;
  // quadrantes no sentido horário: cima → direita → baixo → esquerda → cima
  return (
    `M${P(cx, cy - u)}` +
    `C${P(cx + r * a, cy - u * b)} ${P(cx + r * b, cy - u * a)} ${P(cx + r, cy)}` +
    `C${P(cx + r * b, cy + d * a)} ${P(cx + r * a, cy + d * b)} ${P(cx, cy + d)}` +
    `C${P(cx - l * a, cy + d * b)} ${P(cx - l * b, cy + d * a)} ${P(cx - l, cy)}` +
    `C${P(cx - l * b, cy - u * a)} ${P(cx - l * a, cy - u * b)} ${P(cx, cy - u)}Z`
  );
}

/* ---------- 1. Constelação: quatro estrelas em losango ---------- */

function constelacao({ t, px, py, pa, energy }: SymbolInput): string[] {
  "worklet";
  // esquerda, cima, direita, baixo
  const stars = [
    { x: -40.5, y: 0, l: 43, r: 30, u: 43, d: 43 },
    { x: 0, y: -19.5, l: 38, r: 38, u: 44, d: 19 },
    { x: 40.5, y: 0, l: 30, r: 43, u: 43, d: 43 },
    { x: 0, y: 19.5, l: 38, r: 38, u: 19, d: 44 },
  ];
  const spread = 1 + 0.025 * Math.sin(t * 0.8) + energy * 0.05;
  const rot = 0.045 * Math.sin(t * 0.33) + px * pa * 0.09;
  let d = "";
  for (let i = 0; i < 4; i++) {
    const s = stars[i];
    const phase = i * (Math.PI / 2);
    const breathe = 1 + 0.045 * Math.sin(t * 1.25 + phase);
    // ao digitar, as estrelas cintilam em sequência
    const twinkle = energy * 0.16 * Math.max(0, Math.sin(t * 7.5 - i * 1.4));
    const k = breathe + twinkle;
    const needle = 1 + 0.07 * Math.sin(t * 1.7 + phase * 1.3) + twinkle * 0.6;
    // paralaxe: cada estrela segue o dedo num grau diferente
    const depth = 0.6 + (i % 2) * 0.5;
    const ox = px * pa * 7 * depth;
    const oy = py * pa * 7 * depth;
    d += sparkle(100 + s.x * spread, 100 + s.y * spread, s.l * k * needle, s.r * k * needle, s.u * k * needle, s.d * k * needle, 0.28, rot, ox, oy);
  }
  return [d];
}

/* ---------- 2. Onda: três picos sobre uma agulha horizontal ---------- */

function onda({ t, px, pa, energy }: SymbolInput): string[] {
  "worklet";
  const len = 88 * (0.95 + 0.05 * Math.sin(t * 0.9));
  // agulha horizontal com corpo baixo
  let d = sparkle(100, 100, len, len, 13, 13, 0.55, 0, 0, 0);
  for (let i = 0; i < 3; i++) {
    const x = 100 + (i - 1) * 17;
    // respiração lenta + "fala" ao digitar
    const idle = 0.84 + 0.16 * Math.sin(t * 2.0 + i * 1.6);
    const talk = energy * 0.55 * Math.abs(Math.sin(t * 10.5 + i * 2.1));
    // o pico mais perto do dedo cresce
    const near = pa * 0.35 * Math.exp(-(((px * 60 - (i - 1) * 17) / 22) ** 2));
    const h = 33 * (idle + talk + near);
    const up = h * (1 + 0.06 * Math.sin(t * 3.1 + i));
    const down = h * (1 - 0.06 * Math.sin(t * 3.1 + i));
    d += sparkle(x, 100, 19, 19, up, down, 0.42, 0, 0, 0);
  }
  return [d];
}

/* ---------- 3. Órbita com olho ---------- */

/** Anel elíptico afinado, com uma abertura num dos lados; mais grosso nas pontas. */
function ring(cx: number, cy: number, a: number, b: number, rot: number, width: number, gapAt: number, gap: number) {
  "worklet";
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const N = 120;
  const start = gapAt + gap;
  const span = TAU - 2 * gap;
  const outer: string[] = [];
  const inner: string[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const phi = start + span * u;
    const ex = a * Math.cos(phi);
    const ey = b * Math.sin(phi);
    // normal da elipse
    let nx = b * Math.cos(phi);
    let ny = a * Math.sin(phi);
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const taper = smooth(0, 0.16, u) * smooth(1, 0.84, u);
    const w = width * (0.3 + 0.7 * Math.abs(Math.cos(phi)) ** 1.4) * taper;
    const o = [ex + nx * w * 0.5, ey + ny * w * 0.5];
    const n = [ex - nx * w * 0.5, ey - ny * w * 0.5];
    outer.push(`${f(cx + o[0] * cos - o[1] * sin)} ${f(cy + o[0] * sin + o[1] * cos)}`);
    inner.push(`${f(cx + n[0] * cos - n[1] * sin)} ${f(cy + n[0] * sin + n[1] * cos)}`);
  }
  return `M${outer.join("L")}L${inner.reverse().join("L")}Z`;
}

/** Amêndoa (olho) centrada em 100,100. */
function almond(w: number, h: number) {
  "worklet";
  const k = 1.33; // quadrática → altura real = h
  return `M${f(100 - w)} 100Q100 ${f(100 - h * k)} ${f(100 + w)} 100Q100 ${f(100 + h * k)} ${f(100 - w)} 100Z`;
}

/** Círculo recortado pelas pálpebras (amêndoa de meia-largura w e meia-altura h). */
function clippedCircle(cx: number, cy: number, r: number, w: number, h: number) {
  "worklet";
  const N = 36;
  let d = "";
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const x = cx + r * Math.cos(a);
    let y = cy + r * Math.sin(a);
    const xx = Math.max(-1, Math.min(1, (x - 100) / w));
    const lid = h * (1 - xx * xx); // altura da pálpebra nesse x
    y = Math.max(100 - lid, Math.min(100 + lid, y));
    d += `${i ? "L" : "M"}${f(x)} ${f(y)}`;
  }
  return `${d}Z`;
}

function orbita({ t, px, py, pa, energy }: SymbolInput): string[] {
  "worklet";
  const sway = 0.06 * Math.sin(t * 0.45) + px * pa * 0.08;
  const swell = 1 + 0.03 * Math.sin(t * 0.9) + energy * 0.05;
  const a = 64 * swell;
  const b = 19 * swell;
  const width = 8.5;
  // cada anel tem um lado contínuo passando pelo centro e o outro aberto
  const rotA = Math.PI / 4 + sway + 0.035 * Math.sin(t * 0.7);
  const rotB = -Math.PI / 4 + sway - 0.035 * Math.sin(t * 0.7 + 1);
  const ringA = ring(100 + b * Math.cos(rotA + Math.PI / 2), 100 + b * Math.sin(rotA + Math.PI / 2), a, b, rotA, width, Math.PI / 2, 0.62);
  const ringB = ring(100 - b * Math.cos(rotB + Math.PI / 2), 100 - b * Math.sin(rotB + Math.PI / 2), a, b, rotB, width, -Math.PI / 2, 0.62);

  // piscar: a cada ~4,8 s (duas vezes seguidas de vez em quando)
  const cycle = t % 4.8;
  const blink = Math.max(1 - smooth(0, 0.09, Math.abs(cycle - 0.12)), Math.floor(t / 4.8) % 3 === 2 ? 1 - smooth(0, 0.09, Math.abs(cycle - 0.42)) : 0);
  const open = Math.max(0.06, (1 - blink) * (1 - energy * 0.18));
  const ew = 23.5;
  const eh = 12.5 * open;
  // o olhar segue o dedo; ao digitar, olha para baixo (para o campo de texto)
  const idleX = 0.35 * Math.sin(t * 0.37) * Math.sin(t * 0.23);
  const lookX = (px * pa + idleX * (1 - pa)) * (1 - energy * 0.6);
  const lookY = py * pa * (1 - energy) + energy * 0.75;
  const ix = 100 + Math.max(-1, Math.min(1, lookX)) * 7;
  const iy = 100 + Math.max(-1, Math.min(1, lookY)) * 3.2;
  const ir = 9;
  const pr = 3.8 * (1 + energy * 0.25);
  return [
    ringA,
    ringB,
    almond(ew + 6, 12.5 + 5.5),
    almond(ew, Math.max(eh, 0.6) + 2.2) + almond(ew - 3, Math.max(eh - 0.2, 0.01)),
    clippedCircle(ix, iy, ir, ew - 3, eh),
    clippedCircle(ix, iy, pr, ew - 3, eh),
    open > 0.4 ? clippedCircle(ix + 2.6, iy - 2.8, 1.5, ew - 3, eh) : "M0 0Z",
  ];
}

/* ---------- 4. Cacho: um cacho de cabelo em espiral ---------- */

function cacho({ t, px, pa, energy }: SymbolInput): string[] {
  "worklet";
  const N = 170;
  const top = 26;
  // ao digitar, o cacho "quica" como uma mola
  const bounce = energy * 0.06 * Math.sin(t * 9);
  const len = 140 * (1 + 0.018 * Math.sin(t * 1.1) + bounce);
  const turns = 3.15;
  const twist = 0.5 * Math.sin(t * 0.7) + energy * 1.2 * Math.sin(t * 2.2);
  const swing = 9 * Math.sin(t * 0.9) * (1 - pa) + px * pa * 22;
  const xs: number[] = [];
  const ys: number[] = [];
  const front: number[] = [];
  const ws: number[] = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const th = TAU * turns * s + twist + 1.6;
    // raio cresce devagar depois da raiz e afina na ponta (como um cacho de verdade)
    const r = 22 * smooth(0, 0.3, s) * (1 - 0.4 * smooth(0.72, 1, s));
    // balanço de pêndulo: a ponta mexe mais que a raiz; leve "S" no eixo
    const sw = swing * s * s + 5 * Math.sin(Math.PI * s * 1.3);
    xs.push(100 + r * Math.sin(th) + sw);
    ys.push(top + len * s + r * 0.62 * Math.cos(th));
    front.push(Math.cos(th));
    // agulha na raiz, corpo cheio na frente e fino atrás, ponta fina
    ws.push(10 * smooth(0, 0.22, s) * (1 - smooth(0.8, 1, s) * 0.92) * (0.45 + 0.55 * (0.5 + 0.5 * Math.cos(th))) + 0.3);
  }
  let back = "";
  let fore = "";
  // divide a fita em trechos da frente e de trás para dar profundidade
  let run: number[] = [];
  const flush = (isFront: boolean) => {
    if (run.length < 2) return;
    const left: string[] = [];
    const right: string[] = [];
    for (const i of run) {
      const a = Math.max(0, i - 1);
      const c = Math.min(N, i + 1);
      let nx = -(ys[c] - ys[a]);
      let ny = xs[c] - xs[a];
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl;
      ny /= nl;
      left.push(`${f(xs[i] + nx * ws[i] * 0.5)} ${f(ys[i] + ny * ws[i] * 0.5)}`);
      right.push(`${f(xs[i] - nx * ws[i] * 0.5)} ${f(ys[i] - ny * ws[i] * 0.5)}`);
    }
    const seg = `M${left.join("L")}L${right.reverse().join("L")}Z`;
    if (isFront) fore += seg;
    else back += seg;
  };
  let state = front[0] >= 0;
  for (let i = 0; i <= N; i++) {
    const isFront = front[i] >= 0;
    if (isFront !== state) {
      run.push(i); // sobrepõe um ponto para não abrir fresta
      flush(state);
      run = [i];
      state = isFront;
    } else run.push(i);
  }
  flush(state);
  // pequena estrela na ponta, o mesmo traço dos outros símbolos
  const tx = xs[N];
  const ty = ys[N];
  const glint = 9 * (0.85 + 0.15 * Math.sin(t * 2.3)) * (1 + energy * 0.4);
  const star = sparkle(tx, ty + 4, glint * 0.7, glint * 0.7, glint, glint * 1.2, 0.38, 0, 0, 0);
  return [back || "M0 0Z", fore || "M0 0Z", star];
}

export function symbolFrame(kind: KallySymbolKind, input: SymbolInput): string[] {
  "worklet";
  if (kind === "onda") return onda(input);
  if (kind === "orbita") return orbita(input);
  if (kind === "cacho") return cacho(input);
  return constelacao(input);
}
