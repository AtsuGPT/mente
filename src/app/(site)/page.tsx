import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PostListItem } from "@/components/post-list-item";
import { site } from "@/config/site";
import { listCategoriesWithPublicCounts } from "@/server/categories";
import { countPublishedPosts, listLatestPosts } from "@/server/posts";
import { SearchForm } from "@/components/search-form";
import { accentVars } from "@/lib/color";

export const metadata: Metadata = {
  title: { absolute: `${site.name} — ${site.tagline}` },
  description: site.description,
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const categories = await listCategoriesWithPublicCounts();
  const activeCategories = categories.filter((category) => category.count > 0);
  const [total, categoryFeeds] = await Promise.all([
    countPublishedPosts(),
    Promise.all(activeCategories.map(async (category) => ({
      category,
      posts: await listLatestPosts(6, category.slug),
    }))),
  ]);

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
        <p className="label">{total} {total === 1 ? "post" : "posts"}</p>
      </header>

      <section id="feed" aria-label="Feed por categoria">
        {categoryFeeds.length > 0 ? categoryFeeds.map(({ category, posts }) => (
          <section key={category.id} aria-labelledby={`feed-${category.slug}`} className="border-b border-line py-5">
            <header className="mb-3 flex items-center justify-between border-l-2 border-(--accent) pl-3" style={accentVars(category.color)}>
              <div>
                <h2 id={`feed-${category.slug}`} className="font-sans text-base font-semibold text-(--accent-text)">
                  {category.name}
                </h2>
                <p className="mt-0.5 font-sans text-xs text-muted">{category.count} {category.count === 1 ? "publicação" : "publicações"}</p>
              </div>
              <Link href={`/categoria/${category.slug}`} className="label text-(--accent-text) transition-opacity hover:opacity-75">
                Ver todas <span aria-hidden>→</span>
              </Link>
            </header>

            {posts.map((post) => (
              <PostListItem key={`${category.id}-${post.id}`} post={post} accentColor={category.color} showCategories={false} />
            ))}
          </section>
        )) : (
          <EmptyState title="Ainda não há pensamentos publicados.">
            Quando o primeiro for publicado, ele aparece aqui.
          </EmptyState>
        )}

        <div className="flex items-center justify-between border-b border-line px-1 py-4 sm:px-3">
          <span className="label">Arquivo completo</span>
          <Link href="/pensamentos" className="font-sans text-sm font-medium text-(--site-link) transition-colors hover:text-fg">
            Ver todos <span aria-hidden>→</span>
          </Link>
        </div>
      </section>
    </>
  );
}
