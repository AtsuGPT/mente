import { useEffect, useMemo, useRef, useState } from "react";
import { getItem, setItem } from "@/lib/secure-storage";

/**
 * Frases curtas da Kally abaixo da órbita (uma por vez) e a saudação da tela vazia. Cada cenário tem várias versões,
 * sorteadas sem repetir a última; em tarefas longas, a frase troca sozinha. As etapas detalhadas (o texto que o
 * servidor manda) continuam no chat, na lista de etapas.
 */

export type PhraseKey = "listening" | "thinking" | "memory" | "research" | "docs" | "post" | "responding" | "done" | "error";

const PHRASES: Record<PhraseKey, string[]> = {
  listening: ["Ouvindo…", "Pode falar, estou ouvindo…", "Estou aqui, continue…", "Te ouvindo…"],
  thinking: ["Entendendo sua ideia…", "Pensando no que você pediu…", "Juntando as peças…", "Organizando as informações…"],
  memory: ["Consultando suas memórias…", "Lembrando do que você já me contou…", "Buscando nos seus pensamentos…", "Revendo o que já conversamos…"],
  research: ["Pesquisando referências…", "Procurando boas fontes…", "Vendo o que já se sabe sobre isso…", "Conferindo os dados…"],
  docs: ["Lendo o documento…", "Analisando o arquivo…", "Separando o que importa no texto…", "Passando pelas páginas…"],
  post: ["Escrevendo o rascunho…", "Dando forma ao seu post…", "Rascunhando as primeiras linhas…", "Ajustando o tom do texto…"],
  responding: ["Construindo sua resposta…", "Escrevendo pra você…", "Colocando em palavras…", "Montando a resposta…"],
  done: ["Quer ajustar alguma coisa?", "Pronto. Mudo algo?", "Se quiser, eu refino.", "Feito. E agora?"],
  error: ["Não consegui terminar. Tentamos de novo?", "Algo falhou no caminho. Quer repetir?", "Parei no meio. Posso tentar outra vez?"],
};

/** Tarefas longas: a frase troca a cada tanto (as de fim não trocam). */
const ROTATE_MS = 4_500;
const STEADY: PhraseKey[] = ["done", "error"];

