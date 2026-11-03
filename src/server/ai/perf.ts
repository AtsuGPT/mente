import "server-only";
import { execFile } from "node:child_process";
import { appendFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Registro de desempenho da Kally: uma linha JSON por pedido em logs/kally-perf.jsonl
 * (tempos de fila, descarga, carga, interpretação e geração, e memória). Sem conteúdo das
 * mensagens nem identificação da pessoa.
 *
 *   KALLY_PERF_GPU=1  também mede o pico de VRAM com o nvidia-smi (1 vez por segundo).
 */

const FILE = () => path.join(process.cwd(), "logs", "kally-perf.jsonl");

function gpuUsedMiB(): Promise<number | null> {
  return new Promise((resolve) => {
    execFile("nvidia-smi", ["--query-gpu=memory.used", "--format=csv,noheader,nounits"], { timeout: 3_000, windowsHide: true }, (cause, stdout) => {
      const value = Number(String(stdout).trim().split("\n")[0]);
      resolve(cause || !Number.isFinite(value) ? null : value);
    });
  });
}

/** Mede a RAM livre mínima (e o pico de VRAM, se ligado) até stop(). */
export function memorySampler() {
  const gpu = process.env.KALLY_PERF_GPU === "1";
  let minFree = os.freemem();
  let peakVram: number | null = null;
  const sample = () => {
    minFree = Math.min(minFree, os.freemem());
    if (gpu) void gpuUsedMiB().then((v) => v !== null && (peakVram = Math.max(peakVram ?? 0, v)));
  };
  sample();
  const timer = setInterval(sample, gpu ? 1_000 : 500);
  timer.unref?.();
  // Pedido que termina antes da resposta (erro de validação) nunca chama stop(): para sozinho.
  setTimeout(() => clearInterval(timer), 15 * 60_000).unref?.();
  return {
    stop() {
      clearInterval(timer);
      sample();
      return { minFreeRamGB: Math.round((minFree / 1e9) * 100) / 100, peakVramMiB: peakVram };
    },
  };
}

export async function logPerf(record: Record<string, unknown>) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...record });
  console.info("Kally perf:", line);
  try {
    await mkdir(path.dirname(FILE()), { recursive: true });
    await appendFile(FILE(), `${line}\n`, "utf8");
  } catch {
    // o registro nunca derruba a resposta
  }
}
