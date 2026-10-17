// Datas sempre exibidas no fuso de Brasília, independentemente do servidor.
const TIME_ZONE = "America/Sao_Paulo";

const long = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: TIME_ZONE,
});

const short = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: TIME_ZONE,
});

const withTime = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});

export const formatDateLong = (d: Date) => long.format(d);
export const formatDateShort = (d: Date) => short.format(d).replace(/\./g, "");
export const formatDateTime = (d: Date) => withTime.format(d).replace(/\./g, "");

/** "007" */
export const formatNumber = (n: number) => String(n).padStart(3, "0");

/* ------------------------------------------------------------------ */
/* <input type="datetime-local"> ⇄ Date, sempre no fuso do site.       */
/* O valor do campo não carrega fuso; interpretamos como horário de    */
/* Brasília, o mesmo usado para exibir as datas publicamente.          */
/* ------------------------------------------------------------------ */

const partsFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function zonedParts(date: Date) {
  const p: Record<string, number> = {};
  for (const part of partsFormat.formatToParts(date)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  return p;
}

/** Diferença (ms) entre o horário local do site e UTC no instante informado. */
function zoneOffsetMs(date: Date) {
  const p = zonedParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(date.getTime() / 60_000) * 60_000;
}

/** Date → "YYYY-MM-DDTHH:mm" no horário de Brasília. */
export function toDatetimeLocal(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return "";
  const p = zonedParts(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** "YYYY-MM-DDTHH:mm" (horário de Brasília) → Date, ou null se inválido. */
export function fromDatetimeLocal(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  if (Number.isNaN(asUtc)) return null;

  let result = new Date(asUtc - zoneOffsetMs(new Date(asUtc)));
  const refined = new Date(asUtc - zoneOffsetMs(result)); // ajuste fino em transições de horário
  if (refined.getTime() !== result.getTime()) result = refined;

  // Rejeita datas inexistentes (ex.: 31 de fevereiro).
  return toDatetimeLocal(result) === value.trim() ? result : null;
}
