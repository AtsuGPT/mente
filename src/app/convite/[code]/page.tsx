import type { Metadata } from "next";
import { previewInvite } from "@/server/environments";

export const metadata: Metadata = { title: "Convite", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Destino do link de convite. Mostra só o nome do ambiente (nunca o conteúdo)
 * e como aceitar: o convite é aceito no app, com uma conta.
 */
export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const preview = await previewInvite(decodeURIComponent(code));

  return (
    <main className="access-screen">
      <div className="access-content page-enter">
        <header className="access-brand">
          <p className="label">Convite · Minha Mente</p>
          {preview.ok ? (
            <>
              <h1>{preview.environment.name}</h1>
              {preview.environment.description ? <p className="access-tagline">{preview.environment.description}</p> : null}
            </>
          ) : (
            <h1>Convite indisponível</h1>
          )}
        </header>
        <div className="access-panel">
          {preview.ok ? (
            <p className="text-sm leading-relaxed text-muted">
              Abra o app Minha Mente, toque em <strong>Adicionar ambiente</strong> e informe o código{" "}
              <strong className="font-mono text-fg">{preview.code}</strong> (ou cole este link).
            </p>
          ) : (
            <p className="text-sm leading-relaxed text-muted">{preview.error} Peça um novo convite a quem administra o ambiente.</p>
          )}
        </div>
      </div>
    </main>
  );
}
