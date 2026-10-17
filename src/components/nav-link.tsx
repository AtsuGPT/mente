"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

export function NavLink({
  href,
  children,
  style,
}: {
  href: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      style={style}
      aria-current={active ? "page" : undefined}
      className={[
        "label border-b pb-1 transition-colors duration-200",
        active
          ? "border-(--accent,var(--color-fg)) text-fg"
          : "border-transparent hover:border-line hover:text-fg",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
