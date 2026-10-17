import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdmin } from "@/lib/auth/session";
import { logoutAction } from "../login/actions";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[72rem] flex-wrap items-baseline justify-between gap-x-10 gap-y-4 px-6 py-5 md:px-10">
          <div className="flex items-baseline gap-5">
            <Link href="/admin" className="text-[1.3rem] leading-none tracking-[-0.015em]">
              Minha <em className="font-light">Mente</em>
            </Link>
            <span className="label text-faint">Administração</span>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
            <AdminNav />
            <a href="/" target="_blank" rel="noopener" className="label transition-colors hover:text-fg">
              Ver site <span aria-hidden>↗</span>
            </a>
            <form action={logoutAction}>
              <button type="submit" className="label transition-colors hover:text-fg">
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <main id="conteudo" className="mx-auto max-w-[72rem] px-6 pb-16 pt-10 md:px-10 md:pt-14">
        <div className="page-enter">{children}</div>
      </main>
    </>
  );
}
