import { createArtifact, listArtifacts } from "@/server/artifacts/store";
import { envAccess, json, readJson, type EnvContext } from "../../../_lib/http";
import { ARTIFACT_BODY_MAX, artifactFailure, str } from "./_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Biblioteca do ambiente: ?q=busca&tipo=simulador&categoria=Física&favoritos=1&meus=1 */
export async function GET(request: Request, context: EnvContext) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  const p = new URL(request.url).searchParams;
  try {
    return json(
      await listArtifacts(access, {
        q: p.get("q") ?? undefined,
        kind: p.get("tipo") ?? undefined,
        category: p.get("categoria") ?? undefined,
        favorites: p.get("favoritos") === "1",
        mine: p.get("meus") === "1",
      }),
    );
  } catch (cause) {
    return artifactFailure(cause);
  }
}

/** Novo artefato: { title, kind, description?, category?, format?, source, private?, note?, origin?, conversationId? } */
export async function POST(request: Request, context: EnvContext) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  const body = await readJson(request, ARTIFACT_BODY_MAX);
  if (body instanceof Response) return body;
  try {
    const created = await createArtifact(access, {
      title: str(body.title) ?? "",
      kind: str(body.kind) ?? null,
      description: str(body.description),
      category: str(body.category),
      format: str(body.format),
      source: str(body.source) ?? "",
      private: body.private === true,
      note: str(body.note),
      origin: body.origin === "kally" ? "kally" : "manual",
      conversationId: str(body.conversationId) ?? null,
    });
    return json(created, { status: 201 });
  } catch (cause) {
    return artifactFailure(cause);
  }
}

export { preflight as OPTIONS } from "../../../_lib/http";
