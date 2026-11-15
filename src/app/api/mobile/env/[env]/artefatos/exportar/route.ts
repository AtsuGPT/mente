import { exportArtifact, EXPORT_FORMATS, type ExportFormat } from "@/server/artifacts/export";
import { getArtifact } from "@/server/artifacts/store";
import { LIMITS } from "@/server/artifacts/kinds";
import { envAccess, error, json, readJson, type EnvContext } from "../../../../_lib/http";
import { ARTIFACT_BODY_MAX, artifactFailure, str } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Arquivo de um artefato: { formato: "pdf" | "html" | "md", id } para um salvo (com as permissões de quem pede), ou
 * { formato, source, title, format } para um que ainda está só na conversa (o código é da própria pessoa).
 * Responde o arquivo (Content-Disposition: attachment).
 */
export async function POST(request: Request, context: EnvContext) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  if (!access.userId) return error("Entre com sua conta para baixar arquivos.", 401);
  const body = await readJson(request, ARTIFACT_BODY_MAX);
  if (body instanceof Response) return body;
  const to = (EXPORT_FORMATS as readonly string[]).includes(String(body.formato)) ? (body.formato as ExportFormat) : null;
  if (!to) return error("Formato inválido. Use pdf, html ou md.", 400);
  try {
    let artifact: { title: string; format: string; source: string };
    if (str(body.id)) {
      const { artifact: a } = await getArtifact(access, String(body.id));
      artifact = { title: a.title, format: a.format, source: a.source };
    } else {
      const source = (str(body.source) ?? "").slice(0, LIMITS.source);
      if (!source.trim()) return error("Nada para exportar.", 400);
      artifact = { title: (str(body.title) ?? "Artefato").slice(0, LIMITS.title), format: body.format === "markdown" ? "markdown" : "html", source };
    }
    const file = await exportArtifact(artifact, to);
    const headers = new Headers(json(null).headers);
    headers.set("Content-Type", file.type);
    headers.set("Content-Disposition", `attachment; filename="${file.name}"`);
    headers.set("Access-Control-Expose-Headers", "Content-Disposition");
    return new Response(new Uint8Array(file.body), { headers });
  } catch (cause) {
    if (cause instanceof Error && /navegador|PDF/.test(cause.message)) return error(cause.message, 503);
    return artifactFailure(cause);
  }
}

export { preflight as OPTIONS } from "../../../../_lib/http";
