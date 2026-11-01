/**
 * Identificação de intenção da Kally, sem chamada ao modelo.
 *
 * "explicit"  — comando /post.
 * "strong"    — pedido claro de produzir uma publicação ("transforme isso em um post").
 * "ambiguous" — há sinais de escrita, mas pode ser só conversa ("pensei em escrever sobre isso").
 * "none"      — conversa comum. Falar sobre um assunto não é pedir um post.
 */

export type PostIntent = "explicit" | "strong" | "ambiguous" | "none";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
}

const POST_COMMAND = /^\/post(?:\s|$)/i;
const SEARCH_COMMAND = /^\/(pesquisar|pesquisa|buscar)(?:\s|$)/i;

export function stripPostCommand(text: string) {
  return text.replace(POST_COMMAND, "").trim();
}

export function stripSearchCommand(text: string) {
  return text.replace(SEARCH_COMMAND, "").trim();
}

// Produtos de escrita que viram publicação no Minha Mente.
const NOUN = "(?:post|posts|postagem|publicacao|publicacoes|texto|textos|artigo|artigos|ensaio|cronica|pensamento|reflexao escrita|materia|redacao)";
// Verbos de criação no imperativo, infinitivo ou primeira pessoa do plural.
const CREATE = "(?:transforme|transformar|transforma|converta|converter|escreva|escrever|escrevamos|crie|criar|cria|produza|produzir|redija|redigir|elabore|elaborar|desenvolva|desenvolver|gere|gerar|faca|fazer|faz|monte|montar|prepare|preparar|componha|compor|rascunhe|rascunhar|vire|virar)";

const STRONG_PATTERNS: RegExp[] = [
  // "transforme essa ideia em uma publicação", "converta a transcrição em post"
  new RegExp(`\\b(?:transforme|transformar|transforma|converta|converter|vire|virar)\\b.{0,80}\\bem (?:um |uma )?${NOUN}\\b`),
  // "escreva um post", "quero desenvolver um texto sobre", "produza um artigo relacionando"
  new RegExp(`\\b${CREATE}\\b(?: (?:um|uma|o|a|meu|minha|novo|nova|esse|este|essa|esta))?(?: \\w+)? ${NOUN}\\b`),
  // "me ajude a escrever um texto", "vamos escrever um post"
  new RegExp(`\\b(?:ajude|ajuda|ajudar|vamos|bora|quero|preciso|gostaria de|queria)\\b.{0,30}\\b(?:escrever|criar|produzir|redigir|elaborar|montar|desenvolver)\\b.{0,30}\\b${NOUN}\\b`),
  // "quero publicar isso", "publique um post sobre"
  // "quero um texto sobre liberdade"
  new RegExp(`\\b(?:quero|queria|preciso|gostaria de) (?:um|uma|o|a) (?:novo |nova )?${NOUN}\\b`),
  /\b(?:quero|vamos|preciso|gostaria de) publicar\b/,
  /\bpublique\b/,
];

const AMBIGUOUS_PATTERNS: RegExp[] = [
  /\b(?:pensei|penso|pensando) em escrever\b/,
  /\b(?:seria|daria) (?:um bom|uma boa|bom|legal|interessante) (?:post|texto|publicacao|artigo|pensamento)\b/,
  /\b(?:isso|essa ideia|esse assunto|isto) (?:daria|renderia|poderia virar|vira) (?:um|uma)\b/,
  /\bescrever sobre\b/,
  /\b(?:ideia|ideias) (?:para|pra) (?:um|uma) (?:post|texto|publicacao|artigo)\b/,
];

// Perguntas sobre escrita ("como escrever um bom texto?") não são pedidos de produção.
const META_QUESTION = /^(?:como|o que|qual|quais|por que|porque|quando|onde|quem|voce acha|vale a pena|sera que)\b/;

export function detectPostIntent(raw: string): PostIntent {
  const text = raw.trim();
  if (POST_COMMAND.test(text)) return "explicit";
  const value = normalize(text);
  if (!value || value.length < 8) return "none";
  // Pedidos sobre o que Kayk já escreveu continuam sendo perguntas ao arquivo.
  if (/\b(?:kayk|ele) (?:escreveu|publicou|disse|pensa)\b/.test(value)) return "none";
  const question = META_QUESTION.test(value) || /\?$/.test(value);
  if (STRONG_PATTERNS.some((pattern) => pattern.test(value))) return question ? "ambiguous" : "strong";
  if (AMBIGUOUS_PATTERNS.some((pattern) => pattern.test(value))) return "ambiguous";
  return "none";
}

