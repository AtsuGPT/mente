"use client";

import { useActionState, useEffect, useState } from "react";
import { saveProfileImageAction } from "@/app/admin/actions";
import type { ActionState } from "@/server/validation";
import { SubmitButton } from "./submit-button";

const MAX_IMAGE_BYTES = 700 * 1024;
const TARGET_IMAGE_BYTES = 680 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível abrir esta imagem."));
    };
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Não foi possível otimizar esta imagem.")),
      "image/webp",
      quality,
    );
  });
}

async function optimizeImage(file: File): Promise<File> {
  if (file.size <= TARGET_IMAGE_BYTES) return file;

  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Seu navegador não conseguiu processar esta imagem.");

  let scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  let blob: Blob | null = null;

  while (scale >= 0.125) {
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4]) {
      blob = await canvasBlob(canvas, quality);
      if (blob.size <= TARGET_IMAGE_BYTES) {
        return new File([blob], "foto-perfil.webp", { type: "image/webp", lastModified: Date.now() });
      }
    }

    scale *= 0.8;
  }

  if (blob && blob.size <= MAX_IMAGE_BYTES) {
    return new File([blob], "foto-perfil.webp", { type: "image/webp", lastModified: Date.now() });
  }
  throw new Error("Não foi possível reduzir a imagem para menos de 700 KB.");
}

export function ProfileImageForm({ currentImage }: { currentImage: string | null }) {
  const [state, action] = useActionState<ActionState, FormData>(saveProfileImageAction, { ok: false });
  const [preview, setPreview] = useState(currentImage);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizationMessage, setOptimizationMessage] = useState("");
  const [selectionError, setSelectionError] = useState("");

  useEffect(() => setPreview(currentImage), [currentImage]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const original = input.files?.[0];
    setOptimizationMessage("");
    setSelectionError("");
    if (!original) return;

    setPreview(URL.createObjectURL(original));
    if (original.size <= TARGET_IMAGE_BYTES) return;

    setOptimizing(true);
    try {
      const optimized = await optimizeImage(original);
      const transfer = new DataTransfer();
      transfer.items.add(optimized);
      input.files = transfer.files;
      setPreview(URL.createObjectURL(optimized));
      setOptimizationMessage(`Imagem otimizada: ${(original.size / 1024).toFixed(0)} KB → ${(optimized.size / 1024).toFixed(0)} KB.`);
    } catch (error) {
      input.value = "";
      setPreview(currentImage);
      setSelectionError(error instanceof Error ? error.message : "Falha ao otimizar a imagem.");
    } finally {
      setOptimizing(false);
    }
  }

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
          onChange={handleFileChange}
          disabled={optimizing}
          className="mt-3 block w-full font-sans text-sm text-muted file:mr-4 file:border file:border-line file:bg-transparent file:px-3 file:py-2 file:font-sans file:text-sm file:text-fg hover:file:border-fg"
        />
        <p className="mt-2 font-sans text-xs text-faint">JPG, PNG ou WebP. Imagens grandes são reduzidas automaticamente para até 700 KB.</p>
        {optimizing ? <p role="status" className="mt-2 font-sans text-sm text-(--site-link)">Otimizando imagem…</p> : null}
        {optimizationMessage ? <p role="status" className="mt-2 font-sans text-sm text-(--site-link)">{optimizationMessage}</p> : null}
        {selectionError ? <p role="alert" className="mt-2 font-sans text-sm text-danger">{selectionError}</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton variant="primary" pendingLabel="Enviando…" disabled={optimizing || !!selectionError}>Salvar foto</SubmitButton>
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