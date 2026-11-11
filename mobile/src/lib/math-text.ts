/**
 * Fórmulas e marcações que o app não desenha, convertidas em texto legível (cópia idêntica em
 * src/server/kally/math-text.ts, para o texto salvo e o rascunho publicado).
 *
 * O app (e o editor) não têm LaTeX: numa explicação de regressão linear do modo aprofundado (11/11/2026) as
 * fórmulas saíram como "math" e "\cdot". Aqui:
 *   - $…$, $$…$$, \(…\), \[…\] e blocos ```math/```latex/```tex viram texto com símbolos Unicode
 *     (ŷ = β₀ + β₁·x, x², √x, Σ, ≤); fórmula de bloco fica numa linha própria, em bloco de código simples;
 *   - comandos soltos fora de $ (\cdot, \times, \beta…) também;
 *   - HTML que escapou (<br>, <sup>, <sub>, <b>, <i>) vira Markdown;
 *   - código (``` e `…`) e valores como "R$ 5.000" não são tocados.
 */

const GREEK: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ",
  iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ",
  phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π",
  Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
};
const SYMBOLS: Record<string, string> = {
  cdot: "·", times: "×", div: "÷", pm: "±", mp: "∓", leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠", approx: "≈",
  sim: "∼", simeq: "≃", equiv: "≡", propto: "∝", infty: "∞", sum: "Σ", prod: "∏", int: "∫", oint: "∮", partial: "∂",
  nabla: "∇", to: "→", rightarrow: "→", leftarrow: "←", Rightarrow: "⇒", Leftarrow: "⇐", leftrightarrow: "↔",
  Leftrightarrow: "⇔", implies: "⇒", iff: "⇔", mapsto: "↦", in: "∈", notin: "∉", ni: "∋", subset: "⊂", subseteq: "⊆",
  supset: "⊃", supseteq: "⊇", cup: "∪", cap: "∩", emptyset: "∅", varnothing: "∅", forall: "∀", exists: "∃", neg: "¬",
  land: "∧", lor: "∨", wedge: "∧", vee: "∨", ldots: "…", dots: "…", cdots: "⋯", vdots: "⋮", ddots: "⋱", circ: "∘",
  degree: "°", prime: "′", ast: "∗", star: "⋆", bullet: "•", angle: "∠", perp: "⊥", parallel: "∥", mid: "∣", ll: "≪", gg: "≫",
  langle: "⟨", rangle: "⟩", lfloor: "⌊", rfloor: "⌋", lceil: "⌈", rceil: "⌉", hbar: "ℏ", ell: "ℓ", Re: "ℜ", Im: "ℑ",
  percent: "%", "%": "%", "$": "$", "&": "&", "#": "#", "_": "_", "{": "{", "}": "}", ",": " ", ";": " ", ":": " ", "!": "",
  quad: " ", qquad: "  ", " ": " ",
};
const WORDS = ["lim", "log", "ln", "exp", "sin", "cos", "tan", "cot", "sec", "csc", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "max", "min", "sup", "inf", "det", "arg", "deg", "gcd", "mod", "Pr", "var", "Var", "Cov", "cov", "E"];
const SETS: Record<string, string> = { R: "ℝ", N: "ℕ", Z: "ℤ", Q: "ℚ", C: "ℂ", P: "ℙ" };
const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ", T: "ᵀ", k: "ᵏ", m: "ᵐ", x: "ˣ", y: "ʸ", "*": "*", "′": "′" };
const SUB: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎", a: "ₐ", e: "ₑ", o: "ₒ", x: "ₓ", h: "ₕ", k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ", p: "ₚ", s: "ₛ", t: "ₜ", i: "ᵢ", j: "ⱼ", r: "ᵣ", u: "ᵤ", v: "ᵥ" };
const ACCENT: Record<string, string> = { hat: "̂", widehat: "̂", bar: "̄", overline: "̄", tilde: "̃", widetilde: "̃", vec: "⃗", dot: "̇", ddot: "̈" };

/** O que vem depois de ^ ou _: {grupo} ou um caractere só. */
function readArg(s: string, at: number): [string, number] {
  if (s[at] === "{") {
    let depth = 0;
    for (let i = at; i < s.length; i++) {
      if (s[i] === "{") depth++;
      else if (s[i] === "}" && --depth === 0) return [s.slice(at + 1, i), i + 1];
    }
    return [s.slice(at + 1), s.length];
  }
  if (s[at] === "\\") {
    const m = /^\\[A-Za-z]+/.exec(s.slice(at));
    if (m) return [m[0], at + m[0].length];
  }
  return [s[at] ?? "", at + 1];
}

function script(text: string, map: Record<string, string>, mark: string) {
  const plain = convertInner(text).trim();
  const chars = Array.from(plain);
  if (chars.length && chars.every((c) => map[c])) return chars.map((c) => map[c]).join("");
  return chars.length === 1 ? `${mark}${plain}` : `${mark}(${plain})`;
}

