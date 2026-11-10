import "server-only";
import { completeChat } from "@/server/ai";
import type { WebResult } from "@/server/web-search";

/**
 * Fontes para o post (Kally remota): o texto continua sendo da pessoa, e os conceitos gerais que ela toca
 * (ex.: "repetição espaçada") ganham base em fontes reais e diversas, citadas com link.
 *
 * 1. O modelo remoto escolhe até 3 conceitos gerais do tema, em português e em inglês, sem nada pessoal.
 *    Só esses termos saem do servidor; o texto da pessoa nunca vai para a pesquisa.
 * 2. Cada termo é pesquisado em várias frentes ao mesmo tempo no SearXNG local (SEARXNG_URL): web em português
 *    e em inglês, notícias nacionais e globais, redes sociais (Reddit, X, Instagram, TikTok, LinkedIn, Mastodon,
 *    Lemmy) e vídeos. Sem SearXNG, ou com poucos resultados, usa a Brave Search (BRAVE_API_KEY), se houver.
 *    Wikipédia fica de fora (pedido do dono do projeto, 10/11/2026).
 * 3. Dos resultados (100 ou mais por post, em dezenas de sites), ficam só os relacionados ao termo, sem repetir
 *    página; para o modelo vão os melhores de cada tipo, no máximo 2 por site.
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

export type PostTerms = { pt: string[]; en: string[] };

const SYSTEM = [
  "Você escolhe termos de pesquisa para dar base a um post. A pessoa contou uma ideia ou vivência; o post vai citar fontes sobre os CONCEITOS GERAIS que ela toca.",
  "Devolva até 3 termos curtos (1 a 4 palavras cada), em português, que sejam nomes de conceitos, fenômenos, áreas ou práticas conhecidas (ex.: \"repetição espaçada\", \"síndrome do impostor\"), e os mesmos termos em inglês, na mesma ordem.",
  "Nunca inclua nada pessoal ou identificável: nomes de pessoas, cidades, empresas, datas, números, parentes, doenças da pessoa, nada do que ela viveu.",
  "Se o texto for só uma vivência íntima em que uma fonte não acrescentaria nada (luto, uma lembrança de família), devolva listas vazias.",
  'Responda só com o JSON: {"termos": ["...", "..."], "termos_en": ["...", "..."]}',
].join("\n");

const PERSONAL = /\d|\b(meu|minha|meus|minhas|eu|ele|ela|my|mine|i|me)\b/i;

/** A mesma regra dentro do interpretador remoto (pipeline.ts), para não gastar uma chamada a mais. */
export const TERMS_RULE =
  "termos = só se a competência for post: até 3 nomes de conceitos gerais que o tema toca (ex.: \"repetição espaçada\"), sem nada pessoal ou identificável (nomes, cidades, datas, números, parentes); lista vazia se for uma vivência íntima em que fonte não acrescenta, ou se não for post. termos_en = os mesmos termos em inglês, na mesma ordem.";

/** Filtra os termos devolvidos pelo modelo: curtos, sem números nem nada em primeira pessoa. */
export function cleanTerms(value: unknown[]): string[] {
  return value
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().replace(/\s+/g, " "))
    .filter((t) => t.length >= 3 && t.length <= 60 && t.split(" ").length <= 4 && !PERSONAL.test(t))
    .slice(0, 3);
}

/** Termos gerais do tema (no máximo 3, em português e inglês). Listas vazias se não houver o que pesquisar. */
export async function postSearchTerms(text: string): Promise<PostTerms> {
  try {
    const raw = await completeChat(
      [{ role: "system", content: SYSTEM }, { role: "user", content: `Texto da pessoa:\n"""${text.slice(0, 2_500)}"""` }],
      { target: "remote", json: true, temperature: 0.1, maxTokens: 160, timeoutMs: 10_000, think: false },
    );
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { termos?: unknown; termos_en?: unknown };
    return { pt: cleanTerms(Array.isArray(parsed.termos) ? parsed.termos : []), en: cleanTerms(Array.isArray(parsed.termos_en) ? parsed.termos_en : []) };
  } catch (cause) {
    console.warn("Kally fontes do post: sem termos:", cause instanceof Error ? cause.message : cause);
    return { pt: [], en: [] };
  }
}

/* --------------------------------- busca --------------------------------- */

export type SourceKind = "referência" | "notícia nacional" | "notícia global" | "rede social" | "vídeo" | "web";
type Hit = WebResult & { kind: SourceKind; domain: string; score: number; date: number | null };

