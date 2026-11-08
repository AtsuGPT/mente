import type { Metadata } from "next";
import { previewInvite } from "@/server/environments";

export const metadata: Metadata = { title: "Convite", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Destino do link de convite. Mostra só o nome do ambiente (nunca o conteúdo)
 * e como aceitar: o convite é aceito no app (celular ou web em "/"), com uma conta.
 */
export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const preview = await previewInvite(decodeURIComponent(code));

  return (
    <main id="conteudo" className="standalone">
      <div className="standalone-card">
        <p className="eyebrow">Convite · Minha Mente</p>
        {preview.ok ? (
          <>
            <h1>{preview.environment.name}</h1>
            {preview.environment.description ? <p className="lead">{preview.environment.description}</p> : null}
          </>
        ) : (
          <h1>Convite indisponível</h1>
        )}
        <div className="standalone-panel">
          {preview.ok ? (
            <p>
              Abra o Minha Mente, escolha <strong>Adicionar ambiente</strong> e informe o código{" "}
              <strong className="code">{preview.code}</strong> (ou cole este link).
            </p>
          ) : (
            <p>{preview.error} Peça um novo convite a quem administra o ambiente.</p>
          )}
        </div>
        <div className="standalone-actions">
          <a href="/" className="button button-primary">
            Abrir o Minha Mente
          </a>
        </div>
      </div>
    </main>
  );
}
