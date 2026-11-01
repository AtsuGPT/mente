import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { WebSource } from "@/lib/kally/types";
import { ollamaJson } from "@/server/ai/ollama";
import { normalizeText, queryTerms, selectRelevantChunks, splitIntoChunks } from "./chunks";

/**
 * Pesquisa na internet geral para a Kally.
 *
 * Buscadores gerais (em ordem de preferência, conforme configuração):
 *   1. SearXNG próprio (SEARXNG_URL) — metabuscador, sem chave;
 *   2. Brave Search API (BRAVE_SEARCH_API_KEY);
 *   3. DuckDuckGo HTML — sem chave, melhor esforço (pode ser limitado).
 * Fontes complementares, sem chave: OpenAlex (artigos científicos),
 * Open Library (livros) e Wikipédia (apenas complementar, nunca a única).
 *
 * Os resultados servem apenas à tarefa atual: nada é salvo no banco.
 */

const USER_AGENT = "MinhaMente-Kally/1.0 (+assistente de pesquisa; respeita robots e limites)";
const SEARCH_TIMEOUT_MS = 9_000;
const PAGE_TIMEOUT_MS = 9_000;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const MAX_SOURCES = 8;
const PAGES_TO_READ = 5;

type RawResult = {
  title: string;
  url: string;
  snippet: string;
  provider: string;
  kind?: WebSource["kind"];
  published?: string;
  authors?: string;
  /** Conteúdo já obtido pela API (resumo acadêmico, extrato da Wikipédia). */
  content?: string;
  readable?: boolean;
};

/* ------------------------------------------------------------------ */
/* Segurança: só lê páginas públicas (bloqueia rede local e loopback). */
/* ------------------------------------------------------------------ */

export function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^::ffff:/, "");
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || b === 0))
      || (a === 198 && (b === 18 || b === 19));
  }
  if (isIP(ip) === 6) {
    return ip === "::" || ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb");
  }
  return true;
}

async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("protocolo não permitido");
  if (url.username || url.password) throw new Error("credenciais na URL");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("host local");
  }
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) throw new Error("endereço privado");
  return url;
}

async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      break;
    }
    parts.push(value);
  }
  const output = new Uint8Array(Math.min(size, maxBytes));
  let offset = 0;
  for (const part of parts) {
    output.set(part.subarray(0, output.length - offset), offset);
    offset += part.byteLength;
    if (offset >= output.length) break;
  }
  return output;
}

/** Busca uma página pública seguindo no máximo 3 redirecionamentos, revalidando cada destino. */
async function fetchPublicPage(raw: string): Promise<{ url: string; contentType: string; bytes: Uint8Array } | null> {
  let current = raw;
  for (let hop = 0; hop < 4; hop += 1) {
    const url = await assertPublicUrl(current);
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,text/plain;q=0.8" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      current = new URL(location, url).toString();
      continue;
    }
    if (!response.ok) return null;
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    const isPdf = contentType.includes("pdf");
    if (!isPdf && !contentType.includes("html") && !contentType.includes("text/plain")) return null;
    return { url: url.toString(), contentType, bytes: await readLimited(response, isPdf ? MAX_PDF_BYTES : MAX_PAGE_BYTES) };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Extração de texto legível de HTML.                                  */
/* ------------------------------------------------------------------ */

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…",
  laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", ordm: "º", ordf: "ª", deg: "°",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", agrave: "à", acirc: "â", ecirc: "ê", ocirc: "ô",
  atilde: "ã", otilde: "õ", ccedil: "ç", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Agrave: "À",
  Acirc: "Â", Ecirc: "Ê", Ocirc: "Ô", Atilde: "Ã", Otilde: "Õ", Ccedil: "Ç", uuml: "ü",
};

export function decodeEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity] ?? match;
  });
}

