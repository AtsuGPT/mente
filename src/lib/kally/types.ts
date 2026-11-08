/** Tipos dos anexos da Kally (server/kally/attachments.ts e as rotas de anexo do app). */

export type AttachmentStatus = "ready" | "partial" | "unreadable" | "unsupported" | "received";

export type AttachmentInfo = {
  id: string;
  name: string;
  kind: "pdf" | "texto" | "markdown" | "docx" | "csv" | "imagem" | "audio";
  status: AttachmentStatus;
  /** Explicação legível do resultado do processamento. */
  detail: string;
  chars: number;
  pages?: number;
};