/** Pedido explícito de pesquisa na internet (comando ou linguagem clara). */
export function detectSearchIntent(raw: string): boolean {
  const text = raw.trim();
  if (SEARCH_COMMAND.test(text)) return true;
  const value = normalize(text);
  return [
    /\b(?:pesquise|pesquisa|pesquisar|busque|buscar|procure|procurar)\b.{0,40}\b(?:internet|web|online|google|fontes|referencias|artigos|estudos|noticias)\b/,
    /\b(?:na|pela) (?:internet|web)\b/,
    /\b(?:pesquise|busque|procure)\b/,
    /\b(?:quais|que) (?:fontes|estudos|artigos|pesquisas|referencias) (?:falam|dizem|existem|mostram|tratam)\b/,
    /\b(?:artigos cientificos|estudos cientificos|noticias recentes|ultimas noticias)\b/,
    /\bcom (?:fontes|referencias)\b/,
  ].some((pattern) => pattern.test(value));
}

/** Profundidade declarada pelo usuário, se houver. */
export function detectDepth(raw: string): "sintetico" | "desenvolvido" | "aprofundado" | "extensivo" | null {
  const value = normalize(raw);
  if (/\b(extensivo|extenso|longo|completo|detalhad[oa]|exaustivo|com fundamentacao)\b/.test(value)) return "extensivo";
  if (/\b(aprofundad[oa]|profund[oa]|denso|aprofundar)\b/.test(value)) return "aprofundado";
  if (/\b(sintetic[oa]|curto|breve|resumid[oa]|enxuto|direto ao ponto|rapido)\b/.test(value)) return "sintetico";
  if (/\b(desenvolvid[oa]|medio|intermediario)\b/.test(value)) return "desenvolvido";
  return null;
}

/** Abordagem declarada pelo usuário, se houver. */
export function detectApproach(raw: string): "informativo" | "filosofico" | "tecnico" | "reflexivo" | "argumentativo" | null {
  const value = normalize(raw);
  if (/\bfilosofic[oa]\b/.test(value)) return "filosofico";
  if (/\btecnic[oa]\b/.test(value)) return "tecnico";
  if (/\breflexiv[oa]\b/.test(value)) return "reflexivo";
  if (/\bargumentativ[oa]\b|\bdefender (?:a|uma) (?:tese|posicao)\b/.test(value)) return "argumentativo";
  if (/\binformativ[oa]\b|\bexplicativ[oa]\b|\bdidatic[oa]\b/.test(value)) return "informativo";
  return null;
}

/** Na etapa de rascunho: o usuário pede mudança no texto ou só faz uma pergunta sobre ele? */
export function isRevisionRequest(raw: string): boolean {
  const value = normalize(raw);
  const changeVerb = /\b(mude|mudar|altere|alterar|troque|trocar|reescreva|reescrever|refaca|refazer|ajuste|ajustar|corrija|corrigir|acrescente|acrescentar|adicione|adicionar|inclua|incluir|remova|remover|tire|tirar|corte|cortar|encurte|encurtar|amplie|ampliar|expanda|expandir|aprofunde|aprofundar|desenvolva|desenvolver|simplifique|simplificar|resuma|resumir|melhore|melhorar|deixe|deixar|torne|tornar|use|usar|coloque|colocar|substitua|substituir|reorganize|reorganizar|divida|dividir|junte|juntar)\b/;
  if (changeVerb.test(value)) return true;
  return !/\?$/.test(value) && !META_QUESTION.test(value);
}

/** Cumprimentos e agradecimentos curtos: merecem resposta casual, sem busca no arquivo. */
export function isCasualMessage(raw: string): boolean {
  const value = normalize(raw).replace(/[!?.,;:)(\s]+$/g, "");
  if (value.length > 60) return false;
  return /^(oi+|ola|opa|eai|e ai|hey|bom dia|boa tarde|boa noite|tudo bem|tudo bom|como vai|como voce esta|obrigad[oa]|valeu|vlw|brigad[oa]|tchau|ate mais|ate logo|beleza|blz|ok|certo|legal|show|perfeito|entendi)\b/.test(value);
}
