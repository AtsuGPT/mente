import "server-only";
import { completeChat } from "@/server/ai";
import { remoteConfig } from "@/server/ai/remote";
import { EXAM_QUESTION } from "./pipeline";

/**
 * Gabarito pré-montado para questões de prova (pedido do dono do projeto, 15/11/2026: as respostas têm que ser
 * montadas antes e sempre conferidas).
 *
 * Problema medido (bateria de provas, 34 questões, alunos simulados): quando o aluno mandava a resposta dele
 * ("Resposta final: C. Acertei?"), a Kally confirmava respostas erradas em ~1 de cada 6 casos: lia a resposta do aluno
 * primeiro e justificava em vez de resolver.
 *
 * Solução: assim que uma questão de prova está na conversa, o servidor resolve a questão SOZINHO, com raciocínio
 * ligado e sem ver a resposta do aluno, e a Kally recebe esse gabarito como guia interno: para conferir ("acertei?"),
 * compara com ele; enquanto o aluno pede para não dar a resposta, usa o gabarito para guiar sem revelar.
 * O resultado fica guardado por questão (a mesma questão não é resolvida duas vezes).
 */

export type ExamKey = { answer: string; why: string };

const cache = new Map<string, Promise<ExamKey | null>>();

const HAS_OPTIONS = /(^|\n)\s*\(?[A-E][).]\s+\S[^\n]*\n(?:[^\n]*\n)*?\s*\(?[B-E][).]\s+\S/;
const SOLVABLE = /\b(calcule|determine|encontre|qual (é|o valor|a sa[ií]da)|quanto|resolva|assinale|avalie|analise o c[oó]digo)\b/i;

/** A questão de prova em jogo: a da mensagem, ou a última que a pessoa mandou na conversa (até 6 mensagens atrás). */
export function findExamQuestion(message: string, history: { role: string; content: string }[]): string | null {
  if (HAS_OPTIONS.test(message) || (SOLVABLE.test(message) && message.length > 60 && !/\bacertei\b/i.test(message))) return message;
  if (!EXAM_QUESTION.test(message) && message.length > 400) return null;
  for (const m of [...history].reverse().slice(0, 6)) {
    if (m.role !== "user") continue;
    if (HAS_OPTIONS.test(m.content) || (SOLVABLE.test(m.content) && m.content.length > 60)) return m.content;
  }
  return null;
}

/** A pessoa está conferindo a resposta dela. */
export const asksVerdict = (message: string) => /\b(acertei|errei|est[aá] cert[oa]|t[aá] cert[oa]|confere|minha resposta|resposta final|qual (é|e) a (resposta )?cert[ao])\b/i.test(message);

async function solve(question: string): Promise<ExamKey | null> {
  const options = HAS_OPTIONS.test(question);
  const text = await completeChat(
    [
      {
        role: "system",
        content:
          "Você resolve questões de prova com rigor. Leia o comando com atenção (em \"assinale a INCORRETA\", \"EXCETO\" ou \"NÃO\", a resposta é a afirmação falsa). Refaça as contas. Avalie cada alternativa e cada afirmação (I, II, III...) separadamente antes de decidir. Responda só no formato pedido.",
      },
      {
        role: "user",
        content: `${question.slice(0, 6_000)}\n\nResponda exatamente assim, em duas linhas:\nRESPOSTA: ${options ? "<a letra da alternativa correta>" : "<o valor ou a expressão final>"}\nPOR QUÊ: <a justificativa em até 3 frases, citando o que decide a questão>`,
      },
    ],
    { target: remoteConfig().enabled ? "remote" : "local", think: true, temperature: 0, maxTokens: 6_000, timeoutMs: 90_000 },
  ).catch(() => null);
  if (!text) return null;
  const answer = text.match(/RESPOSTA:\s*\**\s*([^\n*]+)/i)?.[1]?.trim();
  if (!answer) return null;
  const letter = options ? answer.match(/\b([A-E])\b/)?.[1] : null;
  if (options && !letter) return null;
  return { answer: letter ?? answer.slice(0, 120), why: (text.match(/POR QU[ÊE]:\s*([\s\S]+)/i)?.[1] ?? "").trim().slice(0, 600) };
}

export function examKey(question: string): Promise<ExamKey | null> {
  const id = question.replace(/\s+/g, " ").trim().slice(0, 2_000);
  let hit = cache.get(id);
  if (!hit) {
    hit = solve(question);
    cache.set(id, hit);
    if (cache.size > 300) cache.delete(cache.keys().next().value as string);
    hit.then((r) => {
      if (!r) cache.delete(id);
    });
  }
  return hit;
}

/** Guia interno para a Kally (vai no prompt como instrução, nunca como fala da pessoa). */
export function examGuide(key: ExamKey, verdict: boolean) {
  return verdict
    ? `GABARITO CONFERIDO (resolvido antes, de forma independente e com raciocínio, sem ver a resposta da pessoa): ${key.answer}. Motivo: ${key.why}\nA pessoa está conferindo a resposta dela. Comece dizendo com clareza se ela acertou ou errou, comparando com este gabarito, e qual é a resposta correta; depois explique o porquê e o erro de cada alternativa errada em uma linha. Não confirme outra resposta só porque a pessoa parece segura; se você achar que o gabarito está errado, refaça o raciocínio passo a passo antes de afirmar qualquer coisa.`
    : `GABARITO INTERNO (resolvido antes, de forma independente): ${key.answer}. Motivo: ${key.why}\nUse para guiar a pessoa com segurança. Se ela pediu para não receber a resposta pronta, NÃO revele a alternativa nem o resultado final: explique a ideia que destrava a questão e faça uma pergunta que a leve ao próximo passo.`;
}