const EXCLUDED = /(^|\.)(wikipedia\.org|wikinews\.org|wikiwand\.com|play\.google\.com|apps\.apple\.com)$/;
const SOCIAL = /(^|\.)(reddit\.com|x\.com|twitter\.com|instagram\.com|facebook\.com|tiktok\.com|linkedin\.com|threads\.net|bsky\.app|medium\.com|substack\.com|quora\.com|tumblr\.com|piefed\.social|kbin\.social)$|^(mastodon|lemmy|mstdn|fosstodon|lemm)\./;
const VIDEO = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com)$/;
const REFERENCE = /(\.edu(\.[a-z]{2})?|\.gov(\.[a-z]{2})?|\.ac\.[a-z]{2})$|scielo|pubmed|ncbi\.nlm|nature\.com|sciencedirect|springer|frontiersin|apa\.org|who\.int|fiocruz|\.usp\.br|unicamp|ufrj|ufmg|ufu\.br|unesp|repositorio|periodicos|researchgate|jstor|britannica|psychologytoday|harvard|mit\.edu|stanford/;
const BR_NEWS = /(globo\.com|uol\.com\.br|folha\.|estadao|cnnbrasil|exame\.com|abril\.com\.br|terra\.com\.br|metropoles|r7\.com|correiobraziliense|gazetadopovo|nexojornal|agenciabrasil|poder360|cartacapital|istoe|infomoney|bbc\.com|band\.com\.br|jc\.ne10|otempo|em\.com\.br|zh\.clicrbs|opovo|diariodepernambuco|revistagalileu|superinteressante|olhardigital|tecmundo|canaltech|napratica)/;

const CLICKBAIT = /\b(a psicologia (afirma|diz|explica|revela)|segundo a psicologia|a ci[eê]ncia (explica|revela|diz)|a maioria (pensa|das pessoas)|isso diz muito|voc[eê] n[aã]o vai acreditar|pessoas que .{3,60} (podem ter|t[eê]m|s[aã]o)|sinais de que|o que significa quando|you won'?t believe|psychology says|people who .{3,60} (tend|usually|often))\b/i;

type Query = { q: string; categories: string; language: string; pageno?: number; kind: SourceKind };

/** As frentes de cada termo: web (pt e en), notícias nacionais e globais, redes sociais e vídeos. */
function plan(pt: string, en: string): Query[] {
  const social = "(site:reddit.com OR site:x.com OR site:instagram.com OR site:tiktok.com OR site:linkedin.com OR site:threads.net)";
  return [
    { q: pt, categories: "general", language: "pt-BR", kind: "web" },
    { q: en, categories: "general", language: "en", kind: "web" },
    { q: pt, categories: "news", language: "pt-BR", kind: "notícia nacional" },
    { q: en, categories: "news", language: "en", kind: "notícia global" },
    { q: en, categories: "social media", language: "all", kind: "rede social" },
    { q: `${pt} ${social}`, categories: "general", language: "pt-BR", kind: "rede social" },
    { q: `${en} ${social}`, categories: "general", language: "en", kind: "rede social" },
    { q: pt, categories: "videos", language: "pt-BR", kind: "vídeo" },
  ];
}

const fold = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const roots = (terms: string[]) => [...new Set(terms.flatMap((t) => fold(t).split(/[^a-z0-9]+/).filter((w) => w.length >= 4).map((w) => w.slice(0, 5))))];
const clean = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#0?39;/g, "'").replace(/\s+/g, " ").trim();
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

function kindOf(domain: string, url: string, planned: SourceKind): SourceKind {
  if (VIDEO.test(domain)) return "vídeo";
  if (SOCIAL.test(domain)) return "rede social";
  if (REFERENCE.test(domain)) return "referência";
  if (planned === "notícia nacional" || planned === "notícia global") return planned;
  if (BR_NEWS.test(domain) || /\/(noticias?|news)\//.test(url)) return domain.endsWith(".br") || BR_NEWS.test(domain) ? "notícia nacional" : "notícia global";
  return "web";
}

type SearxResult = { url: string; title?: string; content?: string; publishedDate?: string | null };

async function searx(base: string, query: Query, signal: AbortSignal): Promise<{ query: Query; results: SearxResult[] }> {
  const params = new URLSearchParams({ q: query.q, categories: query.categories, language: query.language, format: "json", safesearch: "0" });
  if (query.pageno) params.set("pageno", String(query.pageno));
  try {
    const r = await fetch(`${base}/search?${params}`, { headers: { Accept: "application/json" }, signal });
    if (!r.ok) return { query, results: [] };
    return { query, results: ((await r.json()) as { results?: SearxResult[] }).results ?? [] };
  } catch {
    return { query, results: [] };
  }
}

async function brave(term: string, kind: SourceKind, signal: AbortSignal): Promise<{ query: Query; results: SearxResult[] }> {
  const key = process.env.BRAVE_API_KEY;
  const query: Query = { q: term, categories: kind.startsWith("notícia") ? "news" : "general", language: "pt-BR", kind };
  if (!key) return { query, results: [] };
  const path = query.categories === "news" ? "news/search" : "web/search";
  try {
    const r = await fetch(`https://api.search.brave.com/res/v1/${path}?q=${encodeURIComponent(term)}&count=20&search_lang=pt`, { headers: { Accept: "application/json", "X-Subscription-Token": key }, signal });
    if (!r.ok) return { query, results: [] };
    const data = (await r.json()) as { results?: { url: string; title: string; description?: string; age?: string }[]; web?: { results: { url: string; title: string; description?: string }[] } };
    const list = data.web?.results ?? data.results ?? [];
    return { query, results: list.map((x) => ({ url: x.url, title: x.title, content: x.description })) };
  } catch {
    return { query, results: [] };
  }
}

/** Roda as tarefas com no máximo `limit` ao mesmo tempo. */
async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const out: T[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const i = next++;
      out[i] = await tasks[i]();
    }
  }));
  return out;
}

