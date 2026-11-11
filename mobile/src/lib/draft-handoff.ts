import { latexToText } from "@/lib/math-text";

/**
 * Texto que a Kally entrega ao editor: guardado em memória só até o editor abrir e
 * pegá-lo (uma vez). Com postId, vale só para o editor daquele pensamento (revisão
 * aplicada); sem, para um pensamento novo. Nada é salvo sem a pessoa salvar no editor.
 */
type Draft = { title: string; content: string; postId?: string };
let pending: Draft | null = null;

export function handOffDraft(draft: Draft) {
  // O editor não desenha LaTeX: as fórmulas vão como texto com símbolos (lib/math-text.ts).
  pending = { ...draft, content: latexToText(draft.content) };
}

export function takeDraft(postId?: string) {
  if (!pending || (pending.postId ?? undefined) !== postId) return null;
  const draft = pending;
  pending = null;
  return draft;
}

/**
 * Separa o rascunho marcado do restante da resposta:
 * <rascunho># Título / Categorias: A, B / corpo</rascunho>
 */
export function extractDraft(text: string): { before: string; draft: { title: string; content: string; categories: string[] } | null; after: string } {
  // O modelo às vezes troca a marcação por *rascunho* / **Rascunho:**; aceita as duas.
  const match = text.match(/(?:<rascunho>|\*{1,2}rascunho:?\*{1,2}:?)\s*([\s\S]*?)\s*(?:<\/rascunho>|\*{1,2}\/rascunho\*{1,2}|$)/i);
  if (!match || match.index === undefined) return { before: text, draft: null, after: "" };
  let body = match[1].trim();
  const heading = body.match(/^#\s+(.+)\n?/);
  const title = heading ? heading[1].trim() : "";
  if (heading) body = body.slice(heading[0].length).trim();
  const cats = body.match(/^categorias?:\s*(.+)\n?/i);
  const categories = cats ? cats[1].split(",").map((c) => c.trim().replace(/\.$/, "")).filter(Boolean) : [];
  if (cats) body = body.slice(cats[0].length).trim();
  // O modelo às vezes copia a linha do formato pedido ("Corpo em Markdown").
  body = body.replace(/^corpo em markdown:?\s*\n+/i, "").trim();
  const draft = { title, content: latexToText(body), categories };
  return { before: text.slice(0, match.index).trim(), draft: draft.content || draft.title ? draft : null, after: text.slice(match.index + match[0].length).trim() };
}

/** Aplica as sugestões escolhidas (troca do trecho exato pela sugestão). */
export function applySuggestions(content: string, suggestions: { trecho: string; sugestao: string }[]) {
  return suggestions.reduce((text, s) => (s.sugestao && text.includes(s.trecho) ? text.replace(s.trecho, s.sugestao) : text), content);
}
