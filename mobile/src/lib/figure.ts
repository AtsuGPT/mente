/**
 * Leitura do bloco ```figura (dados que a Kally escreve; o desenho fica em components/markdown/figure.tsx). Arquivo
 * sem React, para dar para testar sozinho.
 */
// "objetos" eram "linha" na primeira versão: "linha" se confundia com "linha do tempo" e agora quer dizer tempo.
export type FigureKind = "blocos" | "ciclo" | "objetos" | "partes" | "comparacao" | "barras" | "tempo";
type Item = { label: string; note: string; extra: string; arrow: string };
export type Figure = { kind: FigureKind; title: string; items: Item[]; columns: { name: string; items: Item[] }[] };

const KINDS: FigureKind[] = ["blocos", "ciclo", "objetos", "partes", "comparacao", "barras", "tempo"];
const ALIASES: Record<string, FigureKind> = { "comparação": "comparacao", etapas: "blocos", sequencia: "blocos", "sequência": "blocos", mapa: "partes", "linha do tempo": "tempo", linha: "tempo", timeline: "tempo", fila: "objetos", objeto: "objetos", grafico: "barras", "gráfico": "barras" };

/** Quantos itens cabem em cada modelo (o resto fica de fora). */
const MAX_ITEMS: Record<FigureKind, number> = { blocos: 7, ciclo: 7, objetos: 5, partes: 8, comparacao: 8, barras: 8, tempo: 7 };

/** Rótulos copiados do formato ("Rótulo | nota | tamanho", "[Rótulo curto]"): não são itens. */
const PLACEHOLDER = /^\[?(r[oó]tulo|label|item|nome)( curto)?\]?$/i;

export function parseFigure(source: string): Figure | null {
  let kind: FigureKind | null = null;
  let title = "";
  const items: Item[] = [];
  const columns: Figure["columns"] = [];
  let pendingArrow = "";
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line || /^-{3,}$/.test(line)) continue;
    const key = line.match(/^(tipo|titulo|título|lado|coluna)\s*:\s*(.+)$/i);
    if (key) {
      const k = key[1].toLowerCase();
      const v = key[2].trim();
      if (k === "tipo") {
        const n = v.toLowerCase();
        // "linha de tempo", "ciclo de vida": vale a palavra do modelo que aparecer.
        kind = (KINDS as string[]).includes(n) ? (n as FigureKind) : ALIASES[n] ?? (/tempo/.test(n) ? "tempo" : (KINDS.find((x) => n.includes(x)) ?? null));
      } else if (k === "lado" || k === "coluna") columns.push({ name: v, items: [] });
      else title = v;
      continue;
    }
    if (!kind && /\btipo\b/i.test(line) && !/^[-*•]/.test(line)) {
      const found = [...KINDS, ...Object.keys(ALIASES)].find((k) => new RegExp(`(^|\\s)${k}(\\s|:|$)`, "i").test(line.replace(/tipo\s*:?/i, " ")));
      if (found) kind = (KINDS as string[]).includes(found) ? (found as FigureKind) : ALIASES[found];
      continue;
    }
    const arrow = line.match(/^(?:→|->|=>)\s*(.*)$/);
    if (arrow) {
      pendingArrow = arrow[1].trim();
      continue;
    }
    // Item com traço, número ou, sem nada, com campos separados por | ("ARPANET | 1969").
    const item = line.match(/^[-*•]\s+(.+)$/) ?? line.match(/^\d+[.)]\s+(.+)$/) ?? (line.includes("|") ? [line, line] : null);
    if (!item) continue;
    let [label, note = "", extra = ""] = item[1].split("|").map((p) => p.trim().replace(/\*\*/g, ""));
    // "1969: ARPANET" ou "Sol: fonte de luz" (sem |): numa linha do tempo, a data vira a nota; nos outros, o resto vira a nota.
    const colon = !item[1].includes("|") ? label.match(/^([^:]{1,24}):\s+(.+)$/) : null;
    if (colon) [label, note] = /\d/.test(colon[1]) && (kind === "tempo" || !kind) ? [colon[2], colon[1]] : [colon[1], colon[2]];
    if (!label || PLACEHOLDER.test(label)) continue;
    const entry = { label, note, extra, arrow: "" };
    if (pendingArrow && items.length) items[items.length - 1].arrow = pendingArrow;
    pendingArrow = "";
    if (columns.length) columns[columns.length - 1].items.push(entry);
    else items.push(entry);
  }
  // Sem tipo reconhecível, os itens viram blocos (melhor uma figura simples do que o código na tela).
  if (!kind) kind = "blocos";
  // Comparação sem colunas ("- Reler | passivo"): cada item vira uma coluna, com a nota como conteúdo.
  if (kind === "comparacao" && columns.filter((c) => c.items.length).length < 2 && items.length >= 2) {
    columns.length = 0;
    for (const it of items.slice(0, 3)) columns.push({ name: it.label, items: (it.note ? it.note.split(/;|,(?![^(]*\))/) : [it.extra || "—"]).map((t) => ({ label: t.trim(), note: "", extra: "", arrow: "" })).filter((t) => t.label) });
  }
  if (kind === "comparacao" ? columns.filter((c) => c.items.length).length < 2 : items.length < 2) return null;
  return { kind, title, items: items.slice(0, MAX_ITEMS[kind]), columns: columns.slice(0, 3).map((c) => ({ ...c, items: c.items.slice(0, 8) })) };
}

/** Separa a figura do parágrafo ao lado (depois de uma linha ---). */
export function splitFigure(text: string) {
  const at = text.search(/^\s*-{3,}\s*$/m);
  if (at < 0) return { figure: text, rest: "" };
  return { figure: text.slice(0, at), rest: text.slice(at).replace(/^\s*-{3,}\s*$/m, "").trim() };
}

