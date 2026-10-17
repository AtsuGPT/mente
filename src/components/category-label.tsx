import Link from "next/link";
import { accentVars } from "@/lib/color";
import type { CategorySummary } from "@/server/categories";

/** Nome da categoria com um pequeno traço na cor de destaque. */
export function CategoryLabel({ category, linked = true }: { category: Pick<CategorySummary, "name" | "slug" | "color">; linked?: boolean }) {
  const content = (
    <>
      <span aria-hidden className="h-[2px] w-3 bg-(--accent)" />
      {category.name}
    </>
  );

  const className = "label relative inline-flex items-center gap-2";

  if (!linked) {
    return (
      <span className={className} style={accentVars(category.color)}>
        {content}
      </span>
    );
  }

  return (
    <Link
      href={`/categoria/${category.slug}`}
      style={accentVars(category.color)}
      className={`${className} z-10 transition-colors duration-200 hover:text-(--accent-text)`}
    >
      {content}
    </Link>
  );
}
