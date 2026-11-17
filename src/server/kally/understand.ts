import { detectIntent, type KallyMode } from "@/server/kally";
import { asksForCode, asksForMath } from "./remote-style";
import { EXAM_QUESTION, EXAM_REQUEST, type Interpretation } from "./pipeline";
import { asksProgress } from "./learning";
import type { IntentKind } from "./intent-kinds";
export { competenceOfKind, INTENT_KINDS, type IntentKind } from "./intent-kinds";

/**
 * Entendimento do pedido em duas etapas (Kally Intelligence, 17/11/2026):
 *
 *   1. roteador rápido (aqui, sem modelo): só decide o que é inequívoco e diz quão seguro está —
 *      "certa" (segue sem interpretador), "ambigua" (há mais de uma leitura plausível) ou
 *      "desconhecida" (depende do contexto da conversa);
 *   2. interpretador (pipeline.ts, um modelo, com o histórico recente): só para "ambigua" e "desconhecida".
 *
 * Antes, detectIntent decidia tudo por palavras soltas e o interpretador só via mensagens de 280+ caracteres: "não
 * entendi essa parte", "aquilo deu errado" e "transforma aquela ideia em algo publicável" nunca eram interpretados.
 * O roteador não força classificação sem evidência; ele também não concede nada (permissões e modos escolhidos pela
 * pessoa são decididos na rota, antes).
 */


export type Certainty = "certa" | "ambigua" | "desconhecida";

export type FastRoute = {
  certainty: Certainty;
  kind: IntentKind;
  /** modo da Kally que atende (o rótulo no app e o que a busca inclui) */
  mode: Exclude<KallyMode, "auto">;
  casual: boolean;
  /** a mensagem aponta para algo dito antes ("isso", "essa parte", "aquilo que falamos") */
  refersBack: boolean;
  reason: string;
};

type Turn = { role: string; content: string };

/** Referência a algo da conversa: dêiticos e retomadas. Só vale com histórico. */
const REFERS_BACK =
  /\b(isso|isto|aquilo|aquela|aquele|essa parte|esta parte|essa (explica[cç][aã]o|ideia|conta|quest[aã]o|fun[cç][aã]o)|(o|a) (que|qual) (voc[eê]|vc) (disse|falou|explicou|mandou|sugeriu)|que (a gente )?falamos|anterior(mente)?|de novo|continua(r|ndo)?|ainda (n[aã]o|d[aá]|t[aá]|est[aá]|retorna)|n[aã]o entendi|n[aã]o funcionou|deu (errado|erro)|o mesmo erro|tamb[eé]m n[aã]o|e (se|no caso|quando|pra|para)\b|mas e\b|e a[ií]\b|e o\b|e a\b)/i;
/** "Não entendi" sobre a resposta anterior. */
const NOT_UNDERSTOOD = /\bn[aã]o (entendi|compreendi|captei|peguei)\b|\bficou confuso\b|\bexplica (melhor|de novo|de outro jeito)\b|\bcomo assim\b/i;
/** Só cumprimento ou papo curto (nada pedido). */
const GREETING_ONLY =
  /^(oi+|ol[aá]|e a[ií]|eai|opa|bom dia|boa tarde|boa noite|tudo (bem|bom|certo|tranquilo)|como (voc[eê]|vc) (est[aá]|vai)|valeu|obrigad[oa]|brigad[oa]|haha+|kkk+|rs+|beleza|blz|show|massa|top|legal|entendi|ok|certo|t[aá] bom|perfeito|kally)([\s,!.?]+(oi+|ol[aá]|tudo (bem|bom|certo|tranquilo)|e (voc[eê]|vc)|como (voc[eê]|vc) (est[aá]|vai)|kally|tudo|bem|sim|valeu|obrigad[oa]|haha+|kkk+))*[\s!.?]*$/i;
