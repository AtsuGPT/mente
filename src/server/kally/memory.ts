import "server-only";
import { completeChat, embedDocuments, embedProfile, embedQueries } from "@/server/ai";
import { remoteConfig, remoteHealth } from "@/server/ai/remote";
import { db } from "@/lib/db";

/**
 * Memória da Kally: pedaços de informação que a pessoa deu numa conversa SALVA, para as próximas respostas
 * ficarem mais adequadas a ela (preferências, fatos sobre ela, objetivos, contexto de vida e de trabalho).
 *
 * Custo baixo de propósito:
 *   - guardar: um filtro de palavras decide se a mensagem pode ter algo pessoal; só então um modelo (o remoto, se
 *     estiver no ar; senão o local) extrai até 3 itens curtos. Itens parecidos com um já guardado atualizam o antigo.
 *   - consultar: um vetor da mensagem (o mesmo do RAG, na CPU, ~0,1 s) contra os vetores guardados; entram no
 *     prompt só os itens com significado próximo (no máximo 6, ~150 tokens).
 *
 * Privacidade: por pessoa e por ambiente; só ela lista e apaga (painel da Kally). Conversa temporária não gera
 * memória. Senhas, documentos, dados financeiros e de terceiros nunca são guardados.
 *
 *   KALLY_MEMORY = "0" desliga (não guarda nem consulta).
 */

export const memoryEnabled = () => process.env.KALLY_MEMORY !== "0";

export type MemoryKind = "preferencia" | "fato" | "objetivo" | "contexto";
const KINDS: MemoryKind[] = ["preferencia", "fato", "objetivo", "contexto"];
const MAX_PER_USER = 200;
const MAX_TEXT = 220;
/** cosseno a partir do qual um item entra no prompt (qwen3-embedding: sem relação ~0,25, relacionado ~0,6) */
const RECALL_MIN = 0.42;
/** a partir daqui, um item novo é o mesmo de um já guardado (atualiza em vez de duplicar) */
const SAME_MIN = 0.86;