function stripTags(value: string) {
  return decodeEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function htmlToText(html: string): { title: string; text: string; published?: string } {
  const title = stripTags(
    html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    ?? "",
  );
  const published = html.match(/<meta[^>]+(?:property|name)=["'](?:article:published_time|date|dc\.date|citation_publication_date)["'][^>]*content=["']([^"']+)["']/i)?.[1];
  let body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|form|select|button)[\s\S]*?<\/\1>/gi, " ");
  const main = body.match(/<article[\s\S]*<\/article>/i)?.[0] ?? body.match(/<main[\s\S]*<\/main>/i)?.[0];
  body = (main ?? body.match(/<body[\s\S]*<\/body>/i)?.[0] ?? body)
    .replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/?(p|div|section|article|li|ul|ol|h[1-6]|tr|table|blockquote|pre|figure|figcaption|dd|dt)[^>]*>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n");
  const text = decodeEntities(body.replace(/<[^>]+>/g, " "))
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    // Descarta itens de menu e rótulos soltos: blocos curtos sem pontuação.
    .filter((block) => block.length >= 60 || (block.length >= 25 && /[.!?:;]/.test(block)))
    .join("\n\n");
  return { title, text, ...(published ? { published: published.slice(0, 10) } : {}) };
}

/* ------------------------------------------------------------------ */
/* Provedores de busca.                                                */
/* ------------------------------------------------------------------ */

async function getJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

async function searchSearxng(query: string, news: boolean): Promise<RawResult[]> {
  const base = process.env.SEARXNG_URL?.replace(/\/+$/, "");
  if (!base) return [];
  const params = new URLSearchParams({ q: query, format: "json", language: "pt-BR", safesearch: "1" });
  if (news) params.set("categories", "news,general");
  const data = await getJson<{ results?: { title?: string; url?: string; content?: string; publishedDate?: string; category?: string }[] }>(`${base}/search?${params}`);
  return (data.results ?? []).slice(0, 10).flatMap((result) => result.url && result.title
    ? [{ title: result.title, url: result.url, snippet: result.content ?? "", provider: "SearXNG", published: result.publishedDate?.slice(0, 10), kind: result.category === "news" ? "noticia" as const : undefined }]
    : []);
}

async function searchBrave(query: string): Promise<RawResult[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return [];
  const params = new URLSearchParams({ q: query, count: "10", search_lang: "pt-br", safesearch: "moderate" });
  const data = await getJson<{ web?: { results?: { title?: string; url?: string; description?: string; age?: string; page_age?: string }[] } }>(
    `https://api.search.brave.com/res/v1/web/search?${params}`,
    { headers: { "X-Subscription-Token": key } },
  );
  return (data.web?.results ?? []).flatMap((result) => result.url && result.title
    ? [{ title: stripTags(result.title), url: result.url, snippet: stripTags(result.description ?? ""), provider: "Brave Search", published: result.page_age?.slice(0, 10) }]
    : []);
}

export function parseDuckDuckGoHtml(html: string): RawResult[] {
  const results: RawResult[] = [];
  const blocks = html.split(/<div[^>]+class="[^"]*\bresult\b[^"]*"/i).slice(1);
  for (const block of blocks) {
    if (/result--ad|badge--ad/i.test(block.slice(0, 400))) continue;
    const anchor = block.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!anchor) continue;
    let href = decodeEntities(anchor[1]);
    if (href.startsWith("//")) href = `https:${href}`;
    try {
      const parsed = new URL(href, "https://duckduckgo.com");
      const target = parsed.searchParams.get("uddg");
      href = target ?? parsed.toString();
    } catch {
      continue;
    }
    if (/duckduckgo\.com\/y\.js/.test(href) || !/^https?:/i.test(href)) continue;
    const snippet = block.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|td)>/i)?.[1] ?? "";
    results.push({ title: stripTags(anchor[2]), url: href, snippet: stripTags(snippet), provider: "DuckDuckGo" });
  }
  return results;
}

async function searchDuckDuckGo(query: string): Promise<RawResult[]> {
  const response = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MinhaMente-Kally/1.0)", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ q: query, kl: "br-pt" }).toString(),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseDuckDuckGoHtml(await response.text()).slice(0, 10);
}

