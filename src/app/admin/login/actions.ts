"use server";

import { timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/env";
import { burnPasswordCheck, verifyPassword } from "@/lib/auth/password";
import { checkLoginAllowed, clearLoginFailures, registerLoginFailure } from "@/lib/auth/rate-limit";
import { createSession, destroySession } from "@/lib/auth/session";

export type LoginState = { error?: string };

const credentials = z.object({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(4).max(1024),
});

function sameText(a: string, b: string) {
  const x = Buffer.from(a.toLowerCase());
  const y = Buffer.from(b.toLowerCase());
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Aceita apenas caminhos internos da área administrativa. */
function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/admin") && !next.startsWith("//") && !next.includes("\\") ? next : "/admin";
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";

  const gate = checkLoginAllowed(ip);
  if (!gate.allowed) {
    const minutes = Math.max(1, Math.ceil(gate.retryAfterSeconds / 60));
    return { error: `Muitas tentativas. Tente novamente em ${minutes} min.` };
  }

  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "Informe e-mail e senha." };

  let config;
  try {
    config = env();
  } catch (error) {
    console.error(error);
    return { error: "Configuração do servidor incompleta. Veja o README (variáveis de ambiente)." };
  }

  const emailOk = sameText(parsed.data.email, config.ADMIN_EMAIL);
  let passwordOk = false;
  if (emailOk) {
    passwordOk = await verifyPassword(parsed.data.password, config.ADMIN_PASSWORD_HASH);
  } else {
    await burnPasswordCheck(parsed.data.password);
  }

  if (!emailOk || !passwordOk) {
    registerLoginFailure(ip);
    return { error: "E-mail ou senha incorretos." };
  }

  clearLoginFailures(ip);
  await createSession(config.ADMIN_EMAIL);
  redirect(safeNext(formData.get("next")));
}

export async function logoutAction() {
  await destroySession();
  redirect("/admin/login");
}
