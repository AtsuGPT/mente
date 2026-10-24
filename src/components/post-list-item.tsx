import Link from "next/link";
import { accentVars } from "@/lib/color";
import { formatDateShort, formatNumber } from "@/lib/format";
import type { PostCard } from "@/server/posts";
import { CategoryLabel } from "./category-label";
import { ProfileAvatar } from "./profile-avatar";
import { site } from "@/config/site";

/**
 * Uma entrada do arquivo. A linha inteira é clicável (link "esticado" no
 * título); os rótulos de categoria ficam acima dele para continuarem clicáveis.
 */
export function PostListItem({
  post,
  profileImage,
  accentColor,
  showCategories = true,
}: {
  post: PostCard;
  profileImage?: string | null;
  accentColor?: string;
  showCategories?: boolean;
}) {
  return (
    <article
      className="group relative mb-2 rounded-md border border-line bg-(--site-post) px-4 py-4 transition-colors hover:border-(--site-post-edge) hover:bg-(--site-hover) sm:px-5 sm:py-5"
      style={accentVars(accentColor ?? post.categories[0]?.color)}
    >
      <div className="flex items-center gap-3">
        <ProfileAvatar size={42} src={profileImage} />
        <div className="min-w-0 flex-1 font-sans text-sm leading-snug">
          <span className="font-semibold text-fg">{site.author}</span>
          <span className="ml-1.5 text-muted">{site.authorHandle}</span>
          <span className="mx-1.5 text-faint" aria-hidden>·</span>
          <time className="text-muted" dateTime={post.publishedAt.toISOString()}>{formatDateShort(post.publishedAt)}</time>
        </div>
        <span className="label shrink-0 text-faint">Nº {formatNumber(post.number)}</span>
      </div>

      <div className="pl-[3.45rem]">
        <h2 className="mt-3 text-balance text-[1.35rem] font-medium leading-snug text-fg sm:text-[1.55rem]">
          <Link href={`/pensamento/${post.slug}`} className="rounded-sm outline-offset-4 after:absolute after:inset-0 hover:text-(--accent-text)">
            {post.title}
          </Link>
        </h2>

        {post.excerpt ? (
          <p className="mt-2 max-w-[58ch] whitespace-pre-line text-[1rem] leading-[1.7] text-(--site-copy) sm:text-[1.05rem]">{post.excerpt}</p>
        ) : null}

        {showCategories && post.categories.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
            {post.categories.map((c) => (
              <CategoryLabel key={c.id} category={c} />
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
