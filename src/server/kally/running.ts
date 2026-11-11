import "server-only";

/**
 * Respostas da Kally em andamento por conversa salva. Numa conversa salva a geração continua no servidor mesmo
 * que a pessoa saia do app ou do site (a conexão cai, o texto segue sendo escrito e é gravado no fim); quem reabre
 * a conversa vê que a Kally ainda está escrevendo (GET da conversa → generating) e o app confere até ficar pronta.
 * Fica só em memória: um reinício do servidor interrompe o que estava em andamento (a parte escrita até ali não é
 * gravada) e o registro some junto. Validade de 30 min, por segurança.
 */
type Registry = { __kallyRunning?: Map<string, number> };
const registry = globalThis as typeof globalThis & Registry;
const running = (registry.__kallyRunning ??= new Map<string, number>());
const TTL_MS = 30 * 60_000;

export function markRunning(conversationId: string) {
  running.set(conversationId, Date.now());
}

export function markDone(conversationId: string) {
  running.delete(conversationId);
}

export function isRunning(conversationId: string) {
  const at = running.get(conversationId);
  if (!at) return false;
  if (Date.now() - at > TTL_MS) {
    running.delete(conversationId);
    return false;
  }
  return true;
}
