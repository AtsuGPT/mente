/**
 * Separa os blocos ":::details[título] ... :::" do Markdown, com a mesma regra
 * de aninhamento do editor do site (src/lib/tiptap/details-markdown.ts).
 */

export type Segment = { type: "markdown"; text: string } | { type: "details"; summary: string; body: Segment[] };

const OPEN = /^:::details\[(.*)\]\s*$/;
const CLOSE = /^:::\s*$/;

export function splitDetails(source: string): Segment[] {
  const lines = source.split("\n");
  const segments: Segment[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.join("").trim()) segments.push({ type: "markdown", text: buffer.join("\n") });
    buffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const opening = OPEN.exec(lines[i]);
    if (!opening) {
      buffer.push(lines[i]);
      continue;
    }
    // Procura o ":::" que fecha este bloco, respeitando blocos aninhados.
    let depth = 1;
    let end = -1;
    for (let j = i + 1; j < lines.length; j++) {
      if (OPEN.test(lines[j])) depth++;
      else if (CLOSE.test(lines[j]) && --depth === 0) {
        end = j;
        break;
      }
    }
    if (end === -1) {
      buffer.push(lines[i]); // sem fechamento: mantém como texto, como o site faz
      continue;
    }
    flush();
    segments.push({
      type: "details",
      summary: opening[1].replace(/\\\]/g, "]") || "Detalhes",
      body: splitDetails(lines.slice(i + 1, end).join("\n")),
    });
    i = end;
  }
  flush();
  return segments;
}
