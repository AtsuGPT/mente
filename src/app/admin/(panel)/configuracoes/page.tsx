import type { Metadata } from "next";
import { ProfileImageForm } from "@/components/admin/profile-image-form";
import { requireAdmin } from "@/lib/auth/session";
import { getProfileImage } from "@/server/site-settings";

export const metadata: Metadata = { title: "Configurações" };

export default async function AdminSettingsPage() {
  await requireAdmin();
  const profileImage = await getProfileImage();

  return (
    <>
      <p className="label">Administração</p>
      <h1 className="mb-4 mt-3 text-[2.5rem] font-light leading-none tracking-[-0.03em] md:text-5xl">Configurações</h1>
      <section aria-labelledby="foto-perfil" className="mt-12 border-t border-line pt-8">
        <h2 id="foto-perfil" className="label mb-8">Imagem do perfil</h2>
        <ProfileImageForm currentImage={profileImage} />
      </section>
    </>
  );
}