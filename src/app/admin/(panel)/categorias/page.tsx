import type { Metadata } from "next";
import { CategoryRow, NewCategoryForm } from "@/components/admin/category-forms";
import { requireAdmin } from "@/lib/auth/session";
import { listCategoriesWithAllCounts } from "@/server/categories";

export const metadata: Metadata = { title: "Categorias" };

export default async function AdminCategoriesPage() {
  await requireAdmin();
  const categories = await listCategoriesWithAllCounts();

  return (
    <>
      <p className="label">Administração</p>
      <h1 className="mb-4 mt-3 text-[2.5rem] font-light leading-none tracking-[-0.03em] md:text-5xl">Categorias</h1>
      <p className="max-w-[56ch] text-lg leading-relaxed text-muted">
        Cada categoria tem sua página, seu feed e uma cor de destaque usada só em pequenos detalhes.
      </p>

      <section aria-labelledby="nova" className="mt-14">
        <h2 id="nova" className="label mb-8">
          Nova categoria
        </h2>
        <NewCategoryForm />
      </section>

      <section aria-labelledby="existentes" className="mt-20">
        <h2 id="existentes" className="label mb-8">
          Existentes ({categories.length})
        </h2>
        {categories.length === 0 ? (
          <p className="border-t border-line py-12 text-xl italic text-muted">Nenhuma categoria ainda.</p>
        ) : (
          <ul className="border-b border-line">
            {categories.map((c) => (
              <CategoryRow key={c.id} category={c} count={c.count} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
