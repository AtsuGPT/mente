import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { SiteBottomNav } from "./site-bottom-nav";

export function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="site-surface">
      <SiteHeader />
      <main id="conteudo" className="mx-auto w-full max-w-[44rem] px-4 pb-28 sm:px-6 sm:pb-16">
        {children}
      </main>
      <SiteFooter />
      <SiteBottomNav />
    </div>
  );
}
