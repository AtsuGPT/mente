/**
 * Refinamento sem recriar: a Kally devolve só os trechos que mudam (BUSCAR → trocar por), e o servidor aplica no
 * código atual do artefato. Uma mudança pequena ("deixa a curva verde") custa algumas linhas em vez da página
 * inteira, e o resto do código fica exatamente como estava.
 *
 * Cada trecho é procurado primeiro exatamente; depois ignorando espaços no começo e no fim das linhas (o modelo às
 * vezes muda a indentação ao copiar). Um trecho que não aparece, ou aparece mais de uma vez, faz a edição falhar
 * inteira (nada é aplicado pela metade) e o servidor pede o artefato completo.
 */

export type EditResult = { ok: true; source: string; applied: number } | { ok: false; reason: string };

function exactOnce(haystack: string, needle: string) {
  const first = haystack.indexOf(needle);
  if (first < 0) return { at: -1, count: 0 };
  return { at: first, count: haystack.indexOf(needle, first + 1) >= 0 ? 2 : 1 };
}

/** Procura o trecho comparando linha a linha sem os espaços das pontas; devolve [início, fim) no texto original. */
function looseFind(source: string, search: string): { start: number; end: number } | null | "ambiguous" {
  const want = search.split("\n").map((l) => l.trim());
  while (want.length && !want[0]) want.shift();
  while (want.length && !want[want.length - 1]) want.pop();
  if (!want.length) return null;
  const lines = source.split("\n");
  const offsets: number[] = [];
  let pos = 0;
  for (const l of lines) {
    offsets.push(pos);
    pos += l.length + 1;
  }
  let found: { start: number; end: number } | null = null;
  for (let i = 0; i + want.length <= lines.length; i++) {
    let ok = true;
    for (let j = 0; j < want.length; j++) {
      if (lines[i + j].trim() !== want[j]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    if (found) return "ambiguous";
    const last = i + want.length - 1;
    found = { start: offsets[i], end: offsets[last] + lines[last].length };
  }
  return found;
}

export function applyEdits(source: string, edits: { search: string; replace: string }[]): EditResult {
  if (!edits.length) return { ok: false, reason: "nenhuma troca no bloco" };
  let current = source;
  for (const [i, edit] of edits.entries()) {
    if (!edit.search.trim()) return { ok: false, reason: `troca ${i + 1} sem trecho a buscar` };
    const exact = exactOnce(current, edit.search);
    if (exact.count === 1) {
      current = current.slice(0, exact.at) + edit.replace + current.slice(exact.at + edit.search.length);
      continue;
    }
    if (exact.count > 1) return { ok: false, reason: `o trecho da troca ${i + 1} aparece mais de uma vez` };
    const loose = looseFind(current, edit.search);
    if (loose === "ambiguous") return { ok: false, reason: `o trecho da troca ${i + 1} aparece mais de uma vez` };
    if (!loose) return { ok: false, reason: `não encontrei o trecho da troca ${i + 1} no código atual` };
    current = current.slice(0, loose.start) + edit.replace + current.slice(loose.end);
  }
  return { ok: true, source: current, applied: edits.length };
}
