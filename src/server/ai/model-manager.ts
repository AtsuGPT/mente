import "server-only";

/**
 * Gerenciador central dos modelos do Ollama local: UM modelo de texto carregado por vez.
 *
 * Toda chamada de geração (Kally do app e do site, revisão, imagens) pede a vez aqui antes
 * de falar com o Ollama. Pedidos do mesmo modelo seguem juntos (o próprio Ollama os enfileira);
 * um pedido de outro modelo espera os anteriores terminarem, descarrega o atual (keep_alive: 0),
 * confirma em /api/ps que ele saiu da memória e só então carrega o próximo. Se o modelo pedido
 * já está carregado, nada é descarregado. A fila é única por servidor (globalThis), então vale
 * para todas as rotas do Next ao mesmo tempo.
 *
 * O modelo de embeddings não entra na conta: roda na CPU (server/ai.ts) e convive com o de texto.
 *
 *   KALLY_MODEL_MANAGER = "off" desliga. Ligado por padrão quando o Ollama é local.
 *   KALLY_GPU_LAYERS    = "modelo=camadas,..." camadas na placa por modelo (num_gpu). Na RTX 2050
 *                         (4 GB), com OLLAMA_FLASH_ATTENTION=1 e OLLAMA_KV_CACHE_TYPE=q8_0, o
 *                         qwen3:4b (37) e o llama3.2 (29) cabem inteiros: 35 e 45 tok/s, contra
 *                         24 e 34 com a escolha automática do Ollama, e sem ocupar a RAM.
 */

export type LeaseInfo = {
  model: string;
  /** espera na fila, atrás de pedidos de outro modelo */
  queueMs: number;
  /** modelos descarregados para dar lugar a este */
  unloaded: string[];
  /** descarga + confirmação de que a memória foi liberada */
  unloadMs: number;
  /** carga do modelo (0 se já estava carregado) */
  loadMs: number;
  alreadyLoaded: boolean;
};

export type Lease = { info: LeaseInfo; release: () => void };

type Loaded = { name: string; model: string; size: number; size_vram: number; context_length?: number };
type Waiter = { model: string; numCtx?: number; maxMs: number; enqueuedAt: number; resolve: (lease: Lease) => void; reject: (cause: Error) => void };

const KEEP_ALIVE = () => process.env.AI_KEEP_ALIVE || "30m";
const UNLOAD_CONFIRM_MS = 30_000;

/** "llama3.2" e "llama3.2:latest" são o mesmo modelo para o Ollama. */
const normalize = (model: string) => (model.includes(":") ? model : `${model}:latest`);

export class ModelBusyError extends Error {}

const registry = globalThis as typeof globalThis & { __kallyModelManagers?: Map<string, ModelManager>; __kallyGpuFallback?: Set<string> };

/**
 * Opções de execução fixas do modelo (hoje, as camadas na placa). Precisam ser as mesmas em
 * todo pedido, senão o Ollama recarrega o modelo. Se a carga falhar com elas (falta de VRAM),
 * o modelo volta para a escolha automática do Ollama até o servidor reiniciar.
 */
export function runtimeOptions(model: string): { num_gpu?: number } {
  const name = normalize(model);
  if (registry.__kallyGpuFallback?.has(name)) return {};
  for (const entry of (process.env.KALLY_GPU_LAYERS || "").split(",")) {
    const at = entry.lastIndexOf("=");
    if (at <= 0 || normalize(entry.slice(0, at).trim()) !== name) continue;
    const layers = Number(entry.slice(at + 1));
    if (Number.isInteger(layers) && layers >= 0) return { num_gpu: layers };
  }
  return {};
}

class ModelManager {
  private current: string | null = null;
  private active = 0;
  private queue: Waiter[] = [];
  private pumping = false;
  private embedders = new Map<string, boolean>();

  constructor(private readonly baseUrl: string) {}

  acquire(model: string, options: { numCtx?: number; maxMs: number }): Promise<Lease> {
    return new Promise((resolve, reject) => {
      this.queue.push({ model: normalize(model), numCtx: options.numCtx, maxMs: options.maxMs, enqueuedAt: Date.now(), resolve, reject });
      void this.pump();
    });
  }

