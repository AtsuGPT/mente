/**
 * Contratos dos blocos interativos que o app desenha (mobile/src/lib/blocks.ts lê o mesmo formato): o servidor confere
 * cada bloco antes de a resposta ficar pronta e converte o que estiver fora do contrato em texto comum (uma lista), em
 * vez de deixar o app mostrar um componente quebrado.
 *
 *   ```escolhas   ? pergunta opcional, 2 a 5 linhas "- opção" (curtas). Um bloco por resposta.
 *   ```progresso  "titulo: …" e linhas "- [x] etapa | estado | detalhe".
 */

const FENCE = /(`{3,})(escolhas|progresso)[^\n]*\n([\s\S]*?)\n?\1/g;

function choicesValid(body: string) {
  const options = body.split("\n").map((l) => l.trim()).filter((l) => /^([-*+]|\d+[.)])\s+\S/.test(l));
  return options.length >= 2 && options.length <= 5 && options.every((o) => o.length <= 130);
}

const progressValid = (body: string) => body.split("\n").some((l) => /^\s*[-*]\s*\[[ xX]\]\s*\S/.test(l));

/** Bloco fora do contrato vira texto: a pergunta como parágrafo e as linhas como lista. */
function asText(body: string) {
  return body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^\?\s*/, "").replace(/^t[ií]tulo\s*:\s*/i, "**").replace(/^(\*\*.+)$/, "$1**").replace(/^[-*]\s*\[[ xX]\]\s*/, "- ").replace(/\s*\|\s*/g, " · "))
    .join("\n");
}

export function normalizeBlocks(text: string): { text: string; fixed: number } {
  let fixed = 0;
  let choices = 0;
  const out = text.replace(FENCE, (whole, _fence: string, kind: string, body: string) => {
    if (kind === "escolhas") {
      choices += 1;
      if (choices === 1 && choicesValid(body)) return whole;
    } else if (progressValid(body)) return whole;
    fixed += 1;
    return asText(body);
  });
  return { text: out, fixed };
}

/** Houve escolhas ou quiz nas últimas respostas da Kally (para não repetir recurso interativo sem necessidade). */
export function recentInteractive(history: { role: string; content: string }[]) {
  return history
    .filter((m) => m.role === "assistant")
    .slice(-2)
    .some((m) => /```(escolhas|quiz)\b/.test(m.content));
}