export type SourceHunt = {
  /** páginas diferentes consultadas (já sem as repetidas e sem as fora do assunto) */
  consulted: number;
  /** sites diferentes entre elas */
  sites: number;
  byKind: Partial<Record<SourceKind, number>>;
  /** as que vão para o modelo */
  picked: WebResult[];
  ms: number;
};

const PICK = 14;
const PER_SITE = 2;
const ORDER: SourceKind[] = ["referência", "notícia nacional", "notícia global", "rede social", "vídeo", "web"];

/** Busca diversa para o post: 100 ou mais páginas relacionadas, e a seleção que vai para o modelo. */
export async function findPostSources(terms: PostTerms, options: { timeoutMs?: number } = {}): Promise<SourceHunt> {
  const started = Date.now();
  // 8 s: com 14 s a busca levava ~11 s e trazia 550 a 920 páginas; o que chega até aqui já passa de 100.
  const signal = AbortSignal.timeout(options.timeoutMs ?? 8_000);
  const pairs = terms.pt.map((pt, i) => ({ pt, en: terms.en[i] || pt }));
  const base = (process.env.SEARXNG_URL || "").replace(/\/+$/, "");
  let batches = base ? await pool(pairs.flatMap((p) => plan(p.pt, p.en)).map((q) => () => searx(base, q, signal)), 9) : [];
  // Reserva: Brave, quando não há SearXNG ou ele trouxe pouco.
  if (batches.reduce((n, b) => n + b.results.length, 0) < 60 && process.env.BRAVE_API_KEY) {
    batches = [...batches, ...(await pool(pairs.flatMap((p) => [() => brave(p.pt, "web", signal), () => brave(p.pt, "notícia nacional", signal), () => brave(p.en, "notícia global", signal)]), 3))];
  }
  // Cada termo é um grupo: a página precisa ter TODAS as palavras de pelo menos um termo ("repetição" e "espaçada").
  const groups = [...terms.pt, ...terms.en].map((t) => roots([t])).filter((g) => g.length);
  return { ...rank(batches, groups, PICK, (have) => groups.some((g) => g.every((k) => have.has(k)))), ms: Date.now() - started };
}

/**
 * Junta as frentes, tira repetidas e as fora do assunto, pontua (relevância, credibilidade, data) e escolhe com
 * diversidade. `relevant` é o filtro de assunto: recebe as raízes que a página contém (título + trecho). Antes,
 * uma única palavra parecida bastava, e entravam páginas sem relação com o pedido (pedido do dono, 10/11/2026).
 */
