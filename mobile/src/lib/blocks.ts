/**
 * Contratos dos blocos interativos da Kally que o app desenha de forma nativa (o servidor valida o mesmo formato em
 * src/server/kally/blocks.ts). O modelo escreve só os dados; a interface é do app.
 *
 *   ```escolhas                       ```progresso
 *   ? Como você prefere seguir?       titulo: Plano de estudo
 *   - Ver um exemplo resolvido        - [x] Lei de Ohm | dominado | 9 de 10 certas
 *   - Fazer 3 exercícios              - [ ] Associação em paralelo | com dificuldade
 *   ```                               ```
 */

export type Choices = { prompt: string; options: string[] };

export function parseChoices(source: string): Choices | null {
  let prompt = "";
  const options: string[] = [];
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    const q = line.match(/^\?\s*(.+)$/);
    if (q) prompt = q[1].trim();
    const o = line.match(/^[-*+]\s+(.+)$/) ?? line.match(/^\d+[.)]\s+(.+)$/);
    if (o) options.push(o[1].trim().slice(0, 120));
  }
  const unique = options.filter((o, i) => options.indexOf(o) === i).slice(0, 5);
  return unique.length >= 2 ? { prompt, options: unique } : null;
}

export type ProgressStatus = "dominado" | "dificuldade" | "estudando" | null;
export type ProgressItem = { done: boolean; label: string; status: ProgressStatus; detail: string };
export type Progress = { title: string; items: ProgressItem[] };

const STATUS: Record<string, ProgressStatus> = { dominado: "dominado", "com dificuldade": "dificuldade", dificuldade: "dificuldade", estudando: "estudando" };

export function parseProgress(source: string): Progress | null {
  let title = "";
  const items: ProgressItem[] = [];
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    const t = line.match(/^t[ií]tulo\s*:\s*(.+)$/i);
    if (t) title = t[1].trim();
    const item = line.match(/^[-*]\s*\[([ xX])\]\s*(.+)$/);
    if (!item) continue;
    const [label, ...rest] = item[2].split("|").map((p) => p.trim());
    const status = rest.length ? (STATUS[rest[0].toLowerCase()] ?? null) : null;
    items.push({ done: item[1].toLowerCase() === "x", label, status, detail: (status ? rest.slice(1) : rest).join(" · ") });
  }
  return items.length ? { title, items: items.slice(0, 20) } : null;
}