  snapshot() {
    return { current: this.current, active: this.active, queued: this.queue.map((w) => w.model) };
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length) {
        const head = this.queue[0];
        // O modelo pedido está em uso agora: com certeza carregado, segue junto.
        if (head.model === this.current && this.active > 0) {
          this.queue.shift();
          this.grant(head, { queueMs: Date.now() - head.enqueuedAt, unloaded: [], unloadMs: 0, loadMs: 0, alreadyLoaded: true });
          continue;
        }
        // Outro modelo em uso: espera terminar (release chama pump de novo).
        if (this.active > 0) return;
        const queueMs = Date.now() - head.enqueuedAt;
        try {
          const prepared = await this.prepare(head.model, head.numCtx);
          this.queue.shift();
          this.current = head.model;
          this.grant(head, { queueMs, ...prepared });
        } catch (cause) {
          this.queue.shift();
          head.reject(cause instanceof Error ? cause : new Error(String(cause)));
        }
      }
    } finally {
      this.pumping = false;
    }
  }

  private grant(waiter: Waiter, info: Omit<LeaseInfo, "model">) {
    this.active += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      clearTimeout(watchdog);
      this.active -= 1;
      void this.pump();
    };
    // Rede de segurança: se quem pediu nunca terminar de ler a resposta, a vez expira junto com o pedido.
    const watchdog = setTimeout(release, waiter.maxMs);
    watchdog.unref?.();
    waiter.resolve({ info: { model: waiter.model, ...info }, release });
  }

  /** Deixa só o modelo pedido carregado (além do de embeddings), sem descargas desnecessárias. */
  private async prepare(model: string, numCtx?: number): Promise<Omit<LeaseInfo, "model" | "queueMs">> {
    const loaded = await this.ps();
    // Sem resposta do Ollama: o próprio pedido vai mostrar o erro de conexão de sempre.
    if (!loaded) return { unloaded: [], unloadMs: 0, loadMs: 0, alreadyLoaded: false };

    const others: string[] = [];
    for (const m of loaded) if (normalize(m.name) !== model && !(await this.isEmbedder(m.name))) others.push(m.name);
    let unloadMs = 0;
    if (others.length) {
      const started = Date.now();
      await Promise.all(others.map((name) => this.post("/api/generate", { model: name, keep_alive: 0 }, 15_000).catch(() => undefined)));
      await this.confirmUnloaded(others);
      unloadMs = Date.now() - started;
    }

    const same = loaded.find((m) => normalize(m.name) === model);
    // Mesmo modelo com outro num_ctx: o Ollama recarrega sozinho (continua um modelo só).
    const alreadyLoaded = !!same && (!numCtx || !same.context_length || same.context_length === numCtx);
    let loadMs = 0;
    if (!alreadyLoaded) {
      const started = Date.now();
      // Carrega já com as opções do pedido; com outras o Ollama recarregaria na hora de gerar.
      const load = () => this.post("/api/generate", { model, keep_alive: KEEP_ALIVE(), options: { ...(numCtx ? { num_ctx: numCtx } : {}), ...runtimeOptions(model) } }, 300_000);
      await load().catch(async (cause) => {
        if (runtimeOptions(model).num_gpu === undefined) return; // o próprio pedido mostra o erro
        console.warn(`Modelo ${model}: não coube com KALLY_GPU_LAYERS (${cause instanceof Error ? cause.message : cause}); usando a escolha automática do Ollama.`);
        (registry.__kallyGpuFallback ??= new Set()).add(model);
        await load().catch(() => undefined);
      });
      loadMs = Date.now() - started;
    }
    return { unloaded: others, unloadMs, loadMs, alreadyLoaded };
  }

  /** Confirma em /api/ps que os modelos saíram da memória antes de carregar o próximo. */
  private async confirmUnloaded(names: string[]) {
    const deadline = Date.now() + UNLOAD_CONFIRM_MS;
    while (Date.now() < deadline) {
      const loaded = await this.ps();
      if (loaded && !loaded.some((m) => names.includes(m.name))) return;
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new ModelBusyError("O modelo anterior não saiu da memória a tempo. Tente de novo em instantes.");
  }

  private async ps(): Promise<Loaded[] | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/ps`, { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) return null;
      return ((await response.json()) as { models?: Loaded[] }).models ?? [];
    } catch {
      return null;
    }
  }

  /** Modelo só de embeddings (capacidade "embedding" sem "completion"), consultado uma vez. */
  private async isEmbedder(name: string) {
    const cached = this.embedders.get(name);
    if (cached !== undefined) return cached;
    let value = /embed/i.test(name) || normalize(name) === normalize(process.env.AI_EMBED_MODEL || "nomic-embed-text");
    try {
      const info = (await this.post("/api/show", { model: name }, 8_000)) as { capabilities?: string[] };
      if (Array.isArray(info.capabilities)) value = info.capabilities.includes("embedding") && !info.capabilities.includes("completion");
    } catch {
      // fica a regra pelo nome
    }
    this.embedders.set(name, value);
    return value;
  }

  private async post(path: string, body: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, ...(path === "/api/generate" ? { stream: false } : {}) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.json();
  }
}

const isLocal = (baseUrl: string) => {
  try {
    return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
};

function managerFor(baseUrl: string) {
  registry.__kallyModelManagers ??= new Map();
  let manager = registry.__kallyModelManagers.get(baseUrl);
  if (!manager) registry.__kallyModelManagers.set(baseUrl, (manager = new ModelManager(baseUrl)));
  return manager;
}

/**
 * Pede a vez de usar um modelo. Devolve null quando o gerenciador não se aplica (Ollama
 * remoto ou KALLY_MODEL_MANAGER=off). Chame release() quando terminar de ler a resposta.
 */
export async function acquireModel(baseUrl: string, model: string, options: { numCtx?: number; maxMs: number }): Promise<Lease | null> {
  if (process.env.KALLY_MODEL_MANAGER === "off" || !isLocal(baseUrl)) return null;
  return managerFor(baseUrl).acquire(model, options);
}
