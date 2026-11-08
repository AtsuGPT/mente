/** Remove a sintaxe Markdown mais comum, devolvendo texto corrido. */
export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*([-*_]\s*){3,}$/gm, " ")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Como stripMarkdown, mas mantém uma linha por parágrafo ou item: a divisão da memória da Kally em trechos é por
 * parágrafo, e com tudo numa linha só ela cortava o post a cada 900 caracteres no meio das frases.
 */
export function stripMarkdownLines(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .split(/\n+/)
    .map((line) => stripMarkdown(line))
    .filter(Boolean)
    .join("\n");
}

/** Trecho curto, cortado em limite de palavra. */
export function excerpt(markdown: string, maxLength = 180): string {
  const text = stripMarkdown(markdown);
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?-]+$/, "")}…`;
}

export function readingMinutes(markdown: string): number {
  const words = stripMarkdown(markdown).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
