import "server-only";

/**
 * Modo Desenvolvedor da Kally (só o administrador da plataforma): escolhe QUAL modelo responde, e só isso. Desde
 * 13/11/2026 não mexe mais no prompt (personalidade, instruções e linguagem saíram, a pedido do dono do projeto): a
 * Kally responde com o prompt de sempre, e o modelo escolhido vale para qualquer pedido, comando (/post, revisão…) ou
 * esforço (Aprofundado, Máximo), sem o roteador trocar de modelo e sem cair para outro se o escolhido falhar.
 *
 *   qwen   o Qwen 8B do PC (Ollama), sem passar pela API
 *   20b    a Kally 1.5 pela API (GPT-OSS 20B, KALLY_LIGHT_MODEL)
 *   120b   a Kally 32 pela API (GPT-OSS 120B, KALLY_REMOTE_MODEL)
 */
export type DevEngine = "qwen" | "20b" | "120b";
export type DevSettings = { engine: DevEngine };

export const DEV_ENGINES: DevEngine[] = ["qwen", "20b", "120b"];
export const DEV_ENGINE_LABEL: Record<DevEngine, string> = { qwen: "Qwen 8B (no PC)", "20b": "GPT-OSS 20B (Kally 1.5)", "120b": "GPT-OSS 120B (Kally 32)" };

/** Lê e valida o que o app mandou. Nulo = modo desligado (a Kally escolhe o modelo como sempre). */
export function parseDevSettings(value: unknown): DevSettings | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.active !== true) return null;
  return DEV_ENGINES.includes(v.engine as DevEngine) ? { engine: v.engine as DevEngine } : null;
}
