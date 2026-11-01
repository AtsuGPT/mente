import { API_URL, REQUEST_TIMEOUT_MS } from "./config";
import type {
  AdminPost,
  AdminPostsPage,
  Category,
  EnvironmentCard,
  EnvironmentInfo,
  EnvironmentSession,
  FeedPage,
  FieldErrors,
  Invite,
  InvitePreview,
  KnowledgeMap,
  Member,
  MemberRole,
  PostCard,
  KallyAttachment,
  KallyConversation,
  KallyImage,
  KallyMessage,
  PostFull,
  User,
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

/** Chamado quando o backend recusa o token (expirado ou conta inexistente). */
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
        : `Não consegui conectar ao Minha Mente em ${API_URL}. Confira sua conexão e se o servidor está ligado.`,
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
    // 401 com token = sessão inválida; sem token, é só um ambiente que pede login.
    if (response.status === 401 && authToken) onUnauthorized?.();
    throw new ApiError(payload.error || `Erro ${response.status} no servidor.`, response.status, payload.fieldErrors);
  }
  return data as T;
}

type TokenResponse = { token: string; user: User; expiresIn: number };

function query(params: Record<string, string | number | undefined>) {
  const search = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
  return search ? `?${search}` : "";
}

export type EnvironmentInput = { name: string; description: string; color: string; icon: string; guestAccess: boolean };

/** Rotas de conta, lista de ambientes e convites (fora de um ambiente). */
export const api = {
  login: (username: string, password: string) =>
    request<TokenResponse>("/api/mobile/auth/login", { method: "POST", json: { username, password } }),
  register: (input: { username: string; displayName: string; password: string }) =>
    request<TokenResponse>("/api/mobile/auth/register", { method: "POST", json: input }),
  me: () => request<{ user: User }>("/api/mobile/me"),

  environments: () => request<{ mine: EnvironmentCard[]; open: EnvironmentCard[] }>("/api/mobile/environments"),
  createEnvironment: (input: EnvironmentInput) =>
    request<{ environment: EnvironmentInfo }>("/api/mobile/environments", { method: "POST", json: input }),
  previewInvite: (code: string) => request<InvitePreview>(`/api/mobile/invites/${encodeURIComponent(code)}`),
  redeemInvite: (code: string) =>
    request<{ ok: true; environmentId: string; alreadyMember: boolean }>(`/api/mobile/invites/${encodeURIComponent(code)}`, { method: "POST" }),
};

