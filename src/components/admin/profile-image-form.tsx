"use client";

import { useActionState, useEffect, useState } from "react";
import { saveProfileImageAction } from "@/app/admin/actions";
import type { ActionState } from "@/server/validation";
import { SubmitButton } from "./submit-button";

export function ProfileImageForm({ currentImage }: { currentImage: string | null }) {
  const [state, action] = useActionState<ActionState, FormData>(saveProfileImageAction, { ok: false });
  const [preview, setPreview] = useState(currentImage);

  useEffect(() => setPreview(currentImage), [currentImage]);

  return (
    <form action={action} encType="multipart/form-data" className="max-w-xl space-y-8">
      <div className="flex items-center gap-5">
        <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-surface-2 font-sans text-3xl font-semibold text-muted">
          {preview ? <img src={preview} alt="Prévia da foto de perfil" className="size-full object-cover" /> : "K"}
        </div>
        <div>
          <p className="font-sans text-sm font-medium">Foto de kayk</p>
          <p className="mt-1 max-w-[38ch] font-sans text-sm leading-relaxed text-muted">
            A imagem aparece no cabeçalho e ao lado das publicações do site.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="profileImage" className="label">Escolher imagem</label>
        <input
          id="profileImage"
          name="profileImage"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) setPreview(URL.createObjectURL(file));
          }}
          className="mt-3 block w-full font-sans text-sm text-muted file:mr-4 file:border file:border-line file:bg-transparent file:px-3 file:py-2 file:font-sans file:text-sm file:text-fg hover:file:border-fg"
        />
        <p className="mt-2 font-sans text-xs text-faint">JPG, PNG ou WebP. Tamanho máximo: 700 KB.</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton variant="primary" pendingLabel="Enviando…">Salvar foto</SubmitButton>
        {currentImage ? (
          <button type="submit" name="intent" value="remove" formNoValidate className="btn">
            Remover foto
          </button>
        ) : null}
        {state.message ? (
          <p role={state.ok ? "status" : "alert"} className={`font-sans text-sm ${state.ok ? "text-fg" : "text-danger"}`}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}