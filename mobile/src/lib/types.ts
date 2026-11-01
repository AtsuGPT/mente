/**
 * Formatos das respostas de /api/mobile (datas chegam como texto ISO).
 * Espelham os tipos de src/server/posts.ts e src/server/map.ts do backend.
 */

export type Role = "CONVIDADO" | "INTIMO" | "ADMIN";

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

export type SessionInfo = {
  role: Role;
  isAdmin: boolean;
  site: { name: string; author: string; authorHandle: string; tagline: string };
  profileImage: string | null;
};

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

export type KnowledgeMap = { nodes: MapNode[]; edges: MapEdge[] };