export function openAlexAbstract(index: Record<string, number[]> | null | undefined): string {
  if (!index) return "";
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) for (const position of positions) words[position] = word;
  return words.filter(Boolean).join(" ");
}

async function searchOpenAlex(query: string): Promise<RawResult[]> {
  const params = new URLSearchParams({
    search: query,
    "per-page": "5",
    select: "id,display_name,doi,publication_year,authorships,primary_location,abstract_inverted_index,open_access,cited_by_count",
  });
  if (process.env.OPENALEX_MAILTO) params.set("mailto", process.env.OPENALEX_MAILTO);
  type Work = {
    id: string;
    display_name?: string;
    doi?: string | null;
    publication_year?: number;
    authorships?: { author?: { display_name?: string } }[];
    primary_location?: { landing_page_url?: string | null; source?: { display_name?: string } | null } | null;
    abstract_inverted_index?: Record<string, number[]> | null;
    open_access?: { oa_url?: string | null } | null;
  };
  const data = await getJson<{ results?: Work[] }>(`https://api.openalex.org/works?${params}`);
  return (data.results ?? []).flatMap((work) => {
    const url = work.doi || work.primary_location?.landing_page_url || work.open_access?.oa_url || work.id;
    if (!work.display_name || !url) return [];
    const abstract = openAlexAbstract(work.abstract_inverted_index);
    const authors = (work.authorships ?? []).map((item) => item.author?.display_name).filter(Boolean).slice(0, 4).join(", ");
    const venue = work.primary_location?.source?.display_name;
    return [{
      title: work.display_name,
      url,
      snippet: abstract.slice(0, 400),
      provider: `OpenAlex${venue ? ` · ${venue}` : ""}`,
      kind: "academico" as const,
      published: work.publication_year ? String(work.publication_year) : undefined,
      authors: authors || undefined,
      content: abstract ? `Resumo (abstract) do artigo: ${abstract}` : undefined,
      readable: false,
    }];
  });
}

async function searchOpenLibrary(query: string): Promise<RawResult[]> {
  const params = new URLSearchParams({ q: query, limit: "3", fields: "key,title,author_name,first_publish_year,subject" });
  const data = await getJson<{ docs?: { key?: string; title?: string; author_name?: string[]; first_publish_year?: number; subject?: string[] }[] }>(
    `https://openlibrary.org/search.json?${params}`,
  );
  return (data.docs ?? []).flatMap((doc) => doc.key && doc.title
    ? [{
        title: doc.title,
        url: `https://openlibrary.org${doc.key}`,
        snippet: doc.subject?.slice(0, 8).join(", ") ?? "",
        provider: "Open Library",
        kind: "livro" as const,
        published: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
        authors: doc.author_name?.slice(0, 3).join(", "),
        content: `Registro bibliográfico (somente metadados, o livro não foi lido). Assuntos: ${doc.subject?.slice(0, 10).join(", ") ?? "não informados"}.`,
        readable: false,
      }]
    : []);
}

async function searchWikipedia(query: string): Promise<RawResult[]> {
  const data = await getJson<{ pages?: { key?: string; title?: string; excerpt?: string }[] }>(
    `https://pt.wikipedia.org/w/rest.php/v1/search/page?${new URLSearchParams({ q: query, limit: "1" })}`,
  );
  const page = data.pages?.[0];
  if (!page?.key || !page.title) return [];
  const summary = await getJson<{ extract?: string; content_urls?: { desktop?: { page?: string } } }>(
    `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.key)}`,
  ).catch(() => null);
  return [{
    title: `${page.title} — Wikipédia`,
    url: summary?.content_urls?.desktop?.page ?? `https://pt.wikipedia.org/wiki/${encodeURIComponent(page.key)}`,
    snippet: stripTags(page.excerpt ?? ""),
    provider: "Wikipédia (complementar)",
    kind: "referencia",
    content: summary?.extract,
    readable: Boolean(summary?.extract),
  }];
}

/* ------------------------------------------------------------------ */
/* Orquestração.                                                       */
/* ------------------------------------------------------------------ */

