import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PostListItem } from "@/components/post-list-item";
import { site } from "@/config/site";
import { listCategories } from "@/server/categories";
import { countPublishedPosts, listLatestPosts } from "@/server/posts";
import { SearchForm } from "@/components/search-form";
import { accentVars } from "@/lib/color";

export const metadata: Metadata = {
  title: { absolute: `${site.name} — ${site.tagline}` },
  description: site.description,
  alternates: { canonical: "/" },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const rawCategory = Array.isArray(params.categoria) ? params.categoria[0] : params.categoria;
  const [categories, total] = await Promise.all([listCategories(), countPublishedPosts()]);
  const posts = total ? await listLatestPosts(total) : [];
  const categoryCounts = new Map<string, number>();
  for (const post of posts) {
    for (const category of post.categories) {
      categoryCounts.set(category.id, (categoryCounts.get(category.id) ?? 0) + 1);
    }
  }
  const activeCategories = categories
    .map((category) => ({ ...category, count: categoryCounts.get(category.id) ?? 0 }))
    .filter((category) => category.count > 0);
  const selectedCategory = activeCategories.find((category) => category.slug === rawCategory);
  const visiblePosts = selectedCategory
    ? posts.filter((post) => post.categories.some((category) => category.id === selectedCategory.id))
    : posts;

  return (
    <>
      <section aria-label="Buscar publicações" className="border-b border-line py-5">
        <SearchForm categories={categories} compact />
      </section>

      <header className="flex items-center justify-between border-b border-line py-5">
        <div>
          <p className="label">{site.author}</p>
          <h1 className="mt-1 font-sans text-lg font-semibold">Feed de pensamentos</h1>
        </div>
        <p className="label">
          {visiblePosts.length} {visiblePosts.length === 1 ? "post" : "posts"}
        </p>
      </header>

      {activeCategories.length > 0 ? (
        <nav aria-label="Filtrar feed por categoria" className="sticky top-[4.25rem] z-10 -mx-4 border-b border-line bg-(--site-header) px-4 py-3 backdrop-blur-xl sm:mx-0 sm:px-0">
          <div className="scrollbar-none flex gap-2 overflow-x-auto">
            <Link href="/" aria-current={selectedCategory ? undefined : "page"} className="category-feed-tab shrink-0">Todas</Link>
            {activeCategories.map(({ id, name, slug, color }) => (
              <Link
                key={id}
                href={`/?categoria=${encodeURIComponent(slug)}`}
                aria-current={selectedCategory?.slug === slug ? "page" : undefined}
                className="category-feed-tab shrink-0"
                style={accentVars(color)}
              >
                <span className="size-1.5 rounded-full bg-(--accent)" aria-hidden="true" />
                {name}
              </Link>
            ))}
          </div>
        </nav>
      ) : null}

      <section id="feed" aria-label={selectedCategory ? `Feed: ${selectedCategory.name}` : "Feed por categoria"}>
        {visiblePosts.length > 0 ? (
          visiblePosts.map((post) => <PostListItem key={post.id} post={post} />)
        ) : (
          <EmptyState title={selectedCategory ? `Ainda não há posts em ${selectedCategory.name}.` : "Ainda não há pensamentos publicados."}>
            {selectedCategory ? "Escolha outra categoria ou volte para Todas." : "Quando o primeiro for publicado, ele aparece aqui."}
          </EmptyState>
        )}

        <div className="flex items-center justify-between border-b border-line px-1 py-4 sm:px-3">
          <span className="label">{selectedCategory ? selectedCategory.name : "Arquivo completo"}</span>
          <Link href={selectedCategory ? `/categoria/${selectedCategory.slug}` : "/pensamentos"} className="font-sans text-sm font-medium text-(--site-link) transition-colors hover:text-fg">
            {selectedCategory ? "Ver categoria" : "Ver todos"} <span aria-hidden>→</span>
          </Link>
        </div>
      </section>
    </>
  );
}
