import type { CompetenceId } from "@/server/kally/competences";
import type { Interpretation } from "@/server/kally/pipeline";

/**
 * Roteador de modelos da Kally: o local (o executor do pipeline, rápido) responde o dia a dia;
 * o remoto (vLLM na GPU alugada) fica com o que pede mais capacidade. A decisão usa só o que a
 * rota já calculou (regras, interpretação, competência, tamanho do material): nenhum modelo extra
 * roda para decidir.
 *
 * Fonte das regras: as avaliações da Kally (eval/simulacao) mostraram o modelo local falhando em
 * raciocínio de código, artigos de lei, contas com dado faltando, leitura fina de enunciados e
 * fidelidade de rascunhos longos; e acertando perguntas factuais com a base (4,4 de 5 na prova).
 */

export type ModelChoice = "auto" | "local" | "remote";
export type RouteDecision = { target: "local" | "remote"; reason: string };

export type RouteSignals = {
  mode: "chat" | "ideia" | "revisar" | "aprender";
  competence: CompetenceId | null;
  casual: boolean;
  interpretation: Interpretation | null;
  message: string;
  /** caracteres do anexo, do texto para revisar e dos trechos de documentos */
  materialChars: number;
  /** posts e documentos que entram no prompt */
  sources: number;
  /** o rascunho de post sai nesta resposta */
  canDraft: boolean;
  /** post com pouca matéria da pessoa (a Kally pergunta em vez de escrever) */
  thinMaterial: boolean;
  /** pedido de resposta curta ("rapidinho", "resumido") */
  brief: boolean;
};

/** Sinais de raciocínio que o modelo pequeno erra (medido nas rodadas da simulação). */
const HARD = [
  /```|\btraceback\b|\berro\b.*\b(c[oó]digo|python|javascript|programa)|\bbug\b|\bfun[cç][aã]o\b.*\b(retorna|devolve)\b/i, // código
  /\b(art\.?|artigo)s?\s*\d|\b(lei|clt|lgpd|s[uú]mula|jurisprud[eê]ncia|constitui[cç][aã]o)\b/i, // direito
  /\b(roteiro|plano|cronograma|estrutura)\b.*\b(palestra|artigo|tcc|disserta[cç][aã]o|curso|semestre|minutos|p[aá]ginas)\b/i, // planejamento com restrições
  /\b(compar[ae]|vantagens e desvantagens|pr[oó]s e contras|trade-?off)\b.*\b(e|com|versus|x)\b/i, // comparação elaborada
];

/** Um trecho citado de pelo menos ~40 caracteres: o texto a revisar veio na mensagem. */
const QUOTED = /["“'«][^"”'»]{40,}["”'»]/;

export function routeModel(s: RouteSignals, choice: ModelChoice = "auto"): RouteDecision {
  if (choice === "local") return { target: "local", reason: "escolha explícita: local" };
  if (choice === "remote") return { target: "remote", reason: "escolha explícita: remoto" };
  if (s.casual) return { target: "local", reason: "papo casual" };
  if (s.brief) return { target: "local", reason: "pedido de resposta curta" };
  const deep = s.interpretation?.profundidade === "aprofundada";
  if (s.competence === "post") {
    if (s.thinMaterial || !s.canDraft) return { target: "local", reason: "post sem matéria suficiente (a Kally pergunta)" };
    return deep || s.message.length > 600 || s.materialChars > 2_000 ? { target: "remote", reason: "post elaborado" } : { target: "local", reason: "post curto" };
  }
  // Revisão: do texto anexado/escolhido ou do trecho citado na própria mensagem ("revise este enunciado: '…'").
  if (s.mode === "revisar" && (s.materialChars > 0 || QUOTED.test(s.message))) return { target: "remote", reason: "revisão crítica de um texto" };
  if (s.competence === "analise") return { target: "remote", reason: "análise crítica" };
  if (s.materialChars > 6_000) return { target: "remote", reason: "documento ou anexo grande" };
  if (s.competence === "estudo" && (deep || s.message.length > 300)) return { target: "remote", reason: "estudo aprofundado" };
  if (HARD.some((re) => re.test(s.message))) return { target: "remote", reason: "raciocínio que o modelo local costuma errar" };
  if (s.sources >= 4 && (deep || s.mode === "aprender")) return { target: "remote", reason: "síntese de várias fontes" };
  return { target: "local", reason: "conversa ou pergunta comum" };
}

/**
 * Quem pode escolher o modelo: o administrador da plataforma e quem é dono do ambiente (o remoto
 * custa dinheiro). Os outros sempre ficam no automático.
 */
export function modelChoiceFrom(value: unknown, can: boolean): ModelChoice {
  if (!can) return "auto";
  return value === "local" || value === "remote" ? value : "auto";
}
