import { listCategories, type CategorySummary } from "@/server/categories";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

async function safeCategories(): Promise<CategorySummary[]> {
  try {
    return await listCategories();
  } catch (error) {
    // A navegação nunca deve derrubar uma página de erro ou 404.
    console.error("Falha ao carregar categorias para o cabeçalho:", error);
    return [];
  }
}

export async function SiteShell({ children }: { children: React.ReactNode }) {
  const categories = await safeCategories();
  return (
    <>
      <SiteHeader categories={categories} />
      <main id="conteudo" className="mx-auto max-w-[72rem] px-6 md:px-10">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
