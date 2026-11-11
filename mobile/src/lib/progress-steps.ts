/**
 * Etapas do andamento de uma resposta da Kally (o que ela está fazendo), acumuladas na ordem em que chegam.
 * A mesma chave atualiza a linha (ex.: a contagem de palavras do rascunho); uma chave nova fecha a etapa em
 * andamento e acrescenta outra; texto vazio só fecha. Os tempos são do relógio do aparelho.
 */
export type ProgressStep = { key: string; text: string; at: number; doneAt?: number };

export function closeStep(steps: ProgressStep[] | undefined, now: number): ProgressStep[] | undefined {
  if (!steps?.length) return steps;
  const last = steps[steps.length - 1];
  if (last.doneAt !== undefined) return steps;
  return [...steps.slice(0, -1), { ...last, doneAt: now }];
}

export function addStep(steps: ProgressStep[] | undefined, text: string | undefined, key: string | undefined, now: number): ProgressStep[] {
  const list = [...(steps ?? [])];
  const last = list[list.length - 1];
  if (!text) return closeStep(list, now) ?? list;
  if (last && key && last.key === key) {
    list[list.length - 1] = { ...last, text };
    return list;
  }
  if (last && last.doneAt === undefined) list[list.length - 1] = { ...last, doneAt: now };
  // Chave repetida mais adiante (ex.: a mesma etapa voltou): ganha um sufixo para a lista não ter duas iguais.
  const base = key ?? `etapa-${list.length}`;
  const unique = list.some((s) => s.key === base) ? `${base}-${list.length}` : base;
  list.push({ key: unique, text, at: now });
  return list;
}

/** m:ss (e h:mm:ss a partir de uma hora). Nunca negativo. */
export function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