const last: Partial<Record<string, number>> = {};
function pick(list: string[], key: string) {
  if (list.length < 2) return list[0];
  let i = Math.floor(Math.random() * list.length);
  if (i === last[key]) i = (i + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
  last[key] = i;
  return list[i];
}

/** A frase do cenário atual (ou "" sem cenário): sorteada ao entrar nele e trocada sozinha em tarefas longas. */
export function useKallyPhrase(key: PhraseKey | null) {
  const [phrase, setPhrase] = useState(() => (key ? pick(PHRASES[key], key) : ""));
  const current = useRef(key);
  useEffect(() => {
    if (key !== current.current) {
      current.current = key;
      setPhrase(key ? pick(PHRASES[key], key) : "");
    }
    if (!key || STEADY.includes(key)) return;
    const timer = setInterval(() => setPhrase(pick(PHRASES[key], key)), ROTATE_MS);
    return () => clearInterval(timer);
  }, [key]);
  return key ? phrase : "";
}

/* ------------------------------- saudação ------------------------------- */

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
function easter(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const FIXED_HOLIDAYS = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"];
const key = (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shift = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

/**
 * Feriado nacional no Brasil (fixos e os móveis: segunda e terça de Carnaval, Sexta-feira Santa, Corpus Christi).
 * O app não pede localização: vale a data do aparelho e os feriados nacionais.
 */
export function isHoliday(date: Date) {
  if (FIXED_HOLIDAYS.includes(key(date))) return true;
  const e = easter(date.getFullYear());
  return [-48, -47, -2, 60].some((offset) => key(shift(e, offset)) === key(date));
}

type Moment = "madrugada" | "manha" | "tarde" | "noite" | "sabado" | "domingo" | "feriado";

const GREETINGS: Record<Moment, ((n: string) => string)[]> = {
  // Neutras: a saudação vale para qualquer pessoa do app (nada de "acordado/acordada").
  madrugada: [(n) => `Ainda por aqui, ${n}?`, (n) => `Madrugada criativa, ${n}?`, (n) => `Sem sono, ${n}? Vamos pensar juntos.`, (n) => `Já é madrugada, ${n}. O que está na cabeça?`],
  manha: [(n) => `Bom dia, ${n}. O que vamos criar hoje?`, (n) => `Bom dia, ${n}. Por onde começamos?`, (n) => `Manhã nova, ${n}. Alguma ideia fresca?`, (n) => `Bom dia, ${n}. O que tem pra hoje?`],
  tarde: [(n) => `Boa tarde, ${n}. No que está pensando?`, (n) => `Boa tarde, ${n}. Alguma ideia nova?`, (n) => `Tarde boa pra criar, ${n}.`, (n) => `E aí, ${n}? Como está a tarde?`],
  noite: [(n) => `Boa noite, ${n}. Vamos continuar?`, (n) => `Boa noite, ${n}. O que ficou na cabeça hoje?`, (n) => `Noite tranquila, ${n}. Quer escrever algo?`, (n) => `Fim de dia, ${n}. O que vale guardar de hoje?`],
  sabado: [(n) => `Sábado tranquilo, ${n}. Alguma ideia nova?`, (n) => `Bom sábado, ${n}. O que vamos criar?`, (n) => `Sábado livre, ${n}? Bora tirar uma ideia do papel.`],
  domingo: [(n) => `Domingo calmo, ${n}. O que tem em mente?`, (n) => `Bom domingo, ${n}. Planejando a semana?`, (n) => `Domingo sem pressa, ${n}. No que está pensando?`],
  feriado: [(n) => `Feriado por aqui, ${n}. O que tem em mente?`, (n) => `Dia de folga, ${n}. Alguma ideia pra explorar?`, (n) => `Feriado tranquilo, ${n}. Vamos criar algo?`],
};

/** O momento do dia na hora local do aparelho; fim de semana e feriado valem fora da madrugada. */
export function momentOf(date: Date): Moment {
  const h = date.getHours();
  if (h < 5) return "madrugada";
  if (isHoliday(date)) return "feriado";
  if (date.getDay() === 6) return "sabado";
  if (date.getDay() === 0) return "domingo";
  return h < 12 ? "manha" : h < 18 ? "tarde" : "noite";
}

/** Primeiro nome do nome de exibição ("Atsu"), sem arroba nem espaços extras. */
export function firstName(displayName?: string | null) {
  const name = (displayName ?? "").trim().replace(/^@/, "").split(/\s+/)[0];
  return name || "";
}

const LAST_KEY = "minha-mente.kally-saudacao.v1";

/**
 * Saudação da tela vazia: uma frase curta para o nome, o horário, o fim de semana e o feriado, diferente da última
 * mostrada neste aparelho (a última fica guardada). Sem nome, a frase sai sem ele.
 */
export function useGreeting(displayName?: string | null) {
  const name = firstName(displayName);
  const moment = useMemo(() => momentOf(new Date()), []);
  const [index, setIndex] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const options = GREETINGS[moment];
    void getItem(LAST_KEY)
      .catch(() => null)
      .then((saved) => {
        if (!alive) return;
        const previous = saved?.startsWith(`${moment}:`) ? Number(saved.split(":")[1]) : -1;
        let i = Math.floor(Math.random() * options.length);
        if (options.length > 1 && i === previous) i = (i + 1) % options.length;
        setIndex(i);
        void setItem(LAST_KEY, `${moment}:${i}`).catch(() => undefined);
      });
    return () => {
      alive = false;
    };
  }, [moment]);
  if (index === null) return "";
  const text = GREETINGS[moment][index](name || "você");
  // Sem nome: "Bom dia, você." soa estranho; tira o vocativo.
  return name ? text : text.replace(/, você([.?!])/, "$1").replace(/, você\b/, "");
}
