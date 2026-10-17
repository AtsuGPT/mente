import type { Metadata } from "next";
import { PostEditor } from "@/components/admin/post-editor";
import { requireAdmin } from "@/lib/auth/session";
import { listCategories } from "@/server/categories";

export const metadata: Metadata = { title: "Novo pensamento" };

export default async function NewPostPage() {
  await requireAdmin();
  const categories = await listCategories();

  return (
    <>
      <p className="label">Novo</p>
      <h1 className="mb-12 mt-3 text-[2.5rem] font-light leading-none tracking-[-0.03em] md:text-5xl">Pensamento</h1>
      <PostEditor post={null} categories={categories} selectedIds={[]} />
    </>
  );
}
