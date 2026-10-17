import Link from "next/link";
import { site } from "@/config/site";

export function SiteFooter() {
  return (
    <footer className="mt-32 border-t border-line">
      <div className="mx-auto flex max-w-[72rem] flex-wrap items-baseline justify-between gap-x-10 gap-y-3 px-6 py-8 md:px-10">
        <p className="label">
          {site.name} · {new Date().getFullYear()}
        </p>
        <p className="label normal-case tracking-normal text-faint">
          <Link href="/pensamentos" className="hover:text-fg">
            Todos os pensamentos
          </Link>
        </p>
      </div>
    </footer>
  );
}
