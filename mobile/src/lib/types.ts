/**
 * Formatos das respostas de /api/mobile (datas chegam como texto ISO).
 * Espelham src/server/{posts,map,environments}.ts do backend.
 */

export type MemberRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
/** DEV: o dev da plataforma num ambiente do qual não participa (só leitura). */
export type AccessRole = MemberRole | "GUEST" | "DEV";

export type User = { id: string; username: string; displayName: string; legacyKind?: string | null };

export type Permissions = {
  view: boolean;
  seePrivate: boolean;
  publish: boolean;
  editOwn: boolean;
  manageContent: boolean;
  manageMembers: boolean;
  manageSettings: boolean;
};

export type EnvironmentInfo = {
  id: string;
  slug: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  guestAccess: boolean;
  ownerId: string | null;
  archivedAt: string | null;
  createdAt: string;
};

export type EnvironmentCard = EnvironmentInfo & {
  role: AccessRole;
  permissions: Permissions;
  stats: { posts: number; members: number };
  image: string | null;
};

export type EnvironmentSession = { environment: EnvironmentInfo; role: AccessRole; permissions: Permissions; image: string | null };

export type InvitePreview = { ok: true; code: string; role: MemberRole; environment: { name: string; description: string; color: string; icon: string } };

export type Invite = {
  id: string;
  code: string;
  link: string;
  role: MemberRole;
  maxUses: number | null;
  uses: number;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type Member = {
  userId: string;
  role: MemberRole;
  canPublish: boolean | null;
  canEditOwn: boolean | null;
  canManageContent: boolean | null;
  canManageMembers: boolean | null;
  createdAt: string;
  user: { username: string; displayName: string };
  permissions: Permissions;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  position: number;
  count?: number;
};

export type PostCard = {
  id: string;
  number: number;
  title: string;
  slug: string;
  excerpt: string;
  publishedAt: string;
  categories: Category[];
};

export type PostFull = PostCard & { content: string; updatedAt: string };

export type FeedPage = { posts: PostCard[]; total: number; page: number; pageCount: number; pageSize: number };

export type PostStatus = "DRAFT" | "PUBLISHED";

export type AdminPostRow = {
  id: string;
  number: number;
  title: string;
  slug: string;
  status: PostStatus;
  private: boolean;
  publishedAt: string | null;
  updatedAt: string;
  authorId: string | null;
  categories: Category[];
};

export type AdminPost = AdminPostRow & { content: string; createdAt: string; publishedAtLocal: string };

export type AdminPostsPage = { posts: AdminPostRow[]; total: number; page: number; pageCount: number };

export type FieldErrors = Record<string, string[] | undefined>;

export type MapNode =
  | { id: string; kind: "pasta"; label: string; slug: string; color: string; description: string }
  | {
      id: string;
      kind: "pensamento";
      label: string;
      slug: string;
      number: number;
      color: string | null;
      excerpt: string;
      publishedAt: string | null;
      draft: boolean;
      private: boolean;
    }
  | { id: string; kind: "imagem"; label: string; src: string };

export type MapEdge = { source: string; target: string; kind: "pasta" | "imagem" | "mencao" };

export type KnowledgeMap = { nodes: MapNode[]; edges: MapEdge[]; environment: { id: string; name: string; color: string; icon: string } };

export type KallyMode = "auto" | "chat" | "ideia" | "revisar" | "aprender";
/** kind: post/projeto/rascunho/conversa (do ambiente) ou web (externa, com url). */
export type KallySource = { title: string; slug: string; kind?: "post" | "projeto" | "rascunho" | "conversa" | "web" | "documento" | "referencia"; url?: string };
/** Documento das bases da Kally: pessoal (só da pessoa) ou institucional (de referência, para todos). */
export type KallyDocument = {
  id: string;
  scope: "pessoal" | "institucional";
  title: string;
  origin: string;
  kind: string;
  chars: number;
  status: "processando" | "pronto" | "erro";
  detail: string;
  createdAt: string;
  updatedAt: string;
  _count: { chunks: number };
};
export type KallySuggestion = { tipo: string; trecho: string; sugestao: string; motivo: string };
export type KallyReview = { resumo: string; sugestoes: KallySuggestion[]; truncated: boolean; postId: string | null; slug: string | null };
export type KallyAttachment = { name: string; kind: "pdf" | "imagem" | "texto" | "docx" | "csv" | "audio"; text: string; pages?: number; truncated?: boolean };
export type KallyImage = { title: string; url: string; thumb: string; author: string; license: string; page: string };
/** owner: só nas conversas de outra pessoa, que o dev da plataforma pode ler (nas próprias é null). */
export type KallyConversation = { id: string; mode: KallyMode; title: string; createdAt: string; updatedAt: string; owner?: { username: string; displayName: string } | null };
export type KallyMessage = { id: string; role: "user" | "assistant"; content: string; sources: KallySource[]; createdAt: string };
