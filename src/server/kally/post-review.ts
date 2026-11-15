import "server-only";
import { completeChat } from "@/server/ai";
import type { WebResult } from "@/server/web-search";

/**
 * Revisão de fidelidade do post (Kally remota), antes de a pessoa ver o rascunho. Nos testes de 10/11 o 32B,
 * só com regras, ainda inventava frases sobre a pessoa ("A ideia era melhorar a saúde, talvez emagrecer"), tabelas
 * com expectativas que ela não contou, gênero que ela não revelou e "estudos" sem fonte.
 *
 * Primeira versão: o revisor devolvia trechos exatos e trocas; metade não batia com o texto e uma correção apagou
 * uma frase dela. Agora o rascunho vai numerado, frase por frase e linha por linha de tabela, e o revisor só diz
 * quais números afirmam sobre ela algo que ela não disse (essas saem) e quais palavras com gênero trocar. Frases
 * que repetem as dela nunca saem, confira-se o que o revisor disser.
 *
 *   KALLY_POST_REVIEW = "0" desliga (o rascunho volta a aparecer enquanto é escrito, sem revisão).
 */
export const postReviewEnabled = () => process.env.KALLY_POST_REVIEW !== "0";

const SYSTEM = [
  "Você é o revisor de fidelidade da Kally. Recebe (1) o que a pessoa escreveu, (2) as fontes externas e (3) as frases de um rascunho de post escrito na voz dela, numeradas.",
  "O post é casual e a Kally pode completar o texto com reflexões e sentimentos coerentes com o que ela disse (ela edita depois). Marque em \"remover\" só as frases com FATO CONCRETO sobre ela ou sobre gente da vida dela que ela NÃO escreveu: nome de pessoa, lugar, data, número, horário, cargo, disciplina, projeto, hobby, episódio ou fala específica (ex.: ela não falou de fotografia; \"meu hobby de fotografia ficou de lado\" sai; \"sinto que não tenho espaço para mais nada\" fica).",
  "Marque também afirmações de conhecimento SEM link que não estejam nas fontes (\"estudos apontam\", números, explicações científicas). Frase com link para uma das fontes não é marcada.",
  "NÃO marque: frases que repetem ou reformulam o que ela disse; reflexões, sentimentos e ligações gerais coerentes com o tema; explicações que vêm das fontes; títulos e subtítulos.",
  "Em \"genero\", quando ela não revelou o gênero no que escreveu, liste TODAS as frases com palavra que revela o gênero dela (adjetivos e particípios como motivado, cansada, pronto, perfeito, sozinha, envolvido, focado, \"a mim mesmo\") e dê cada uma reescrita inteira, mudando o mínimo, com substantivos ou verbos no lugar (ex.: {\"n\": 4, \"frase\": \"Quero voltar com ainda mais vontade.\"} para \"Quero voltar ainda mais motivado.\"; \"não sou perfeita\" vira \"nem tudo sai perfeito\"). Nunca use linguagem neutra com -e ou -x (animade, todes) e não troque por outra palavra com gênero. Confira frase por frase; não deixe passar nenhuma.",
  "Pronomes, possessivos e artigos (eu, me, meu, minha, meus, o, a) não são palavras de gênero sobre ela: nunca os liste. O post é em primeira pessoa: nenhuma troca põe \"a pessoa\", \"ela\" ou \"dela\" no texto.",
  "Em \"trocar\", reescreva frases boas que têm um detalhe concreto inventado no meio, em vez de remover a frase: atividades, tarefas e exemplos que ela não citou (ela disse \"trabalho\" e a frase diz \"respondo e-mails e participo de reuniões\"; ela disse \"projetos\" e a frase diz \"testar hipóteses\"), mudança de sentido (ela disse \"preciso de férias\" e a frase diz \"estou planejando tirar\") ou palavra repetida por engano (\"os dias dias\"). Dê a frase inteira reescrita, só sem o detalhe (ou com o sentido dela), natural e correta, sem palavras novas além das de ligação (ex.: {\"n\": 3, \"frase\": \"À tarde, foco no trabalho.\"}).",
  'Responda só com o JSON compacto: {"remover":[3,7],"genero":[{"n":4,"frase":"..."}],"trocar":[{"n":5,"frase":"..."}]}',
].join("\n");

