/**
 * Limpeza da resposta da Kally antes de chegar à pessoa.
 *
 * O prompt marca o material com [P1], [D1], [C1], [I1] e [E1] para o modelo se orientar, e chama tudo de "material".
 * Mesmo com a regra explícita, o modelo de 4B repetia esses rótulos na resposta ("como diz o pensamento [P1]",
 * "o material fornecido não menciona"): 3 de 40 respostas na versão 5 e 6 de 40 na versão 6 (teste A/B local,
 * rubrica v2). Quem lê não sabe o que é [P1] (calibração humana). A limpeza é determinística e só toca nesses
 * rótulos internos e o "Não encontrou" em terceira pessoa no começo de frase; o resto do texto passa como veio.
 */

// Também a forma do GPT-OSS: 【E3】 ou 【E3†L1-L4】 (teste de 15/11: "【E3】" aparecia no fim da resposta).
const LABEL = String.raw`[\[【](?:P|D|C|I|E)(?:\d{1,2}|…|\.\.\.)(?:†[^\]】\n]{0,16})?[\]】]`;
/** Rótulo logo depois de aspas ("[P1] Guia…"): sai junto com o espaço que vem depois. */
const QUOTED_MARKER = new RegExp(String.raw`(["“«])${LABEL}[ \t]*`, "g");
const MARKER = new RegExp(String.raw`[ \t]?${LABEL}`, "g");

/** "no material fornecido" → "no ambiente", preservando a preposição e a maiúscula. */
const PROVIDED = /\b(n|d)?([oO])s? materia(?:l|is) fornecidos?\b/g;
const BARE = /\bmateria(?:l|is) fornecidos?\b/g;
const THIRD_PERSON = /(^|[.!?]\s+|\n\s*)Não encontrou\b/g;

/** "(https://…)" solto, sem o [texto] antes: o modelo às vezes cita assim, e na tela fica um endereço enorme. */
// O caractere de antes entra no padrão: no streaming, ele fica retido junto e o espaço antes do link sai certo.
const BARE_LINK = /(^|[^\]])\(\s*(https?:\/\/[^\s()]+)\s*\)/g;
function linkLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "fonte";
  }
}

/** Rótulo usado como texto do link ("[E2](https://…)"): o texto vira o nome do site. */
const LINKED_LABEL = new RegExp(String.raw`${LABEL}\((https?:\/\/[^\s()]+)\)`, "g");

export function cleanAnswer(text: string): string {
  return text
    .replace(LINKED_LABEL, (_all, url: string) => `[${linkLabel(url)}](${url})`)
    .replace(QUOTED_MARKER, "$1")
    .replace(MARKER, "")
    .replace(BARE_LINK, (_all, before: string, url: string) => `${before}${before && !/\s/.test(before) ? " " : ""}[${linkLabel(url)}](${url})`)
    .replace(PROVIDED, (_all, prep: string | undefined, article: string) => `${prep ?? ""}${prep ? "o" : article} ambiente`)
    .replace(BARE, "ambiente")
    // "Não encontrou nada no ambiente": a regra pedia "diga que não encontrou" e o modelo copiava a terceira pessoa
    // (7 de 80 respostas no A/B v7 × v8). Só no começo de frase, onde o sujeito só pode ser a própria Kally.
    .replace(THIRD_PERSON, "$1Não encontrei");
}

/**
 * Corte do streaming fora de links: nunca dentro de "[texto]", "【E1】" ou "(https://…)" ainda abertos no ponto do
 * corte, nunca entre o "]" e o "(" de um link e nunca logo antes de "(" (o padrão do link cru olha o caractere de
 * antes). Em 15/11 o corte caía em "[E2" + "](https://…)" e o rótulo escapava da limpeza. Links não passam de uma
 * linha; um parêntese aberto fica retido no máximo 600 caracteres.
 */
function outsideLinks(text: string, at: number) {
  let cut = at;
  for (let i = cut - 1; i >= 0 && i >= at - 600 && text[i] !== "\n"; i--) {
    const ch = text[i];
    if (ch !== "(" && ch !== "[" && ch !== "【") continue;
    const end = text.indexOf(ch === "(" ? ")" : ch === "[" ? "]" : "】", i);
    if (end === -1 || end >= cut) cut = i;
  }
  if (text[cut] === "(") {
    const before = text[cut - 1];
    const opener = before === "]" ? text.lastIndexOf("[", cut - 1) : before === "】" ? text.lastIndexOf("【", cut - 1) : -1;
    cut = opener >= 0 ? opener : Math.max(0, cut - 1);
  }
  return cut;
}

/** Maior trecho que um rótulo pode ocupar ("dos materiais fornecidos"): o fim do texto fica retido até ter certeza. */
const HOLD = 32;

/**
 * Versão para streaming. Um rótulo pode chegar picado ("[P", "1]"; "materiais fornecido", "s"), então só sai o texto
 * que já não pode mudar: tudo menos os últimos HOLD caracteres, e nunca cortando um rótulo ao meio. Como nenhum rótulo
 * passa de HOLD caracteres, um que comece antes do corte já chegou inteiro.
 */
export function createAnswerCleaner() {
  let pending = "";
  return {
    push(chunk: string): string {
      pending += chunk;
      if (pending.length <= HOLD) return "";
      let cut = pending.length - HOLD;
      for (const pattern of [QUOTED_MARKER, MARKER, PROVIDED, BARE, THIRD_PERSON]) {
        for (const match of pending.matchAll(pattern)) {
          const start = match.index ?? 0;
          if (start < cut && start + match[0].length >= cut) cut = start;
        }
      }
      cut = outsideLinks(pending, cut);
      // Não corta no meio de um par substituto (emoji).
      const code = pending.charCodeAt(cut - 1);
      if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
      if (cut <= 0) return "";
      const out = cleanAnswer(pending.slice(0, cut));
      pending = pending.slice(cut);
      return out;
    },
    flush(): string {
      const out = cleanAnswer(pending);
      pending = "";
      return out;
    },
  };
}
