import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { embedProfile, embedQueries } from "@/server/ai";
import { analise } from "./analise";
import { estudo } from "./estudo";
import { post } from "./post";
import type { CompetenceId, CompetenceSpec, ReferenceExample } from "./types";

export type { CompetenceId, CompetenceSpec, ReferenceExample };

export const COMPETENCES: Record<CompetenceId, CompetenceSpec> = { estudo, post, analise };

/**
 * Vetores dos pedidos de exemplo, guardados em .cache/kally-exemplos.json pela soma do texto
 * com o modelo de embeddings: só é recalculado o que mudou. O vetor da mensagem da pessoa
 * nunca é gravado.
 */
const CACHE_FILE = () => path.join(process.cwd(), ".cache", "kally-exemplos.json");
const key = (text: string) => createHash("sha256").update(`${embedProfile().model}\n${text}`).digest("hex");

const store = globalThis as typeof globalThis & { __kallyExampleVectors?: Map<string, number[]> };

async function exampleVectors(examples: ReferenceExample[]): Promise<number[][]> {
  if (!store.__kallyExampleVectors) {
    store.__kallyExampleVectors = new Map();
    try {
      const saved = JSON.parse(await readFile(CACHE_FILE(), "utf8")) as Record<string, number[]>;
      for (const [k, v] of Object.entries(saved)) store.__kallyExampleVectors.set(k, v);
    } catch {
      // primeira vez: calcula abaixo
    }
  }
  const cache = store.__kallyExampleVectors;
  const missing = examples.filter((e) => !cache.has(key(e.pedido)));
  if (missing.length) {
    // Prefixo de pergunta dos dois lados: aqui se compara pedido com pedido.
    const vectors = await embedQueries(missing.map((e) => e.pedido));
    missing.forEach((e, i) => cache.set(key(e.pedido), vectors[i]));
    await mkdir(path.dirname(CACHE_FILE()), { recursive: true });
    await writeFile(CACHE_FILE(), JSON.stringify(Object.fromEntries(cache)), "utf8").catch(() => undefined);
  }
  return examples.map((e) => cache.get(key(e.pedido))!);
}

function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Palavras com 4+ letras, sem acento: plano B quando os embeddings falham. */
const words = (text: string) => new Set(text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z]{4,}/g) ?? []);

/**
 * Exemplos de referência mais parecidos com o pedido: o mais próximo sempre e um segundo se
 * os dois couberem no orçamento (o contexto é de 8192 tokens, dividido com o material).
 */
export async function selectExamples(id: CompetenceId, query: string, options: { max?: number; charBudget?: number } = {}): Promise<{ examples: ReferenceExample[]; ms: number; by: "embeddings" | "palavras" }> {
  const started = Date.now();
  const { exemplos } = COMPETENCES[id];
  const max = options.max ?? 2;
  const budget = options.charBudget ?? 6_500;
  let ranked: { example: ReferenceExample; score: number }[];
  let by: "embeddings" | "palavras" = "embeddings";
  try {
    const [vectors, [queryVector]] = await Promise.all([exampleVectors(exemplos), embedQueries([query.slice(0, 2_000)])]);
    ranked = exemplos.map((example, i) => ({ example, score: cosine(queryVector, vectors[i]) }));
  } catch {
    by = "palavras";
    const q = words(query);
    ranked = exemplos.map((example) => ({ example, score: [...words(example.pedido)].filter((w) => q.has(w)).length }));
  }
  ranked.sort((a, b) => b.score - a.score);
  const chosen: ReferenceExample[] = [];
  let used = 0;
  for (const { example } of ranked) {
    const size = example.pedido.length + example.resposta.length;
    if (chosen.length && used + size > budget) continue;
    chosen.push(example);
    used += size;
    if (chosen.length >= max) break;
  }
  return { examples: chosen, ms: Date.now() - started, by };
}
