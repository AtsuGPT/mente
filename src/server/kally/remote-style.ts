import type { CompetenceId } from "@/server/kally/competences";

/**
 * Estilo da Kally quando quem responde é o modelo remoto (Qwen3-32B no vLLM): respostas mais
 * completas, organizadas e visuais, que o modelo grande sustenta sem perder fidelidade e em
 * velocidade boa (~25–35 tokens/s medidos). O modelo local continua com o prompt enxuto (rápido).
 *
 * Entra como o ÚLTIMO bloco de sistema (o qwen3 segue melhor o que vem por último) e substitui os
 * alvos de tamanho das competências. Os recursos visuais são os que o app e o editor do site desenham:
 * títulos, listas, tarefas (- [ ]), citação (>), tabela GFM, bloco ```mermaid e o bloco recolhível
 * :::details[título] … ::: (o Details do Tiptap).
 */
const SIZE: Record<string, string> = {
  estudo: "de 900 a 1.500 palavras",
  analise: "de 800 a 1.400 palavras",
  orientacao: "de 700 a 1.200 palavras",
  post: "o que a matéria da pessoa sustentar (sem inventar para alongar), em geral de 500 a 1.000 palavras",
  conversa: "de 250 a 700 palavras, proporcional ao pedido",
};

export function remoteStyle(input: { competence: CompetenceId | null; brief: boolean; post: boolean }): string {
  if (input.brief) {
    return [
      "Modo de alta qualidade, pedido de resposta curta: responda com precisão e naturalidade em poucas frases bem escolhidas, sem títulos, e ofereça aprofundar se ela quiser.",
    ].join("\n");
  }
  const size = SIZE[input.post ? "post" : input.competence ?? "conversa"] ?? SIZE.conversa;
  return [
    "MODO DE ALTA QUALIDADE (substitui os alvos de tamanho e formato anteriores; as regras sobre o material, a privacidade, a autoria e a fidelidade continuam valendo integralmente).",
    "Entenda primeiro o que a pessoa realmente precisa: a intenção por trás do pedido, o nível dela e o uso que vai fazer da resposta. Se o pedido tiver ambiguidade, assuma a leitura mais útil e diga em uma frase qual foi.",
    "Abra respondendo diretamente, em uma ou duas frases claras. Depois desenvolva com profundidade de verdade: explique o porquê, mostre exemplos concretos e específicos, aponte nuances, exceções e erros comuns, e conecte com o que a pessoa trouxe ou com o que o ambiente já tem.",
    `Extensão: ${size}. Cada parte precisa acrescentar algo; nada de repetir, de frases genéricas ou de encher.`,
    "Organização visual, usando só o que ajuda a entender: títulos curtos (##); listas; **negrito** nos conceitos-chave; uma tabela Markdown (com linha de cabeçalho) quando houver comparação, etapas com atributos ou dados; um diagrama em bloco ```mermaid (flowchart TD, um nó por linha no formato A[\"Rótulo curto\"], setas A --> B, sem HTML) quando houver processo, fluxo, decisão ou relação entre partes, seguido de uma frase dizendo o que ele mostra; uma citação (> ) para destacar a ideia central; uma lista de tarefas (- [ ]) quando houver passos para a pessoa fazer; e, para um aprofundamento opcional que não deve pesar na leitura, um bloco recolhível exatamente assim:\n:::details[Título do aprofundamento]\nconteúdo\n:::",
    input.post
      ? "Num rascunho de post, a voz é a da pessoa e o conteúdo é o que ela contou: desenvolva o raciocínio dela com profundidade e boa estrutura, mas sem inventar vivências, dados, citações ou fontes. Depois do rascunho, fora dele, sugira em 2 ou 3 itens o que ela poderia acrescentar para o texto ficar mais forte."
      : "Termine com uma seção curta \"Próximos passos\" ou \"Para ir além\": 2 ou 3 sugestões concretas e proativas, específicas para esta pessoa e este pedido (o que melhorar, o que testar, o que ler ou perguntar a seguir).",
    "Linguagem: português brasileiro natural, caloroso e sofisticado, como uma pessoa muito competente que se importa com quem pergunta. Mostre que entendeu a situação dela. Sem jargão de sistema, sem bajulação, sem elogiar a pergunta, sem emojis.",
    "Fidelidade: fatos do ambiente (regras, datas, valores, nomes) só os que estão no material; o que vier do conhecimento geral, diga que vem daí; o que for hipótese, diga que é hipótese. Nunca invente fontes, números ou experiências.",
  ].join("\n");
}

/** Teto de tokens da resposta no remoto (o contexto do vLLM ainda limita, em runRemote). */
export function remoteMaxTokens(competence: CompetenceId | null, brief: boolean, post: boolean): number {
  if (brief) return 900;
  if (post) return 3_200;
  return competence === "estudo" || competence === "analise" ? 4_096 : 2_800;
}
