import { site } from "@/config/site";
import { getProfileImage } from "@/server/site-settings";
import { isAdminRole, json, requireRole } from "../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Valida o token guardado no app e devolve o papel e a identidade do site. */
export async function GET() {
  const role = await requireRole();
  if (role instanceof Response) return role;
  return json({
    role,
    isAdmin: isAdminRole(role),
    site: { name: site.name, author: site.author, authorHandle: site.authorHandle, tagline: site.tagline },
    profileImage: await getProfileImage(),
  });
}

export { preflight as OPTIONS } from "../_lib/http";
