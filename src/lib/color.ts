import type { CSSProperties } from "react";

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

/** Variáveis CSS de destaque, para aplicar em style={...} no escopo de uma categoria. */
export function accentVars(color: string | null | undefined): CSSProperties {
  const base = color && HEX_COLOR.test(color) ? color : FALLBACK;
  return {
    "--accent": base,
    "--accent-text": readableAccent(base),
  } as CSSProperties;
}
