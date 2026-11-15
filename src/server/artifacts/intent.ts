/**
 * Interpretação: o pedido à Kally é sobre um artefato? E o que fazer com ele?
 *
 *  - criar: "cria um simulador de circuito RC", "faz um gráfico da função seno", "/artefato calculadora de IMC";
 *  - editar: com um artefato em jogo (o último da conversa, um aberto pela pessoa ou um citado pelo nome), um pedido de
 *    mudança ("deixa a curva verde", "adiciona um controle de tensão");
 *  - explicar: com um artefato em jogo, uma pergunta sobre ele ("como funciona esse código?");
 *  - listar: "quais artefatos eu tenho?".
 *
 * Regras simples e medidas no texto (sem chamar modelo): a decisão sai na hora e não pesa na primeira palavra. Pedidos
 * de figura (```figura, ```desenho), diagrama Mermaid e quiz continuam no caminho de sempre: só vira artefato o que pede
 * interação, cálculo ou uma ferramenta.
 */

export type ArtifactTask = "criar" | "editar" | "explicar" | "listar";

const fold = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const CREATE_VERB = /\b(cri[ae]|crie|criar|fa[cz]a|faz|fazer|gera|gere|gerar|mont[ae]|montar|constr[oó]i|construa|construir|desenvolv[ae]|desenvolver|prepar[ae]|programe|programa|implement[ae]|quero (um|uma)|preciso de (um|uma)|me (da|de|mostra|mostre) (um|uma))\b/;
const OBJECT = /\b(simulador(es)?|simulacao( interativa)?|simule|artefatos?|calculadora|ferramenta|visualizacao( interativa)?|graficos?( [^ ]+){0,3} (interativos?|3d|tridimensional)|graficos? 3d|graficos?( [^ ]+){0,3} (da|de uma|de|do|das|dos) (funcao|funcoes|equacao|parabola|seno|cosseno|reta|derivada|integral|curva|serie|superficie)|superficie 3d|plot(e|ar)? (a|da|de) |dashboard|painel interativo|mini[- ]?app|aplicativo|joguinho|jogo|quiz interativo|flashcards?|exercicios? interativos?|diagrama interativo|mapa mental interativo|fluxograma interativo|arvore interativa|grafo interativo|componente (react|html)|demo|demonstracao interativa|animacao|pagina interativa|conversor|cronometro|timer|formulario interativo|experimento virtual|laboratorio virtual|lista de (tarefas|afazeres|compras)|to-?do|checklist|kanban|quadro de tarefas|planner|planejador|agenda interativa|tabela interativa|planilha|gerador de|simulacao|pdf|arquivo (pdf|para baixar|em pdf)|documento (em pdf|para baixar|para imprimir)|apostila|ficha de estudo|resumo para imprimir|interativ[oa]s?|animad[oa]s?|visualizador(es)?|modelo 3d|em 3d|maquete virtual)\b/;
const MODIFY = /\b(muda|mude|mudar|troca|troque|trocar|adiciona|adicione|adicionar|acrescenta|acrescente|coloca|coloque|colocar|poe|ponha|tira|tire|tirar|remove|remova|remover|aumenta|aumente|diminui|diminua|deixa|deixe|corrige|corrija|conserta|conserte|melhora|melhore|ajusta|ajuste|inclui|inclua|altera|altere|transforma|transforme|substitui|substitua|faz (ele|ela|com que|o|a)|faca (ele|ela|com que)|agora (com|sem|em)|nao esta funcionando|nao funciona|deu erro|travou|bug)\b/;
const NEW_ONE = /\b(outro|outra|novo|nova|mais um|mais uma)\s+(simulador|artefato|grafico|calculadora|ferramenta|diagrama|jogo|quiz)\b/;
const QUESTION = /\b(como funciona|o que (faz|e|significa)|explica|explique|por que|porque|pra que serve|para que serve|qual (e|a)|me ensina)\b/;
const UI_WORD = /\b(artefato|simulador|grafico|cor|cores|botao|botoes|controle|slider|curva|eixo|titulo|fundo|tamanho|velocidade|animacao|tela|fonte|layout|campo|parametro|legenda|escala|linha|tabela|codigo)\b/;
const LIST =/\b(quais|liste|lista|listar|mostra|mostre|ver|veja)\b.{0,30}\bartefatos\b|\bmeus artefatos\b|\bartefatos (salvos|do ambiente|que (eu )?(tenho|salvei))\b/;

export function artifactTask(message: string, context: { hasArtifact: boolean; attached: boolean }): ArtifactTask | null {
  const raw = message.trim();
  const m = fold(raw);
  if (/^\/artefato\b/i.test(raw)) return context.attached && MODIFY.test(m) ? "editar" : "criar";
  if (LIST.test(m)) return "listar";
  // "como faço um gráfico em python?" é dúvida de programação, não pedido de artefato.
  const howTo = /^(como|qual|quais|o que|por que|pq)\b/.test(m) && raw.endsWith("?");
  const wantsNew = (CREATE_VERB.test(m) && OBJECT.test(m) && !howTo) || /^simule\b/.test(m) || NEW_ONE.test(m);
  if (context.hasArtifact && !NEW_ONE.test(m)) {
    // Sem o artefato aberto (só o último da conversa), o pedido de mudança precisa ser curto ou falar da interface:
    // "deixa eu te perguntar outra coisa sobre Freud…" não é edição.
    const aboutIt = context.attached || m.length < 220 || UI_WORD.test(m);
    if (aboutIt && MODIFY.test(m) && !/^deixa eu\b/.test(m) && !(CREATE_VERB.test(m) && /\b(do zero|novo|nova)\b/.test(m))) return "editar";
    if (context.attached && QUESTION.test(m)) return "explicar";
    // Artefato aberto pela pessoa ("Editar com a Kally"): o que ela escrever é pedido sobre ele.
    if (context.attached) return raw.endsWith("?") ? "explicar" : "editar";
  }
  if (wantsNew) return "criar";
  return null;
}

/** "cria um simulador" → "simulador": para a frase de andamento ("Vou montar o simulador…"). */
export function requestedThing(message: string) {
  const m = fold(message).match(OBJECT);
  return m ? m[0].replace(/^simule$/, "simulação") : "artefato";
}
