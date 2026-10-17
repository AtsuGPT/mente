import Link from "next/link";
import { SiteShell } from "@/components/site-shell";

export default function NotFound() {
  return (
    <SiteShell>
      <section className="mx-auto max-w-[42rem] py-24 md:py-40">
        <p className="label">Erro 404</p>
        <h1 className="mt-6 text-5xl font-light leading-[1.02] tracking-[-0.02em] md:text-7xl">
          Esta página <em>não existe</em>.
        </h1>
        <p className="mt-8 max-w-[36ch] text-xl italic text-muted">
          Talvez o pensamento ainda não tenha sido publicado, ou o endereço tenha mudado.
        </p>
        <Link href="/" className="label mt-12 inline-block border-b border-line pb-1 hover:border-fg hover:text-fg">
          Voltar ao início
        </Link>
      </section>
    </SiteShell>
  );
}
