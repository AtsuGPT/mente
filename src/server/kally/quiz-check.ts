import { Script, createContext } from "node:vm";

/**
 * Conferência das questões que a Kally monta (pedido do dono do projeto, 15/11/2026: "se pedirem uma prova de 5
 * questões de eletricidade, as questões e os resultados têm que ser pré-montados e sempre conferidos").
 *
 * Cada questão com resposta numérica traz uma linha "= conta" (a conta em JavaScript que dá a resposta, com os números
 * do próprio enunciado). O servidor calcula a conta à parte e confere se a alternativa marcada como certa (*) tem esse
 * valor e se nenhuma errada tem o mesmo valor. Uma divergência volta para a Kally refazer antes de chegar à pessoa.
 *
 * A conta roda numa VM vazia (só as funções de Math), com tempo máximo de 50 ms e só com caracteres de aritmética: não
 * é possível rodar outra coisa por ela.
 */

export type QuizProblem = { question: number; text: string };

const MATH = Object.fromEntries(Object.getOwnPropertyNames(Math).map((k) => [k, (Math as unknown as Record<string, unknown>)[k]]));

/** Calcula a conta (só aritmética e funções de Math). null se não for uma conta válida. */
export function evaluate(expression: string): number | null {
  const expr = expression.trim().replace(/×/g, "*").replace(/÷/g, "/").replace(/\^/g, "**").replace(/π/g, "PI").replace(/√\s*\(/g, "sqrt(");
  if (!expr || expr.length > 300 || !/^[\d\s+\-*/().,%a-zA-Z_]*$/.test(expr)) return null;
  // Só nomes de Math (sqrt, PI, log...) e "e" de notação científica.
  for (const name of expr.match(/[a-zA-Z_]+/g) ?? []) if (!(name in MATH) && !/^e$/i.test(name)) return null;
  try {
    const value = new Script(`(${expr})`).runInContext(createContext({ ...MATH }), { timeout: 50 });
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** Números de um texto de alternativa, aceitando "1.126,83", "1126.83", "2,5 A", "3 × 10^4" (o primeiro número). */
export function numbersIn(text: string): number[] {
  const clean = text.replace(/\*\*/g, "").replace(/(\d)\s*[×x·]\s*10\s*\^?\s*(-?\d+)/g, (_, a, b) => `${a}e${b}`);
  const out: number[] = [];
  for (const m of clean.matchAll(/-?\d[\d.\s]*(?:,\d+)?(?:e-?\d+)?|-?\d+(?:\.\d+)?(?:e-?\d+)?/gi)) {
    let raw = m[0].replace(/\s/g, "");
    if (/,\d+$/.test(raw)) raw = raw.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, "");
    const n = Number(raw);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 0.011);

type Parsed = { prompt: string; options: { text: string; right: boolean }[]; expr: string | null };

function parseBlock(body: string): Parsed[] {
  const out: Parsed[] = [];
  let cur: Parsed | null = null;
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (t.startsWith("?")) {
      cur = { prompt: t.slice(1).trim(), options: [], expr: null };
      out.push(cur);
    } else if (cur && /^[-*]\s/.test(t)) cur.options.push({ text: t.slice(2).trim(), right: t.startsWith("*") });
    else if (cur && t.startsWith("=")) cur.expr = t.slice(1).trim();
  }
  return out;
}

/** Problemas de todas as questões ```quiz do texto (vazio = tudo conferido). */
export function checkQuizzes(text: string): { problems: QuizProblem[]; checked: number } {
  const problems: QuizProblem[] = [];
  let checked = 0;
  let index = 0;
  for (const m of text.matchAll(/```quiz[^\n]*\n([\s\S]*?)```/g)) {
    for (const q of parseBlock(m[1])) {
      index += 1;
      const right = q.options.filter((o) => o.right);
      if (q.options.length && right.length !== 1) problems.push({ question: index, text: `a questão ${index} tem ${right.length} alternativas marcadas como certas (precisa de exatamente uma)` });
      if (!q.expr || right.length !== 1) continue;
      const value = evaluate(q.expr);
      if (value === null) {
        problems.push({ question: index, text: `a conta da questão ${index} ("= ${q.expr}") não é uma conta válida; use só números, + - * / ** ( ) e funções como sqrt` });
        continue;
      }
      checked += 1;
      const shown = value.toLocaleString("pt-BR", { maximumSignificantDigits: 6 });
      if (!numbersIn(right[0].text).some((n) => close(n, value))) problems.push({ question: index, text: `na questão ${index}, a conta dá ${shown}, mas a alternativa marcada como certa é "${right[0].text}"` });
      const twin = q.options.find((o) => !o.right && numbersIn(o.text).some((n) => close(n, value)));
      if (twin) problems.push({ question: index, text: `na questão ${index}, a alternativa errada "${twin.text}" também tem o valor certo (${shown})` });
    }
  }
  return { problems, checked };
}
