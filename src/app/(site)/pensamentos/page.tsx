import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { Pagination, parsePage } from "@/components/pagination";
import { PostListItem } from "@/components/post-list-item";
import { listPublishedPosts } from "@/server/posts";

export const metadata: Metadata = {
  title: "Todos os pensamentos",
  description: "O arquivo completo, do mais recente ao mais antigo.",
  alternates: { canonical: "/pensamentos" },
};

export default async function AllThoughtsPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string | string[] }>;
}) {
  const { pagina } = await searchParams;
  const { posts, page, pageCount, total } = await listPublishedPosts({ page: parsePage(pagina) });

  return (
    <>
      <header className="pb-14 pt-16 md:pb-20 md:pt-28">
        <p className="label">Arquivo</p>
        <h1 className="mt-6 text-[clamp(2.75rem,9vw,6.5rem)] font-light leading-[0.95] tracking-[-0.035em]">
          Todos os <em>pensamentos</em>
        </h1>
        <p className="label mt-8">{total} {total === 1 ? "registro" : "registros"}</p>
      </header>

      {posts.length > 0 ? (
        <div className="border-b border-line">
          {posts.map((post) => (
            <PostListItem key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <EmptyState title="Nada publicado por aqui ainda." />
      )}

      <Pagination page={page} pageCount={pageCount} basePath="/pensamentos" />
    </>
  );
}
