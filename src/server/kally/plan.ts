import type { Understanding } from "./understand";
import type { Interpretation } from "./pipeline";
import type { CompetenceId } from "./competences/types";

/**
 * Plano de resposta (Kally Response Intelligence, 17/11/2026): decide, antes de escrever, quanto esforço o pedido
 * pede e como isso vira instrução para o modelo — sem confundir esforço com tamanho.
 *
 *   rapido     papo, relato, pergunta trivial: poucas frases naturais, sem raciocínio extra, teto baixo de tokens.
 *   normal     dúvida comum, explicação conceitual: o necessário para entender e usar, com exemplo quando ajuda.
 *   profundo   código, matemática, prova, análise, documento grande, explicação aprofundada: planejar e conferir.
 *   (especializado = artefatos e arquivos, que seguem o caminho próprio de src/server/artifacts.)
 *
 * Antes, o estilo do modelo remoto pedia tamanho fixo por competência (estudo de 900 a 1.500 palavras, conversa de
 * 250 a 700) e mandava "desenvolver com profundidade, nuances e exceções" em qualquer pedido: as respostas saíam
 * longas por obrigação. O esforço escolhido pela pessoa (Normal/Aprofundado/Máximo no app) continua valendo por cima.
 */

export type Effort = "rapido" | "normal" | "profundo";

export type ResponsePlan = {
  effort: Effort;
  /** raciocínio escondido do modelo (código, contas, provas) */
  think: boolean;
  /** como decidir a extensão (sem metas de palavras) */
  sizeGuide: string;
  /** teto de tokens da resposta (o modelo para antes quando termina) */
  maxTokens: number;
  reason: string;
};

const DEEP_KINDS = new Set(["programacao", "depuracao", "conta", "prova", "analise"]);

export function planResponse(input: {
  understanding: Understanding;
  competence: CompetenceId | null;
  interpretation: Interpretation | null;
  brief: boolean;
  materialChars: number;
  /** o modelo já pediria raciocínio pelas regras antigas (remoteThinks) */
  thinksByRule: boolean;
  post: boolean;
}): ResponsePlan {
  const u = input.understanding;
  const kind = u.kind;
  let effort: Effort;
  let reason: string;
  if (input.brief) [effort, reason] = ["rapido", "pedido de resposta curta"];
  else if (u.casual) [effort, reason] = ["rapido", kind === "relato" ? "relato pessoal" : "papo"];
  else if (DEEP_KINDS.has(kind)) [effort, reason] = ["profundo", `tipo de pedido: ${kind}`];
  else if (input.materialChars > 6_000) [effort, reason] = ["profundo", "documento ou anexo grande"];
  else if (input.interpretation?.esforco) [effort, reason] = [input.interpretation.esforco, "esforço estimado pelo interpretador"];
  else if (input.interpretation?.profundidade === "aprofundada") [effort, reason] = ["profundo", "explicação aprofundada pedida"];
  else [effort, reason] = ["normal", `tipo de pedido: ${kind}`];

  const think = input.thinksByRule || (effort === "profundo" && (kind === "programacao" || kind === "depuracao" || kind === "conta" || kind === "prova"));
  return { effort, think, sizeGuide: sizeGuide(effort, kind, input.post), maxTokens: effort === "rapido" ? 700 : effort === "normal" ? 3_000 : 6_000, reason };
}

/** Instrução de extensão: proporcional à necessidade, nunca um número de palavras a atingir. */
export function sizeGuide(effort: Effort, kind: string, post = false): string {
  if (post) return "o que a matéria dela sustentar, sem inventar para alongar";
  if (effort === "rapido") {
    return kind === "relato"
      ? "uma reação natural ao que ela contou, em 1 a 3 frases, como numa conversa entre pessoas; sem títulos, listas, conselhos não pedidos ou pergunta obrigatória no fim"
      : "poucas frases diretas e naturais, sem títulos nem listas";
  }
  if (effort === "normal") {
    return "o necessário para a pessoa entender e conseguir usar a resposta: comece pela resposta, explique o fundamento e dê um exemplo concreto quando ajudar; sem títulos se couber em poucos parágrafos. Pare quando a dúvida estiver respondida";
  }
  return kind === "esclarecimento"
    ? "só a parte que ela não entendeu, explicada de outro jeito e com cuidado, sem repetir a explicação inteira"
    : "até a pessoa conseguir aplicar sozinha: a resposta, o fundamento, um exemplo concreto trabalhado e o erro mais comum; títulos e listas só se a resposta ficar longa. Uma tarefa complexa pode terminar com uma conclusão curta: não estique para parecer completa";
}
