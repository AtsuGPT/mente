"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin", label: "Pensamentos", isActive: (p: string) => p === "/admin" || p.startsWith("/admin/pensamentos") },
  { href: "/admin/categorias", label: "Categorias", isActive: (p: string) => p.startsWith("/admin/categorias") },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Administração" className="flex flex-wrap items-baseline gap-x-7 gap-y-2">
      {items.map((item) => {
        const active = item.isActive(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`label border-b pb-1 transition-colors ${
              active ? "border-fg text-fg" : "border-transparent hover:border-line hover:text-fg"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
