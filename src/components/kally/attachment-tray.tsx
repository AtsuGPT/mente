"use client";

import type { AttachmentInfo, AttachmentStatus } from "@/lib/kally/types";

export type PendingAttachment = {
  localId: string;
  name: string;
  size: number;
  state: "uploading" | "done" | "error";
  info?: AttachmentInfo;
  error?: string;
};

export const ACCEPTED_FILES = ".pdf,.txt,.md,.markdown,.docx,.csv,.tsv,.png,.jpg,.jpeg,.webp,.mp3,.m4a,.wav,.ogg,.webm,.mp4,.mpeg";

const STATUS_LABEL: Record<AttachmentStatus, string> = {
  ready: "Interpretado",
  partial: "Interpretado em parte",
  received: "Recebido, não interpretado",
  unreadable: "Ilegível",
  unsupported: "Não suportado",
};

export function statusTone(status: AttachmentStatus | "uploading" | "error") {
  if (status === "ready") return "is-ok";
  if (status === "partial" || status === "received") return "is-warn";
  if (status === "uploading") return "is-busy";
  return "is-bad";
}

export function statusLabel(status: AttachmentStatus) {
  return STATUS_LABEL[status];
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** Anexos escolhidos e ainda não enviados: estado de processamento e remoção individual. */
export function AttachmentTray({ items, onRemove, disabled }: { items: PendingAttachment[]; onRemove: (localId: string) => void; disabled?: boolean }) {
  if (!items.length) return null;
  return (
    <ul className="kally-attachments" aria-label="Anexos desta mensagem">
      {items.map((item) => {
        const status = item.state === "uploading" ? "uploading" : item.state === "error" ? "error" : item.info?.status ?? "error";
        const label = item.state === "uploading"
          ? "Enviando e processando…"
          : item.state === "error"
            ? "Falhou"
            : statusLabel(item.info!.status);
        const detail = item.state === "error" ? item.error : item.info?.detail;
        return (
          <li key={item.localId} className={`kally-attachment ${statusTone(status)}`}>
            <div className="min-w-0 flex-1">
              <p className="kally-attachment-name" title={item.name}>{item.name}</p>
              <p className="kally-attachment-status">
                {item.state === "uploading" ? <span className="site-chat-spinner kally-mini-spinner" aria-hidden="true" /> : null}
                <span>{label}</span>
                <span className="text-faint"> · {formatSize(item.size)}</span>
              </p>
              {detail ? <p className="kally-attachment-detail">{detail}</p> : null}
            </div>
            <button
              type="button"
              className="kally-attachment-remove"
              onClick={() => onRemove(item.localId)}
              disabled={disabled}
              aria-label={`Remover ${item.name}`}
              title="Remover"
            >
              ×
            </button>
          </li>
        );
      })}
    </ul>
  );
}
