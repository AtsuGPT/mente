import "server-only";
import { completeChat } from "@/server/ai";
import { searchWeb, type WebResult } from "@/server/web-search";

/**
 * Fontes para o post (Kally remota): o texto continua sendo da pessoa, mas os conceitos gerais que ela toca
 * (ex.: "repetição espaçada", "curva do esquecimento") ganham base em fontes reais, citadas com link.
 *
 * 1. O modelo remoto escolhe até 3 conceitos gerais do tema, sem nada pessoal (nomes, lugares, datas, números).
 *    Só esses termos saem do servidor; o texto da pessoa nunca vai para a pesquisa.
 * 2. Cada termo é pesquisado (SEARCH_PROVIDER; padrão: Wikipédia em português, com o resumo do artigo).
 *
 *   KALLY_POST_SOURCES = "0" desliga (padrão: ligado nos posts da Kally remota).
 */

export const postSourcesEnabled = () => process.env.KALLY_POST_SOURCES !== "0";

/**
 * Relato de perda, doença ou violência: sem fontes. No teste do post do avô (morte em junho), o 32B transformou
 * o luto em "patrimônio cultural imaterial", com link: a fonte trocava o assunto dela por um verbete.
 */
export const intimateStory = (text: string) =>
  /\b(morreu|morre[ru]am|faleceu|falec\w+|luto|vel[oó]rio|enterro|perdi (meu|minha|o meu|a minha)|c[aâ]ncer|diagn[oó]stic\w*|internad\w*|depress\w*|abuso|aborto|suic\w*|separa[cç][aã]o|div[oó]rcio)\b/i.test(text);

const SYSTEM = [
  "Você escolhe termos de pesquisa para dar base a um post. A pessoa contou uma ideia ou vivência; o post vai citar fontes sobre os CONCEITOS GERAIS que ela toca.",
  "Devolva até 3 termos curtos (1 a 4 palavras cada), em português, que sejam nomes de conceitos, fenômenos, áreas ou práticas conhecidas, do jeito que seriam o título de um verbete de enciclopédia (ex.: \"repetição espaçada\", \"curva do esquecimento\", \"síndrome do impostor\").",
  "Nunca inclua nada pessoal ou identificável: nomes de pessoas, cidades, empresas, datas, números, parentes, doenças da pessoa, nada do que ela viveu.",
  "Se o texto for só uma vivência íntima em que uma fonte não acrescentaria nada (luto, uma lembrança de família), devolva a lista vazia.",
  'Responda só com o JSON: {"termos": ["...", "..."]}',
].join("\n");

const PERSONAL = /\d|\b(meu|minha|meus|minhas|eu|ele|ela)\b/i;

/** A mesma regra dentro do interpretador remoto (pipeline.ts), para não gastar uma chamada a mais. */
export const TERMS_RULE =
  "termos = só se a competência for post: até 3 nomes de conceitos gerais que o tema toca, como títulos de verbete de enciclopédia (ex.: \"repetição espaçada\"), sem nada pessoal ou identificável (nomes, cidades, datas, números, parentes); lista vazia se for uma vivência íntima em que fonte não acrescenta, ou se não for post.";

/** Filtra os termos devolvidos pelo modelo: curtos, sem números nem nada em primeira pessoa. */
export function cleanTerms(value: unknown[]): string[] {
  return value
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().replace(/\s+/g, " "))
    .filter((t) => t.length >= 3 && t.length <= 60 && t.split(" ").length <= 4 && !PERSONAL.test(t))
    .slice(0, 3);
}

/** Termos gerais do tema (no máximo 3). Lista vazia se não houver o que pesquisar ou se o modelo falhar. */
export async function postSearchTerms(text: string): Promise<string[]> {
  try {
    const raw = await completeChat(
      [{ role: "system", content: SYSTEM }, { role: "user", content: `Texto da pessoa:\n"""${text.slice(0, 2_500)}"""` }],
      { target: "remote", json: true, temperature: 0.1, maxTokens: 120, timeoutMs: 10_000, think: false },
    );
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { termos?: unknown };
    return cleanTerms(Array.isArray(parsed.termos) ? parsed.termos : []);
  } catch (cause) {
    console.warn("Kally fontes do post: sem termos:", cause instanceof Error ? cause.message : cause);
    return [];
  }
}

const fold = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** O título do artigo tem alguma palavra do termo (raiz de 5 letras): "compreensão profunda" não traz o verbete de uma atriz. */
const related = (term: string, title: string) => {
  const t = fold(title);
  return fold(term).split(/[^a-z0-9]+/).filter((w) => w.length >= 4).some((w) => t.includes(w.slice(0, 5)));
};

/** Uma fonte por termo (a primeira relacionada, com o resumo do artigo), sem repetir a mesma página. */
export async function findPostSources(terms: string[]): Promise<WebResult[]> {
  const found = await Promise.all(terms.map((term) => searchWeb(term, 2).then((r) => r.filter((x) => related(term, x.title)).slice(0, 1)).catch(() => [] as WebResult[])));
  const seen = new Set<string>();
  return found.flat().filter((r) => r.snippet.length >= 80 && !seen.has(r.url) && (seen.add(r.url), true));
}

/** No fim, a lista de fontes do post fica só com as que o texto citou (o link aparece na resposta). */
export function citedSources(web: WebResult[], answer: string) {
  const decode = (v: string) => {
    try {
      return decodeURI(v);
    } catch {
      return v;
    }
  };
  const text = decode(answer);
  return web.filter((w) => answer.includes(w.url) || text.includes(decode(w.url)));
}
