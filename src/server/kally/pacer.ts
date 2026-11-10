/**
 * Ritmo constante para o texto da Kally remota. Medido em 10/11 (kally-bench/ab/stream_gaps.py): o vLLM, pelo
 * túnel, entrega o texto em rajadas (intervalo mediano 0 ms, pausas de ~0,4 s), e o app mostrava um anda-e-para;
 * o modelo local manda um pedaço a cada ~80 ms. O pacer guarda o que chega e solta a cada TICK_MS uma fração
 * do acumulado, de modo que uma rajada sai em ~WINDOW_MS. O primeiro texto sai na hora; o atraso máximo é ~WINDOW_MS.
 */
const TICK_MS = 40;
const WINDOW_MS = 360;
const MIN_CHARS = 3;

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
