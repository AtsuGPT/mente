import { gpuStatus, startGpu, stopGpu } from "@/server/ai/gpu";
import { remoteConfig, remoteHealth } from "@/server/ai/remote";
import { findUserById } from "@/server/users";
import { error, json, readJson, requireUser } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isPlatformAdmin = async (userId: string) => (await findUserById(userId))?.legacyKind === "ADMIN";

/**
 * Modelo remoto e GPU sob demanda (só o administrador da plataforma). Nada aqui expõe endereço
 * nem chave do vLLM ou do Vast.ai: só estados, custo estimado e o modelo servido.
 */
export async function GET() {
  const userId = await requireUser();
  if (userId instanceof Response) return userId;
  if (!(await isPlatformAdmin(userId))) return error("Só o administrador da plataforma vê a GPU.", 403);
  const cfg = remoteConfig();
  const status = await gpuStatus();
  return json({
    remote: { enabled: cfg.enabled, model: cfg.model || null, state: status.remote.state, maxModelLen: status.remote.maxModelLen, latencyMs: status.remote.latencyMs, detail: status.remote.detail },
    gpu: { enabled: status.enabled, instance: status.instance, intended: status.intended, dph: status.dph, spentTodayUsd: status.spentTodayUsd, startsToday: status.startsToday, lastRemoteUseAt: status.lastRemoteUseAt, lastError: status.lastError },
  });
}

/** { acao: "ligar" | "desligar" | "verificar" } */
export async function POST(request: Request) {
  const userId = await requireUser();
  if (userId instanceof Response) return userId;
  if (!(await isPlatformAdmin(userId))) return error("Só o administrador da plataforma liga ou desliga a GPU.", 403);
  const body = await readJson(request, 1_024);
  if (body instanceof Response) return body;
  if (body.acao === "verificar") return json({ remote: await remoteHealth(true) });
  if (body.acao !== "ligar" && body.acao !== "desligar") return error('Use { "acao": "ligar" | "desligar" | "verificar" }.', 400);
  const result = body.acao === "ligar" ? await startGpu("pedido do administrador") : await stopGpu("pedido do administrador");
  return json(result, { status: result.ok ? 200 : 409 });
}
