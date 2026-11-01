/**
 * Rascunho que a Kally entrega ao editor: guardado em memória só até o editor
 * de "novo pensamento" abrir e pegá-lo (uma vez).
 */
let pending: { title: string; content: string } | null = null;

export function handOffDraft(draft: { title: string; content: string }) {
  pending = draft;
}

export function takeDraft() {
  const draft = pending;
  pending = null;
  return draft;
}

/** Separa o rascunho marcado (<rascunho># Título ... </rascunho>) do restante da resposta. */
export function extractDraft(text: string): { before: string; draft: { title: string; content: string } | null; after: string } {
  const match = text.match(/<rascunho>\s*([\s\S]*?)\s*(?:<\/rascunho>|$)/i);
  if (!match || match.index === undefined) return { before: text, draft: null, after: "" };
  const body = match[1].trim();
  const heading = body.match(/^#\s+(.+)\n?/);
  const draft = { title: heading ? heading[1].trim() : "", content: heading ? body.slice(heading[0].length).trim() : body };
  return { before: text.slice(0, match.index).trim(), draft: draft.content || draft.title ? draft : null, after: text.slice(match.index + match[0].length).trim() };
}
