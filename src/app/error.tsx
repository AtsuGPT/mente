"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="conteudo" className="standalone">
      <div className="standalone-card" role="alert">
        <p className="eyebrow">Algo falhou</p>
        <h1>Não consegui carregar isto agora.</h1>
        <p className="lead">
          O erro já foi registrado. Tente de novo em instantes.
          {error.digest ? <span className="code mt-3 block text-sm">ref. {error.digest}</span> : null}
        </p>
        <div className="standalone-actions">
          <button type="button" onClick={reset} className="button button-primary">
            Tentar novamente
          </button>
          <a href="/" className="button button-secondary">
            Voltar ao início
          </a>
        </div>
      </div>
    </main>
  );
}
