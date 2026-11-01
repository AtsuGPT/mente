import { API_URL, REQUEST_TIMEOUT_MS } from "./config";
import type {
  AdminPost,
  AdminPostsPage,
  Category,
  FeedPage,
  FieldErrors,
  KnowledgeMap,
  PostCard,
  PostFull,
  Role,
  SessionInfo,
} from "./types";

/** Erro com a mensagem do backend (já em português) e, quando houver, erros por campo. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fieldErrors?: FieldErrors,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

/** Chamado quando o backend recusa o token (expirado ou inválido). */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export function authHeaders(): Record<string, string> {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

type RequestOptions = { method?: string; json?: unknown; form?: FormData; timeoutMs?: number };

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);
  const headers: Record<string, string> = { Accept: "application/json", ...authHeaders() };
  let body: BodyInit | undefined;
  if (options.form) body = options.form;
  else if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { method: options.method ?? "GET", headers, body, signal: controller.signal });
  } catch (cause) {
    const aborted = cause instanceof Error && cause.name === "AbortError";
    throw new ApiError(
      aborted
        ? "O servidor demorou demais para responder."
        : `Não consegui conectar ao Minha Mente em ${API_URL}. Confira se o celular está na mesma rede e o servidor está ligado.`,
      0,
    );
  } finally {
    clearTimeout(timer);
  }

  let data: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const payload = (data ?? {}) as { error?: string; fieldErrors?: FieldErrors };
    if (response.status === 401) onUnauthorized?.();
    throw new ApiError(payload.error || `Erro ${response.status} no servidor.`, response.status, payload.fieldErrors);
  }
  return data as T;
}

type TokenResponse = { token: string; role: Role; isAdmin: boolean; expiresIn: number };

function query(params: Record<string, string | number | undefined>) {
  const search = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
  return search ? `?${search}` : "";
}

/** Rotas do backend usadas pelo app. */
export const api = {
  login: (username: string, password: string) =>
    request<TokenResponse>("/api/mobile/auth/login", { method: "POST", json: { username, password } }),
  guest: () => request<TokenResponse>("/api/mobile/auth/guest", { method: "POST" }),
  session: () => request<SessionInfo>("/api/mobile/session"),

  feed: (params: { categoria?: string; q?: string; de?: string; ate?: string; pagina?: number } = {}) =>
    request<FeedPage>(`/api/mobile/feed${query(params)}`),
  categories: () => request<{ categories: (Category & { count: number })[] }>("/api/mobile/categories"),
  post: (slug: string) =>
    request<{ post: PostFull; related: PostCard[] }>(`/api/mobile/posts/${encodeURIComponent(slug)}`),
  map: () => request<KnowledgeMap>("/api/mobile/map"),

  admin: {
    posts: (params: { q?: string; status?: string; categoria?: string; pagina?: number } = {}) =>
      request<AdminPostsPage>(`/api/mobile/admin/posts${query(params)}`),
    post: (id: string) => request<{ post: AdminPost }>(`/api/mobile/admin/posts/${encodeURIComponent(id)}`),
    createPost: (form: FormData) => request<{ id: string }>("/api/mobile/admin/posts", { method: "POST", form }),
    updatePost: (id: string, form: FormData) =>
      request<{ id: string; intent: string }>(`/api/mobile/admin/posts/${encodeURIComponent(id)}`, { method: "PUT", form }),
    deletePost: (id: string) => request<{ ok: true }>(`/api/mobile/admin/posts/${encodeURIComponent(id)}`, { method: "DELETE" }),
    categories: () => request<{ categories: (Category & { count: number })[] }>("/api/mobile/admin/categories"),
    createCategory: (form: FormData) =>
      request<{ category: Category }>("/api/mobile/admin/categories", { method: "POST", form }),
    updateCategory: (id: string, form: FormData) =>
      request<{ category: Category }>(`/api/mobile/admin/categories/${encodeURIComponent(id)}`, { method: "PUT", form }),
    deleteCategory: (id: string) =>
      request<{ ok: true }>(`/api/mobile/admin/categories/${encodeURIComponent(id)}`, { method: "DELETE" }),
    uploadImage: (form: FormData) =>
      request<{ src: string; mime: string }>("/api/admin/post-images", { method: "POST", form, timeoutMs: 60_000 }),
    setProfileImage: (form: FormData) =>
      request<{ ok: true }>("/api/mobile/admin/profile-image", { method: "PUT", form, timeoutMs: 60_000 }),
    removeProfileImage: () => request<{ ok: true }>("/api/mobile/admin/profile-image", { method: "DELETE" }),
  },
};
