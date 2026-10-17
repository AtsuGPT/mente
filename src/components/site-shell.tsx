import { listCategories, type CategorySummary } from "@/server/categories";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { getProfileImage } from "@/server/site-settings";

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
  const [categories, profileImage] = await Promise.all([safeCategories(), getProfileImage()]);
  return (
    <div className="site-surface">
      <SiteHeader categories={categories} profileImage={profileImage} />
      <main id="conteudo" className="mx-auto w-full max-w-[44rem] px-4 sm:px-6">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