/** Converte o miolo de uma fórmula (sem os $). */
function convertInner(input: string): string {
  let s = input;
  // \frac{a}{b} e \sqrt{x} (com aninhamento: repete até não mudar)
  for (let guard = 0; guard < 20; guard++) {
    const before = s;
    s = s.replace(/\\[dt]?frac\s*\{((?:[^{}]|\{[^{}]*\})*)\}\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, (_m, a: string, b: string) => {
      const x = convertInner(a).trim();
      const y = convertInner(b).trim();
      const wrap = (v: string) => (/^[\p{L}\p{N}.·′²³ⁿ₀-₉]+$/u.test(v) ? v : `(${v})`);
      return `${wrap(x)}/${wrap(y)}`;
    });
    s = s.replace(/\\sqrt\s*\[([^\]]*)\]\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, (_m, n: string, x: string) => `${script(n, SUP, "^")}√(${convertInner(x).trim()})`);
    s = s.replace(/\\sqrt\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, (_m, x: string) => {
      const v = convertInner(x).trim();
      return /^[\p{L}\p{N}]+$/u.test(v) ? `√${v}` : `√(${v})`;
    });
    s = s.replace(/\\(hat|widehat|bar|overline|tilde|widetilde|vec|dot|ddot)\s*\{([^{}]*)\}/g, (_m, a: string, x: string) => {
      const v = convertInner(x).trim();
      return Array.from(v).length === 1 ? `${v}${ACCENT[a]}` : a === "overline" || a === "bar" ? `${v}̅` : `${v}${ACCENT[a]}`;
    });
    s = s.replace(/\\(hat|bar|tilde|vec|dot)\s+([A-Za-z])/g, (_m, a: string, x: string) => `${x}${ACCENT[a]}`);
    s = s.replace(/\\(?:text|textrm|textit|textbf|mathrm|mathit|mathbf|mathsf|mathtt|operatorname|boldsymbol|mbox)\s*\{([^{}]*)\}/g, "$1");
    s = s.replace(/\\mathbb\s*\{([A-Z])\}/g, (_m, c: string) => SETS[c] ?? c);
    if (s === before) break;
  }
  s = s.replace(/\\left\s*|\\right\s*|\\big[lr]?\s*|\\Big[lr]?\s*/g, "");
  s = s.replace(/\\(?:begin|end)\s*\{[^{}]*\}/g, "");
  s = s.replace(/\\\\/g, "\n").replace(/&/g, " ");
  s = s.replace(/\\([A-Za-z]+|[,;:! %$&#_{}])/g, (m, name: string) => {
    if (GREEK[name]) return GREEK[name];
    if (SYMBOLS[name] !== undefined) return SYMBOLS[name];
    if (WORDS.includes(name)) return name;
    return name.length > 1 ? name : m;
  });
  // ^ e _ (depois dos comandos, para \beta_0 virar β₀)
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if ((c === "^" || c === "_") && i + 1 < s.length) {
      const [arg, next] = readArg(s, i + 1);
      out += script(arg, c === "^" ? SUP : SUB, c);
      i = next - 1;
      continue;
    }
    out += c;
  }
  // Σ, ∏ e ∫ separados do que vem antes ("1/nΣ" → "1/n Σ")
  return out.replace(/[{}]/g, "").replace(/([^\s(])([Σ∏∫])/gu, "$1 $2").replace(/[ \t]{2,}/g, " ");
}

/** Comandos soltos (fora de $): só os conhecidos, para não estragar uma barra invertida que seja texto. */
const LOOSE = new RegExp(String.raw`\\(${[...Object.keys(GREEK), ...Object.keys(SYMBOLS).filter((k) => /^[A-Za-z]+$/.test(k))].join("|")})(?![A-Za-z])`, "g");

function convertText(text: string): string {
  let s = text;
  // HTML que escapou
  s = s.replace(/<sup>([^<]{1,20})<\/sup>/gi, (_m, x: string) => script(x, SUP, "^"));
  s = s.replace(/<sub>([^<]{1,20})<\/sub>/gi, (_m, x: string) => script(x, SUB, "_"));
  s = s.replace(/<\/?(?:b|strong)>/gi, "**").replace(/<\/?(?:i|em)>/gi, "*");
  s = s
    .split("\n")
    .map((line) => (line.trimStart().startsWith("|") ? line.replace(/<br\s*\/?>/gi, " · ") : line.replace(/<br\s*\/?>/gi, "  \n")))
    .join("\n");
  // fórmulas de bloco: $$…$$ e \[…\] numa linha própria
  s = s.replace(/\$\$([\s\S]{1,1200}?)\$\$/g, (_m, x: string) => `\n\n\`\`\`\n${convertInner(x).trim()}\n\`\`\`\n\n`);
  s = s.replace(/\\\[([\s\S]{1,1200}?)\\\]/g, (_m, x: string) => `\n\n\`\`\`\n${convertInner(x).trim()}\n\`\`\`\n\n`);
  // fórmulas na linha: \(…\) e $…$ (não pega R$ 5.000 nem "custa $5 e $10")
  s = s.replace(/\\\(([\s\S]{1,400}?)\\\)/g, (_m, x: string) => convertInner(x).trim());
  s = s.replace(/(^|[^\\\p{L}\p{N}$])\$(?=[^\s$\d])([^$\n]{1,300}?[^\s$\\])\$(?![\p{L}\p{N}])/gu, (_m, pre: string, x: string) => `${pre}${convertInner(x)}`);
  s = s.replace(LOOSE, (_m, name: string) => GREEK[name] ?? SYMBOLS[name] ?? name);
  return s.replace(/\n{3,}/g, "\n\n");
}

/** Converte o texto inteiro, sem tocar em código (``` … ``` e `…`), exceto blocos math/latex/tex. */
export function latexToText(markdown: string): string {
  if (!markdown || !/[\\$<]|```\s*(?:math|latex|tex)/i.test(markdown)) return markdown;
  const parts = markdown.split(/(```[^\n]*\n[\s\S]*?(?:\n```|$))/g);
  return parts
    .map((part) => {
      const fence = /^```\s*([^\n]*)\n([\s\S]*?)(?:\n```)?$/.exec(part);
      if (fence) {
        if (/^(?:math|latex|tex|katex)$/i.test(fence[1].trim())) return `\`\`\`\n${convertInner(fence[2]).trim()}\n\`\`\``;
        return part;
      }
      return part
        .split(/(`[^`\n]+`)/g)
        .map((piece, i) => (i % 2 ? piece : convertText(piece)))
        .join("");
    })
    .join("");
}
