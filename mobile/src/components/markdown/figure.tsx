import { createContext, useContext, useMemo, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Circle, G, Line, Path, Polygon, Rect, Text as SvgText } from "react-native-svg";
import { colors, fonts, panels, radius, space } from "@/theme/tokens";
import { parseFigure, type Figure, type FigureKind } from "@/lib/figure";

export { parseFigure, splitFigure } from "@/lib/figure";

/**
 * Figuras por modelo pronto (15/11/2026): a Kally escreve só os dados num bloco ```figura e o app desenha, sempre nítido
 * e no visual da Mente. Os desenhos livres (```desenho, SVG escrito pelo modelo) saíam com formas sobrepostas, a Terra
 * quadrada e texto ilegível; aqui as posições são calculadas.
 *
 *   ```figura                 (lado=direita|esquerda, com --- e o parágrafo depois, como no ```desenho)
 *   tipo: ciclo               blocos | ciclo | objetos | partes | comparacao | barras | tempo
 *   titulo: Ciclo da água     (opcional)
 *   - Evaporação | o sol aquece a água        rótulo | nota (opcional) | tamanho p/m/g ou valor
 *   - Condensação
 *   → texto da seta           (só em "objetos": a seta entre o item de cima e o de baixo)
 *   lado: Reler               (só em "comparacao": começa uma coluna)
 *   ```
 */

/* ------------------------------- desenho ------------------------------- */

const C = { line: colors.violet300, accent: colors.violet500, accent2: "#B65CF2", soft: colors.violet500, text: colors.text, muted: colors.muted, faint: colors.faint };
const W = 400;

/** Quebra um texto em linhas de até `max` caracteres (no máximo `lines` linhas, com reticências). */
function wrap(text: string, max: number, lines = 2) {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= max) cur += " " + w;
    else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  if (out.length > lines) {
    const kept = out.slice(0, lines);
    kept[lines - 1] = `${kept[lines - 1].slice(0, Math.max(1, max - 1))}…`;
    return kept;
  }
  return out;
}

function Label({ x, y, text, max, size = 14, color = C.text, lines = 2, anchor = "middle", weight }: { x: number; y: number; text: string; max: number; size?: number; color?: string; lines?: number; anchor?: "middle" | "start" | "end"; weight?: "600" }) {
  const rows = wrap(text, max, lines);
  return (
    <>
      {rows.map((r, i) => (
        <SvgText key={i} x={x} y={y + i * (size + 3)} fill={color} fontSize={size} fontFamily={weight ? fonts.sansSemibold : fonts.sans} textAnchor={anchor}>
          {r}
        </SvgText>
      ))}
    </>
  );
}

/** Seta reta de (x1,y1) a (x2,y2), com ponta. */
function Arrow({ x1, y1, x2, y2, color = C.accent2 }: { x1: number; y1: number; x2: number; y2: number; color?: string }) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const h = 8;
  const p = (dx: number) => `${x2 - h * Math.cos(a) + dx * Math.sin(a)},${y2 - h * Math.sin(a) - dx * Math.cos(a)}`;
  return (
    <G>
      <Line x1={x1} y1={y1} x2={x2 - 4 * Math.cos(a)} y2={y2 - 4 * Math.sin(a)} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      <Polygon points={`${x2},${y2} ${p(5)} ${p(-5)}`} fill={color} />
    </G>
  );
}

const fill = { fill: C.soft, fillOpacity: 0.16, stroke: C.line, strokeWidth: 2 } as const;
const sizeOf = (extra: string) => (/^(g|grande|big|l)$/i.test(extra) ? 1 : /^(p|pequen[oa]|small|s)$/i.test(extra) ? 0.45 : 0.7);

function Blocks({ f }: { f: Figure }) {
  const n = f.items.length;
  const top = f.title ? 34 : 12;
  const rowH = 54;
  const gap = 14;
  const h = top + n * rowH + (n - 1) * gap + 12;
  return (
    <Frame h={h} title={f.title}>
      {f.items.map((it, i) => {
        const y = top + i * (rowH + gap);
        return (
          <G key={i}>
            <Rect x={14} y={y} width={W - 28} height={rowH} rx={12} {...fill} />
            <Circle cx={40} cy={y + rowH / 2} r={13} fill={C.accent} fillOpacity={0.35} stroke={C.line} strokeWidth={1.5} />
            <SvgText x={40} y={y + rowH / 2 + 5} fill={C.text} fontSize={13} fontFamily={fonts.sansSemibold} textAnchor="middle">{String(i + 1)}</SvgText>
            <Label x={64} y={y + (it.note ? 22 : 32)} text={it.label} max={38} size={15} anchor="start" lines={1} weight="600" />
            {it.note ? <Label x={64} y={y + 41} text={it.note} max={44} size={12.5} color={C.muted} anchor="start" lines={1} /> : null}
            {i < n - 1 ? <Arrow x1={W / 2} y1={y + rowH + 1} x2={W / 2} y2={y + rowH + gap - 1} /> : null}
          </G>
        );
      })}
    </Frame>
  );
}

