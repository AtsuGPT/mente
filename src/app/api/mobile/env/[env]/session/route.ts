import { environmentImage } from "@/server/environments";
import { envAccess, json, type EnvContext } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Identidade do ambiente e o que esta pessoa pode fazer nele. */
export async function GET(_request: Request, context: EnvContext) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  return json({
    environment: access.environment,
    role: access.role,
    permissions: access.permissions,
    image: await environmentImage(access.environment),
  });
}

export { preflight as OPTIONS } from "../../../_lib/http";
