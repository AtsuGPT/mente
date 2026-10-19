import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { site } from "@/config/site";
import { getAccessRole } from "@/lib/auth/session";
import { AccessForm } from "./access-form";

export const metadata: Metadata = { title: "Entrar", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AccessPage() {
  if (await getAccessRole()) redirect("/");

  return (
    <main className="access-screen">
      <div className="access-grain" aria-hidden="true" />
      <div className="access-content page-enter">
        <header className="access-brand">
          <p className="label">Arquivo pessoal · {site.author}</p>
          <h1>{site.name}</h1>
          <p className="access-tagline">Pensamentos guardados, ideias em movimento.</p>
        </header>
        <AccessForm />
        <footer className="access-footer">
          <span>MINHA MENTE</span>
          <span>UM ESPAÇO PARA LER E PENSAR</span>
        </footer>
      </div>
    </main>
  );
}