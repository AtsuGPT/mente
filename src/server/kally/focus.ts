/**
 * Primeiro filtro da busca: o essencial do pedido. Antes, a mensagem inteira ia para as buscas (posts, documentos,
 * memória e internet), com saudação, "você poderia me explicar", "de forma simples, em 3 tópicos" e tudo o mais.
 * As palavras de enrolação e de formato puxavam o vetor da busca (e os termos da internet) para longe do assunto,
 * e cada busca vetorizava um recorte diferente da mensagem (mais tempo no embedder, que roda na CPU).
 *
 * Aqui sai só o assunto: tira cumprimento, forma de pedir, instruções de formato e tamanho e as frases que sobram
 * vazias. Não usa modelo (é instantâneo). O resultado vai para as buscas; a resposta continua lendo o pedido inteiro.
 */

/**
 * \b do JavaScript só conhece letras sem acento: depois de "você" ou "olá" ele não acha a divisa entre palavras e a
 * regra falhava. Toda regra daqui troca \b por uma divisa que conhece acentos.
 */
const EDGE = String.raw`(?:(?<![\p{L}\p{N}])(?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])(?![\p{L}\p{N}]))`;
const unicode = (re: RegExp) => new RegExp(re.source.replaceAll(String.raw`\b`, EDGE), `${re.flags.replace("u", "")}u`);

/** Cumprimentos e vocativos no começo de frase. */
const GREETING = unicode(
  /^(?:oi+|ol[aá]|opa|e a[ií]|eae|eai|hey|hello|bom dia|boa tarde|boa noite|tudo (?:bem|bom|certo)|como vai|kally|ei)\b[\s,!.?]*/i,
);

/** Formas de pedir: "você poderia me explicar", "eu queria saber", "me fala"... (podem vir várias em sequência). */
const ASKING = unicode(
  new RegExp(
    "^(?:" +
      [
        "por favor|pfv|pf",
        "ent[aã]o|bom|olha|tipo|a[ií]|beleza|ok|certo",
        "(?:eu )?(?:queria|quero|gostaria(?: muito)?|preciso|precisava)(?: de)?(?: que (?:voc[eê]|vc|tu))?",
        "(?:voc[eê]|vc|tu) (?:pode|poderia|consegue|conseguiria|sabe|saberia)",
        "ser[aá] que (?:voc[eê]|vc) (?:pode|consegue|sabe)",
        "(?:voc[eê] )?(?:se )?lembra (?:que|de|do|da|quando)(?: eu)?(?: te)? (?:falei|contei|disse|mostrei)(?: (?:sobre|de|do|da|dos|das))?",
        String.raw`(?:me|te) (?:ajud|explic|fal|cont|mostr|ensin|diss|diz|dig|d[aáeê])\p{L}*(?: (?:sobre|a respeito de|de|do|da|dos|das))?`,
        "(?:explicar|explica|explique|entender|saber|aprender|conhecer|compreender|falar|saber mais|ajuda|ajudar)(?: melhor)?(?: (?:sobre|a respeito de|de|do|da|dos|das|com))?",
        "uma (?:d[uú]vida|pergunta)|tenho uma (?:d[uú]vida|pergunta)|(?:uma )?ajuda (?:com|em)",
        "(?:pesquise|pesquisa|busque|busca|procure|procura|aprofunde|aprofunda|resuma|resume|descreva|descreve|analise|analisa|compare|compara|liste|lista|escreva|escreve)(?: (?:sobre|a respeito de))?",
        "me|pra mim|para mim",
      ]
        .map((alt) => `(?:${alt})`)
        .join("|") +
      String.raw`)\b[\s,:]*`,
    "i",
  ),
);

/** Instruções de formato, tamanho e público: dizem como responder, não sobre o quê. */
const FORMAT = (
  [
    /\b(?:de (?:um )?(?:forma|jeito|modo|maneira)|de um jeito)\s+(?:bem\s+|mais\s+|muito\s+)?(?:simples|f[aá]cil|did[aá]tic[ao]|detalhad[ao]|resumid[ao]|curt[ao]|breve|clar[ao]|objetiv[ao]|aprofundad[ao]|complet[ao]|t[eé]cnic[ao]|informal|leve)\b/gi,
    /\b(?:em|com|usando|numa?)\s+(?:at[eé]\s+)?(?:\d+|um|uma|dois|duas|tr[eê]s|quatro|cinco|poucos?|poucas?|alguns|algumas)?\s*(?:t[oó]picos?|par[aá]grafos?|linhas?|frases?|palavras?|itens|pontos?|passos?|etapas?|exemplos?|tabelas?|listas?|bullets?|marcadores)\b(?:\s+(?:pr[aá]tic[ao]s?|simples|curt[ao]s?))?/gi,
    /\b(?:passo a passo|com exemplos?(?: pr[aá]ticos?)?|com detalhes|em detalhes|bem explicado|resumidamente|detalhadamente|rapidinho|r[aá]pido|sem enrola[çc][aã]o|direto ao ponto|em portugu[eê]s|em ingl[eê]s)\b/gi,
    /\b(?:para|pra) (?:um |uma )?(?:leigos?|iniciantes?|crian[çc]as?|quem n[aã]o (?:sabe|entende) nada|algu[eé]m de \d+ anos)\b/gi,
    /\bcomo se eu (?:fosse|tivesse) [^,.;!?]+/gi,
    /\b(?:seja|fa[çc]a|deixe?) (?:bem |mais )?(?:breve|curto|sucinto|objetivo|claro|did[aá]tico|detalhado)\b/gi,
    /\b(?:obrigad[oa]|valeu|vlw|brigad[oa])\b[!.]*/gi,
  ] as RegExp[]
).map(unicode);

