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
 *  - spin: fase acumulada do giro (anda mais rápido enquanto a pessoa digita); padrão = t
 */

export type KallySymbolKind = "constelacao" | "onda" | "orbita" | "cacho";

export type SymbolInput = { t: number; px: number; py: number; pa: number; energy: number; spin?: number };

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
    { fill: "deep", opacity: 0.7 }, // anel 1, parte de trás
    { fill: "deep", opacity: 0.7 }, // anel 2, parte de trás
    { fill: "grad", evenOdd: true }, // contorno do olho
    { fill: "grad" }, // pupila
    { fill: "grad" }, // anel 1, parte da frente
    { fill: "grad" }, // anel 2, parte da frente
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

/**
 * Anel elíptico afinado em volta do centro, com uma abertura que percorre o anel.
 * Devolve duas partes: a de trás (passa atrás do olho) e a da frente, para dar profundidade.
 */
function orbitRing(a: number, b: number, rot: number, width: number, gapAt: number, gap: number): [string, string] {
  "worklet";
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const N = 140;
  const start = gapAt + gap;
  const span = TAU - 2 * gap;
  const outer: string[] = [];
  const inner: string[] = [];
  const isFront: boolean[] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const phi = start + span * u;
    const ex = a * Math.cos(phi);
    const ey = b * Math.sin(phi);
    let nx = b * Math.cos(phi);
    let ny = a * Math.sin(phi);
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    // afina nas pontas da abertura; mais grosso nas extremidades do anel
    const taper = smooth(0, 0.18, u) * smooth(1, 0.82, u);
    const w = width * (0.3 + 0.7 * Math.abs(Math.cos(phi)) ** 1.4) * taper;
    const o0 = ex + nx * w * 0.5;
    const o1 = ey + ny * w * 0.5;
    const n0 = ex - nx * w * 0.5;
    const n1 = ey - ny * w * 0.5;
    outer.push(`${f(100 + o0 * cos - o1 * sin)} ${f(100 + o0 * sin + o1 * cos)}`);
    inner.push(`${f(100 + n0 * cos - n1 * sin)} ${f(100 + n0 * sin + n1 * cos)}`);
    isFront.push(Math.sin(phi) >= 0);
  }
  let back = "";
  let front = "";
  let from = 0;
  for (let i = 1; i <= N + 1; i++) {
    if (i === N + 1 || isFront[i] !== isFront[from]) {
      const to = Math.min(i, N); // sobrepõe um ponto para não abrir fresta
      if (to > from) {
        const seg = `M${outer.slice(from, to + 1).join("L")}L${inner.slice(from, to + 1).reverse().join("L")}Z`;
        if (isFront[from]) front += seg;
        else back += seg;
      }
      from = i;
    }
  }
  return [back || "M0 0Z", front || "M0 0Z"];
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

function orbita({ t, px, py, pa, energy, spin = t }: SymbolInput): string[] {
  "worklet";
  // os dois anéis giram juntos em volta do olho (um X que roda devagar);
  // o dedo inclina o conjunto e a digitação acelera o giro (spin)
  const turn = spin * 0.32 + px * pa * 0.35;
  const swell = 1 + 0.03 * Math.sin(t * 0.9) + energy * 0.04;
  const a = 66 * swell;
  // inclinação das órbitas "respira", como se fossem vistas em 3D
  const bA = (20 + 5 * Math.sin(t * 0.6) + py * pa * 5) * swell;
  const bB = (20 + 5 * Math.sin(t * 0.6 + Math.PI) - py * pa * 5) * swell;
  const width = 8;
  // a abertura de cada anel corre ao longo dele, em sentidos opostos
  const [backA, frontA] = orbitRing(a, bA, Math.PI / 4 + turn, width, spin * 1.1, 0.6);
  const [backB, frontB] = orbitRing(a, bB, -Math.PI / 4 + turn, width, Math.PI - spin * 1.1, 0.6);

  // olho minimalista: contorno fino e uma pupila; pisca a cada ~4,8 s
  const cycle = t % 4.8;
  const blink = Math.max(1 - smooth(0, 0.09, Math.abs(cycle - 0.12)), Math.floor(t / 4.8) % 3 === 2 ? 1 - smooth(0, 0.09, Math.abs(cycle - 0.42)) : 0);
  const open = Math.max(0.04, (1 - blink) * (1 - energy * 0.2));
  const ew = 18.5;
  const eh = 9.5 * open;
  const line = 1.7;
  // o olhar segue o dedo; ao digitar, olha para baixo (para o campo de texto)
  const idleX = 0.35 * Math.sin(t * 0.37) * Math.sin(t * 0.23);
  const lookX = (px * pa + idleX * (1 - pa)) * (1 - energy * 0.6);
  const lookY = py * pa * (1 - energy) + energy * 0.75;
  const ix = 100 + Math.max(-1, Math.min(1, lookX)) * 6.5;
  const iy = 100 + Math.max(-1, Math.min(1, lookY)) * 2.6;
  const pr = 4.6 * (1 - energy * 0.15);
  return [
    backA,
    backB,
    almond(ew, eh + line) + almond(ew - line * 1.6, Math.max(eh - line * 0.4, 0.01)),
    open > 0.15 ? clippedCircle(ix, iy, pr, ew - line * 1.6, eh - line * 0.4) : "M0 0Z",
    frontA,
    frontB,
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
