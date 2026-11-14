import { useMemo, useState, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { SvgXml } from "react-native-svg";
import { AppText } from "@/components/ui/primitives";
import { colors, radius, space } from "@/theme/tokens";

/**
 * Figuras dos posts e das respostas da Kally.
 *
 *   ```desenho                      → um SVG (escrito pela Kally ou por quem edita), centralizado
 *   ```desenho lado=direita         → o SVG pequeno ao lado do texto que vem depois de uma linha ---
 *   ```imagem lado=esquerda         → uma imagem enviada (![…](…)) pequena ao lado do texto do bloco
 *
 * O SVG é texto que vem de fora (o modelo, outra pessoa do ambiente): antes de desenhar, sai tudo o que não é forma:
 * script, estilos, imagens e endereços externos, eventos (on…), foreignObject. O que sobra são formas, traços,
 * degradês e texto, desenhados pelo react-native-svg (nada vira HTML).
 */

export type Side = "direita" | "esquerda";

export function sideOptions(info: string) {
  const options = Object.fromEntries(
    info
      .split(/\s+/)
      .slice(1)
      .map((w) => w.split("="))
      .map(([k, v]) => [k.toLowerCase(), (v ?? "true").toLowerCase()]),
  ) as Record<string, string>;
  const side: Side | null = options.lado === "direita" ? "direita" : options.lado === "esquerda" ? "esquerda" : null;
  return { side, size: options.tamanho === "grande" ? ("grande" as const) : ("pequena" as const) };
}

/** Limpa o SVG e devolve o texto e a proporção (largura/altura) do viewBox. null se não houver um <svg> fechado. */
export function sanitizeSvg(raw: string): { xml: string; ratio: number } | null {
  const match = raw.match(/<svg[\s\S]*?<\/svg>/i);
  if (!match) return null;
  let xml = match[0].slice(0, 60_000);
  const banned = "script|style|foreignObject|image|iframe|use|a|animate\\w*|set";
  xml = xml
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[^>]*>|<\?xml[^>]*\?>/gi, "")
    .replace(new RegExp(`<(${banned})\\b[\\s\\S]*?<\\/\\1\\s*>`, "gi"), "")
    .replace(new RegExp(`<\\/?(${banned})\\b[^>]*>`, "gi"), "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:xlink:)?href\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, "none")
    .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, "");
  const box = xml.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i);
  const w = box ? Number(box[1]) : Number(xml.match(/\swidth\s*=\s*["']?([\d.]+)/i)?.[1] ?? 400);
  const h = box ? Number(box[2]) : Number(xml.match(/\sheight\s*=\s*["']?([\d.]+)/i)?.[1] ?? 300);
  if (!box) xml = xml.replace(/<svg\b/i, `<svg viewBox="0 0 ${w || 400} ${h || 300}"`);
  const ratio = w > 0 && h > 0 ? w / h : 4 / 3;
  return { xml, ratio: Math.min(4, Math.max(0.4, ratio)) };
}

/** Separa o SVG e o texto que fica ao lado dele (depois de uma linha ---, ou o que sobrar). */
export function splitDrawing(text: string) {
  const match = text.match(/<svg[\s\S]*?<\/svg>/i);
  const svg = match ? match[0] : text;
  const rest = match ? text.replace(match[0], "").replace(/^\s*-{3,}\s*$/m, "").trim() : "";
  return { svg, rest };
}

/** A primeira imagem Markdown do bloco e o texto que sobra. */
export function splitImage(text: string) {
  const match = text.match(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/);
  if (!match) return null;
  return { alt: match[1], href: match[2], rest: text.replace(match[0], "").trim() };
}

function DrawingSvg({ source, width }: { source: string; width: number }) {
  const parsed = useMemo(() => sanitizeSvg(source), [source]);
  const [failed, setFailed] = useState(false);
  if (!parsed || failed) {
    return (
      <View style={[styles.fallback, { width, height: Math.round(width * 0.6) }]}>
        <AppText variant="small" color={colors.faint} style={{ textAlign: "center" }}>Não consegui desenhar esta figura.</AppText>
      </View>
    );
  }
  return <SvgXml xml={parsed.xml} width={width} height={Math.round(width / parsed.ratio)} onError={() => setFailed(true)} />;
}

/**
 * Figura sozinha, centralizada, até 460 px. A largura vem da tela (não de uma medida do layout, que no chat podia não
 * chegar e deixava a figura em branco): a coluna de leitura nunca passa de 720 px, e sobram as margens.
 */
export function DrawingFigure({ source }: { source: string }) {
  const { width } = useWindowDimensions();
  const size = Math.max(200, Math.min(460, Math.min(width, 720) - 96));
  return (
    <View style={styles.figure} accessibilityRole="image" accessibilityLabel="Figura">
      <DrawingSvg source={source} width={size} />
    </View>
  );
}

/** Lado da figura ou da imagem: pequena no celular, maior no computador. */
export function useSideSize(size: "pequena" | "grande" = "pequena") {
  const { width } = useWindowDimensions();
  const base = width < 380 ? 110 : width < 700 ? 132 : 180;
  return size === "grande" ? Math.round(base * 1.4) : base;
}

/** Duas colunas: a figura (ou imagem) e o texto; lado=direita põe a figura à direita. */
export function SideBySide({ side, visual, children }: { side: Side; visual: ReactNode; children: ReactNode }) {
  return (
    <View style={[styles.row, side === "direita" && styles.rowRight]}>
      <View style={styles.visual}>{visual}</View>
      <View style={styles.text}>{children}</View>
    </View>
  );
}

export function SideDrawing({ source, width }: { source: string; width: number }) {
  return (
    <View style={[styles.box, { width }]} accessibilityRole="image" accessibilityLabel="Figura">
      <DrawingSvg source={source} width={width - 12} />
    </View>
  );
}

const styles = StyleSheet.create({
  figure: { alignItems: "center", paddingVertical: space.md, marginBottom: space.lg, borderRadius: radius.lg, backgroundColor: "rgba(19,11,38,0.45)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(165,139,247,0.2)" },
  row: { flexDirection: "row", alignItems: "center", gap: space.lg, marginBottom: space.lg },
  rowRight: { flexDirection: "row-reverse" },
  visual: { flexShrink: 0 },
  text: { flex: 1, minWidth: 0 },
  box: { padding: 6, borderRadius: radius.lg, backgroundColor: "rgba(19,11,38,0.55)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(165,139,247,0.22)", alignItems: "center", justifyContent: "center" },
  fallback: { alignItems: "center", justifyContent: "center", padding: space.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong },
});
