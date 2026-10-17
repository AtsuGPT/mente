import Link from "next/link";
import { StatusLabel, statusOf } from "@/components/admin/status-label";
import { Pagination, parsePage } from "@/components/pagination";
import { requireAdmin } from "@/lib/auth/session";
import { accentVars } from "@/lib/color";
import { formatDateShort, formatNumber } from "@/lib/format";
import { listCategories } from "@/server/categories";
import { listAdminPosts, type AdminStatusFilter } from "@/server/posts";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminPostsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;

  const q = (first(sp.q) ?? "").trim().slice(0, 100);
  const statusParam = first(sp.status);
  const status: AdminStatusFilter = statusParam === "draft" || statusParam === "published" ? statusParam : "all";
  const categoryId = first(sp.categoria) || undefined;

  const [categories, { posts, total, page, pageCount }] = await Promise.all([
    listCategories(),
    listAdminPosts({ q, status, categoryId, page: parsePage(sp.pagina) }),
  ]);

  const filtering = q !== "" || status !== "all" || !!categoryId;

  // Mantém os filtros ao paginar.
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status !== "all") params.set("status", status);
  if (categoryId) params.set("categoria", categoryId);
  const basePath = params.size > 0 ? `/admin?${params.toString()}` : "/admin";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="label">Administração</p>
          <h1 className="mt-3 text-[2.5rem] font-light leading-none tracking-[-0.03em] md:text-5xl">Pensamentos</h1>
        </div>
        <Link href="/admin/pensamentos/novo" className="btn btn-primary">
          Novo pensamento
        </Link>
      </div>

      {first(sp.excluido) ? (
        <p role="status" className="mt-8 border border-line px-4 py-3 font-sans text-sm text-fg">
          Pensamento excluído.
        </p>
      ) : null}

      <form method="get" action="/admin" role="search" className="mt-10 grid gap-x-8 gap-y-6 md:grid-cols-[1fr_11rem_13rem_auto] md:items-end">
        <div>
          <label htmlFor="q" className="label">
            Buscar
          </label>
          <input id="q" name="q" defaultValue={q} placeholder="Título, texto ou endereço" className="input mt-2" />
        </div>
        <div>
          <label htmlFor="status" className="label">
            Situação
          </label>
          <select id="status" name="status" defaultValue={status} className="input mt-2">
            <option value="all">Todos</option>
            <option value="draft">Rascunhos</option>
            <option value="published">Publicados</option>
          </select>
        </div>
        <div>
          <label htmlFor="categoria" className="label">
            Categoria
          </label>
          <select id="categoria" name="categoria" defaultValue={categoryId ?? ""} className="input mt-2">
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-5">
          <button type="submit" className="btn">
            Filtrar
          </button>
          {filtering ? (
            <Link href="/admin" className="btn-link text-muted hover:text-fg">
              Limpar
            </Link>
          ) : null}
        </div>
      </form>

      <p className="label mt-12" aria-live="polite">
        {total} {total === 1 ? "pensamento" : "pensamentos"}
        {filtering ? " encontrados" : ""}
      </p>

      {posts.length === 0 ? (
        <div className="mt-6 border-t border-line py-16">
          <p className="text-2xl italic">{filtering ? "Nada encontrado com esses filtros." : "Nenhum pensamento ainda."}</p>
          {!filtering ? (
            <p className="mt-4">
              <Link href="/admin/pensamentos/novo" className="btn-link border-line text-fg hover:border-fg">
                Escrever o primeiro →
              </Link>
            </p>
          ) : null}
        </div>
      ) : (
        <ul className="mt-6 border-b border-line">
          {posts.map((p) => {
            const kind = statusOf(p.status, p.publishedAt);
            return (
              <li key={p.id} className="group rule-sweep relative border-t border-line" style={accentVars(p.categories[0]?.color)}>
                <Link
                  href={`/admin/pensamentos/${p.id}`}
                  className="grid gap-x-8 gap-y-2 py-5 md:grid-cols-[3rem_minmax(0,1fr)_8rem_12rem_8.5rem] md:items-baseline"
                >
                  <span className="label text-faint">{formatNumber(p.number)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-xl tracking-[-0.01em] transition-colors group-hover:text-(--accent-text) md:text-[1.35rem]">
                      {p.title || "Sem título"}
                    </span>
                    <span className="mt-1 block truncate font-sans text-sm text-faint">/{p.slug}</span>
                  </span>
                  <StatusLabel status={p.status} publishedAt={p.publishedAt} />
                  <span className="label normal-case tracking-normal">
                    {p.categories.length > 0 ? p.categories.map((c) => c.name).join(" · ") : <span className="text-faint">Sem categoria</span>}
                  </span>
                  <span className="label md:text-right">
                    {kind === "draft" || !p.publishedAt ? (
                      <>Editado {formatDateShort(p.updatedAt)}</>
                    ) : (
                      formatDateShort(p.publishedAt)
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Pagination page={page} pageCount={pageCount} basePath={basePath} />
    </>
  );
}