type SearchType = "geral" | "academico" | "noticias" | "tecnico" | "livros";

const ACADEMIC_HOSTS = /(scielo|arxiv|pubmed|ncbi\.nlm|researchgate|springer|sciencedirect|jstor|doi\.org|academia\.edu|periodicos|semanticscholar|nature\.com|wiley|tandfonline|sagepub|frontiersin|plos)/i;
const NEWS_HOSTS = /(g1\.globo|folha\.uol|estadao|uol\.com\.br|bbc\.|cnnbrasil|reuters|apnews|elpais|theguardian|nytimes|agenciabrasil|poder360|nexojornal|correiobraziliense|oglobo)/i;
const REFERENCE_HOSTS = /(wikipedia\.org|britannica|plato\.stanford|iep\.utm|dicio|priberam)/i;

function classify(result: RawResult): WebSource["kind"] {
  if (result.kind) return result.kind;
  const host = safeHost(result.url);
  if (ACADEMIC_HOSTS.test(host)) return "academico";
  if (NEWS_HOSTS.test(host)) return "noticia";
  if (REFERENCE_HOSTS.test(host)) return "referencia";
  return "web";
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function canonical(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) if (/^utm_|^fbclid$|^gclid$/.test(key)) parsed.searchParams.delete(key);
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/$/, "")}${parsed.search}`.toLowerCase();
  } catch {
    return url;
  }
}

type QueryPlan = { consultas: string[]; consultaAcademica: string; tipo: SearchType };

const QUERY_SCHEMA = {
  type: "object",
  properties: {
    consultas: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
    consulta_academica_en: { type: "string" },
    tipo: { type: "string", enum: ["geral", "academico", "noticias", "tecnico", "livros"] },
  },
  required: ["consultas", "consulta_academica_en", "tipo"],
};

function fallbackQuery(request: string) {
  return request
    .replace(/^\/(pesquisar|pesquisa|buscar|post)\b/i, "")
    .replace(/\b(pesquise|pesquisar|busque|buscar|procure|procurar|na internet|na web|online|fontes sobre|por favor|kally)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export function detectSearchType(text: string): SearchType {
  const value = normalizeText(text);
  if (/\b(noticia|noticias|reportagem|reportagens|ultimas|recente|recentes|hoje|esta semana|atualidade)\b/.test(value)) return "noticias";
  if (/\b(artigo cientifico|artigos cientificos|estudo|estudos|pesquisa academica|academic|paper|papers|revisao sistematica|evidencia|evidencias|literatura cientifica)\b/.test(value)) return "academico";
  if (/\b(livro|livros|obra|obras|bibliografia|autor|autora)\b/.test(value)) return "livros";
  if (/\b(documentacao|api|biblioteca|framework|codigo|programacao|configurar|instalar|erro)\b/.test(value)) return "tecnico";
  return "geral";
}

async function planQueries(request: string, context: string): Promise<QueryPlan> {
  const fallback = fallbackQuery(request) || request.slice(0, 160);
  try {
    const plan = await ollamaJson<{ consultas?: unknown; consulta_academica_en?: unknown; tipo?: unknown }>(
      [
        {
          role: "system",
          content: "Você formula consultas para mecanismos de busca. A partir do pedido do usuário, crie de 1 a 3 consultas curtas e objetivas em português (palavras-chave, sem perguntas longas), uma consulta em inglês para bases acadêmicas e classifique o tipo de pesquisa. Responda apenas com JSON.",
        },
        { role: "user", content: `${context ? `Contexto da conversa:\n${context.slice(0, 1_500)}\n\n` : ""}Pedido de pesquisa: ${request.slice(0, 1_500)}` },
      ],
      QUERY_SCHEMA,
      { numPredict: 200, timeoutMs: 45_000, numCtx: 4_096 },
    );
    const consultas = Array.isArray(plan?.consultas)
      ? plan.consultas.filter((item): item is string => typeof item === "string" && item.trim().length > 2).map((item) => item.trim().slice(0, 160)).slice(0, 3)
      : [];
    const tipo = ["geral", "academico", "noticias", "tecnico", "livros"].includes(String(plan?.tipo)) ? plan?.tipo as SearchType : detectSearchType(request);
    return {
      consultas: consultas.length ? consultas : [fallback],
      consultaAcademica: typeof plan?.consulta_academica_en === "string" && plan.consulta_academica_en.trim() ? plan.consulta_academica_en.trim().slice(0, 160) : consultas[0] ?? fallback,
      tipo,
    };
  } catch {
    return { consultas: [fallback], consultaAcademica: fallback, tipo: detectSearchType(request) };
  }
}

async function generalSearch(query: string, news: boolean): Promise<{ results: RawResult[]; provider: string; error?: string }> {
  const providers: { name: string; run: () => Promise<RawResult[]> }[] = [];
  if (process.env.SEARXNG_URL) providers.push({ name: "SearXNG", run: () => searchSearxng(query, news) });
  if (process.env.BRAVE_SEARCH_API_KEY) providers.push({ name: "Brave Search", run: () => searchBrave(query) });
  providers.push({ name: "DuckDuckGo", run: () => searchDuckDuckGo(query) });
  const errors: string[] = [];
  for (const provider of providers) {
    try {
      const results = await provider.run();
      if (results.length) return { results, provider: provider.name };
      errors.push(`${provider.name}: sem resultados`);
    } catch (error) {
      errors.push(`${provider.name}: ${error instanceof Error ? error.message : "falhou"}`);
    }
  }
  return { results: [], provider: "nenhum", error: errors.join("; ") };
}

async function readSource(result: RawResult, terms: string[], budget: number): Promise<{ excerpt: string; read: boolean; title?: string; published?: string }> {
  if (result.content) {
    return { excerpt: result.content.slice(0, budget), read: Boolean(result.readable) };
  }
  try {
    const page = await fetchPublicPage(result.url);
    if (!page) return { excerpt: result.snippet, read: false };
    let text = "";
    let title: string | undefined;
    let published: string | undefined;
    if (page.contentType.includes("pdf")) {
      const { getDocumentProxy, extractText } = await import("unpdf");
      const pdf = await getDocumentProxy(page.bytes);
      const extracted = await extractText(pdf, { mergePages: false });
      text = extracted.text.map((pageText, index) => `[p. ${index + 1}] ${pageText}`).join("\n\n");
    } else {
      const html = new TextDecoder().decode(page.bytes);
      const parsed = page.contentType.includes("html") ? htmlToText(html) : { title: "", text: html };
      text = parsed.text;
      title = parsed.title || undefined;
      published = "published" in parsed ? parsed.published : undefined;
    }
    if (text.length < 200) return { excerpt: result.snippet, read: false };
    const chunks = splitIntoChunks([{ label: "página", text }], 900);
    const selected = selectRelevantChunks(chunks, terms, budget);
    return { excerpt: selected.chunks.map((chunk) => chunk.text).join("\n[…]\n"), read: true, title, published };
  } catch {
    return { excerpt: result.snippet, read: false };
  }
}

export type ResearchResult = {
  sources: WebSource[];
  queries: string[];
  notes: string[];
};

/**
 * Interpreta o pedido, formula consultas, pesquisa em fontes gerais e
 * especializadas, lê as páginas principais e devolve trechos com referência.
 */
export async function researchWeb(request: string, context = "", options: { budgetPerSource?: number } = {}): Promise<ResearchResult> {
  const budget = options.budgetPerSource ?? 2_400;
  const plan = await planQueries(request, context);
  const notes: string[] = [];

  const general = Promise.all(plan.consultas.map((query) => generalSearch(query, plan.tipo === "noticias")));
  const academic = plan.tipo === "noticias" ? Promise.resolve([]) : searchOpenAlex(plan.consultaAcademica).catch(() => {
    notes.push("OpenAlex (artigos científicos) não respondeu.");
    return [];
  });
  const books = plan.tipo === "livros" ? searchOpenLibrary(plan.consultas[0]).catch(() => []) : Promise.resolve([]);
  const wiki = searchWikipedia(plan.consultas[0]).catch(() => []);

  const [generalResults, academicResults, bookResults, wikiResults] = await Promise.all([general, academic, books, wiki]);
  const providerErrors = generalResults.filter((item) => item.error).map((item) => item.error as string);
  if (providerErrors.length === generalResults.length) {
    notes.push(`A busca geral na internet não retornou resultados (${providerErrors[0]}). Configure SEARXNG_URL ou BRAVE_SEARCH_API_KEY para uma busca mais confiável.`);
  }

  // Intercala resultados das consultas gerais para variar as fontes.
  const generalFlat: RawResult[] = [];
  const lists = generalResults.map((item) => item.results);
  for (let index = 0; index < 10; index += 1) for (const list of lists) if (list[index]) generalFlat.push(list[index]);

  const ordered = plan.tipo === "academico"
    ? [...academicResults.slice(0, 4), ...generalFlat, ...academicResults.slice(4)]
    : plan.tipo === "livros"
      ? [...bookResults, ...generalFlat, ...academicResults.slice(0, 2)]
      : [...generalFlat.slice(0, 6), ...academicResults.slice(0, 2), ...generalFlat.slice(6)];
  // Wikipédia só entra como complemento, no fim, e nunca sozinha se houver outras fontes.
  ordered.push(...wikiResults);

  const seen = new Set<string>();
  const perHost = new Map<string, number>();
  const picked: RawResult[] = [];
  for (const result of ordered) {
    const key = canonical(result.url);
    const host = safeHost(result.url);
    if (!host || seen.has(key) || (perHost.get(host) ?? 0) >= 2) continue;
    seen.add(key);
    perHost.set(host, (perHost.get(host) ?? 0) + 1);
    picked.push(result);
    if (picked.length >= MAX_SOURCES) break;
  }

  const terms = queryTerms(`${plan.consultas.join(" ")} ${request}`);
  let pagesRead = 0;
  const sources = await Promise.all(picked.map(async (result, index) => {
    const shouldFetch = !result.content && pagesRead++ < PAGES_TO_READ;
    const read = shouldFetch || result.content ? await readSource(result, terms, budget) : { excerpt: result.snippet, read: false };
    return {
      id: `W${index + 1}`,
      title: (read.title && read.title.length > 4 && read.title.length < 200 ? read.title : result.title).slice(0, 200),
      url: result.url,
      site: safeHost(result.url),
      kind: classify(result),
      provider: result.provider,
      published: result.published ?? read.published,
      authors: result.authors,
      excerpt: read.excerpt.slice(0, budget),
      read: read.read,
    } satisfies WebSource;
  }));

  const usable = sources.filter((source) => source.excerpt.trim().length > 0);
  if (!usable.length) notes.push("Nenhuma fonte com conteúdo utilizável foi encontrada.");
  else if (usable.every((source) => source.provider.startsWith("Wikipédia"))) notes.push("Só a Wikipédia retornou conteúdo; trate o resultado como insuficiente.");
  return { sources: usable.map((source, index) => ({ ...source, id: `W${index + 1}` })), queries: plan.consultas, notes };
}

const KIND_NAMES: Record<WebSource["kind"], string> = {
  web: "site",
  academico: "publicação acadêmica",
  livro: "livro (metadados)",
  referencia: "obra de referência",
  noticia: "notícia",
};

export function formatWebContext(sources: WebSource[]): string {
  return sources.map((source) => [
    `[${source.id}] ${source.title} — ${source.site} (${KIND_NAMES[source.kind]}; via ${source.provider}${source.published ? `; ${source.published}` : ""}${source.authors ? `; autores: ${source.authors}` : ""})`,
    `URL: ${source.url}`,
    source.read ? "Conteúdo lido da fonte:" : "Apenas resumo/metadados (a página não foi lida por completo):",
    source.excerpt,
  ].join("\n")).join("\n\n---\n\n");
}
