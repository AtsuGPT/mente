/**
 * Competências da Kally: cada uma tem instruções, critérios de qualidade, formato e 10
 * exemplos de referência. Os exemplos mostram o nível esperado; a cada pedido só os mais
 * parecidos entram no prompt (competences/index.ts). Os casos de avaliação ficam fora daqui.
 */
export type CompetenceId = "estudo" | "post" | "analise";

export type ReferenceExample = {
  id: string;
  /** o pedido, como a pessoa escreveria (é por ele que o exemplo é encontrado) */
  pedido: string;
  /** a resposta de referência */
  resposta: string;
};

export type CompetenceSpec = {
  id: CompetenceId;
  nome: string;
  /** quando a competência se aplica */
  descricao: string;
  instrucoes: string[];
  /** critérios de qualidade: guiam a resposta e a avaliação (rubrica da Etapa 6) */
  criterios: string[];
  /** formato da resposta; canDraft = a pessoa pode publicar e pediu um post */
  formato: (options: { canDraft: boolean; categories: string[] }) => string[];
  /** tamanho-alvo pela profundidade pedida (da interpretação; sem ela, "media") */
  tamanho: Record<"breve" | "media" | "aprofundada", string>;
  /**
   * Checagem final, repetida no fim do prompt (logo antes da resposta): o qwen3 4B seguia as
   * regras do começo do prompt com menos rigor que as do fim.
   */
  lembrete: string;
  temperatura: number;
  maxTokens: number;
  exemplos: ReferenceExample[];
};
