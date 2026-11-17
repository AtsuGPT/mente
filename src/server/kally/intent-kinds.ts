/** Tipos de pedido que o entendimento reconhece (understand.ts); módulo à parte para o interpretador (pipeline.ts) usar sem import circular. */
export type IntentKind =
  | "casual" // cumprimento, papo
  | "relato" // a pessoa conta algo dela, sem pedir nada ("aprendi a programar hoje!")
  | "pergunta" // dúvida comum
  | "ensino" // quer aprender/entender um assunto
  | "esclarecimento" // não entendeu algo da resposta anterior
  | "continuacao" // segue o assunto anterior ("e no caso de…", "aquilo deu errado")
  | "depuracao" // código que não funciona
  | "programacao" // escrever ou explicar código
  | "conta" // cálculo, exatas
  | "prova" // questão de prova, montar prova/quiz
  | "publicacao" // virar post
  | "revisao" // revisar um texto
  | "analise" // crítica de argumento, documento
  | "orientacao"; // plano de estudo, por onde começar

export const INTENT_KINDS: IntentKind[] = ["casual", "relato", "pergunta", "ensino", "esclarecimento", "continuacao", "depuracao", "programacao", "conta", "prova", "publicacao", "revisao", "analise", "orientacao"];

/**
 * Tipo de pedido → competência usada no prompt (competences/). null = conversa comum (ou o modo Aprender, no caso da
 * orientação: plano de estudo segue o prompt de aprendizagem guiada, não a competência de explicar um tema).
 */
export function competenceOfKind(kind: IntentKind): "estudo" | "post" | "analise" | null {
  switch (kind) {
    case "ensino":
    case "esclarecimento":
    case "prova":
      return "estudo";
    case "publicacao":
      return "post";
    case "analise":
      return "analise";
    default:
      return null;
  }
}
