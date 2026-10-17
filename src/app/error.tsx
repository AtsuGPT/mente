"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="conteudo" className="mx-auto max-w-[42rem] px-6 py-32 md:py-44">
      <p className="label">Algo falhou</p>
      <h1 className="mt-6 text-4xl font-light leading-tight tracking-[-0.02em] md:text-6xl">
        Não consegui carregar isto agora.
      </h1>
      <p className="mt-6 max-w-[40ch] text-lg italic text-muted">
        O erro já foi registrado. Tente de novo em instantes.
        {error.digest ? <span className="label mt-4 block normal-case tracking-normal">ref. {error.digest}</span> : null}
      </p>
      <button
        type="button"
        onClick={reset}
        className="label mt-10 border-b border-line pb-1 hover:border-fg hover:text-fg"
      >
        Tentar novamente
      </button>
    </main>
  );
}
