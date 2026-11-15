/**
 * Do que a resposta precisa antes de a Kally escrever (pedido do dono do projeto, 15/11/2026): o ambiente e a internet
 * só entram quando fazem falta, como num assistente comum (ChatGPT, Claude) que tem memória e busca mas não as usa em
 * toda pergunta.
 *
 * Antes: toda conversa consultava os pensamentos (nota mínima 0,4; no modo aprender, nenhuma) e toda pergunta de
 * conhecimento ia à internet. Na bateria de 15/11 com o ambiente real (40 pensamentos), "me ajuda a estudar recursão"
 * abria com "O que já está no seu ambiente: Sobrecarga, Realização…", "me faz perguntas de função do 2º grau" puxava
 * dois pensamentos sem relação e "como programo isso em javascript?" esperava 46 s por 8 sites.
 *
 * Agora:
 *   - pergunta que fala do ambiente ou da própria pessoa (o que escreveu, os posts, alguém pelo nome, "lembra",
 *     "meus princípios") consulta como antes;
 *   - pergunta geral só recebe um pensamento quando ele é quase exatamente sobre o assunto (nota alta, GENERAL_MIN),
 *     e sem as conversas antigas;
 *   - a internet automática só entra no que muda com o tempo ou depende de dado específico (notícias, preços, "hoje",
 *     versões, leis, estatísticas) ou quando a pessoa pede fontes ou pesquisa. Com o botão Web ligado, vale a escolha dela.
 */

/** Nota mínima de um pensamento numa pergunta geral: só o que é quase exatamente sobre o assunto. */
export const GENERAL_MIN = 0.6;

/** Fala de algo do ambiente ou da vida da pessoa registrada nele. */
const ENVIRONMENT =
  /\b(meus?|minhas?|nossos?|nossas?) (posts?|textos?|pensamentos?|ideias|rascunhos?|projetos?|anota[cç](ão|ões)|notas|documentos?|arquivos?|conversas?|reflex(ão|ões)|princ[ií]pios|valores|metas?|objetivos?|planos?|sonhos?|opini(ão|ões)|hist[oó]rias?|experi[eê]ncias?|sentimentos?|medos?|dias?|rotinas?|estudos?|categorias?|pastas?)\b|o que (eu )?(escrevi|publiquei|pensei|postei|anotei|disse|falei|contei)|\b(eu|que eu|onde eu|quando eu) (escrevi|publiquei|postei|anotei|disse|falei|contei|mencionei|registrei|comentei)\b|\bte (contei|falei|disse|mandei|passei|mostrei)\b|\b(lembra|lembrar|lembre|lembrou)\b|\b(falamos|conversamos|combinamos)\b|\bda [uú]ltima vez\b|\b(ambiente|ambientes|pensamentos? d[oa]|posts? d[oa]|na mente|da mente|no grupo|nosso grupo)\b|\bkally\b/i;

/**
 * Nome próprio no meio da frase ("a prova da Carla", "o sítio do João"): quase sempre alguém do ambiente. Fora: o que
 * é comum em dúvida geral (linguagens, marcas, lugares, ciências) e o começo de frase.
 */
const COMMON_PROPER = new Set(
  "javascript java python react node typescript html css sql linux windows mac macos ios android excel word google chrome git github docker kubernetes api nat ip tcp http https dns wifi bluetooth json xml php ruby rust go kotlin swift c c++ c# flutter vue angular next expo firebase aws azure figma canva photoshop chatgpt claude gpt openai deus jesus brasil portugal europa américa áfrica ásia estados unidos eua china japão rio são paulo enem fuvest sisu inss sus cpf cnpj pix newton einstein darwin platão aristóteles sócrates freud marx kant nietzsche shakespeare machado bhaskara pitágoras tales euler gauss revolução segunda primeira guerra mundial idade média renascimento iluminismo terra sol lua marte vênus júpiter saturno via láctea internet youtube instagram tiktok whatsapp spotify netflix amazon apple microsoft samsung".split(" "),
);
function mentionsSomeone(message: string) {
  for (const m of message.matchAll(/(?<![.!?]\s|^)\b(?:d[oa]s?|o|a|com|pra|para|e)\s+([A-ZÁÉÍÓÚÂÊÔÃÕ][a-záéíóúâêôãõç]{2,})\b/g)) {
    if (!COMMON_PROPER.has(m[1].toLowerCase())) return true;
  }
  return false;
}

/** A pergunta é sobre o ambiente ou a vida da pessoa registrada nele (então consulta os pensamentos como antes). */
export function asksEnvironment(message: string) {
  return ENVIRONMENT.test(message) || mentionsSomeone(message);
}

/** Muda com o tempo, depende de um dado específico ou a pessoa pediu fontes: vale a internet. */
const FRESH =
  /\b(hoje|agora|atualmente|atual|atuais|recentes?|recentemente|[uú]ltim[oa]s? (not[ií]cias|vers(ão|ões)|atualiza[cç](ão|ões)|dados|resultados?|lan[cç]amentos?)|esta semana|este m[eê]s|este ano|neste ano|em 202\d|de 202\d|202[5-9]|not[ií]cias?|aconteceu|acontecendo|cota[cç](ão|ões)|pre[cç]os?|quanto custa|quanto est[aá]|valor d[oa] (d[oó]lar|euro|real|bitcoin|sal[aá]rio)|sal[aá]rio m[ií]nimo|lan[cç]amento|lan[cç]ou|vers(ão|ões) (mais )?(nova|recente|atual)|quem ganhou|resultado d[oa]s?|placar|elei[cç](ão|ões)|previs(ão|ões) do tempo|clima (em|de|no|na)|hor[aá]rio de funcionamento|endere[cç]o d[eoa]|telefone d[eoa]|lei n|lei federal|decreto|portaria|estat[ií]stic\w*|pesquis(e|a|ar|as) (sobre|na internet|pra mim|para mim)|com fontes|fontes?|refer[eê]ncias|com links?|links? (para|pra|de))\b/i;

export function needsFreshFacts(message: string) {
  return FRESH.test(message);
}