const toBytes = (v: number[]) => Buffer.from(new Float32Array(v).buffer);
const fromBytes = (b: Uint8Array) => new Float32Array(b.buffer, b.byteOffset, Math.floor(b.byteLength / 4));
function cosine(a: ArrayLike<number>, b: ArrayLike<number>) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export async function listMemories(environmentId: string, userId: string) {
  return db.kallyMemory.findMany({
    where: { environmentId, userId },
    select: { id: true, text: true, kind: true, conversationId: true, uses: true, lastUsedAt: true, createdAt: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function deleteMemory(environmentId: string, userId: string, id: string) {
  const { count } = await db.kallyMemory.deleteMany({ where: { id, environmentId, userId } });
  return count > 0;
}

export async function clearMemories(environmentId: string, userId: string) {
  const { count } = await db.kallyMemory.deleteMany({ where: { environmentId, userId } });
  return count;
}

/** Itens da memória com significado próximo da mensagem (para o prompt). Falha no embedder = sem memória. */
export async function recallMemories(environmentId: string, userId: string, query: string, limit = 6): Promise<{ id: string; text: string; kind: string; score: number }[]> {
  if (!memoryEnabled() || !query.trim()) return [];
  try {
    const rows = await db.kallyMemory.findMany({ where: { environmentId, userId, embedModel: embedProfile().model }, select: { id: true, text: true, kind: true, vector: true } });
    if (!rows.length) return [];
    const [q] = await embedQueries([query.slice(0, 1_000)]);
    const hits = rows
      .map((r) => ({ id: r.id, text: r.text, kind: r.kind, score: cosine(q, fromBytes(r.vector)) }))
      .filter((r) => r.score >= RECALL_MIN)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    if (hits.length) {
      void db.kallyMemory.updateMany({ where: { id: { in: hits.map((h) => h.id) } }, data: { uses: { increment: 1 }, lastUsedAt: new Date() } }).catch(() => undefined);
    }
    return hits;
  } catch (cause) {
    console.warn("Kally memória: consulta indisponível:", cause instanceof Error ? cause.message : cause);
    return [];
  }
}

/** Bloco do prompt com o que a Kally sabe da pessoa (só os itens relacionados à mensagem). */
export function memoryBlock(items: { text: string; kind: string }[]) {
  if (!items.length) return "";
  return [
    "O QUE VOCÊ JÁ SABE SOBRE QUEM CONVERSA COM VOCÊ (memória de conversas anteriores, contada pela própria pessoa). Use só quando ajudar esta resposta, com naturalidade, sem dizer \"segundo a memória\" e sem repetir tudo; se a mensagem atual contradisser algo daqui, vale a mensagem atual:",
    ...items.map((m) => `- (${m.kind}) ${m.text}`),
  ].join("\n");
}

/**
 * Filtro barato antes de chamar o modelo: a mensagem parece contar algo da própria pessoa (quem é, o que faz,
 * do que gosta, o que quer) ou pede para lembrar. Papo sem nada disso não custa nenhuma chamada.
 */
const PERSONAL = /\b(lembr[ae](-se)?|guard[ae] (isso|que)|anot[ae] (isso|que)|n[aã]o esque[cç]a|meu nome|me chamo|pode me chamar|eu sou|sou (um|uma|professor|estudante|m[eé]dic|engenheir|advogad|programador|designer|aluno)|trabalho (com|como|na|no|em)|estudo|estou estudando|fa[cç]o faculdade|moro (em|no|na)|tenho \d+ anos|prefiro|gosto (de|mais|muito)|n[aã]o gosto|odeio|adoro|meu objetivo|minha meta|quero (aprender|passar|conseguir|me tornar|virar)|estou (aprendendo|tentando|me preparando)|meu (filho|filha|marido|esposa|trabalho|chefe|curso|projeto|cachorro|gato)|minha (filha|esposa|m[aã]e|empresa|loja|pesquisa|tese|rotina)|sempre (que|uso|fa[cç]o)|nunca (uso|fa[cç]o|gostei)|me responda|responda (sempre|em|de forma)|fale comigo|me explique sempre)\b/i;
export const mightRemember = (message: string) => PERSONAL.test(message);

const SYSTEM = [
  "Você decide o que a Kally deve guardar na memória sobre quem conversa com ela, para personalizar respostas futuras.",
  "Guarde só o que a PRÓPRIA pessoa disse sobre si e que continua valendo depois desta conversa: preferências de resposta e de estilo, profissão, área de estudo, objetivos, projetos em andamento, contexto de vida que ela mesma contou, pedidos explícitos de \"lembre que…\".",
  "Não guarde: o pedido do momento (\"quero um post sobre X\"), perguntas, opiniões sobre o assunto da conversa, fatos sobre o mundo, nada de outras pessoas além do vínculo que ela contou (\"tem uma filha\"), senhas, documentos, números de conta, endereço, telefone, dados de saúde ou religião (a menos que ela peça para lembrar).",
  "Cada item: uma frase curta em TERCEIRA pessoa, com as palavras da própria mensagem (formato: \"Trabalha com …\", \"Prefere …\", \"Quer …\"), no máximo 25 palavras, sem acrescentar nada que ela não disse (nenhum número, tempo ou detalhe novo), e o tipo: preferencia, fato, objetivo ou contexto.",
  'Responda só com o JSON compacto: {"memorias":[{"texto":"...","tipo":"fato"}]} (no máximo 3; lista vazia se não houver nada a guardar).',
].join("\n");

/**
 * Decide e guarda o que a mensagem traz de duradouro sobre a pessoa. Devolve os itens novos ou atualizados
 * (para a Kally avisar "guardei na memória"). Nunca lança: falha = nada guardado.
 */
export async function rememberFrom(input: { environmentId: string; userId: string; message: string; conversationId: string | null; localModel?: string; timeoutMs?: number }): Promise<string[]> {
  if (!memoryEnabled() || !input.conversationId || !mightRemember(input.message)) return [];
  try {
    const remote = remoteConfig().enabled && (await remoteHealth()).state === "disponivel";
    const raw = await completeChat(
      [{ role: "system", content: SYSTEM }, { role: "user", content: `Mensagem da pessoa:\n"""${input.message.slice(0, 3_000)}"""` }],
      remote
        ? { target: "remote", json: true, temperature: 0, maxTokens: 220, timeoutMs: input.timeoutMs ?? 10_000, think: false }
        : { json: true, temperature: 0, maxTokens: 220, timeoutMs: input.timeoutMs ?? 20_000, ...(input.localModel ? { model: input.localModel } : {}) },
    );
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { memorias?: { texto?: unknown; tipo?: unknown }[] };
    const items = (parsed.memorias ?? [])
      .map((m) => ({ text: typeof m?.texto === "string" ? m.texto.trim().replace(/\s+/g, " ").slice(0, MAX_TEXT) : "", kind: KINDS.includes(m?.tipo as MemoryKind) ? (m!.tipo as MemoryKind) : "fato" }))
      .filter((m) => m.text.length >= 8 && grounded(m.text, input.message))
      .slice(0, 3);
    if (!items.length) return [];
    return await saveItems(input.environmentId, input.userId, input.conversationId, items);
  } catch (cause) {
    console.warn("Kally memória: não guardei:", cause instanceof Error ? cause.message : cause);
    return [];
  }
}

const fold = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const STOP = new Set("a o as os um uma de da do das dos em no na nos nas por para pra com sem que e ou se mais muito sua seu suas seus ela ele dela dele".split(" "));
/**
 * O item veio da mensagem: metade ou mais das palavras dele estão nela, e nenhum número que ela não escreveu.
 * Medido em 11/11: o 8B guardou "É professora de matemática há 12 anos" a partir de uma mensagem sem tempo nenhum
 * (o "12 anos" era do exemplo do prompt).
 */
export function grounded(item: string, message: string) {
  const said = ` ${fold(message).replace(/[^a-z0-9]+/g, " ")} `;
  const numbers = item.match(/\d+/g) ?? [];
  if (numbers.some((n) => !said.includes(` ${n} `) && !said.includes(n))) return false;
  const words = fold(item).replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length > 2 && !STOP.has(w));
  if (!words.length) return false;
  const hits = words.filter((w) => said.includes(` ${w}`) || said.includes(w.slice(0, Math.max(4, w.length - 2)))).length;
  return hits / words.length >= 0.5;
}

async function saveItems(environmentId: string, userId: string, conversationId: string | null, items: { text: string; kind: MemoryKind }[]) {
  const model = embedProfile().model;
  const vectors = await embedDocuments(items.map((i) => i.text));
  const existing = await db.kallyMemory.findMany({ where: { environmentId, userId, embedModel: model }, select: { id: true, vector: true } });
  const saved: string[] = [];
  for (const [i, item] of items.entries()) {
    const same = existing.map((e) => ({ id: e.id, score: cosine(vectors[i], fromBytes(e.vector)) })).sort((a, b) => b.score - a.score)[0];
    if (same && same.score >= SAME_MIN) {
      await db.kallyMemory.update({ where: { id: same.id }, data: { text: item.text, kind: item.kind, vector: toBytes(vectors[i]), conversationId } });
    } else {
      await db.kallyMemory.create({ data: { environmentId, userId, text: item.text, kind: item.kind, conversationId, vector: toBytes(vectors[i]), embedModel: model } });
    }
    saved.push(item.text);
  }
  // Limite por pessoa: saem os menos usados e mais antigos.
  const count = await db.kallyMemory.count({ where: { environmentId, userId } });
  if (count > MAX_PER_USER) {
    const old = await db.kallyMemory.findMany({ where: { environmentId, userId }, orderBy: [{ uses: "asc" }, { updatedAt: "asc" }], take: count - MAX_PER_USER, select: { id: true } });
    await db.kallyMemory.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  }
  return saved;
}
