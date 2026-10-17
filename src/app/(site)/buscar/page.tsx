import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { Pagination, parsePage } from "@/components/pagination";
import { PostListItem } from "@/components/post-list-item";
import { SearchForm } from "@/components/search-form";
import { listCategories } from "@/server/categories";
import { getProfileImage } from "@/server/site-settings";
import { listPublishedPosts } from "@/server/posts";

export const metadata: Metadata = {
  title: "Buscar pensamentos",
  description: "Busque pensamentos por palavra, categoria ou data.",
  alternates: { canonical: "/buscar" },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = (first(params.q) ?? "").trim().slice(0, 100);
  const categoria = (first(params.categoria) ?? "").slice(0, 120);
  const de = (first(params.de) ?? "").slice(0, 10);
  const ate = (first(params.ate) ?? "").slice(0, 10);

  const [{ posts, page, pageCount, total }, categories, profileImage] = await Promise.all([
    listPublishedPosts({ q, categorySlug: categoria, from: de, to: ate, page: parsePage(params.pagina) }),
    listCategories(),
    getProfileImage(),
  ]);

  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (categoria) query.set("categoria", categoria);
  if (de) query.set("de", de);
  if (ate) query.set("ate", ate);
  const basePath = query.size ? `/buscar?${query.toString()}` : "/buscar";
  const hasFilters = !!(q || categoria || de || ate);

  return (
    <>
      <header className="site-page-heading">
        <p className="label">Explorar</p>
        <h1 className="mt-3 font-sans text-3xl font-semibold">Buscar</h1>
        <p className="mt-2 text-sm text-muted">Palavras, assuntos e momentos.</p>
      </header>

      <section aria-label="Filtros de busca" className="border-y border-line py-5">
        <SearchForm categories={categories} values={{ q, categoria, de, ate }} />
      </section>

      <section aria-labelledby="search-results-heading" className="mt-2">
        <div className="flex items-center justify-between border-b border-line px-1 py-4 sm:px-3">
          <h2 id="search-results-heading" className="font-sans text-sm font-semibold">
            {hasFilters ? "Resultados" : "Recentes"}
          </h2>
          <span className="label">{total} {total === 1 ? "post" : "posts"}</span>
        </div>

        {posts.length ? (
          <div>
            {posts.map((post) => <PostListItem key={post.id} post={post} profileImage={profileImage} />)}
          </div>
        ) : (
          <EmptyState title={hasFilters ? "Nenhum pensamento encontrado." : "Ainda não há publicações."}>
            Ajuste as palavras ou os filtros e tente novamente.
          </EmptyState>
        )}

        <Pagination page={page} pageCount={pageCount} basePath={basePath} />
      </section>
    </>
  );
}