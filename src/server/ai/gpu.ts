import "server-only";
import fs from "node:fs";
import path from "node:path";
import { clearRemoteBooting, markRemoteBooting, remoteHealth } from "@/server/ai/remote";

/**
 * GPU sob demanda no Vast.ai (instância com o vLLM). Liga e desliga a instância pela API
 * oficial (PUT /api/v0/instances/{id}/ com state "running" ou "stopped"); nunca destrói
 * instância nem volume. Desligada por padrão.
 *
 *   KALLY_VAST_ENABLED          "1" liga o controlador.
 *   KALLY_VAST_API_KEY          chave do Vast.ai (só no servidor). A permissão instance_write
 *                               também permite destruir: o código só usa ligar e desligar.
 *   KALLY_VAST_INSTANCE_ID      id da instância.
 *   KALLY_GPU_AUTOSTART         "1": um pedido que precisa do modelo remoto liga a instância
 *                               (a resposta daquele pedido sai no modelo local). Padrão: só o
 *                               administrador liga.
 *   KALLY_GPU_IDLE_MINUTES      desliga depois de N minutos sem uso remoto (padrão 20; 0 = nunca).
 *   KALLY_GPU_MAX_USD_PER_DAY   gasto máximo de GPU por dia, pelo dph_total do Vast (padrão 5).
 *   KALLY_GPU_MAX_STARTS_PER_DAY  tentativas de ligar por dia (padrão 6).
 *   KALLY_GPU_BOOT_TIMEOUT_MIN  ligando há mais que isso sem o vLLM responder: estado de erro (padrão 15).
 *
 * Cobrança (documentação do Vast.ai): parada, a GPU não é cobrada, mas o disco continua sendo.
 * Ao religar, a instância pode esperar indefinidamente se a GPU foi alugada por outra pessoa.
 */

const API = "https://console.vast.ai/api/v0";
const STATE_FILE = () => path.join(process.cwd(), ".cache", "kally-gpu.json");
const START_COOLDOWN_MS = 10 * 60_000;

type GpuState = {
  /** dia (America/Sao_Paulo) das contas abaixo */
  day: string;
  starts: number;
  /** gasto estimado do dia em US$ (horas ligada × dph_total) */
  spentUsd: number;
  /** quando ligamos (ou vimos ligada) pela última vez, para somar o custo */
  runningSince: number | null;
  dph: number | null;
  lastStartAt: number | null;
  lastRemoteUseAt: number | null;
  /** a instância foi ligada por este controlador (só desligamos por inatividade o que ligamos) */
  startedByUs: boolean;
  lastError: string | null;
};

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

export function gpuConfig() {
  const n = (v: string | undefined, d: number) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
  return {
    enabled: process.env.KALLY_VAST_ENABLED === "1" && !!process.env.KALLY_VAST_API_KEY && !!process.env.KALLY_VAST_INSTANCE_ID,
    instanceId: process.env.KALLY_VAST_INSTANCE_ID || "",
    autostart: process.env.KALLY_GPU_AUTOSTART === "1",
    idleMinutes: n(process.env.KALLY_GPU_IDLE_MINUTES, 20),
    maxUsdPerDay: n(process.env.KALLY_GPU_MAX_USD_PER_DAY, 5),
    maxStartsPerDay: n(process.env.KALLY_GPU_MAX_STARTS_PER_DAY, 6),
    bootTimeoutMs: n(process.env.KALLY_GPU_BOOT_TIMEOUT_MIN, 15) * 60_000,
  };
}

const registry = globalThis as typeof globalThis & { __kallyGpuState?: GpuState; __kallyGpuTimer?: ReturnType<typeof setInterval>; __kallyGpuBusy?: Promise<unknown> };