export type PostReview = { text: string; applied: number; proposed: number; ms: number; ok: boolean };

const words = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

type Unit = { line: number; start: number; end: number; text: string; table: boolean };

/**
 * Frases do corpo e linhas de tabela, com a posição na linha. Títulos, citações, links e marcações ficam de fora.
 * Só o que está dentro de <rascunho>…</rascunho>: a frase de entendimento, a pergunta e as notas de fora são da
 * Kally para a pessoa, não do post (em 13/11 a revisão apagou a pergunta "qual detalhe você quer incluir?" de um
 * pedido sem matéria, a resposta saiu vazia e o post "não era criado"). Sem rascunho, nada é revisado.
 */
export function splitUnits(text: string): { lines: string[]; units: Unit[] } {
  const lines = text.split("\n");
  const units: Unit[] = [];
  const open = lines.findIndex((l) => /<rascunho>/i.test(l));
  if (open < 0) return { lines, units };
  const after = lines.slice(open + 1).findIndex((l) => /<\/rascunho>/i.test(l));
  const close = after < 0 ? lines.length : open + 1 + after;
  let fenced = false;
  let sideText = false;
  let figure = false;
  lines.forEach((raw, line) => {
    if (line <= open || line >= close) return;
    const t = raw.trim();
    if (t.startsWith("```")) {
      fenced = !fenced;
      figure = fenced && /^```\s*(desenho|imagem|figura)\b/i.test(t);
      sideText = false;
      return;
    }
    if (fenced && figure && /^-{3,}$/.test(t)) {
      sideText = true;
      return;
    }
    if (fenced && !sideText) return;
    if (!t || /^(#|>|:::|<\/?rascunho>|categorias:|- \[|\* \[)/i.test(t) || /^\|?\s*:?-{3,}/.test(t)) return;
    if (t.startsWith("|")) {
      units.push({ line, start: 0, end: raw.length, text: t, table: true });
      return;
    }
    // Pontos dentro de links e números (https://www.cdc.gov, 3.000) não terminam frase: a busca roda numa cópia sem eles.
    // O link inteiro ([texto](endereço)) fica numa frase só: cortar dentro dele deixava "](https://…) — g1" solto no post.
    const masked = raw.replace(/\[[^\]]*\]\([^)]*\)/g, (m) => m.replace(/[.!?…]/g, "_")).replace(/(\d)\.(\d)/g, "$1_$2");
    const re = /[^.!?…]+(?:[.!?…]+["”»)]?|$)\s*/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(masked)) && m[0]) {
      const piece = raw.slice(m.index, m.index + m[0].length);
      if (piece.trim().length >= 12) units.push({ line, start: m.index, end: m.index + m[0].length, text: piece.trim(), table: false });
      if (re.lastIndex >= raw.length) break;
    }
  });
  return { lines, units };
}

/**
 * Troca que o revisor pode fazer: nunca um pronome, possessivo ou artigo sozinho (em 15/11 ele trocou "meu" e "minha"
 * por "da pessoa" e o post saiu com "do da pessoa emprego"), e nunca pondo a terceira pessoa num post em primeira.
 */
const FUNCTION_WORDS = /^(eu|me|mim|comigo|meu|minha|meus|minhas|o|a|os|as|um|uma|ele|ela|seu|sua|seus|suas|dele|dela|nosso|nossa|que|de|do|da)$/i;
export function safeSwap(from: string, to: string) {
  if (FUNCTION_WORDS.test(from.trim())) return false;
  return !/(a pessoa|da pessoa|na pessoa|pela pessoa|dela|dele|ela|ele)/i.test(to);
}

/** Linguagem neutra com -e/-x ("animade", "todes", "elx"): o revisor chegou a usar; o post é no português dela. */
const NEUTRAL = /\b(animade|cansade|motivade|preparade|focade|todes|elu|elx|todxs|amigues)\b/i;

/**
 * A reescrita é a mesma frase, mais curta ou com outra palavra: 60% ou mais das palavras dela (de 3+ letras) já estavam
 * na original (não acrescenta conteúdo), ela guarda ao menos 30% da original e não cria palavra repetida em sequência
 * ("ao estudo: estudo").
 */
function sameSentence(original: string, rewrite: string) {
  const a = words(original).split(" ").filter((x) => x.length > 2);
  const b = words(rewrite).split(" ").filter((x) => x.length > 2);
  if (!a.length || !b.length) return false;
  const inA = new Set(a);
  const inB = new Set(b);
  const repeated = b.some((x, i) => i > 0 && b[i - 1] === x) && !a.some((x, i) => i > 0 && a[i - 1] === x);
  return !repeated && b.filter((x) => inA.has(x)).length / b.length >= 0.6 && a.filter((x) => inB.has(x)).length / a.length >= 0.3;
}

/** Tira as frases marcadas (nunca as que são dela), troca o gênero e arruma o que sobrar. */
export function applyReview(text: string, ownWords: string, remove: number[], gender: { n: number; de: string; para: string }[], sourceUrls: string[] = [], rewrites: { n: number; frase: string }[] = []) {
  const { lines, units } = splitUnits(text);
  const own = ` ${words(ownWords)} `;
  const isHers = (u: Unit) => {
    const w = words(u.text);
    if (!w) return false;
    if (own.includes(` ${w} `)) return true;
    // quase toda dela (reordenada ou com pontuação nova): 85% das palavras estão no que ela escreveu
    const list = w.split(" ").filter((x) => x.length > 2);
    return list.length > 0 && list.filter((x) => own.includes(` ${x} `)).length / list.length >= 0.85;
  };
  let applied = 0;
  const edits = new Map<number, { start: number; end: number; with: string }[]>();
  const push = (u: Unit, replacement: string) => {
    const list = edits.get(u.line) ?? [];
    list.push({ start: u.start, end: u.end, with: replacement });
    edits.set(u.line, list);
    applied += 1;
  };
  // Frase com link para uma das fontes é conhecimento citado: fica (o revisor apagava a explicação com a fonte).
  const cited = (u: Unit) => sourceUrls.some((url) => lines[u.line].slice(u.start, u.end).includes(url));
  for (const n of new Set(remove)) {
    const u = units[n - 1];
    if (!u || isHers(u) || cited(u)) continue;
    push(u, u.table ? "\u0000" : "");
  }
  // Frases reescritas sem gênero: entram só se forem a mesma frase (a maior parte das palavras igual), sem a terceira
  // pessoa e sem linguagem neutra com -e/-x.
  for (const r of rewrites) {
    const u = units[r.n - 1];
    if (!u || !r.frase.trim() || (edits.get(u.line) ?? []).some((e) => e.start === u.start)) continue;
    if (!sameSentence(u.text, r.frase) || !safeSwap("frase", r.frase) || NEUTRAL.test(r.frase)) continue;
    const original = lines[u.line].slice(u.start, u.end);
    const trailing = original.match(/\s*$/)?.[0] ?? "";
    push(u, r.frase.trim() + trailing);
  }
  // Trocas (gênero e detalhes generalizados): todas as da mesma frase, em sequência, sobre o texto original dela.
  const byUnit = new Map<number, { de: string; para: string }[]>();
  for (const g of gender) {
    if (!g.de || g.de === g.para || !safeSwap(g.de, g.para)) continue;
    byUnit.set(g.n, [...(byUnit.get(g.n) ?? []), g]);
  }
  for (const [n, list] of byUnit) {
    const u = units[n - 1];
    if (!u || (edits.get(u.line) ?? []).some((e) => e.start === u.start)) continue;
    const original = lines[u.line].slice(u.start, u.end);
    let changed = original;
    for (const g of list) {
      const re = new RegExp(`(?<![\\p{L}\\d])${g.de.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\d])`, "u");
      if (re.test(changed)) changed = changed.replace(re, g.para);
    }
    if (changed !== original) push(u, changed);
  }
  const out = lines.map((line, i) => {
    const list = (edits.get(i) ?? []).sort((a, b) => b.start - a.start);
    let l = line;
    for (const e of list) l = e.with === "\u0000" ? "\u0000" : l.slice(0, e.start) + e.with + l.slice(e.end);
    return l;
  });
  return { text: tidy(out.filter((l) => l !== "\u0000").join("\n")), applied };
}

/** Espaços, parágrafos vazios, tabela sem linhas e bloco :::details sem par. */
function tidy(text: string) {
  let lines = text.replace(/[ \t]{2,}/g, " ").replace(/ +([,.;:!?])/g, "$1").split("\n").map((l) => l.replace(/\s+$/, ""));
  // tabela que ficou só com cabeçalho e separador
  // (só linha de tabela, com "|": o "---" do bloco de figura, que separa o SVG do parágrafo, fica)
  lines = lines.filter((l, i) => !(/^\|?\s*:?-{3,}/.test(l.trim()) && l.includes("|") && !(lines[i + 1] ?? "").trim().startsWith("|")) || false);
  lines = lines.filter((l, i) => !(l.trim().startsWith("|") && !(lines[i + 1] ?? "").trim().startsWith("|") && !(lines[i - 1] ?? "").trim().startsWith("|")));
  // :::details sem fecho ganha fecho; ::: sem abertura sai
  const out: string[] = [];
  let open = false;
  for (const l of lines) {
    if (/^:::details\[/.test(l.trim())) {
      if (open) out.push(":::");
      open = true;
    } else if (l.trim() === ":::") {
      if (!open) continue;
      open = false;
    } else if (/^<\/rascunho>/.test(l.trim()) && open) {
      out.push(":::");
      open = false;
    }
    out.push(l);
  }
  if (open) out.push(":::");
  return out
    .join("\n")
    // bloco recolhível que ficou vazio
    .replace(/^:::details\[[^\]]*\]\s*\n(\s*\n)*:::\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}

export async function reviewPostFidelity(input: { ownWords: string; sources: WebResult[]; draft: string }): Promise<PostReview> {
  const started = Date.now();
  const { units } = splitUnits(input.draft);
  if (!units.length) return { text: input.draft, applied: 0, proposed: 0, ms: 0, ok: true };
  const sources = input.sources.length ? input.sources.map((s, i) => `[E${i + 1}] ${s.title} — ${s.url}\n${s.snippet}`).join("\n\n") : "(nenhuma fonte)";
  const numbered = units.map((u, i) => `${i + 1}. ${u.text}`).join("\n");
  try {
    const raw = await completeChat(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: `(1) O QUE A PESSOA ESCREVEU:\n"""${input.ownWords.slice(0, 4_000)}"""\n\n(2) FONTES:\n${sources.slice(0, 7_000)}\n\n(3) FRASES DO RASCUNHO:\n${numbered}` },
      ],
      // Sem raciocínio: com ele (15/11), a revisão levava de 15 a 21 s e falhava em 4 de 6 rascunhos.
      { target: "remote", json: true, temperature: 0, maxTokens: 900, timeoutMs: 30_000, think: false },
    );
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { remover?: unknown; genero?: unknown; trocar?: unknown };
    const remove = (Array.isArray(parsed.remover) ? parsed.remover : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    const rewrites = [...(Array.isArray(parsed.genero) ? parsed.genero : []), ...(Array.isArray(parsed.trocar) ? parsed.trocar : [])]
      .filter((g): g is { n: unknown; frase: unknown } => !!g && typeof g === "object" && "frase" in g)
      .map((g) => ({ n: Number(g.n), frase: String(g.frase ?? "") }))
      .filter((g) => Number.isInteger(g.n) && g.frase);
    const gender = [...(Array.isArray(parsed.genero) ? parsed.genero : []), ...(Array.isArray(parsed.trocar) ? parsed.trocar : [])]
      .filter((g): g is { n: unknown; de: unknown; para: unknown } => !!g && typeof g === "object")
      .map((g) => ({ n: Number(g.n), de: String(g.de ?? ""), para: String(g.para ?? "") }))
      .filter((g) => Number.isInteger(g.n) && g.de);
    const { text, applied } = applyReview(input.draft, input.ownWords, remove, gender, input.sources.map((s) => s.url), rewrites);
    // Rascunho que ficaria sem nenhuma frase do corpo: a revisão errou a mão (ou o rascunho era quase todo inventado);
    // fica o original, em vez de uma resposta vazia.
    if (!splitUnits(text).units.length) return { text: input.draft, applied: 0, proposed: remove.length + gender.length, ms: Date.now() - started, ok: false };
    return { text, applied, proposed: remove.length + gender.length + rewrites.length, ms: Date.now() - started, ok: true };
  } catch (cause) {
    console.warn("Kally revisão do post: sem revisão:", cause instanceof Error ? cause.message : cause);
    return { text: input.draft, applied: 0, proposed: 0, ms: Date.now() - started, ok: false };
  }
}
