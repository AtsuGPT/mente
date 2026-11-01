import "server-only";

/**
 * Pesquisa externa da Kally. Só o servidor consulta; o app recebe títulos, trechos e links.
 *
 *   SEARCH_PROVIDER = "wikipedia" (padrão, gratuito, sem chave) | "brave" (BRAVE_API_KEY)
 *                   | "searxng" (SEARXNG_URL, instância própria)
 *
 * Os resultados nunca viram memória do ambiente: servem só à resposta em que aparecem.
 */

export type WebResult = { title: string; url: string; snippet: string; source: string };
export type WebImage = { title: string; url: string; thumb: string; author: string; license: string; page: string };

const TIMEOUT = 8_000;
const USER_AGENT = "MinhaMente-Kally/1.0 (https://minhamente.space)";
const clean = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#0?39;/g, "'").replace(/\s+/g, " ").trim();

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers }, signal: AbortSignal.timeout(TIMEOUT) });
  if (!response.ok) throw new Error(`pesquisa ${response.status}`);
  return (await response.json()) as T;
}

async function wikipedia(query: string, limit: number): Promise<WebResult[]> {
  const data = await getJson<{ pages: { key: string; title: string; excerpt: string; description?: string }[] }>(
    `https://pt.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=${limit}`,
  );
  return data.pages.map((p) => ({
    title: p.title,
    url: `https://pt.wikipedia.org/wiki/${encodeURIComponent(p.key)}`,
    snippet: clean(`${p.description ? `${p.description}. ` : ""}${p.excerpt}`),
    source: "Wikipédia",
  }));
}

/** Resumo do artigo (primeiros parágrafos), para a Kally ter mais que o trecho da busca. */
async function wikipediaSummary(result: WebResult): Promise<WebResult> {
  try {
    const key = decodeURIComponent(result.url.split("/wiki/")[1] ?? "");
    const data = await getJson<{ extract?: string }>(`https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(key)}`);
    return data.extract ? { ...result, snippet: data.extract.slice(0, 1_200) } : result;
  } catch {
    return result;
  }
}

async function brave(query: string, limit: number): Promise<WebResult[]> {
  const key = process.env.BRAVE_API_KEY;
  if (!key) throw new Error("BRAVE_API_KEY ausente");
  const data = await getJson<{ web?: { results: { title: string; url: string; description: string; profile?: { name?: string } }[] } }>(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}&search_lang=pt`,
    { "X-Subscription-Token": key },
  );
  return (data.web?.results ?? []).map((r) => ({ title: clean(r.title), url: r.url, snippet: clean(r.description), source: r.profile?.name || new URL(r.url).hostname }));
}

async function searxng(query: string, limit: number): Promise<WebResult[]> {
  const base = process.env.SEARXNG_URL?.replace(/\/+$/, "");
  if (!base) throw new Error("SEARXNG_URL ausente");
  const data = await getJson<{ results: { title: string; url: string; content?: string }[] }>(`${base}/search?q=${encodeURIComponent(query)}&format=json&language=pt-BR`);
  return data.results.slice(0, limit).map((r) => ({ title: r.title, url: r.url, snippet: clean(r.content ?? ""), source: new URL(r.url).hostname }));
}

const STOP = new Set(
  "a o as os um uma de da do das dos em no na nos nas por para com sem que qual quais como e é ou mas se sobre isso esse essa este esta me eu você voce ele ela pesquise pesquisa pesquisar aprofunde explique explica fale quero saber relaciona relacionam relação entre mais funciona funcionam".split(" "),
);

/** Pergunta em linguagem natural → palavras-chave (a busca da Wikipédia falha com frases longas). */
export function searchQuery(question: string) {
  const words = question.replace(/[?!.,;:()"“”]/g, " ").split(/\s+/).filter((w) => w.length >= 2 && !STOP.has(w.toLowerCase()));
  return words.slice(0, 6).join(" ");
}

/** Até `limit` resultados com links reais. Falha na pesquisa = lista vazia (a Kally avisa). */
export async function searchWeb(query: string, limit = 4): Promise<WebResult[]> {
  const q = searchQuery(query).slice(0, 200);
  if (!q) return [];
  try {
    const provider = process.env.SEARCH_PROVIDER || "wikipedia";
    if (provider === "brave") return await brave(q, limit);
    if (provider === "searxng") return await searxng(q, limit);
    const found = await wikipedia(q, limit);
    return await Promise.all(found.slice(0, 3).map(wikipediaSummary)).then((top) => [...top, ...found.slice(3)]);
  } catch (cause) {
    console.error("Kally web search failed:", cause instanceof Error ? cause.message : cause);
    return [];
  }
}

/** Imagens livres do Wikimedia Commons, com autor e licença para o crédito. */
export async function searchImages(query: string, limit = 8): Promise<WebImage[]> {
  const q = query.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!q) return [];
  type Page = { title: string; imageinfo?: { url: string; thumburl?: string; descriptionurl: string; mime: string; extmetadata?: Record<string, { value?: string }> }[] };
  try {
    const data = await getJson<{ query?: { pages: Record<string, Page> } }>(
      `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=${limit * 2}` +
        `&gsrsearch=${encodeURIComponent(`${q} filetype:bitmap`)}&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=480&origin=*`,
    );
    return Object.values(data.query?.pages ?? {})
      .map((page) => ({ page, info: page.imageinfo?.[0] }))
      .filter(({ info }) => info && /^image\/(jpeg|png|webp)$/.test(info.mime))
      .slice(0, limit)
      .map(({ page, info }) => ({
        title: page.title.replace(/^File:|^Arquivo:/, "").replace(/\.[a-z]+$/i, ""),
        url: info!.url,
        thumb: info!.thumburl ?? info!.url,
        author: clean(info!.extmetadata?.Artist?.value ?? "Autor desconhecido").slice(0, 120),
        license: clean(info!.extmetadata?.LicenseShortName?.value ?? "ver página").slice(0, 60),
        page: info!.descriptionurl,
      }));
  } catch (cause) {
    console.error("Kally image search failed:", cause instanceof Error ? cause.message : cause);
    return [];
  }
}
