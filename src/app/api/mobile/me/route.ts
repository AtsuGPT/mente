import { findUserById } from "@/server/users";
import { error, json, requireUser } from "../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Valida o token guardado no app e devolve a conta. */
export async function GET() {
  const userId = await requireUser();
  if (userId instanceof Response) return userId;
  const user = await findUserById(userId);
  return user ? json({ user }) : error("Sessão expirada. Entre novamente.", 401);
}

export { preflight as OPTIONS } from "../_lib/http";
