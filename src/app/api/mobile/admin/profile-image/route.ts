import { revalidatePath } from "next/cache";
import { detectImage } from "@/lib/uploads";
import { setProfileImage } from "@/server/site-settings";
import { error, json, requireAdminRequest } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mesmo limite de saveProfileImageAction (admin/actions.ts).
const MAX_PROFILE_BYTES = 700 * 1024;

/** Troca a foto de perfil (campo "profileImage" do FormData). */
export async function PUT(request: Request) {
  const admin = await requireAdminRequest();
  if (admin instanceof Response) return admin;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return error("Não consegui ler a imagem.", 400);
  }

  const file = formData.get("profileImage");
  if (!(file instanceof File) || file.size === 0) return error("Escolha uma imagem para enviar.", 400);
  if (file.size > MAX_PROFILE_BYTES) return error("A imagem deve ter no máximo 700 KB.", 413);

  const bytes = Buffer.from(await file.arrayBuffer());
  const detected = detectImage(bytes);
  if (!detected) return error("Envie uma imagem JPG, PNG ou WebP válida.", 415);

  await setProfileImage(`data:${detected.mime};base64,${bytes.toString("base64")}`);
  revalidatePath("/", "layout");
  return json({ ok: true });
}

export async function DELETE() {
  const admin = await requireAdminRequest();
  if (admin instanceof Response) return admin;

  await setProfileImage(null);
  revalidatePath("/", "layout");
  return json({ ok: true });
}

export { preflight as OPTIONS } from "../../_lib/http";
