import Link from "next/link";
import { accentVars } from "@/lib/color";
import { formatDateLong, formatNumber } from "@/lib/format";
import { readingMinutes } from "@/lib/text";
import type { CategorySummary } from "@/server/categories";
import { CategoryLabel } from "./category-label";
import { Markdown } from "./markdown";

export type ArticleData = {
  number: number;
  title: string;
  content: string;
  publishedAt: Date | null;
  categories: CategorySummary[];
};

/** Leitura de um pensamento. Usada na página pública e na prévia do painel. */
export function ThoughtArticle({ post, preview = false }: { post: ArticleData; preview?: boolean }) {
  const primary = post.categories[0];
  const backLabel = primary ? primary.name : "Todos os pensamentos";

  return (
    <article
      style={accentVars(primary?.color)}
      className={`mx-auto max-w-[42rem] pb-8 ${preview ? "pt-6" : "pt-14 md:pt-24"}`}
    >
      <header>
        {preview ? (
          // Na prévia do editor os links ficam inertes, para não perder o texto em edição.
          <span className="label inline-flex items-center gap-2">
            <span aria-hidden>←</span>
            {backLabel}
          </span>
        ) : (
          <Link
            href={primary ? `/categoria/${primary.slug}` : "/pensamentos"}
            className="label inline-flex items-center gap-2 transition-colors hover:text-fg"
          >
            <span aria-hidden>←</span>
            {backLabel}
          </Link>
        )}

        <div aria-hidden className="mt-10 h-[2px] w-10 bg-(--accent)" />

        <p className="label mt-6 flex flex-wrap gap-x-5 gap-y-1">
          <span>Nº {post.number > 0 ? formatNumber(post.number) : "—"}</span>
          {post.publishedAt ? (
            <time dateTime={post.publishedAt.toISOString()}>{formatDateLong(post.publishedAt)}</time>
          ) : (
            <span>Sem data de publicação</span>
          )}
          <span>{readingMinutes(post.content)} min de leitura</span>
        </p>

        <h1 className="mt-6 text-balance text-[2.5rem] font-light leading-[1.04] tracking-[-0.025em] md:text-[4rem]">
          {post.title}
        </h1>

        {post.categories.length > 0 ? (
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
            {post.categories.map((c) => (
              <CategoryLabel key={c.id} category={c} linked={!preview} />
            ))}
          </div>
        ) : null}
      </header>

      <div className="mt-12 md:mt-16">
        <Markdown>{post.content}</Markdown>
      </div>

      <div aria-hidden className="mt-16 flex justify-center">
        <span className="h-[2px] w-10 bg-(--accent)" />
      </div>
    </article>
  );
}
