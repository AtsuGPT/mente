import { addVersion } from "@/server/artifacts/store";
import { envAccess, json, readJson } from "../../../../../_lib/http";
import { ARTIFACT_BODY_MAX, artifactFailure, str } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ env: string; id: string }> };

/** Nova versão: { source, note?, origin?: "kally" | "manual", title?, description? }. As anteriores ficam guardadas. */
export async function POST(request: Request, context: Context) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  const body = await readJson(request, ARTIFACT_BODY_MAX);
  if (body instanceof Response) return body;
  const { id } = await context.params;
  try {
    const created = await addVersion(access, id, {
      source: str(body.source) ?? "",
      note: str(body.note),
      origin: body.origin === "kally" ? "kally" : "manual",
      title: str(body.title),
      description: str(body.description),
    });
    return json(created, { status: 201 });
  } catch (cause) {
    return artifactFailure(cause);
  }
}

export { preflight as OPTIONS } from "../../../../../_lib/http";