/** Agradecimento ou confirmação curta ("valeu, ajudou demais", "obrigada, entendi agora"). */
const THANKS = /^\W*(valeu|obrigad[oa]|brigad[oa]|vlw|show|perfeito|entendi|ah,? entendi|agora entendi|faz sentido|beleza|massa|top|[oó]timo)\b[^?\n]{0,60}$/i;
/** Relato: a pessoa conta algo dela em primeira pessoa, sem pergunta nem pedido. */
// Fim de palavra que funciona com acento ("tô", "é"): o \b do JavaScript não trata letra acentuada como letra.
const END = "(?=[\\s,.!?;:]|$)";
const PERSONAL_REPORT = new RegExp(
  `^(hoje |ontem |finalmente |enfim |nossa,? |cara,? |gente,? |mano,? )?(eu )?((hoje|ontem) (foi|é|t[aá]|est[aá])|aprendi|consegui|terminei|passei|fui|fiz|comecei|acabei|tirei|ganhei|perdi|li|vi|assisti|voltei|cheguei|mudei|entrei|sa[ií]|comprei|descobri|resolvi|estudei|errei|acertei|estou|t[oô]|to|me sinto|fiquei|tive)${END}`,
  "i",
);
/** Pedido ou pergunta (com isso não é papo nem relato). */
const ASKS =
  /\?|\b(qu[ae]l|quais|qu?ando|qnd|quant[oa]s?|quem|onde|como|por ?que|pq|o que|oq|me (ajud|diz|fala|explic|mostr|lembr|conta|ensin|d[aá])|explic|fa[zç]a?\b|elabor|escrev|cri[ae]|organiz|revis|resum|mont[ae]|liste|calcul|precis|quero|queria|pode|consegue|tem como|existe|lembra|ajuda)/i;
/** Só quer conversar (com "queria", mas sem pedido). */
const JUST_TALK = /\b(s[oó] )?(queria|quero) (conversar|bater (um )?papo|desabafar|falar com algu[eé]m)\b/i;
/** Ensinar/entender um assunto (com erros de digitação comuns: "explca", "o q é", "oq é", "n entendi"). */
const TEACH = new RegExp(
  `\\b(quero (aprender|entender|saber)|me ensin\\w*|me expl\\w*|expli\\w* (como|o que|o q|por que|pq)|como funciona|(o que|o q|oq|que) (é|e|s[aã]o)${END}|qual (é )?a diferen[cç]a|diferen[cç]a entre|(n|n[aã]o) entendi (nada|direito|bem)?)`,
  "i",
);
const ANALYZE = /\banalis[ae]r?\b|\bcritique\b|\bcriticamente\b|\bavali(e|ar)\b|\bse sustenta\b|\besse argumento\b|\bpontos fracos\b/i;
const GUIDE = /\b(plano de estudos?|cronograma|por onde (eu )?come[cç]o|me orient\w*|como (me )?organiz\w*|roteiro de estudo|o que estudar)\b/i;
/** Alternativas A) a E) em linhas próprias (questão de prova de verdade). */
const HAS_OPTIONS = /(^|\n)\s*\(?[A-E][).]\s+\S[^\n]*\n(?:[^\n]*\n)*?\s*\(?[B-E][).]\s+\S/i;

