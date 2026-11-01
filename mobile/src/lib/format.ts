import { formatDateLong as longFormat, formatDateShort as shortFormat, formatNumber } from "@shared/format";

/**
 * Datas no fuso de Brasília, com as mesmas funções do site (src/lib/format.ts).
 * Se o Intl do dispositivo não suportar timeZone, cai para o formato local.
 */

function safe(format: (date: Date) => string, value: string | Date | null | undefined) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  try {
    return format(date);
  } catch {
    return date.toLocaleDateString("pt-BR");
  }
}

export const formatDateShort = (value: string | Date | null | undefined) => safe(shortFormat, value);
export const formatDateLong = (value: string | Date | null | undefined) => safe(longFormat, value);
export { formatNumber };

/** "@nome" para contas novas; a conta antiga do site usa o e-mail como nome e fica sem o @. */
export const formatHandle = (username: string) => (username.includes("@") ? username : `@${username}`);
