/**
 * Divisão de textos longos em trechos e recuperação dos mais relevantes.
 * Usado pelos anexos e pelas páginas lidas na pesquisa, para não enviar
 * documentos enormes integralmente ao modelo.
 */

export type Chunk = { index: number; label: string; text: string };

const STOP_WORDS = new Set([
  "a", "as", "o", "os", "um", "uma", "uns", "umas", "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas",
  "por", "para", "com", "sem", "que", "qual", "quais", "como", "porque", "sobre", "isso", "este", "esta", "esse", "essa",
  "me", "mim", "eu", "voce", "ele", "ela", "eles", "elas", "e", "ou", "mas", "ao", "aos", "ser", "ter", "faz", "fazer",
  "quero", "queria", "gostaria", "pode", "poderia", "favor", "texto", "post", "arquivo", "arquivos", "anexo", "anexos",
  "documento", "documentos", "analise", "analisar", "relacione", "relacionar", "produza", "escreva", "crie", "sua",
  "seu", "suas", "seus", "nao", "sim", "mais", "muito", "bem", "tem", "sao", "foi", "era", "isto", "aquilo", "entre",
  "the", "and", "for", "with", "from", "this", "that", "what", "about",
]);

export function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");
}

export function queryTerms(value: string, max = 14): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of value.match(/[\p{L}\p{N}]{3,}/gu) ?? []) {
    const term = normalizeText(raw).slice(0, 40);
    if (STOP_WORDS.has(term) || seen.has(term)) continue;
    seen.add(term);
    terms.push(term);
    if (terms.length >= max) break;
  }
  return terms;
}

/** Divide seções (páginas, linhas, parágrafos) em trechos de tamanho próximo a `size`, sem cortar palavras. */
export function splitIntoChunks(sections: { label: string; text: string }[], size = 1_400): Chunk[] {
  const chunks: Chunk[] = [];
  for (const section of sections) {
    const paragraphs = section.text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    let current = "";
    const flush = () => {
      if (current.trim()) chunks.push({ index: chunks.length, label: section.label, text: current.trim() });
      current = "";
    };
    for (const paragraph of paragraphs) {
      if (paragraph.length > size) {
        flush();
        const words = paragraph.split(/\s+/);
        let piece = "";
        for (const word of words) {
          if (piece.length + word.length + 1 > size) {
            chunks.push({ index: chunks.length, label: section.label, text: piece.trim() });
            piece = "";
          }
          piece += `${word} `;
        }
        current = piece;
        continue;
      }
      if (current.length + paragraph.length + 2 > size) flush();
      current += `${paragraph}\n\n`;
    }
    flush();
  }
  return chunks;
}

export function scoreChunk(text: string, terms: string[]) {
  if (!terms.length) return 0;
  const haystack = normalizeText(text);
  let score = 0;
  let matched = 0;
  for (const term of terms) {
    let count = 0;
    let position = haystack.indexOf(term);
    while (position !== -1 && count < 6) {
      count += 1;
      position = haystack.indexOf(term, position + term.length);
    }
    if (count) {
      matched += 1;
      score += 1 + Math.log2(1 + count);
    }
  }
  // Trechos que cobrem mais termos diferentes valem mais que repetições de um só.
  return matched ? score + matched * 1.5 : 0;
}

/**
 * Seleciona trechos relevantes dentro de um orçamento de caracteres.
 * O primeiro trecho é sempre incluído para que o assunto do documento fique claro.
 * O resultado volta na ordem original do documento.
 */
export function selectRelevantChunks(chunks: Chunk[], terms: string[], budget: number): { chunks: Chunk[]; omitted: number } {
  if (!chunks.length) return { chunks: [], omitted: 0 };
  const total = chunks.reduce((sum, chunk) => sum + chunk.text.length, 0);
  if (total <= budget) return { chunks, omitted: 0 };

  const selected = new Map<number, Chunk>();
  let used = 0;
  const take = (chunk: Chunk) => {
    if (selected.has(chunk.index)) return true;
    if (used + chunk.text.length > budget) return false;
    selected.set(chunk.index, chunk);
    used += chunk.text.length;
    return true;
  };
  take(chunks[0]);
  const ranked = chunks
    .map((chunk) => ({ chunk, score: scoreChunk(chunk.text, terms) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  for (const { chunk } of ranked) take(chunk);
  // Sem termos coincidentes, distribui a amostra ao longo do documento.
  if (selected.size === 1 && chunks.length > 1) {
    const step = Math.max(1, Math.floor(chunks.length / 6));
    for (let index = step; index < chunks.length; index += step) {
      if (!take(chunks[index])) break;
    }
  }
  const ordered = [...selected.values()].sort((a, b) => a.index - b.index);
  return { chunks: ordered, omitted: chunks.length - ordered.length };
}
