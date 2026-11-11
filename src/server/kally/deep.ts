import "server-only";
import { completeChat, embedDocuments, embedQueries, type AiMessage } from "@/server/ai";

/* ------------------------------ fora do assunto ------------------------------ */

const fold = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const STOP = new Set(
  "como funciona funcionam porque quando quanto quais qual onde quem sobre sobre isso essa esse este esta para pela pelo pelos pelas entre mais menos muito muita muitos muitas fazer faz feito pode poderia queria quero gostaria explica explique explicar entender saber dizer coisa coisas forma jeito ainda tambem sempre nunca depois antes agora hoje voce voces minha minhas meus meu seus suas nossa nosso".split(" "),
);
/** Raízes (5 letras) das palavras de conteúdo do pedido: "inflação" → "infla", "salário" → "salar". */
export function topicRoots(request: string) {
  return [...new Set(fold(request).split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.slice(0, 5)))];
}

/**
 * A parte trata do pedido? Duas checagens que não dependem do modelo: palavras do pedido presentes na parte e
 * significado próximo (o mesmo embedder do RAG, na CPU). Basta uma passar com folga, ou as duas passarem juntas.
 * Medido em 11/11: a parte sobre "elasticidade-preço" numa pergunta sobre inflação não tinha nenhuma palavra do
 * pedido. Sem embedder, vale só a checagem de palavras.
 */
export async function onTopic(request: string, text: string): Promise<{ ok: boolean; hits: number; score: number | null }> {
  const roots = topicRoots(request);
  const body = fold(text);
  const hits = roots.filter((r) => body.includes(r)).length;
  let score: number | null = null;
  try {
    const [[q], [d]] = await Promise.all([embedQueries([request.slice(0, 1_000)]), embedDocuments([text.slice(0, 2_000)])]);
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < Math.min(q.length, d.length); i++) {
      dot += q[i] * d[i];
      na += q[i] * q[i];
      nb += d[i] * d[i];
    }
    score = na && nb ? dot / Math.sqrt(na * nb) : null;
  } catch {
    score = null;
  }
  const words = roots.length === 0 || hits >= Math.min(2, roots.length);
  const meaning = score === null ? words : score >= 0.5;
  const ok = (words && (score === null || score >= 0.35)) || (meaning && hits >= 1);
  return { ok, hits, score };
}

/**
 * Resposta em partes (níveis de esforço). Em vez de uma resposta só, a Kally:
 *   1. planeja a resposta (uma chamada curta, em JSON): uma frase do que ela vai entregar e as partes, em ordem;
 *   2. escreve cada parte numa chamada própria, com o plano e o que já foi escrito no prompt, para continuar
 *      de onde parou sem repetir e com espaço para tabela, diagrama e exemplos em cada parte;
 *   3. a última parte fecha com próximos passos.
 * Cada parte aparece enquanto é escrita. Leva de 3 a 7 vezes o tempo de uma resposta normal: o app avisa antes.
 *
 *   normal      uma resposta (o de sempre)
 *   aprofundado 3 a 4 partes
 *   maximo      5 a 6 partes, com o raciocínio do 32B ligado em cada parte (só na remota)
 */
export type Effort = "normal" | "aprofundado" | "maximo";
export const effortFrom = (value: unknown): Effort => (value === "aprofundado" || value === "maximo" ? value : "normal");

export const EFFORTS: Record<Exclude<Effort, "normal">, { parts: string; min: number; max: number; tokens: number; think: boolean }> = {
  aprofundado: { parts: "3 ou 4", min: 3, max: 4, tokens: 1_100, think: false },
  maximo: { parts: "5 ou 6", min: 5, max: 6, tokens: 1_400, think: true },
};

export type Plan = { abertura: string; partes: { titulo: string; objetivo: string }[] };

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "");

