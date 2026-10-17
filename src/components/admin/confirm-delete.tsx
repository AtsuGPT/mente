"use client";

import { useState, useTransition } from "react";

/** Exclusão em duas etapas, sem diálogo do navegador. */
export function ConfirmDelete({
  action,
  label = "Excluir",
  warning,
}: {
  action: () => Promise<void>;
  label?: string;
  warning: string;
}) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!armed) {
    return (
      <button type="button" onClick={() => setArmed(true)} className="btn-link text-danger">
        {label}
      </button>
    );
  }

  return (
    <div role="alertdialog" aria-label="Confirmar exclusão" className="space-y-3 border border-line p-4">
      <p className="text-sm leading-relaxed text-muted">{warning}</p>
      <div className="flex items-center gap-5">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => action())}
          className="btn-link text-danger"
          autoFocus
        >
          {pending ? "Excluindo…" : "Confirmar exclusão"}
        </button>
        <button type="button" disabled={pending} onClick={() => setArmed(false)} className="btn-link text-muted">
          Cancelar
        </button>
      </div>
    </div>
  );
}
