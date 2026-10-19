import { SiteShell } from "@/components/site-shell";
import { getAccessRole } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  if (!(await getAccessRole())) redirect("/entrar");
  return <SiteShell>{children}</SiteShell>;
}