function load(): GpuState {
  if (!registry.__kallyGpuState) {
    let saved: Partial<GpuState> = {};
    try {
      saved = JSON.parse(fs.readFileSync(STATE_FILE(), "utf8"));
    } catch {
      // primeira vez
    }
    registry.__kallyGpuState = { day: today(), starts: 0, spentUsd: 0, runningSince: null, dph: null, lastStartAt: null, lastRemoteUseAt: null, startedByUs: false, lastError: null, ...saved };
  }
  const s = registry.__kallyGpuState;
  if (s.day !== today()) Object.assign(s, { day: today(), starts: 0, spentUsd: 0, runningSince: s.runningSince ? Date.now() : null });
  return s;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE()), { recursive: true });
    fs.writeFileSync(STATE_FILE(), JSON.stringify(registry.__kallyGpuState));
  } catch (cause) {
    console.error("Kally GPU: não salvei o estado:", cause instanceof Error ? cause.message : cause);
  }
}

/** Soma ao gasto do dia o tempo ligado desde a última conta. */
function accrue(s: GpuState) {
  if (s.runningSince && s.dph) {
    const now = Date.now();
    s.spentUsd += ((now - s.runningSince) / 3_600_000) * s.dph;
    s.runningSince = now;
  }
}

async function vast(method: "GET" | "PUT", body?: Record<string, unknown>) {
  const { instanceId } = gpuConfig();
  const r = await fetch(`${API}/instances/${encodeURIComponent(instanceId)}/`, {
    method,
    headers: { Authorization: `Bearer ${process.env.KALLY_VAST_API_KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (r.status === 429) throw new Error("Vast.ai: muitas chamadas seguidas (429)");
  if (!r.ok) throw new Error(`Vast.ai respondeu HTTP ${r.status}`);
  return (await r.json()) as Record<string, unknown>;
}

export type GpuStatus = {
  enabled: boolean;
  /** actual_status do Vast.ai (running, loading, exited...) ou null */
  instance: string | null;
  intended: string | null;
  dph: number | null;
  spentTodayUsd: number;
  startsToday: number;
  lastRemoteUseAt: number | null;
  lastError: string | null;
  remote: Awaited<ReturnType<typeof remoteHealth>>;
};

export async function gpuStatus(): Promise<GpuStatus> {
  const cfg = gpuConfig();
  const s = load();
  let instance: string | null = null;
  let intended: string | null = null;
  if (cfg.enabled) {
    try {
      const data = (await vast("GET")).instances as Record<string, unknown> | undefined;
      instance = (data?.actual_status as string | null) ?? null;
      intended = (data?.intended_status as string | null) ?? null;
      if (typeof data?.dph_total === "number") s.dph = data.dph_total;
      if (instance === "running") {
        if (!s.runningSince) s.runningSince = Date.now();
      } else if (s.runningSince) {
        accrue(s);
        s.runningSince = null;
      }
      accrue(s);
      save();
    } catch (cause) {
      s.lastError = cause instanceof Error ? cause.message : String(cause);
    }
  }
  return { enabled: cfg.enabled, instance, intended, dph: s.dph, spentTodayUsd: Math.round(s.spentUsd * 100) / 100, startsToday: s.starts, lastRemoteUseAt: s.lastRemoteUseAt, lastError: s.lastError, remote: await remoteHealth() };
}

/** O modelo remoto respondeu: conta para o desligamento por inatividade. */
export function noteRemoteUse() {
  const s = load();
  s.lastRemoteUseAt = Date.now();
  save();
}

/**
 * Liga a instância, com as travas: uma tentativa por vez, intervalo mínimo entre tentativas,
 * limite de tentativas e de gasto por dia. Não espera o vLLM subir: marca o estado
 * "inicializando" e o vigia confere depois.
 */
export async function startGpu(reason: string): Promise<{ ok: boolean; detail: string }> {
  const cfg = gpuConfig();
  if (!cfg.enabled) return { ok: false, detail: "controlador da GPU desligado (KALLY_VAST_ENABLED)" };
  if (registry.__kallyGpuBusy) return { ok: false, detail: "já há uma operação na instância em andamento" };
  const s = load();
  accrue(s);
  if (s.starts >= cfg.maxStartsPerDay) return { ok: false, detail: `limite de ${cfg.maxStartsPerDay} tentativas de ligar por dia` };
  if (cfg.maxUsdPerDay > 0 && s.spentUsd >= cfg.maxUsdPerDay) return { ok: false, detail: `limite de US$ ${cfg.maxUsdPerDay} por dia atingido` };
  if (s.lastStartAt && Date.now() - s.lastStartAt < START_COOLDOWN_MS) return { ok: false, detail: "tentativa recente; aguardando o intervalo mínimo" };
  const op = (async () => {
    try {
      const current = ((await vast("GET")).instances as Record<string, unknown> | undefined)?.actual_status;
      if (current === "running") {
        s.runningSince ??= Date.now();
        return { ok: true, detail: "a instância já estava ligada" };
      }
      s.starts += 1;
      s.lastStartAt = Date.now();
      await vast("PUT", { state: "running" });
      s.startedByUs = true;
      s.runningSince = Date.now();
      s.lastError = null;
      markRemoteBooting(cfg.bootTimeoutMs, "a GPU está ligando");
      console.info("Kally GPU: ligando a instância:", reason);
      return { ok: true, detail: "ligando" };
    } catch (cause) {
      s.lastError = cause instanceof Error ? cause.message : String(cause);
      return { ok: false, detail: s.lastError };
    } finally {
      save();
    }
  })();
  registry.__kallyGpuBusy = op;
  try {
    return await op;
  } finally {
    registry.__kallyGpuBusy = undefined;
  }
}

/** Desliga (state "stopped"): para a cobrança da GPU; o disco continua cobrado e os dados ficam. */
export async function stopGpu(reason: string): Promise<{ ok: boolean; detail: string }> {
  const cfg = gpuConfig();
  if (!cfg.enabled) return { ok: false, detail: "controlador da GPU desligado (KALLY_VAST_ENABLED)" };
  if (registry.__kallyGpuBusy) return { ok: false, detail: "já há uma operação na instância em andamento" };
  const s = load();
  const op = (async () => {
    try {
      await vast("PUT", { state: "stopped" });
      accrue(s);
      s.runningSince = null;
      s.startedByUs = false;
      clearRemoteBooting();
      console.info("Kally GPU: desligando a instância:", reason);
      return { ok: true, detail: "desligando" };
    } catch (cause) {
      s.lastError = cause instanceof Error ? cause.message : String(cause);
      return { ok: false, detail: s.lastError };
    } finally {
      save();
    }
  })();
  registry.__kallyGpuBusy = op;
  try {
    return await op;
  } finally {
    registry.__kallyGpuBusy = undefined;
  }
}

/**
 * Vigia (a cada minuto, só com o controlador ligado): desliga por inatividade ou por limite de
 * gasto o que este controlador ligou, e acusa erro quando a instância não sobe no prazo.
 */
export function ensureGpuWatcher() {
  const cfg = gpuConfig();
  if (!cfg.enabled || registry.__kallyGpuTimer) return;
  registry.__kallyGpuTimer = setInterval(() => {
    void (async () => {
      const s = load();
      if (!s.runningSince || !s.startedByUs) return;
      accrue(s);
      save();
      const c = gpuConfig();
      const idleSince = Math.max(s.lastRemoteUseAt ?? 0, s.lastStartAt ?? 0);
      if (c.maxUsdPerDay > 0 && s.spentUsd >= c.maxUsdPerDay) await stopGpu(`limite de US$ ${c.maxUsdPerDay} por dia`);
      else if (c.idleMinutes > 0 && Date.now() - idleSince > c.idleMinutes * 60_000) await stopGpu(`${c.idleMinutes} min sem uso`);
      else if (s.lastStartAt && Date.now() - s.lastStartAt > c.bootTimeoutMs && (await remoteHealth(true)).state !== "disponivel") {
        s.lastError = "a instância não ficou pronta no prazo (a GPU pode ter sido alugada por outra pessoa)";
        save();
      }
    })().catch((cause) => console.error("Kally GPU (vigia):", cause instanceof Error ? cause.message : cause));
  }, 60_000);
  registry.__kallyGpuTimer.unref?.();
}