/** Palavras que sozinhas não dizem o assunto (uma frase só com elas é enrolação). */
const EMPTY = new Set(
  "a o as os um uma uns umas de da do das dos em no na nos nas por pelo pela para pra com sem que qual quais como e é ou mas se sobre isso esse essa este esta isto aquilo me te eu você voce vc tu ele ela nós gente meu minha seu sua teu tua quero queria pode poderia sabe saber entender explica explique explicar fala fale diga ajuda ajude favor tudo bem bom boa ok certo então entao aí ai tipo assim coisa coisas algo sim não nao gostaria preciso dúvida duvida pergunta kally oi olá ola obrigado obrigada valeu mais muito pouco bem agora hoje aqui lá la já ja também tambem só so ainda melhor".split(
    " ",
  ),
);

const words = (text: string) => text.toLowerCase().normalize("NFC").split(/[^\p{L}\p{N}-]+/u).filter(Boolean);
const contentWords = (text: string) => words(text).filter((w) => w.length >= 2 && !EMPTY.has(w));

/** Tira cumprimentos e formas de pedir do começo da frase (podem vir vários seguidos). */
function stripLead(sentence: string) {
  let s = sentence.trim();
  for (let i = 0; i < 8; i++) {
    const next = s.replace(/^[\s,;:—-]+/, "").replace(GREETING, "").replace(ASKING, "").trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

export type Focus = {
  /** o essencial do pedido, em texto corrido (vai para os vetores e para a busca na internet) */
  text: string;
  /** palavras de conteúdo que sobraram */
  terms: string[];
  /** palavras da mensagem original e do essencial (só contagens, para o registro de desempenho) */
  stats: { before: number; after: number };
};

/**
 * O essencial do pedido. `previous` é a última mensagem da pessoa: entra quando esta não diz o assunto sozinha
 * ("e no Brasil?", "por quê?", "explica melhor").
 */
export function focusQuery(message: string, previous = ""): Focus {
  const own = essential(message);
  const before = words(message).length;
  if (own.terms.length >= 2 || !previous.trim()) return { ...own, stats: { before, after: own.terms.length } };
  const prior = essential(previous);
  // Sem assunto próprio ("explica melhor"), vale só o da mensagem anterior.
  const text = [prior.text, own.terms.length ? own.text : ""].filter(Boolean).join(" — ");
  const terms = [...new Set([...prior.terms, ...own.terms])];
  return { text, terms, stats: { before, after: terms.length } };
}

function essential(message: string): Omit<Focus, "stats"> {
  const clean = message
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[*_`#>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return { text: "", terms: [] };
  let body = clean;
  for (const rule of FORMAT) body = body.replace(rule, " ");
  // Frase por frase: tira o começo de enrolação e descarta as que ficam sem assunto ("Oi Kally, tudo bem?").
  const parts = body
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((s) => stripLead(s).replace(/^[\s,;:—-]+|[\s,;:—-]+$/g, "").replace(/\s{2,}/g, " "))
    .filter((s) => contentWords(s).length > 0);
  let text = parts
    .join(" ")
    .replace(/\s*([,;:])(?:\s*[,;:])+/g, "$1")
    .replace(/\s+([?.!,;:])/g, "$1")
    .trim();
  // Nada sobrou (a mensagem era só forma): fica a original, sem perder o pedido.
  if (!text) text = clean;
  return { text: text.slice(0, 600), terms: [...new Set(contentWords(text))].slice(0, 16) };
}

/** Só tira instruções de formato, tamanho e público (usado também na frase que o modelo escreve). */
export function withoutFormat(text: string) {
  let body = text;
  for (const rule of FORMAT) body = body.replace(rule, " ");
  return body.replace(/\s*([,;:])(?:\s*[,;:])+/g, "$1").replace(/\s+([?.!,;:])/g, "$1").replace(/\s{2,}/g, " ").replace(/^[\s,;:—-]+|[\s,;:—-]+$/g, "").trim();
}
