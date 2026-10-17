import "server-only";
import { db } from "@/lib/db";

export async function getProfileImage(): Promise<string | null> {
  const settings = await db.siteSettings.findUnique({
    where: { id: "site" },
    select: { profileImageData: true },
  });
  return settings?.profileImageData ?? null;
}

export async function setProfileImage(profileImageData: string | null): Promise<void> {
  await db.siteSettings.upsert({
    where: { id: "site" },
    update: { profileImageData },
    create: { id: "site", profileImageData },
  });
}