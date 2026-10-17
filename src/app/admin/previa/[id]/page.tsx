import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusLabel } from "@/components/admin/status-label";
import { SiteShell } from "@/components/site-shell";
import { ThoughtArticle } from "@/components/thought-article";
import { requireAdmin } from "@/lib/auth/session";
import { getAdminPost } from "@/server/posts";

export const metadata: Metadata = { title: "Prévia" };

/**
 * Mostra a versão SALVA de um pensamento (rascunho ou publicado) com o layout
 * público real. Fica sob /admin, portanto exige sessão.
 */
export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const post = await getAdminPost(id);
  if (!post) notFound();

  return (
    <SiteShell>
      <div className="-mx-6 border-b border-line bg-surface-2 px-6 py-3 md:-mx-10 md:px-10">
        <div className="mx-auto flex max-w-[72rem] flex-wrap items-center justify-between gap-x-8 gap-y-2">
          <p className="label flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className="text-fg">Prévia</span>
            <StatusLabel status={post.status} publishedAt={post.publishedAt} />
            <span className="normal-case tracking-normal text-faint">Visível apenas para você.</span>
          </p>
          <Link href={`/admin/pensamentos/${post.id}`} className="btn-link text-fg">
            ← Voltar ao editor
          </Link>
        </div>
      </div>

      <ThoughtArticle
        post={{
          number: post.number,
          title: post.title,
          content: post.content || "*Nada escrito ainda.*",
          publishedAt: post.publishedAt,
          categories: post.categories,
        }}
      />
    </SiteShell>
  );
}
