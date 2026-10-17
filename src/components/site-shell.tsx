import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { getProfileImage } from "@/server/site-settings";
import { SiteBottomNav } from "./site-bottom-nav";

export async function SiteShell({ children }: { children: React.ReactNode }) {
  const profileImage = await getProfileImage();
  return (
    <div className="site-surface">
      <SiteHeader profileImage={profileImage} />
      <main id="conteudo" className="mx-auto w-full max-w-[44rem] px-4 pb-28 sm:px-6 sm:pb-16">
        {children}
      </main>
      <SiteFooter />
      <SiteBottomNav />
    </div>
  );
}