/** Rotas de um ambiente. Todas passam pela verificação de acesso do servidor. */
export function envApi(environmentId: string) {
  const base = `/api/mobile/env/${encodeURIComponent(environmentId)}`;
  return {
    id: environmentId,
    session: () => request<EnvironmentSession>(`${base}/session`),
    feed: (params: { categoria?: string; q?: string; de?: string; ate?: string; pagina?: number } = {}) =>
      request<FeedPage>(`${base}/feed${query(params)}`),
    categories: () => request<{ categories: (Category & { count: number })[] }>(`${base}/categories`),
    post: (slug: string) => request<{ post: PostFull; related: PostCard[]; canEdit: boolean }>(`${base}/posts/${encodeURIComponent(slug)}`),
    map: () => request<KnowledgeMap>(`${base}/map`),

    managePosts: (params: { q?: string; status?: string; categoria?: string; pagina?: number } = {}) =>
      request<AdminPostsPage>(`${base}/manage/posts${query(params)}`),
    managedPost: (id: string) => request<{ post: AdminPost }>(`${base}/manage/posts/${encodeURIComponent(id)}`),
    createPost: (form: FormData) => request<{ id: string }>(`${base}/manage/posts`, { method: "POST", form }),
    updatePost: (id: string, form: FormData) =>
      request<{ id: string; intent: string }>(`${base}/manage/posts/${encodeURIComponent(id)}`, { method: "PUT", form }),
    deletePost: (id: string) => request<{ ok: true }>(`${base}/manage/posts/${encodeURIComponent(id)}`, { method: "DELETE" }),
    manageCategories: () => request<{ categories: (Category & { count: number })[] }>(`${base}/manage/categories`),
    createCategory: (form: FormData) => request<{ category: Category }>(`${base}/manage/categories`, { method: "POST", form }),
    updateCategory: (id: string, form: FormData) =>
      request<{ category: Category }>(`${base}/manage/categories/${encodeURIComponent(id)}`, { method: "PUT", form }),
    deleteCategory: (id: string) => request<{ ok: true }>(`${base}/manage/categories/${encodeURIComponent(id)}`, { method: "DELETE" }),
    uploadImage: (form: FormData) => request<{ src: string; mime: string }>(`${base}/manage/images`, { method: "POST", form, timeoutMs: 60_000 }),

    updateSettings: (input: EnvironmentInput) =>
      request<{ environment: EnvironmentInfo }>(`${base}/settings`, { method: "PUT", json: input }),
    setArchived: (archived: boolean) => request<{ ok: true }>(`${base}/settings`, { method: "PATCH", json: { archived } }),
    setImage: (form: FormData) => request<{ ok: true }>(`${base}/settings/image`, { method: "PUT", form, timeoutMs: 60_000 }),
    removeImage: () => request<{ ok: true }>(`${base}/settings/image`, { method: "DELETE" }),

    members: () => request<{ members: Member[]; canManage: boolean; myRole: string }>(`${base}/members`),
    updateMember: (userId: string, update: Partial<Pick<Member, "role" | "canPublish" | "canEditOwn" | "canManageContent" | "canManageMembers">>) =>
      request<{ ok: true }>(`${base}/members/${encodeURIComponent(userId)}`, { method: "PATCH", json: update }),
    removeMember: (userId: string) => request<{ ok: true }>(`${base}/members/${encodeURIComponent(userId)}`, { method: "DELETE" }),
    leave: () => request<{ ok: true }>(`${base}/leave`, { method: "POST" }),

    /** Kally: o envio de mensagens é em tempo real (lib/stream) em kallyPath. */
    kallyPath: `${base}/kally`,
    kallyConversations: () => request<{ conversations: KallyConversation[] }>(`${base}/kally`),
    kallyConversation: (id: string) =>
      request<KallyConversation & { messages: KallyMessage[] }>(`${base}/kally/${encodeURIComponent(id)}`),
    deleteKallyConversation: (id: string) => request<{ ok: true }>(`${base}/kally/${encodeURIComponent(id)}`, { method: "DELETE" }),
    transcribe: (form: FormData) => request<{ text: string }>(`${base}/kally/transcribe`, { method: "POST", form, timeoutMs: 6 * 60_000 }),
    kallyAttachment: (form: FormData) => request<KallyAttachment>(`${base}/kally/anexo`, { method: "POST", form, timeoutMs: 4 * 60_000 }),
    /** Salva o pensamento preparado no chat: rascunho, ou publicado (publish) depois da confirmação da pessoa. */
    kallySavePost: (input: { title: string; content: string; categories: string[]; publish: boolean; private?: boolean }) =>
      request<{ id: string; slug: string; status: "PUBLISHED" | "DRAFT"; environment: { id: string; name: string } }>(`${base}/kally/rascunho`, { method: "POST", json: input }),
    kallyImages: (q: string) => request<{ images: KallyImage[] }>(`${base}/kally/imagens${query({ q })}`),
    kallyImportImage: (image: KallyImage) => request<{ src: string; markdown: string }>(`${base}/kally/imagens`, { method: "POST", json: image, timeoutMs: 60_000 }),

    invites: () => request<{ invites: Invite[] }>(`${base}/invites`),
    createInvite: (input: { role: MemberRole; maxUses: number | null; expiresInDays: number | null }) =>
      request<{ invite: Invite }>(`${base}/invites`, { method: "POST", json: input }),
    revokeInvite: (id: string) => request<{ ok: true }>(`${base}/invites/${encodeURIComponent(id)}`, { method: "DELETE" }),
  };
}

export type EnvApi = ReturnType<typeof envApi>;
