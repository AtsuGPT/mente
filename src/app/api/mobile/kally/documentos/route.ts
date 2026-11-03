import { MAX_DOCUMENT_BYTES } from "@/server/kally/attachments";
import { addDocument, listDocuments } from "@/server/kally/documents";
import { pipelineFor } from "@/server/kally/pipeline";
import { findUserById } from "@/server/users";
import { error, json, requireUser } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isPlatformAdmin = async (userId: string) => (await findUserById(userId))?.legacyKind === "ADMIN";

/**
 * Bases de documentos da Kally: a pessoal da pessoa (só ela vê) e a institucional (todos
 * consultam; só o administrador da plataforma altera).
 */
export async function GET() {
  const userId = await requireUser();
  if (userId instanceof Response) return userId;
  const admin = await isPlatformAdmin(userId);
  // enabled: a Kally desta pessoa consulta as bases (pipeline ligado para ela).
  return json({ documents: await listDocuments(userId, { institutional: true }), canManageInstitutional: admin, enabled: !!pipelineFor(admin) });
}

/**
 * Envia um documento (multipart): file, scope ("pessoal" por padrão ou "institucional"),
 * title e origin opcionais. Responde já; a indexação segue em segundo plano (status "processando").
 */
export async function POST(request: Request) {
  const userId = await requireUser();
  if (userId instanceof Response) return userId;
  if (Number(request.headers.get("content-length") ?? 0) > MAX_DOCUMENT_BYTES + 64 * 1024) return error("Documentos devem ter no máximo 15 MB.", 413);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error("Não consegui ler o arquivo.", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return error("Envie o arquivo no campo file.", 400);
  const scope = form.get("scope") === "institucional" ? "institucional" : "pessoal";
  if (scope === "institucional" && !(await isPlatformAdmin(userId))) return error("Só o administrador pode alterar a base institucional.", 403);
  const text = (key: string) => (typeof form.get(key) === "string" ? String(form.get(key)) : undefined);
  const result = await addDocument({ scope, userId, file, title: text("title"), origin: text("origin") });
  if (!result.ok) return error(result.error, result.status);
  return json({ id: result.id, status: result.status, reused: result.reused, detail: result.detail }, { status: result.reused ? 200 : 202 });
}

export { preflight as OPTIONS } from "../../_lib/http";
