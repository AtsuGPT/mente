"use server";

import { timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { burnPasswordCheck, verifyPassword } from "@/lib/auth/password";
import { checkLoginAllowed, clearLoginFailures, registerLoginFailure } from "@/lib/auth/rate-limit";
import { createAccessSession, createSession, destroyAccessSession, destroySession } from "@/lib/auth/session";
import { ROLES } from "@/lib/auth/role";

export type AccessLoginState = { error?: string };

function sameText(a: string, b: string) {
	const left = Buffer.from(a.trim().toLocaleLowerCase("en-US"));
	const right = Buffer.from(b.trim().toLocaleLowerCase("en-US"));
	return left.length === right.length && timingSafeEqual(left, right);
}

export async function accessLoginAction(_previous: AccessLoginState, formData: FormData): Promise<AccessLoginState> {
	const requestHeaders = await headers();
	const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
		|| requestHeaders.get("x-real-ip")
		|| "desconhecido";
	const key = `site:${ip}`;
	const gate = checkLoginAllowed(key);
	if (!gate.allowed) {
		const minutes = Math.max(1, Math.ceil(gate.retryAfterSeconds / 60));
		return { error: `Muitas tentativas. Tente novamente em ${minutes} min.` };
	}

	const username = String(formData.get("username") ?? "").trim().slice(0, 254);
	const password = String(formData.get("password") ?? "");
	if (username.length < 1 || password.length < 4 || password.length > 1024) {
		registerLoginFailure(key);
		return { error: "Usuário ou senha incorretos." };
	}

	let config;
	try {
		config = env();
	} catch (error) {
		console.error(error);
		return { error: "Configuração do servidor incompleta. Confira as variáveis de ambiente." };
	}

	const isAdmin = sameText(username, config.ADMIN_EMAIL);
	const siteUsername = process.env.SITE_USERNAME?.trim();
	const sitePasswordHash = process.env.SITE_PASSWORD_HASH;
	const isSiteUser = !!siteUsername && !!sitePasswordHash && sameText(username, siteUsername);
	let passwordOk = false;
	if (isAdmin) passwordOk = await verifyPassword(password, config.ADMIN_PASSWORD_HASH);
	else if (isSiteUser) passwordOk = await verifyPassword(password, sitePasswordHash);
	else await burnPasswordCheck(password);

	if (!passwordOk || (!isAdmin && !isSiteUser)) {
		registerLoginFailure(key);
		return { error: "Usuário ou senha incorretos." };
	}

	clearLoginFailures(key);
	if (isAdmin) await createSession(config.ADMIN_EMAIL);
	await createAccessSession(isAdmin ? ROLES.ADMIN : ROLES.INTIMATE);
	redirect("/");
}

export async function guestAccessAction() {
	await createAccessSession(ROLES.GUEST);
	redirect("/");
}

export async function logoutAccessAction() {
	await destroyAccessSession();
	await destroySession();
	redirect("/entrar");
}
