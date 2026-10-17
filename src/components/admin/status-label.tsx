import type { PostStatus } from "@/generated/prisma/client";

/** Rascunho / Publicado / Agendado (publicado com data futura). */
export function statusOf(status: PostStatus, publishedAt: Date | null): "draft" | "published" | "scheduled" {
  if (status === "DRAFT") return "draft";
  return publishedAt && publishedAt.getTime() > Date.now() ? "scheduled" : "published";
}

const copy = {
  draft: { text: "Rascunho", marker: "border border-faint" },
  published: { text: "Publicado", marker: "bg-fg" },
  scheduled: { text: "Agendado", marker: "border border-fg" },
} as const;

export function StatusLabel({ status, publishedAt }: { status: PostStatus; publishedAt: Date | null }) {
  const kind = statusOf(status, publishedAt);
  return (
    <span className="label inline-flex items-center gap-2">
      <span aria-hidden className={`size-[7px] ${copy[kind].marker}`} />
      {copy[kind].text}
    </span>
  );
}
