/**
 * Ritmo constante para o texto da Kally remota. Medido em 10/11 (kally-bench/ab/stream_gaps.py): o vLLM, pelo
 * túnel, entrega o texto em rajadas (intervalo mediano 0 ms, pausas de ~0,4 s), e o app mostrava um anda-e-para;
 * o modelo local manda um pedaço a cada ~80 ms. O pacer guarda o que chega e solta a cada TICK_MS uma fração
 * do acumulado, de modo que uma rajada sai em ~WINDOW_MS. O primeiro texto sai na hora; o atraso máximo é ~WINDOW_MS.
 */
const TICK_MS = 40;
const WINDOW_MS = 360;
const MIN_CHARS = 3;

/**
 * Texto já pronto (o post revisado): sai em pedaços, em ~CHARS_PER_SECOND, cortando em espaço, para o app
 * mostrar o rascunho se formando sem receber o texto inteiro de uma vez.
 */
const CHARS_PER_SECOND = 1_800;
export async function typeOut(text: string, emit: (text: string) => void, signal: AbortSignal) {
  const step = Math.ceil((CHARS_PER_SECOND * TICK_MS) / 1_000);
  let at = 0;
  while (at < text.length && !signal.aborted) {
    let end = Math.min(text.length, at + step);
    const space = text.indexOf(" ", end);
    if (end < text.length && space > 0 && space - end < 20) end = space + 1;
    emit(text.slice(at, end));
    at = end;
    if (at < text.length) await new Promise((resolve) => setTimeout(resolve, TICK_MS));
  }
}

export function createPacer(emit: (text: string) => void, signal: AbortSignal) {
  let queue = "";
  let timer: ReturnType<typeof setInterval> | null = null;
  let drained: (() => void) | null = null;

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
    const done = drained;
    drained = null;
    done?.();
  };
  const tick = () => {
    if (signal.aborted) queue = "";
    if (!queue) return stop();
    let n = Math.max(MIN_CHARS, Math.ceil((queue.length * TICK_MS) / WINDOW_MS));
    // não separa um par substituto (emoji) entre dois envios
    if (n < queue.length) {
      const code = queue.charCodeAt(n - 1);
      if (code >= 0xd800 && code <= 0xdbff) n += 1;
    }
    const part = queue.slice(0, n);
    queue = queue.slice(n);
    emit(part);
    if (!queue) stop();
  };

  return {
    push(text: string) {
      if (!text) return;
      queue += text;
      if (!timer) {
        tick();
        if (queue && !timer) timer = setInterval(tick, TICK_MS);
      }
    },
    /** Espera o acumulado sair no mesmo ritmo (fim normal da resposta). */
    finish(): Promise<void> {
      if (!queue) return Promise.resolve();
      return new Promise((resolve) => {
        drained = resolve;
      });
    },
    /** Solta tudo de uma vez (erro ou cancelamento). */
    flushNow() {
      const rest = queue;
      queue = "";
      stop();
      if (rest && !signal.aborted) emit(rest);
    },
  };
}
