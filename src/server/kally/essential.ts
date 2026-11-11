import "server-only";
import { completeChat, type AiMessage } from "@/server/ai";
import { remoteConfig, remoteHealth } from "@/server/ai/remote";
import { focusQuery, withoutFormat } from "./focus";

/**
 * Primeiro filtro da busca, com o modelo: antes de procurar nos posts, documentos, memória e internet, o modelo lê a
 * mensagem (com a conversa) e escreve só o essencial: o assunto e o que a pessoa quer saber, numa frase que se entende
 * sozinha. Esse essencial é o que vai para os vetores, para a busca na internet e para o filtro das fontes; a resposta
 * continua lendo a mensagem inteira. As conversas variam demais para regras fixas: "e no Brasil?" só tem assunto com
 * a conversa, e um pedido longo mistura contexto, desabafo e instruções de formato com o que interessa.
 *
 * Quem faz: a Kally 32, se já estiver no ar (cerca de 1 s; nunca liga a GPU por isso); senão, o modelo local que vai
 * responder, lendo o MESMO começo do prompt da resposta (regras + histórico). O Ollama daqui atende um pedido por vez
 * e guarda só o último começo lido: com um prompt próprio, esta chamada apagaria o que a resposta reaproveita. Se o
 * modelo falhar, demorar ou fugir do assunto, valem as regras de focus.ts.
 */

export type Essential = { text: string; by: "remota" | "local" | "regras"; ms: number; before: number; after: number };

// Curta de propósito: no 8B, cada token desta instrução e da saída é espera antes da resposta (a primeira versão,
// com o dobro do texto e uma lista de palavras-chave na saída, levava de 5 a 8 s).
const TASK =
  "TAREFA INTERNA, não responda à pessoa: escreva o essencial da próxima mensagem para buscar material — o assunto e o que ela quer saber, numa frase de até 15 palavras que se entenda sozinha. " +
  'Se depende da conversa ("e no Brasil?", "explica melhor"), use o assunto da conversa. Tire cumprimentos, forma de pedir e instruções de formato, tamanho ou público. ' +
  'Mantenha nomes, números e termos técnicos. Não acrescente fatos. Só o JSON: {"busca":"..."}';

const words = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 4);

/** O essencial precisa ter saído da conversa: ao menos uma palavra dele aparece na mensagem ou nas anteriores. */
function grounded(essential: string, source: string) {
  const have = new Set(words(source).map((w) => w.slice(0, 5)));
  return words(essential).some((w) => have.has(w.slice(0, 5)));
}

function parse(raw: string): string | null {
  try {
    const data = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { busca?: unknown };
    // O 8B às vezes deixa "em 3 tópicos" na frase: o corte de formato das regras passa nela também.
    const text = typeof data.busca === "string" ? withoutFormat(data.busca.replace(/\s+/g, " ").trim()) : "";
    return text.length >= 3 && text.length <= 300 ? text : null;
  } catch {
    return null;
  }
}

export async function essentialOf(input: {
  message: string;
  history: { role: string; content: string }[];
  /** começo fixo do prompt da resposta local (chatHead/competenceHead); sem ele, o local não é usado */
  head: AiMessage[] | null;
  /** modelo local que vai responder (o mesmo do começo guardado) */
  localModel: string | null;
}): Promise<Essential> {
  const started = Date.now();
  const previous = [...input.history].reverse().find((m) => m.role === "user")?.content ?? "";
  const rules = focusQuery(input.message, previous);
  const fallback = (): Essential => ({ text: rules.text, by: "regras", ms: Date.now() - started, before: rules.stats.before, after: rules.stats.after });
  const before = rules.stats.before;
  // Mensagem curta e sem conversa antes já é o próprio essencial: o modelo só somaria espera.
  if (!input.history.length && before <= 6) return fallback();
  const source = [input.message, ...input.history.slice(-4).map((m) => m.content)].join(" ");
  const done = (text: string | null, by: "remota" | "local"): Essential | null =>
    text && grounded(text, source) ? { text, by, ms: Date.now() - started, before, after: words(text).length } : null;

  // Kally 32 já ligada: um prompt próprio e curto (o vLLM guarda vários começos; não atrapalha a resposta).
  if (remoteConfig().enabled && (await remoteHealth()).state === "disponivel") {
    try {
      const recent = input.history.slice(-4).map((m) => `${m.role === "assistant" ? "Kally" : "Pessoa"}: ${m.content.slice(-500)}`).join("\n");
      const raw = await completeChat(
        [
          { role: "system", content: TASK },
          { role: "user", content: `${recent ? `Conversa recente:\n${recent}\n\n` : ""}Mensagem da pessoa:\n"""${input.message.slice(0, 2_000)}"""` },
        ],
        { target: "remote", json: true, temperature: 0, maxTokens: 60, timeoutMs: 6_000, think: false },
      );
      const ok = done(parse(raw), "remota");
      if (ok) return ok;
    } catch (cause) {
      console.warn("Kally essencial (remota):", cause instanceof Error ? cause.message : cause);
    }
  }

  // Local: o mesmo começo da resposta, a tarefa e a mensagem. A resposta depois reaproveita o começo (regras + histórico).
  if (input.head && input.localModel) {
    try {
      const raw = await completeChat([...input.head, { role: "system", content: TASK }, { role: "user", content: input.message.slice(0, 2_000) }], {
        model: input.localModel,
        // Mesmo contexto da resposta: com outro num_ctx o Ollama recarregaria o modelo (e perderia o começo guardado).
        sameContext: true,
        json: true,
        temperature: 0,
        maxTokens: 50,
        timeoutMs: 20_000,
      });
      const ok = done(parse(raw), "local");
      if (ok) return ok;
    } catch (cause) {
      console.warn("Kally essencial (local):", cause instanceof Error ? cause.message : cause);
    }
  }
  return fallback();
}