function rank(batches: { query: Query; results: SearxResult[] }[], groups: string[][], pick: number, relevant: (have: Set<string>) => boolean): Omit<SourceHunt, "ms"> {
  const keys = [...new Set(groups.flat())];
  const seen = new Map<string, Hit>();
  for (const { query, results } of batches) {
    for (const r of results) {
      if (!r.url || !/^https?:\/\//.test(r.url)) continue;
      const domain = hostOf(r.url);
      if (!domain || EXCLUDED.test(domain)) continue;
      const url = r.url.replace(/[?#].*$/, (m) => (/[?&](v|id|p)=/.test(m) ? m : ""));
      const title = clean(r.title ?? "").slice(0, 200);
      const snippet = clean(r.content ?? "").slice(0, 420);
      const text = fold(`${title} ${snippet}`);
      const have = new Set(keys.filter((k) => text.includes(k)));
      if (!title || !relevant(have)) continue;
      const score = keys.reduce((n, k) => n + (fold(title).includes(k) ? 2 : 0) + (have.has(k) ? 1 : 0), 0);
      const date = r.publishedDate ? Date.parse(r.publishedDate) || null : null;
      const old = seen.get(url);
      if (old) {
        old.score += 1; // achada por mais de uma frente
        continue;
      }
      seen.set(url, { title, url, snippet, source: "", kind: kindOf(domain, url, query.kind), domain, score, date });
    }
  }
  const hits = [...seen.values()];
  const recent = (h: Hit) => (h.date && Date.now() - h.date < 2 * 365 * 86_400_000 ? 1 : 0);
  // Credibilidade: referências e veículos conhecidos sobem; títulos caça-clique e blogs de loja descem
  // (teste de 10/11: "A psicologia afirma: pessoas que enviam áudios longos…" chegou a ser citado).
  for (const h of hits) {
    if (h.kind === "referência") h.score += 3;
    if (BR_NEWS.test(h.domain) || /(reuters|apnews|nytimes|theguardian|bbc\.co|washingtonpost|economist|npr\.org|scientificamerican|theatlantic|wired|ft\.com|elpais|lemonde|dw\.com)/.test(h.domain)) h.score += 2;
    if (CLICKBAIT.test(h.title)) h.score -= 6;
    if (/(^|\.)blog\.|\/blog\//.test(h.domain + new URL(h.url).pathname) && h.kind === "web") h.score -= 1;
  }
  const byKind: Partial<Record<SourceKind, Hit[]>> = {};
  for (const h of hits) (byKind[h.kind] ??= []).push(h);
  for (const list of Object.values(byKind)) list!.sort((a, b) => b.score + recent(b) - (a.score + recent(a)) || b.snippet.length - a.snippet.length);

  // Seleção: um de cada tipo por vez, no máximo PER_SITE por site, até PICK.
  const picked: Hit[] = [];
  const perSite = new Map<string, number>();
  for (let round = 0; picked.length < pick && round < pick; round++) {
    let added = false;
    for (const kind of ORDER) {
      const next = byKind[kind]?.find((h) => !picked.includes(h) && (perSite.get(h.domain) ?? 0) < PER_SITE && h.snippet.length >= 60);
      if (!next || picked.length >= pick) continue;
      picked.push(next);
      perSite.set(next.domain, (perSite.get(next.domain) ?? 0) + 1);
      added = true;
    }
    if (!added) break;
  }
  return {
    consulted: hits.length,
    sites: new Set(hits.map((h) => h.domain)).size,
    byKind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, v!.length])),
    picked: picked.map((h) => ({ title: h.title, url: h.url, snippet: h.snippet, source: `${h.domain} · ${h.kind}${h.date ? ` · ${new Date(h.date).toISOString().slice(0, 10)}` : ""}` })),
  };
}

/* ------------------------- fontes para responder ------------------------- */

/**
 * Pedido de conhecimento (estudo, análise, aprender, pergunta que o ambiente não responde), na Kally local e na
 * remota: a resposta se apoia em fontes da internet, e sem fonte a Kally não afirma o que não sabe (pedido do dono
 * do projeto, 10/11/2026). Papo casual, relato pessoal e posts (que têm a busca própria) ficam de fora.
 *
 *   KALLY_AUTO_WEB = "0" desliga (volta a pesquisar só quando a pessoa liga a internet no app).
 */
export const autoWebEnabled = () => process.env.KALLY_AUTO_WEB !== "0" && !!(process.env.SEARXNG_URL || process.env.BRAVE_API_KEY);

const STOPWORDS = new Set(
  "a o as os um uma uns umas de da do das dos em no na nos nas por pelo pela para pra com sem que qual quais como e é ou mas se sobre isso esse essa este esta me eu você voce vc ele ela meu minha seu sua quero queria pode poderia explica explique explicar fale fala diga diz mostra mostre rapidinho rápido resumido favor por favor ajuda ajude sabe saber entender".split(" "),
);
/** Palavras-chave da pergunta (os buscadores vão melhor com termos do que com a frase inteira). */
export function questionTerms(question: string) {
  return question
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[?!.,;:()"“”'«»]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w.toLowerCase()))
    .slice(0, 8)
    .join(" ");
}

/** Fontes para responder a uma pergunta: web e notícias em português, até 8 escolhidas com diversidade, em ~4 s. */
export async function findAnswerSources(question: string, options: { timeoutMs?: number } = {}): Promise<SourceHunt> {
  const started = Date.now();
  const q = questionTerms(question).slice(0, 160);
  const base = (process.env.SEARXNG_URL || "").replace(/\/+$/, "");
  if (!q) return { consulted: 0, sites: 0, byKind: {}, picked: [], ms: 0 };
  const signal = AbortSignal.timeout(options.timeoutMs ?? 4_500);
  const queries: Query[] = [
    { q, categories: "general", language: "pt-BR", kind: "web" },
    { q, categories: "news", language: "pt-BR", kind: "notícia nacional" },
    { q, categories: "general", language: "all", kind: "web" },
  ];
  let batches = base ? await Promise.all(queries.map((x) => searx(base, x, signal))) : [];
  if (batches.reduce((n, b) => n + b.results.length, 0) < 10 && process.env.BRAVE_API_KEY) batches = [...batches, await brave(q, "web", signal), await brave(q, "notícia nacional", signal)];
  // Pergunta: a página precisa ter metade ou mais das palavras-chave (no mínimo 2 quando houver 2 ou mais).
  const keys = roots([q]);
  const need = keys.length >= 2 ? Math.max(2, Math.ceil(keys.length * 0.5)) : keys.length;
  return { ...rank(batches, [keys], 8, (have) => keys.filter((k) => have.has(k)).length >= need), ms: Date.now() - started };
}

/**
 * Segundo filtro, com o modelo remoto (quando no ar): lê título e trecho de cada fonte escolhida e tira as que não
 * tratam do pedido. Sem o remoto, ou se ele falhar, ficam as do filtro de palavras.
 */
export async function filterRelevant(request: string, web: WebResult[]): Promise<{ kept: WebResult[]; removed: number }> {
  if (web.length < 2) return { kept: web, removed: 0 };
  try {
    const list = web.map((w, i) => `${i + 1}. ${w.title} — ${w.snippet.slice(0, 220)}`).join("\n");
    const raw = await completeChat(
      [
        { role: "system", content: 'Você filtra fontes de pesquisa. Dado um pedido e uma lista numerada de páginas (título e trecho), devolva os números das páginas que tratam diretamente do assunto do pedido e ajudariam a responder ou a fundamentar o texto. Página de outro assunto, que só repete uma palavra, propaganda, loja ou caça-clique fica de fora. Responda só com o JSON compacto: {"relevantes":[1,3]}' },
        { role: "user", content: `Pedido: """${request.slice(0, 1_500)}"""\n\nPáginas:\n${list}` },
      ],
      { target: "remote", json: true, temperature: 0, maxTokens: 120, timeoutMs: 8_000, think: false },
    );
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { relevantes?: unknown };
    const ids = new Set((Array.isArray(parsed.relevantes) ? parsed.relevantes : []).map(Number));
    const kept = web.filter((_, i) => ids.has(i + 1));
    // Se o filtro tirasse tudo, provavelmente errou: fica a seleção do filtro de palavras.
    return kept.length ? { kept, removed: web.length - kept.length } : { kept: web, removed: 0 };
  } catch {
    return { kept: web, removed: 0 };
  }
}

/**
 * Versão reduzida das fontes para a Kally local (8B na placa de 4 GB). Com as 8 fontes inteiras o prompt do 8B
 * passou de ~1.600 para 2.900 a 3.800 tokens e a escrita caiu de ~15 para 5 a 6,6 tokens/s (log de 10/11): o texto
 * parecia travar. A local recebe as 3 primeiras (as mais bem pontuadas), com trecho de até 260 caracteres.
 *   KALLY_LOCAL_SOURCES = quantas (padrão 3; "0" tira as fontes da local).
 */
export function localSources(web: WebResult[]): WebResult[] {
  const n = Number.isFinite(Number(process.env.KALLY_LOCAL_SOURCES)) && process.env.KALLY_LOCAL_SOURCES !== "" ? Number(process.env.KALLY_LOCAL_SOURCES) : 3;
  return web.slice(0, Math.max(0, n)).map((w) => ({ ...w, snippet: w.snippet.length > 260 ? `${w.snippet.slice(0, 257).replace(/\s+\S*$/, "")}…` : w.snippet }));
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