/** Primeiro passo do entendimento (sem modelo). requested = modo escolhido pela pessoa ("auto" = deduzir). */
export function fastRoute(input: {
  message: string;
  history: Turn[];
  requested: KallyMode;
  postCommand: boolean;
  hasReviewPayload: boolean;
  hasAttachment: boolean;
  canPublish: boolean;
}): FastRoute {
  const message = input.message.trim();
  const m = message.toLowerCase();
  const legacy = detectIntent(message);
  const hasHistory = input.history.some((t) => t.role === "assistant");
  const refersBack = hasHistory && (REFERS_BACK.test(m) || NOT_UNDERSTOOD.test(m));
  const sure = (kind: IntentKind, mode: FastRoute["mode"], reason: string, casual = false): FastRoute => ({ certainty: "certa", kind, mode, casual, refersBack, reason });
  const unsure = (certainty: Exclude<Certainty, "certa">, kind: IntentKind, mode: FastRoute["mode"], reason: string, casual = false): FastRoute => ({ certainty, kind, mode, casual, refersBack, reason });

  // Escolhas explícitas da pessoa valem sempre (o roteador não muda modo escolhido).
  if (input.postCommand) return sure("publicacao", "ideia", "comando /post");
  if (input.hasReviewPayload) return sure("revisao", "revisar", "texto escolhido para revisão");
  if (input.requested === "ideia") return sure("publicacao", "ideia", "modo escolhido: Idealizar");
  if (input.requested === "revisar") return sure("revisao", "revisar", "modo escolhido: Revisar");

  // Prova: alternativas, "acertei?", "monta uma prova" (regra medida nas baterias de 15/11). Um relato com "errei quase
  // tudo" (sem pergunta nem alternativas) é relato, não questão.
  const report = PERSONAL_REPORT.test(m) && !ASKS.test(m);
  // Plano de estudo "pra prova" é orientação: "prova" ali é o evento, não um pedido de questões (bateria de 17/11: o
  // plano de anatomia virou "prova", ligou o raciocínio e o 1º texto saiu em 34 s em vez de ~8).
  const examEvent = GUIDE.test(m) && !HAS_OPTIONS.test(message) && !/\b(quest(ões|oes|ão|ao)|quiz|simulado|exerc[ií]cios|me testa)\b/i.test(m);
  if (!report && !examEvent && (EXAM_QUESTION.test(message) || EXAM_REQUEST.test(message))) return sure("prova", "aprender", "questão ou pedido de prova");
  if (report && HAS_OPTIONS.test(message)) return sure("prova", "aprender", "questão de prova");

  if (input.requested === "aprender") return refersBack ? unsure("desconhecida", "ensino", "aprender", "modo Aprender com referência ao que veio antes") : sure("ensino", "aprender", "modo escolhido: Aprender");

  // Cumprimento, agradecimento ou papo curto, sem pedido (no meio da conversa também: "valeu, ajudou demais" ia ao
  // interpretador e levava 7 s a mais).
  if (GREETING_ONLY.test(message) || (THANKS.test(message) && !ASKS.test(m.replace(THANKS, "")))) return sure("casual", "chat", "cumprimento, agradecimento ou papo", true);
  // Pergunta pelo próprio progresso de estudo: os dados vêm do banco (learning.ts), sem interpretador.
  if (asksProgress(message)) return sure("orientacao", "aprender", "pergunta pelo progresso de estudo");

  // Texto longo ou anexo: as regras procuram palavras soltas e erram justamente aí (medido antes: relatos com
  // "aprender a cozinhar" caíam no modo Aprender).
  if (message.length >= 280) return unsure("ambigua", legacy.mode === "ideia" ? "publicacao" : "pergunta", legacy.mode, "mensagem longa");
  if (input.hasAttachment) return unsure("ambigua", "analise", legacy.mode, "anexo");

  // Referência ao que veio antes: precisa do contexto para saber o que é "isso" ou "essa parte". No meio de uma
  // conversa, mensagem curta sem pedido explícito também (as regras não enxergam "pode dar outro exemplo?").
  const explicit = EXAM_REQUEST.test(message) || legacy.mode === "ideia" || legacy.mode === "revisar" || GUIDE.test(m) || ANALYZE.test(m) || /```|\b\d+\s*[+\-*/=^]\s*\d/.test(message);
  if (refersBack || (hasHistory && message.length < 160 && !explicit && !GREETING_ONLY.test(message))) {
    if (NOT_UNDERSTOOD.test(m)) return unsure("desconhecida", "esclarecimento", "chat", "a pessoa não entendeu algo da resposta anterior");
    if (asksForCode(message) || /\b(null|undefined|nan|exception|erro|bug)\b/i.test(m)) return unsure("desconhecida", "depuracao", "chat", "problema com algo da conversa (código)");
    if (legacy.mode === "ideia" || /\b(public[aá]vel|post|publica)/i.test(m)) return unsure("desconhecida", "publicacao", input.canPublish ? "ideia" : "chat", "transformar algo da conversa em post");
    return unsure("desconhecida", "continuacao", "chat", "continua o assunto anterior");
  }

  // Pedido de post (as regras de detectIntent, medidas em 131 mensagens, ficam).
  if (legacy.mode === "ideia") return sure("publicacao", input.canPublish ? "ideia" : "chat", "pedido de post");
  if (legacy.mode === "revisar") return sure("revisao", "revisar", "pedido de revisão");

  // Relato pessoal sem pedido: conversa natural, não modo Aprender ("aprendi a programar hoje!").
  if (report) return sure("relato", "chat", "relato pessoal, sem pedido", true);
  if (JUST_TALK.test(m) && !/\?/.test(m)) return sure("casual", "chat", "só quer conversar", true);

  if (GUIDE.test(m)) return sure("orientacao", "aprender", "plano ou orientação de estudo");
  // Ensinar um conceito vem antes de conta e código quando não há números nem código ("me ensina derivada do zero").
  const concrete = /\d|```|[{}();=]/.test(message);
  if (TEACH.test(m) && !concrete) return sure("ensino", legacy.mode === "aprender" ? "aprender" : "chat", "quer entender um assunto");
  if (asksForCode(message)) return sure("programacao", "chat", "programação");
  if (asksForMath(message)) return sure("conta", "chat", "conta ou exatas");
  if (ANALYZE.test(m)) return sure("analise", "chat", "pedido explícito de análise");
  if (TEACH.test(m)) return sure("ensino", legacy.mode === "aprender" ? "aprender" : "chat", "quer entender um assunto");

  // Daqui para baixo, nenhuma regra específica reconheceu o pedido: são as "redes de pegar tudo" do detectIntent. Num
  // conjunto separado de mensagens (tests/intent-cases-holdout.ts), decidir aqui acertou só 71% (as palavras soltas não
  // generalizam), então o roteador só decide sozinho o que é muito simples e o resto vai ao interpretador.
  if (legacy.casual) {
    return !hasHistory && message.length <= 40 && !/\b(sei|preciso|quero|significa|aprender)\b/i.test(m)
      ? sure("casual", "chat", "frase curta sem pergunta nem pedido, no começo da conversa", true)
      : unsure("ambigua", "casual", "chat", "frase sem pedido claro", true);
  }
  if (ASKS.test(m)) {
    return !hasHistory && FACT_QUESTION.test(m)
      ? sure("pergunta", legacy.mode, "pergunta factual direta")
      : unsure("ambigua", "pergunta", legacy.mode, "pergunta ou pedido sem tipo claro");
  }
  return unsure("ambigua", hasHistory ? "continuacao" : "casual", "chat", "frase sem pedido claro", !hasHistory);
}

