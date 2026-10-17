import type { Metadata } from "next";
import { LoginForm } from "@/components/admin/login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  const nextPath = typeof next === "string" ? next : undefined;

  return (
    <main id="conteudo" className="mx-auto flex min-h-dvh max-w-[26rem] flex-col justify-center px-6 py-16">
      <div className="page-enter">
        <div aria-hidden className="h-[2px] w-10 bg-fg" />
        <p className="label mt-8">Administração</p>
        <h1 className="mt-4 text-[2.75rem] font-light leading-none tracking-[-0.03em]">
          Minha <em>Mente</em>
        </h1>
        <div className="mt-14">
          <LoginForm next={nextPath} />
        </div>
      </div>
    </main>
  );
}
