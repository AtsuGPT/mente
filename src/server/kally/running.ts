import "server-only";

/**
 * Respostas da Kally em andamento por conversa salva. Numa conversa salva a geração continua no servidor mesmo
 * que a pessoa saia do app ou do site (a conexão cai, o texto segue sendo escrito e é gravado no fim); quem reabre
 * a conversa vê que a Kally ainda está escrevendo (GET da conversa → generating) e o app confere até ficar pronta.
 *
 * Parar de verdade (botão "Parar" ou conversa excluída): stopRunning cancela a geração no servidor, para não gastar
 * modelo à toa (pedido do dono do projeto, 11/11/2026). A parte já escrita fica gravada.
 *
 * Fica só em memória: um reinício do servidor interrompe o que estava em andamento e o registro some junto.
 * Validade de 30 min, por segurança.
 */
type Entry = { at: number; cancel?: AbortController };
type Registry = { __kallyRunning?: Map<string, Entry> };
const registry = globalThis as typeof globalThis & Registry;
const running = (registry.__kallyRunning ??= new Map<string, Entry>());
const TTL_MS = 30 * 60_000;

export function markRunning(conversationId: string, cancel?: AbortController) {
  running.set(conversationId, { at: Date.now(), cancel });
}

export function markDone(conversationId: string) {
  running.delete(conversationId);
}

export function isRunning(conversationId: string) {
  const entry = running.get(conversationId);
  if (!entry) return false;
  if (Date.now() - entry.at > TTL_MS) {
    running.delete(conversationId);
    return false;
  }
  return true;
}

/** Para a resposta em andamento desta conversa (se houver). true se havia algo para parar. */
export function stopRunning(conversationId: string) {
  const entry = running.get(conversationId);
  if (!entry) return false;
  entry.cancel?.abort();
  running.delete(conversationId);
  return true;
}
