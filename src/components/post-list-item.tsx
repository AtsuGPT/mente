import Link from "next/link";
import { accentVars } from "@/lib/color";
import { formatDateShort, formatNumber } from "@/lib/format";
import type { PostCard } from "@/server/posts";
import { CategoryLabel } from "./category-label";

/**
 * Uma entrada do arquivo. A linha inteira é clicável (link "esticado" no
 * título); os rótulos de categoria ficam acima dele para continuarem clicáveis.
 */
export function PostListItem({ post }: { post: PostCard }) {
  return (
    <article
      className="group rule-sweep relative grid gap-3 border-t border-line py-8 md:grid-cols-12 md:gap-10 md:py-11"
      style={accentVars(post.categories[0]?.color)}
    >
      <div className="md:col-span-3">
        <p className="label">
          <time dateTime={post.publishedAt.toISOString()}>{formatDateShort(post.publishedAt)}</time>
        </p>
        <p className="label mt-1 text-faint">Nº {formatNumber(post.number)}</p>
      </div>

      <div className="md:col-span-9">
        <h3 className="max-w-[24ch] text-balance text-[1.75rem] font-normal leading-[1.1] tracking-[-0.018em] md:text-[2.35rem]">
          <Link href={`/pensamento/${post.slug}`} className="reveal-underline after:absolute after:inset-0">
            {post.title}
          </Link>
        </h3>

        {post.excerpt ? (
          <p className="mt-4 max-w-[58ch] text-[1.05rem] leading-relaxed text-muted md:text-[1.12rem]">{post.excerpt}</p>
        ) : null}

        {post.categories.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1">
            {post.categories.map((c) => (
              <CategoryLabel key={c.id} category={c} />
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
