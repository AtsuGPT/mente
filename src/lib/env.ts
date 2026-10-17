import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL não definida"),
  SITE_URL: z.string().url().default("http://localhost:3000"),
  ADMIN_EMAIL: z.string().email("ADMIN_EMAIL inválido"),
  ADMIN_PASSWORD_HASH: z.string().min(1, "ADMIN_PASSWORD_HASH não definida (rode: npm run admin:hash)"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET precisa ter pelo menos 32 caracteres"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/**
 * Lê e valida as variáveis de ambiente sob demanda (não na importação),
 * para que páginas públicas não dependam das credenciais administrativas
 * durante o build.
 */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuração de ambiente inválida:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** URL pública do site, sem barra final. Tolerante a ausência de configuração. */
export function siteUrl(): string {
  const raw = process.env.SITE_URL || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}