/** Pergunta factual curta e direta ("quem descobriu…?", "qual a capital…?"): resposta comum, sem interpretador. */
const FACT_QUESTION = /^(qu[ae]l|quais|quem|quando|onde|em que ano|quantos?|quantas?)\b[^?]{3,90}\?\s*$/i;

/** O interpretador (pipeline.ts) entra quando o roteador não tem certeza e o pipeline está ligado. */
export const needsInterpreter = (route: FastRoute) => route.certainty !== "certa";


/** Decisão final do entendimento: o roteador, corrigido pelo interpretador quando ele rodou. */
export type Understanding = FastRoute & { interpreted: boolean; referent: string | null; topic: string | null };

export function settle(route: FastRoute, interpretation: Interpretation | null, can: { publish: boolean }): Understanding {
  if (!interpretation?.tipo) return { ...route, interpreted: !!interpretation, referent: interpretation?.referencia || null, topic: interpretation?.tema || null };
  // Evidência explícita de que a pessoa não entendeu ("como assim caso base?", "não entendi essa parte") vale mais que
  // um "pergunta"/"continuacao" genérico do interpretador (que errou "como assim caso base?" no conjunto de ajuste).
  const kind = route.kind === "esclarecimento" && (interpretation.tipo === "pergunta" || interpretation.tipo === "continuacao") ? "esclarecimento" : interpretation.tipo;
  const casual = kind === "casual" || kind === "relato";
  const mode: FastRoute["mode"] =
    kind === "publicacao" ? (can.publish ? "ideia" : "chat") : kind === "revisao" ? "revisar" : kind === "orientacao" || kind === "prova" ? "aprender" : kind === "ensino" && route.mode === "aprender" ? "aprender" : "chat";
  return { ...route, kind, mode, casual, certainty: "certa", interpreted: true, referent: interpretation.referencia || null, topic: interpretation.tema || null, reason: `interpretador: ${interpretation.intencao || kind}` };
}

/** Guia para o executor quando a mensagem retoma algo da conversa. */
export function referentGuide(u: Understanding): string {
  if (!u.referent && !u.refersBack) return "";
  const about = u.referent ? `A mensagem se refere a: «${u.referent.slice(0, 400)}».` : "A mensagem se refere a algo dito antes nesta conversa; use o histórico para saber o quê.";
  const how =
    u.kind === "esclarecimento"
      ? "A pessoa não entendeu essa parte: explique de novo SÓ essa parte, de outro jeito (outra analogia ou um exemplo concreto), sem repetir a explicação inteira."
      : u.kind === "depuracao"
        ? "É o mesmo problema de antes: parta do código e do erro já mostrados, levante a causa mais provável e diga exatamente o que mudar."
        : u.kind === "publicacao"
          ? "Transforme essa ideia (as palavras dela) no conteúdo pedido, sem inventar fatos."
          : "Responda sobre isso especificamente, sem recomeçar o assunto do zero.";
  return `CONTEXTO DA MENSAGEM (não é fala da pessoa): ${about} ${how}`;
}