function Cycle({ f }: { f: Figure }) {
  const n = f.items.length;
  // Raio menor que o quadro pede: os rótulos das laterais (até 12 letras) cabem sem cortar.
  const top = f.title ? 44 : 14;
  const h = 300 + top;
  const cx = W / 2;
  const cy = top + 150;
  const r = 84;
  const node = n > 6 ? 20 : 24;
  const pos = f.items.map((_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), a };
  });
  return (
    <Frame h={h} title={f.title}>
      <Circle cx={cx} cy={cy} r={r} fill="none" stroke={C.faint} strokeOpacity={0.35} strokeWidth={1.5} strokeDasharray="3 6" />
      {pos.map((p, i) => {
        // arco entre os nós, por fora do raio dos círculos
        const step = (2 * Math.PI) / n;
        const a1 = p.a + (node + 6) / r;
        const a2 = p.a + step - (node + 10) / r;
        const x1 = cx + r * Math.cos(a1);
        const y1 = cy + r * Math.sin(a1);
        const x2 = cx + r * Math.cos(a2);
        const y2 = cy + r * Math.sin(a2);
        const tx = cx + r * Math.cos(a2 + 0.06);
        const ty = cy + r * Math.sin(a2 + 0.06);
        return (
          <G key={`a${i}`}>
            <Path d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`} stroke={C.accent2} strokeWidth={2.2} fill="none" strokeLinecap="round" />
            <Arrow x1={x2} y1={y2} x2={tx} y2={ty} />
          </G>
        );
      })}
      {pos.map((p, i) => {
        const out = { x: cx + (r + node + 18) * Math.cos(p.a), y: cy + (r + node + 18) * Math.sin(p.a) };
        const anchor = Math.abs(Math.cos(p.a)) < 0.3 ? "middle" : Math.cos(p.a) > 0 ? "start" : "end";
        const ly = out.y + (Math.sin(p.a) > 0.3 ? 8 : Math.sin(p.a) < -0.3 ? -8 : 4);
        return (
          <G key={i}>
            <Circle cx={p.x} cy={p.y} r={node} {...fill} />
            <SvgText x={p.x} y={p.y + 5} fill={C.text} fontSize={13} fontFamily={fonts.sansSemibold} textAnchor="middle">{String(i + 1)}</SvgText>
            <Label x={out.x} y={ly} text={f.items[i].label} max={12} size={12.5} anchor={anchor} />
          </G>
        );
      })}
    </Frame>
  );
}

function Row({ f }: { f: Figure }) {
  const n = f.items.length;
  const top = f.title ? 30 : 0;
  const h = 220 + top;
  const cy = top + 92;
  const slot = W / n;
  const maxR = Math.min(54, slot / 2 - 14);
  const xs = f.items.map((_, i) => slot * i + slot / 2);
  const rs = f.items.map((it) => Math.max(12, maxR * sizeOf(it.extra)));
  return (
    <Frame h={h} title={f.title}>
      {f.items.map((it, i) =>
        i < n - 1 ? (
          <G key={`s${i}`}>
            <Arrow x1={xs[i] + rs[i] + 6} y1={cy} x2={xs[i + 1] - rs[i + 1] - 6} y2={cy} />
            {it.arrow ? <Label x={(xs[i] + rs[i] + xs[i + 1] - rs[i + 1]) / 2} y={cy - 12} text={it.arrow} max={Math.max(8, Math.floor((slot - 20) / 7))} size={12} color={C.line} lines={1} /> : null}
          </G>
        ) : null,
      )}
      {f.items.map((it, i) => (
        <G key={i}>
          <Circle cx={xs[i]} cy={cy} r={rs[i]} {...fill} />
          <Label x={xs[i]} y={cy + maxR + 30} text={it.label} max={Math.floor(slot / 8)} size={14} weight="600" lines={2} />
          {it.note ? <Label x={xs[i]} y={cy + maxR + 50} text={it.note} max={Math.floor(slot / 7)} size={12} color={C.muted} lines={2} /> : null}
        </G>
      ))}
    </Frame>
  );
}

function Parts({ f }: { f: Figure }) {
  const n = f.items.length;
  const h = 320;
  const cx = W / 2;
  const cy = 160;
  const r = 118;
  return (
    <Frame h={h}>
      {f.items.map((it, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        return (
          <G key={i}>
            <Line x1={cx + 44 * Math.cos(a)} y1={cy + 44 * Math.sin(a)} x2={x - 30 * Math.cos(a)} y2={y - 16 * Math.sin(a)} stroke={C.line} strokeOpacity={0.6} strokeWidth={1.8} />
            <Rect x={x - 58} y={y - 17} width={116} height={34} rx={17} {...fill} />
            <Label x={x} y={y + 5} text={it.label} max={15} size={12.5} lines={1} />
          </G>
        );
      })}
      <Circle cx={cx} cy={cy} r={44} fill={C.accent} fillOpacity={0.28} stroke={C.line} strokeWidth={2.2} />
      <Label x={cx} y={cy + (wrap(f.title || "Tema", 11).length > 1 ? -2 : 5)} text={f.title || "Tema"} max={11} size={13} weight="600" />
    </Frame>
  );
}

function Compare({ f }: { f: Figure }) {
  const cols = f.columns.filter((c) => c.items.length);
  const top = f.title ? 30 : 0;
  const rows = Math.max(...cols.map((c) => c.items.length));
  const h = top + 56 + rows * 40 + 10;
  const colW = (W - 20 - (cols.length - 1) * 12) / cols.length;
  return (
    <Frame h={h} title={f.title}>
      {cols.map((c, ci) => {
        const x = 10 + ci * (colW + 12);
        return (
          <G key={ci}>
            <Rect x={x} y={top + 6} width={colW} height={h - top - 14} rx={14} fill={C.soft} fillOpacity={ci % 2 ? 0.1 : 0.18} stroke={C.line} strokeOpacity={0.7} strokeWidth={1.5} />
            <Label x={x + colW / 2} y={top + 34} text={c.name} max={Math.floor(colW / 9)} size={15} weight="600" lines={1} color={colors.violet200} />
            {c.items.map((it, i) => (
              <G key={i}>
                <Circle cx={x + 16} cy={top + 66 + i * 40} r={3.5} fill={C.accent2} />
                <Label x={x + 28} y={top + 70 + i * 40} text={it.note ? `${it.label}: ${it.note}` : it.label} max={Math.floor((colW - 36) / 7)} size={12.5} anchor="start" lines={2} />
              </G>
            ))}
          </G>
        );
      })}
    </Frame>
  );
}

function Bars({ f }: { f: Figure }) {
  const values = f.items.map((it) => Number(String(it.extra || it.note).replace(/[^\d,.-]/g, "").replace(",", ".")) || 0);
  const max = Math.max(...values, 1);
  const top = f.title ? 34 : 12;
  const rowH = 38;
  const h = top + f.items.length * rowH + 8;
  const labelW = 118;
  return (
    <Frame h={h} title={f.title}>
      {f.items.map((it, i) => {
        const y = top + i * rowH;
        const w = Math.max(4, ((W - labelW - 70) * values[i]) / max);
        const shown = it.extra && it.note ? it.extra : it.extra || it.note;
        return (
          <G key={i}>
            <Label x={labelW - 8} y={y + 20} text={it.label} max={15} size={13} anchor="end" lines={1} />
            <Rect x={labelW} y={y + 6} width={w} height={22} rx={6} fill={C.accent} fillOpacity={0.55} stroke={C.line} strokeWidth={1.2} />
            <SvgText x={labelW + w + 8} y={y + 22} fill={C.muted} fontSize={12.5} fontFamily={fonts.sans}>{shown}</SvgText>
          </G>
        );
      })}
    </Frame>
  );
}

function Timeline({ f }: { f: Figure }) {
  const n = f.items.length;
  const top = f.title ? 30 : 0;
  const h = 230 + top;
  const cy = top + 110;
  const xs = f.items.map((_, i) => 30 + ((W - 60) * i) / Math.max(1, n - 1));
  return (
    <Frame h={h} title={f.title}>
      <Line x1={18} y1={cy} x2={W - 18} y2={cy} stroke={C.line} strokeOpacity={0.6} strokeWidth={2} strokeLinecap="round" />
      {f.items.map((it, i) => {
        const up = i % 2 === 0;
        const x = xs[i];
        const max = Math.max(8, Math.floor((W / Math.max(2, n)) * 1.6 / 7));
        const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
        const lx = i === 0 ? x - 10 : i === n - 1 ? x + 10 : x;
        return (
          <G key={i}>
            <Line x1={x} y1={cy} x2={x} y2={up ? cy - 30 : cy + 30} stroke={C.faint} strokeOpacity={0.6} strokeWidth={1.2} />
            <Circle cx={x} cy={cy} r={7} fill={C.accent2} stroke={C.line} strokeWidth={1.5} />
            {up ? (
              <>
                {it.note ? <Label x={lx} y={cy - 72} text={it.note} max={max} size={11.5} color={C.muted} lines={1} anchor={anchor} /> : null}
                <Label x={lx} y={cy - 54} text={it.label} max={max} size={13} lines={2} anchor={anchor} weight="600" />
              </>
            ) : (
              <>
                <Label x={lx} y={cy + 50} text={it.label} max={max} size={13} lines={2} anchor={anchor} weight="600" />
                {it.note ? <Label x={lx} y={cy + 86} text={it.note} max={max} size={11.5} color={C.muted} lines={1} anchor={anchor} /> : null}
              </>
            )}
          </G>
        );
      })}
    </Frame>
  );
}

/** Quadro do SVG; o título (quando há) no alto. A largura vem de fora; a altura segue a proporção. */
function Frame({ h, title, children }: { h: number; title?: string; children: ReactNode }) {
  return (
    <FrameContext h={h}>
      {title ? <SvgText x={W / 2} y={20} fill={colors.violet200} fontSize={14} fontFamily={fonts.sansSemibold} textAnchor="middle">{title}</SvgText> : null}
      {children}
    </FrameContext>
  );
}

/** Largura da figura na tela (FigureView); o desenho usa sempre 400 de largura e escala. */
const WidthContext = createContext(320);
function FrameContext({ h, children }: { h: number; children: ReactNode }) {
  const width = useContext(WidthContext);
  return (
    <Svg width={width} height={(width * h) / W} viewBox={`0 0 ${W} ${h}`}>
      {children}
    </Svg>
  );
}

const VIEWS: Record<FigureKind, (p: { f: Figure }) => ReactNode> = { blocos: Blocks, ciclo: Cycle, objetos: Row, partes: Parts, comparacao: Compare, barras: Bars, tempo: Timeline };

/** A figura no tamanho pedido (largura em pontos). */
export function FigureView({ figure, width }: { figure: Figure; width: number }) {
  const Draw = VIEWS[figure.kind];
  return (
    <WidthContext.Provider value={width}>
      <Draw f={figure} />
    </WidthContext.Provider>
  );
}

/** Figura sozinha, centralizada, num quadro (até 460 de largura). */
export function FigureBlock({ source }: { source: string }) {
  const figure = useMemo(() => parseFigure(source), [source]);
  const { width } = useWindowDimensions();
  const size = Math.max(220, Math.min(460, Math.min(width, 720) - 96));
  if (!figure) return null;
  return (
    <View style={styles.stage} accessibilityRole="image" accessibilityLabel={figureLabel(figure)}>
      <FigureView figure={figure} width={size} />
    </View>
  );
}

/** Figura pequena, ao lado de um parágrafo. */
export function SideFigure({ figure, width }: { figure: Figure; width: number }) {
  return (
    <View style={[styles.tile, { width }]} accessibilityRole="image" accessibilityLabel={figureLabel(figure)}>
      <FigureView figure={figure} width={width - 12} />
    </View>
  );
}

/** Texto para leitores de tela: o tipo e os itens. */
export function figureLabel(f: Figure) {
  const items = f.kind === "comparacao" ? f.columns.map((c) => `${c.name}: ${c.items.map((i) => i.label).join(", ")}`).join("; ") : f.items.map((i) => i.label).join(", ");
  return `Figura${f.title ? ` "${f.title}"` : ""}: ${items}`;
}

const styles = StyleSheet.create({
  stage: { alignItems: "center", paddingVertical: space.md, marginBottom: space.lg, borderRadius: radius.lg, backgroundColor: panels.stage, borderWidth: StyleSheet.hairlineWidth, borderColor: panels.border },
  tile: { padding: 6, borderRadius: radius.lg, backgroundColor: panels.tile, borderWidth: StyleSheet.hairlineWidth, borderColor: panels.border, alignItems: "center", justifyContent: "center" },
});
