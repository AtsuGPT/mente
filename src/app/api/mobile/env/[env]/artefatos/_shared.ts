import "server-only";
import { ArtifactError } from "@/server/artifacts/store";
import { error } from "../../../_lib/http";

/** Erros dos artefatos viram a mesma resposta JSON das outras rotas (com os detalhes da validação, se houver). */
export function artifactFailure(cause: unknown) {
  if (cause instanceof ArtifactError) return error(cause.message, cause.status, cause.details.length ? { details: cause.details } : {});
  console.error("Artefatos:", cause instanceof Error ? cause.message : cause);
  return error("Não consegui concluir isso agora. Tente de novo.", 500);
}

/** Pedido com o código de um artefato: até ~260 KB (o código pode ter até 200 mil caracteres). */
export const ARTIFACT_BODY_MAX = 260_000;

export const str = (v: unknown) => (typeof v === "string" ? v : undefined);
