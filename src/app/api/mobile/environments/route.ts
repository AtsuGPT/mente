import { createEnvironment, listEnvironmentsFor, parseEnvironmentInput } from "@/server/environments";
import { currentUserId, error, json, readJson, requireUser } from "../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ambientes de quem pede ("mine") e os abertos a convidados ("open"). Sem conta, só os abertos. */
export async function GET() {
  return json(await listEnvironmentsFor(await currentUserId()));
}

/** Cria um ambiente; quem cria vira o proprietário. */
export async function POST(request: Request) {
  const userId = await requireUser();
  if (userId instanceof Response) return userId;
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const parsed = parseEnvironmentInput(body);
  if (!parsed.ok) return error("Revise os campos destacados.", 422, { fieldErrors: parsed.fieldErrors });
  const result = await createEnvironment(userId, parsed.data);
  if (!result.ok) return error(result.error, 400);
  return json({ environment: result.environment }, { status: 201 });
}

export { preflight as OPTIONS } from "../_lib/http";
