import { readStoredFile } from "@/server/artifacts/files";
import { envAccess, error } from "../../../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Arquivo que a Kally gerou na conversa (files.ts): só quem pediu, no mesmo ambiente, por 24 horas. */
type Context = { params: Promise<{ env: string; id: string }> };

export async function GET(_request: Request, context: Context) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  if (!access.userId) return error("Entre com sua conta para baixar o arquivo.", 401);
  const { id } = await context.params;
  const file = await readStoredFile(id, { environmentId: access.environment.id, userId: access.userId });
  if (!file) return error("Arquivo não encontrado (os arquivos ficam disponíveis por 24 horas).", 404);
  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.type,
      "Content-Disposition": `attachment; filename="${file.name.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

export { preflight as OPTIONS } from "../../../../../_lib/http";
