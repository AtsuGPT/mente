const BACKGROUND = "#080808";
const FALLBACK = "#929292";

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function parse(hex: string): [number, number, number] {
  const h = HEX_COLOR.test(hex) ? hex : FALLBACK;
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function toHex([r, g, b]: [number, number, number]) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function channel(v: number) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(rgb: [number, number, number]) {
  const [r, g, b] = rgb;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string) {
  const la = luminance(parse(a));
  const lb = luminance(parse(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Versão da cor legível como TEXTO sobre o fundo preto (contraste >= 4,5:1).
 * A cor original continua sendo usada em filetes e marcadores; só o texto
 * ganha a versão clareada.
 */
export function readableAccent(hex: string, minContrast = 4.5): string {
  let rgb = parse(hex);
  for (let i = 0; i < 40 && contrastRatio(toHex(rgb), BACKGROUND) < minContrast; i++) {
    rgb = [rgb[0] + (255 - rgb[0]) * 0.06, rgb[1] + (255 - rgb[1]) * 0.06, rgb[2] + (255 - rgb[2]) * 0.06];
  }
  return toHex(rgb);
}

/**
 * Tons das pastas (redesign de 27/11): no lugar de amarelo, azul e verde puros, dez tons foscos que conversam com o
 * preto e o roxo da Mente. A cor salva continua a mesma no banco; na tela ela vira o tom da paleta mais próximo pelo
 * matiz (cores quase cinza viram ardósia).
 */
export const FOLDER_TONES = [
  { name: "Coral", hex: "#E0A090", hue: 12 },
  { name: "Âmbar", hex: "#D4B07A", hue: 38 },
  { name: "Sálvia", hex: "#9CC4A4", hue: 120 },
  { name: "Jade", hex: "#7FC1B8", hue: 172 },
  { name: "Azul aço", hex: "#8FA9D9", hue: 215 },
  { name: "Íris", hex: "#8C7CF0", hue: 248 },
  { name: "Lavanda", hex: "#B9A6F0", hue: 266 },
  { name: "Orquídea", hex: "#C98BE0", hue: 290 },
  { name: "Rosa antigo", hex: "#D99AB2", hue: 338 },
] as const;
const SLATE = "#A3A0B8";

function hsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = parse(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

/** O tom da paleta das pastas mais próximo da cor salva. */
export function folderTone(hex: string): string {
  if (!HEX_COLOR.test(hex)) return SLATE;
  if (FOLDER_TONES.some((t) => t.hex.toLowerCase() === hex.toLowerCase())) return hex;
  const { h, s } = hsl(hex);
  if (s < 0.14) return SLATE;
  let best: string = SLATE;
  let gap = Infinity;
  for (const tone of FOLDER_TONES) {
    const d = Math.min(Math.abs(tone.hue - h), 360 - Math.abs(tone.hue - h));
    if (d < gap) {
      gap = d;
      best = tone.hex;
    }
  }
  return best;
}