/** Plano da resposta. null se o modelo falhar ou fugir do formato (aí a resposta sai normal). */
export async function planAnswer(base: AiMessage[], effort: Exclude<Effort, "normal">, target: { remote: boolean; model?: string; signal?: AbortSignal }): Promise<Plan | null> {
  const cfg = EFFORTS[effort];
  const rule = [
    `PLANEJAMENTO (não escreva a resposta agora). A resposta a este pedido vai ser escrita em ${cfg.parts} partes encadeadas, cada uma numa etapa própria.`,
    "Planeje as partes em ordem lógica (do essencial ao aprofundamento), sem sobreposição entre elas; cada parte entrega algo novo e diz que recurso usa quando couber (tabela, diagrama, exemplo prático, lista de passos). A última parte fecha com aplicação e próximos passos.",
    "abertura = uma ou duas frases que respondem diretamente ao pedido (vão no começo da resposta). titulo = subtítulo curto que diz a ideia da parte. objetivo = o que a parte entrega, em uma frase.",
    'Responda só com o JSON compacto: {"abertura":"...","partes":[{"titulo":"...","objetivo":"..."}]}',
  ].join("\n");
  try {
    const raw = await completeChat([...base, { role: "system", content: rule }], {
      json: true,
      temperature: 0.2,
      maxTokens: 600,
      timeoutMs: target.remote ? 40_000 : 120_000,
      ...(target.remote ? { target: "remote" as const, think: false } : target.model ? { model: target.model } : {}),
      ...(target.signal ? { signal: target.signal } : {}),
    });
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { abertura?: unknown; partes?: { titulo?: unknown; objetivo?: unknown }[] };
    const partes = (parsed.partes ?? []).map((p) => ({ titulo: clip(p?.titulo, 90), objetivo: clip(p?.objetivo, 240) })).filter((p) => p.titulo).slice(0, cfg.max);
    if (partes.length < Math.min(2, cfg.min)) return null;
    return { abertura: clip(parsed.abertura, 400), partes };
  } catch (cause) {
    console.warn("Kally em partes: sem plano:", cause instanceof Error ? cause.message : cause);
    return null;
  }
}

/** O fim do que já foi escrito (o prompt não cresce sem limite): ~6.000 caracteres, começando numa linha inteira. */
function tail(text: string, max = 6_000) {
  if (text.length <= max) return text;
  const cut = text.slice(-max);
  const nl = cut.indexOf("\n");
  return `[…]\n${nl >= 0 ? cut.slice(nl + 1) : cut}`;
}

/** Prompt de uma parte: o mesmo da Kally (material, regras, memória) + plano + o que já foi escrito + a tarefa. */
export function partPrompt(base: AiMessage[], plan: Plan, index: number, written: string, request: string, retry = false): AiMessage[] {
  const part = plan.partes[index];
  const last = index === plan.partes.length - 1;
  const outline = plan.partes.map((p, i) => `${i + 1}. ${p.titulo}: ${p.objetivo}`).join("\n");
  const task = [
    `RESPOSTA EM PARTES: parte ${index + 1} de ${plan.partes.length}. Pedido da pessoa: """${request.slice(0, 1_500)}"""`,
    "Tudo nesta parte trata do assunto DESTE pedido; não traga outro tema, nem o de exemplos que apareceram antes no prompt.",
    `Plano completo:\n${outline}`,
    written ? `Já escrito (continue daqui, coerente com isso, sem repetir nem resumir):\n"""${tail(written)}"""` : "",
    index === 0
      ? `AGORA: comece pela abertura, em uma ou duas frases naturais que respondam direto ao pedido (${plan.abertura || "o essencial do que a pessoa pediu"}), e depois escreva a parte 1 com o subtítulo "## ${part.titulo}".`
      : `AGORA: escreva só a parte ${index + 1}, começando com o subtítulo "## ${part.titulo}".`,
    `O que esta parte entrega: ${part.objetivo}`,
    "Desenvolva de verdade (explicação, exemplo concreto, nuance), com tabela, diagrama ```mermaid, lista ou exemplo quando a parte pedir. Não anuncie as próximas partes, não diga \"nesta parte\" e não volte ao que já foi escrito.",
    "Formato: subtítulos com ## (um por parte; ### dentro dela, se precisar), listas e tabelas Markdown com linha de cabeçalho. Fórmulas em texto com símbolos (ŷ = β₀ + β₁·x, x², √x, Σ), nunca LaTeX ($, \\frac, \\cdot) nem blocos ```math; nada de HTML.",
    last ? "É a última parte: feche com aplicação prática e 2 ou 3 próximos passos concretos, sem resumir tudo de novo." : "Não escreva conclusão: a resposta continua na próxima parte.",
    retry ? `ATENÇÃO: a versão anterior desta parte saiu do assunto e foi descartada. Escreva de novo tratando só do pedido da pessoa ("${request.slice(0, 300)}"), usando os termos dele.` : "",
  ].filter(Boolean);
  return [...base, { role: "system", content: task.join("\n") }];
}
