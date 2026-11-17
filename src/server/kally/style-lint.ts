/**
 * Vícios de assistente numa resposta (lista do dono do projeto, 17/11/2026), contados sem modelo. Serve para medir a
 * naturalidade antes e depois (bateria de respostas) e nos testes; não altera a resposta.
 */

export type StyleIssue =
  | "elogio" // "Ótima pergunta!", "Que legal que…"
  | "repete_pergunta" // abre parafraseando o pedido
  | "saudacao" // "Olá!" sem a pessoa ter cumprimentado
  | "conclusao_generica" // "Em resumo…", "Espero ter ajudado"
  | "pergunta_generica_final" // "Ficou claro?", "Quer saber mais?"
  | "titulos_em_resposta_curta"
  | "emoji";

const OPENING_PRAISE = /^\W*(que |essa é uma |esta é uma |)(ó|o)tima pergunta|^\W*(excelente|boa|grande|incr[ií]vel|interessante) (pergunta|quest[aã]o|d[uú]vida)|^\W*(parab[eé]ns|que legal|que incr[ií]vel|que bom que|adorei)/i;
// (?=…) no lugar de \b: o \b do JavaScript não reconhece o fim de "Olá".
const GREETING = /^\W*(ol[aá]|oi|bom dia|boa tarde|boa noite|e a[ií])(?=[\s,!.]|$)/i;
const USER_GREETED = /^\W*(ol[aá]|oi+|bom dia|boa tarde|boa noite|e a[ií]|eai|opa|hey)(?=[\s,!.?]|$)/i;
const RESTATE = /^\W*(voc[eê] (quer|gostaria|perguntou|est[aá] perguntando|deseja) (saber|entender)|entendi,? voc[eê] quer|sua pergunta [eé] sobre|vamos falar sobre|vou (te )?explicar (o que|como))/i;
const GENERIC_END = /\b(em resumo|em suma|resumindo|concluindo|espero ter ajudado|espero que (isso|essa explica[cç][aã]o|tenha) (te )?ajud|qualquer d[uú]vida,? ([eé] s[oó]|estou)|fico [àa] disposi[cç][aã]o)\b/i;
const GENERIC_QUESTION = /(quer (saber|que eu (explique|aprofunde|detalhe)|mais|algo mais)|ficou claro|fez sentido|posso (te )?ajudar (em|com) (mais )?(alguma|algo)|tem (mais )?alguma (outra )?d[uú]vida|gostaria (de saber|que eu)|o que (voc[eê] )?acha)[^?\n]{0,60}\?\s*$/i;
const EMOJI = /\p{Extended_Pictographic}/u;

const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const tokens = (t: string) => new Set(t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]{4,}/g) ?? []);

export function lintStyle(answer: string, message = ""): { issues: StyleIssue[]; words: number } {
  const text = answer.replace(/```[\s\S]*?```/g, " ").trim();
  const issues: StyleIssue[] = [];
  const opening = text.slice(0, 160);
  if (OPENING_PRAISE.test(opening)) issues.push("elogio");
  if (GREETING.test(opening) && !USER_GREETED.test(message)) issues.push("saudacao");
  const first = (text.split(/(?<=[.!?:])\s|\n/)[0] ?? "").slice(0, 200);
  const asked = tokens(message);
  const said = tokens(first);
  const overlap = asked.size >= 3 ? [...said].filter((w) => asked.has(w)).length / asked.size : 0;
  if (RESTATE.test(first) || (overlap >= 0.7 && said.size >= 4 && words(first) > 6 && /\?\s*$|^(sobre|quanto a|em rela[cç][aã]o a)/i.test(first))) issues.push("repete_pergunta");
  const ending = text.slice(-300);
  if (GENERIC_END.test(ending)) issues.push("conclusao_generica");
  if (GENERIC_QUESTION.test(text.slice(-200))) issues.push("pergunta_generica_final");
  if (words(text) < 220 && /^#{1,3}\s/m.test(text)) issues.push("titulos_em_resposta_curta");
  if (EMOJI.test(text) && !EMOJI.test(message)) issues.push("emoji");
  return { issues, words: words(answer) };
}
