import { findCategory } from "@/server/categories";
import { clearLearning, listLearning } from "@/server/kally/learning";
import { envAccess, error, json, type EnvContext } from "../../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Progresso de estudo da própria pessoa neste ambiente (learning.ts). Ninguém mais lista nem apaga. ?pasta=<id>: só os tópicos da pasta. */
export async function GET(request: Request, context: EnvContext) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  if (!access.userId) return error("Entre com sua conta para ver o seu progresso.", 401);
  const folder = new URL(request.url).searchParams.get("pasta");
  if (folder && !(await findCategory(folder, access.environment.id))) return error("Pasta não encontrada.", 404);
  const topics = await listLearning({ environmentId: access.environment.id, userId: access.userId }, folder);
  return json({
    topics: topics.map((t) => ({
      id: t.id,
      title: t.title,
      mastery: t.mastery,
      explanations: t.explanations,
      doubts: t.doubts,
      quizzes: t.quizzes,
      questions: t.questions,
      correct: t.correct,
      lastScore: t.lastScore,
      weakPoints: t.weakPoints ? t.weakPoints.split("\n") : [],
      lastStudiedAt: t.lastStudiedAt,
      nextReviewAt: t.nextReviewAt,
    })),
  });
}

/** Apaga todo o progresso da pessoa neste ambiente. */
export async function DELETE(_request: Request, context: EnvContext) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  if (!access.userId) return error("Entre com sua conta para apagar o seu progresso.", 401);
  await clearLearning({ environmentId: access.environment.id, userId: access.userId });
  return json({ ok: true });
}

export { preflight as OPTIONS } from "../../../../_lib/http";
