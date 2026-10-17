import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deletePostAction } from "@/app/admin/actions";
import { ConfirmDelete } from "@/components/admin/confirm-delete";
import { PostEditor } from "@/components/admin/post-editor";
import { StatusLabel, statusOf } from "@/components/admin/status-label";
import { requireAdmin } from "@/lib/auth/session";
import { formatDateTime, formatNumber, toDatetimeLocal } from "@/lib/format";
import { listCategories } from "@/server/categories";
import { getAdminPost } from "@/server/posts";

export const metadata: Metadata = { title: "Editar pensamento" };

const created: Record<string, string> = {
  save: "Rascunho criado.",
  publish: "Pensamento criado e publicado.",
  unpublish: "Rascunho criado.",
};

export default async function EditPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ criado?: string | string[] }>;
}) {
  await requireAdmin();
  const [{ id }, { criado }] = await Promise.all([params, searchParams]);

  const [post, categories] = await Promise.all([getAdminPost(id), listCategories()]);
  if (!post) notFound();

  const kind = statusOf(post.status, post.publishedAt);
  const createdKey = Array.isArray(criado) ? criado[0] : criado;

  return (
    <>
      <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="label">Nº {formatNumber(post.number)}</p>
          <h1 className="mt-3 text-[2.5rem] font-light leading-none tracking-[-0.03em] md:text-5xl">Editar</h1>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <StatusLabel status={post.status} publishedAt={post.publishedAt} />
          {kind === "published" ? (
            <Link href={`/pensamento/${post.slug}`} target="_blank" className="btn-link text-muted hover:text-fg">
              Ver no site <span aria-hidden>↗</span>
            </Link>
          ) : null}
          {kind === "scheduled" && post.publishedAt ? (
            <span className="label normal-case tracking-normal">Vai ao ar em {formatDateTime(post.publishedAt)}</span>
          ) : null}
        </div>
      </div>

      {createdKey && created[createdKey] ? (
        <p role="status" className="mb-10 border border-line px-4 py-3 font-sans text-sm text-fg">
          {created[createdKey]}
        </p>
      ) : null}

      <PostEditor
        key={post.id}
        post={{
          id: post.id,
          number: post.number,
          title: post.title,
          slug: post.slug,
          content: post.content,
          status: post.status,
          publishedAtLocal: toDatetimeLocal(post.publishedAt),
        }}
        categories={categories}
        selectedIds={post.categories.map((c) => c.id)}
      />

      <section aria-labelledby="zona-perigosa" className="mt-20 border-t border-line pt-8">
        <h2 id="zona-perigosa" className="label">
          Excluir
        </h2>
        <p className="mt-3 max-w-[52ch] text-sm leading-relaxed text-muted">
          A exclusão é definitiva. Se só quiser tirar o texto do ar, use “Voltar a rascunho”.
        </p>
        <div className="mt-5 max-w-md">
          <ConfirmDelete
            action={deletePostAction.bind(null, post.id)}
            label="Excluir pensamento"
            warning={`Excluir “${post.title || "Sem título"}” para sempre? Não dá para desfazer.`}
          />
        </div>
      </section>
    </>
  );
}
