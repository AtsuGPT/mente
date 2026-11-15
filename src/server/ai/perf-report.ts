import "server-only";
import { open, stat } from "node:fs/promises";
import path from "node:path";
import { spendSummary } from "@/server/ai/spend";

/**
 * Resumo do registro de desempenho da Kally (logs/kally-perf.jsonl, escrito por perf.ts) para o painel do administrador
 * da plataforma (pedido do dono do projeto, 11/11/2026). Lê só o fim do arquivo (os pedidos recentes), sem conteúdo de
 * mensagem nem identificação de pessoa: o registro já não guarda isso.
 */

const FILE = () => path.join(process.cwd(), "logs", "kally-perf.jsonl");
/** O suficiente para ~7 dias de uso normal (cada linha tem ~1,2 KB). */
const TAIL_BYTES = 3 * 1024 * 1024;

type Entry = {
  at: string;
  mode?: string | null;
  competence?: string | null;
  casual?: boolean;
  effort?: string | null;
  retrieved?: number | null;
  web?: number | null;
  retrievalMs?: number | null;
  firstTextMs?: number | null;
  totalMs?: number | null;
  error?: string | null;
  backend?: { target?: string | null; fallback?: string | null } | null;
  executor?: { model?: string | null; tokensPerSecond?: number | null; outputTokens?: number | null } | null;
};

async function readTail(): Promise<Entry[]> {
  let size = 0;
  try {
    size = (await stat(FILE())).size;
  } catch {
    return [];
  }
  const start = Math.max(0, size - TAIL_BYTES);
  const handle = await open(FILE(), "r");
  try {
    const buffer = Buffer.alloc(size - start);
    await handle.read(buffer, 0, buffer.length, start);
    const lines = buffer.toString("utf8").split("\n");
    if (start > 0) lines.shift(); // a primeira linha pode estar cortada
    const out: Entry[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as Entry);
      } catch {
        // linha incompleta (o site ainda estava escrevendo): fica de fora
      }
    }
    return out;
  } finally {
    await handle.close();
  }
}

const seconds = (ms: number | null | undefined) => (typeof ms === "number" && Number.isFinite(ms) ? Math.round(ms / 100) / 10 : null);

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function timing(values: (number | null | undefined)[]) {
  const list = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!list.length) return null;
  return { media: seconds(list.reduce((a, b) => a + b, 0) / list.length), mediana: seconds(percentile(list, 50)), p90: seconds(percentile(list, 90)) };
}

function summarize(entries: Entry[]) {
  const byModel = new Map<string, Entry[]>();
  for (const e of entries) {
    const model = e.executor?.model ?? "sem modelo";
    byModel.set(model, [...(byModel.get(model) ?? []), e]);
  }
  return {
    pedidos: entries.length,
    erros: entries.filter((e) => e.error).length,
    quedasParaLocal: entries.filter((e) => e.backend?.fallback).length,
    comInternet: entries.filter((e) => (e.web ?? 0) > 0).length,
    primeiraPalavra: timing(entries.map((e) => e.firstTextMs)),
    total: timing(entries.map((e) => e.totalMs)),
    busca: timing(entries.map((e) => e.retrievalMs)),
    porModelo: [...byModel.entries()]
      .map(([modelo, list]) => ({
        modelo,
        pedidos: list.length,
        primeiraPalavraMediana: timing(list.map((e) => e.firstTextMs))?.mediana ?? null,
        tokensPorSegundo: percentile(list.map((e) => e.executor?.tokensPerSecond ?? NaN).filter(Number.isFinite), 50),
      }))
      .sort((a, b) => b.pedidos - a.pedidos),
  };
}

export async function perfReport(now = Date.now()) {
  const entries = (await readTail()).filter((e) => e.at && Number.isFinite(Date.parse(e.at)));
  const since = (hours: number) => entries.filter((e) => now - Date.parse(e.at) <= hours * 3_600_000);
  return {
    geradoEm: new Date(now).toISOString(),
    janelas: { "24 h": summarize(since(24)), "7 dias": summarize(since(24 * 7)) },
    gastoHoje: spendSummary(),
    recentes: entries
      .slice(-40)
      .reverse()
      .map((e) => ({
        at: e.at,
        modelo: e.executor?.model ?? null,
        destino: e.backend?.target ?? null,
        modo: e.casual ? "papo" : e.competence ?? e.mode ?? null,
        esforco: e.effort && e.effort !== "normal" ? e.effort : null,
        pensamentos: e.retrieved ?? 0,
        internet: e.web ?? 0,
        primeiraPalavra: seconds(e.firstTextMs),
        total: seconds(e.totalMs),
        tokensPorSegundo: typeof e.executor?.tokensPerSecond === "number" ? Math.round(e.executor.tokensPerSecond) : null,
        queda: e.backend?.fallback ?? null,
        erro: e.error ?? null,
      })),
  };
}

export type PerfReport = Awaited<ReturnType<typeof perfReport>>;
