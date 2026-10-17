"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Início", icon: "home" },
  { href: "/arquivo", label: "Arquivo", icon: "folder" },
  { href: "/buscar", label: "Buscar", icon: "search" },
] as const;

function NavIcon({ name }: { name: (typeof items)[number]["icon"] }) {
  if (name === "home") {
    return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m3.5 10 8.5-7 8.5 7v10.5h-6v-7h-5v7h-6V10Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>;
  }
  if (name === "folder") {
    return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6.5h7l2 2h9v9.8a1.7 1.7 0 0 1-1.7 1.7H4.7A1.7 1.7 0 0 1 3 18.3V6.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M3.5 10h17" stroke="currentColor" strokeWidth="1.4" /></svg>;
  }
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.7" /><path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
}

export function SiteBottomNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navegação principal" className="site-bottom-nav">
      <div className="site-bottom-nav-inner">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`site-bottom-nav-link ${active ? "is-active" : ""}`}>
              <NavIcon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}