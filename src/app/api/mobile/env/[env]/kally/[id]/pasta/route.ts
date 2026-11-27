import { revalidatePath } from "next/cache";
import { folderChoiceFrom, saveConversationToFolder } from "@/server/kally/folder-prompt";
import { DEFAULT_ENVIRONMENT_ID } from "@/server/scope";
import { envAccess, error, json, readJson } from "../../../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ env: string; id: string }> };

/**
 * Resposta do cartão da pasta: { kind: "existente", categoryId } | { kind: "nova", name } | { kind: "recusa" }.
 * Só a própria pessoa, na própria conversa. Criar pasta exige gerenciar conteúdo (a mesma regra da rota de pastas).
 */
export async function POST(request: Request, context: Context) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  if (!access.userId) return error("Entre com sua conta para conversar com a Kally.", 401);
  const body = await readJson(request, 2_000);
  if (body instanceof Response) return body;
  const choice = folderChoiceFrom(body);
  if (!choice) return error("Escolha uma pasta, dê um nome à nova ou responda \"agora não\".", 400);
  const result = await saveConversationToFolder({ environmentId: access.environment.id, userId: access.userId, conversationId: (await context.params).id, canCreate: access.permissions.manageContent, choice });
  if (!result.ok) return error(result.message, result.status);
  if (result.category && access.environment.id === DEFAULT_ENVIRONMENT_ID) revalidatePath("/", "layout");
  return json({ category: result.category, moved: result.moved });
}

export { preflight as OPTIONS } from "../../../../../_lib/http";
