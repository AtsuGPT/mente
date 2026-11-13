import "server-only";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Gasto do dia com as APIs pagas por uso (Kally 32 e Kally 1.5 no OpenRouter), por modelo. Cada modelo tem um teto
 * diário (KALLY_API_MAX_USD_PER_DAY, padrão US$ 1, decisão do dono do projeto em 13/11/2026): passou dele, o modelo
 * sai de cena até o dia seguinte (horário de Brasília) e a Kally desce um degrau: Kally 32 → Kally 1.5 pela API →
 * Qwen no PC (o último recurso).
 *
 * O custo vem da própria API (usage.cost do OpenRouter); sem ele, uma estimativa pelos tokens (PRICES). O total
 * fica em logs/kally-gasto.json, para um reinício do site não zerar a conta do dia. Pedidos que já estavam em
 * andamento quando o teto foi atingido terminam normalmente (passam do teto por frações de centavo).
 */

const FILE = () => path.join(process.cwd(), "logs", "kally-gasto.json");

/** US$ por milhão de tokens (entrada, saída), só para estimar quando a API não informa o custo. */
const PRICES: Record<string, [number, number]> = {
  "openai/gpt-oss-120b": [0.05, 0.25],
  "openai/gpt-oss-20b": [0.03, 0.14],
};

export const dailyLimitUsd = () => {
  const v = Number(process.env.KALLY_API_MAX_USD_PER_DAY);
  return Number.isFinite(v) && v > 0 ? v : 1;
};

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

type Ledger = { day: string; models: Record<string, { usd: number; requests: number }> };
type Registry = { __kallySpend?: Ledger; __kallySpendTimer?: ReturnType<typeof setTimeout> };
const registry = globalThis as typeof globalThis & Registry;

function ledger(): Ledger {
  const day = today();
  if (!registry.__kallySpend) {
    try {
      registry.__kallySpend = JSON.parse(readFileSync(FILE(), "utf8")) as Ledger;
    } catch {
      registry.__kallySpend = { day, models: {} };
    }
  }
  if (registry.__kallySpend.day !== day) registry.__kallySpend = { day, models: {} };
  return registry.__kallySpend;
}

function save() {
  if (registry.__kallySpendTimer) return;
  registry.__kallySpendTimer = setTimeout(() => {
    registry.__kallySpendTimer = undefined;
    try {
      mkdirSync(path.dirname(FILE()), { recursive: true });
      writeFileSync(FILE(), JSON.stringify(ledger(), null, 2), "utf8");
    } catch {
      // a conta continua em memória; o registro em arquivo nunca derruba a resposta
    }
  }, 1_000);
  registry.__kallySpendTimer.unref?.();
}

/** Soma o custo de um pedido (usage do fim da resposta). */
export function recordSpend(model: string, usage: { cost?: unknown; prompt_tokens?: number; completion_tokens?: number } | null | undefined) {
  if (!model || !usage) return;
  const price = PRICES[model];
  const usd =
    typeof usage.cost === "number" && Number.isFinite(usage.cost)
      ? usage.cost
      : price
        ? ((usage.prompt_tokens ?? 0) * price[0] + (usage.completion_tokens ?? 0) * price[1]) / 1e6
        : 0;
  const l = ledger();
  const entry = (l.models[model] ??= { usd: 0, requests: 0 });
  entry.usd += usd;
  entry.requests += 1;
  save();
}

export function spentToday(model: string) {
  return ledger().models[model]?.usd ?? 0;
}

export function overBudget(model: string) {
  return spentToday(model) >= dailyLimitUsd();
}

/** Resumo do dia (painel e registro). */
export function spendSummary() {
  const l = ledger();
  return { day: l.day, limitUsd: dailyLimitUsd(), models: Object.fromEntries(Object.entries(l.models).map(([m, v]) => [m, { usd: Math.round(v.usd * 10_000) / 10_000, requests: v.requests }])) };
}
