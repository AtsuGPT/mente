import type { CompetenceId } from "@/server/kally/competences";
import { PERSONALITY } from "@/server/kally/personality";

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
  post: "de 200 a 450 palavras, proporcional ao que ela contou",
  // Ponto 4 da personalidade: pergunta simples, resposta direta; assunto complexo, resposta completa.
  conversa: "proporcional ao pedido: pergunta simples ou papo, algumas frases diretas e naturais, sem títulos; assunto que pede explicação, de 250 a 700 palavras",
};

/**
 * Post na remota. Rodada cega de 10/11: o rascunho do 32B saiu só em parágrafos e subtítulos, repetiu a mesma
 * ideia em três seções, não usou nenhuma fonte e ainda inventou "há pouco tempo" e "me acontece com frequência".
 * Agora: duas camadas separadas (a vivência dela, só com o que ela contou; o conhecimento, só das fontes [E…],
 * citado com link), recursos do editor com função e nenhuma repetição.
 */
const POST_RULES = [
  "RASCUNHO DE POST CASUAL. É um post pessoal para um blog, não um artigo, um estudo ou uma publicação científica: soa como a pessoa conversando, em primeira pessoa, no registro dela (se ela escreve simples, fica simples).",
  "Forma: # título curto e com a cara dela; depois parágrafos curtos e corridos (em geral de 3 a 6). Sem subtítulos (##) num post curto; num post longo, no máximo dois, e só se ajudarem a ler. Sem tabela, diagrama, bloco recolhível, lista de referências, notas de rodapé ou links: nada disso combina com um post casual. Uma citação (> ) com a frase central dela só se surgir naturalmente.",
  "Fontes externas: só entram se a pessoa pediu fontes, dados ou pesquisa. Nesse caso, cite no próprio parágrafo com link Markdown para o endereço exato [E…], sem seção de referências. Sem esse pedido, não cite pesquisa, estudo, autor, número nem link.",
  "Conteúdo: o centro é o que ela contou (as ideias, a situação, o sentimento). Para o post ficar completo, você pode completar com reflexões, ligações e sentimentos coerentes com o que ela disse, no tom dela; ela vai editar depois. O que NUNCA se inventa: fatos concretos que só ela saberia (nomes de pessoas, lugares, datas, números, horários, cargos, disciplinas, projetos, hobbies, episódios e falas). Isso vale também para exemplos de atividades, tarefas, lugares e rotinas que ela não citou: se um detalhe concreto faria falta, escreva de um jeito geral (\"meus projetos\", \"o trabalho\") em vez de inventar qual é. Não mude o sentido do que ela disse (se ela espera as férias, não escreva que decidiu parar).",
  "Voz: o rascunho inteiro é dela, em primeira pessoa (\"meus projetos\", nunca \"seus projetos\").",
  "O exemplo de referência é de OUTRA pessoa: nenhum fato, cena ou frase dele entra neste rascunho.",
  "Fecho: uma frase que retome a ideia dela, sem lição de moral nem chamada ao leitor.",
  "Não use palavras com gênero sobre ela (\"cansado\", \"envolvida\") se ela não revelou o gênero: reescreva sem o adjetivo (\"o cansaço\", \"me envolvo\"). Revise a gramática antes de entregar.",
  "Se ela aprovou um texto anterior desta conversa (\"poste isso\", \"deixa assim\", \"pode publicar\"), o rascunho é esse texto, só no formato <rascunho>, sem reescrever o que ela aprovou (tirando só o que for fato concreto inventado).",
  "Depois do rascunho, fora dele e em até 2 linhas: dois títulos alternativos e, se quiser, UMA sugestão do que ela poderia acrescentar. Sem perguntas obrigatórias: o rascunho já está pronto para ela editar e publicar.",
].join("\n");

/**
 * Post com pouca matéria (menos de ~400 caracteres dela): com o alvo de 500 a 1.000 palavras, o 32B enchia com o que
 * ela não disse ("perder uns quilos", "no parque, na areia"; teste de 10/11 com duas frases sobre começar a correr).
 */
const SHORT_POST = "Matéria curta: o rascunho tem de 120 a 250 palavras, sem subtítulos. Escreva mesmo assim, a partir do tema e do que ela disse, completando com reflexões coerentes (sem fatos concretos inventados).";

export function remoteStyle(input: { competence: CompetenceId | null; brief: boolean; post: boolean; shortPost?: boolean }): string {
  if (input.brief) {
    return [
      "Modo de alta qualidade, pedido de resposta curta: responda com precisão e naturalidade em poucas frases bem escolhidas, sem títulos, e ofereça aprofundar se ela quiser.",
    ].join("\n");
  }
  const size = input.shortPost ? "de 120 a 250 palavras no rascunho" : SIZE[input.post ? "post" : input.competence ?? "conversa"] ?? SIZE.conversa;
  // Post: só as regras de post casual. As de "alta qualidade" (profundidade, exemplos, nuances, títulos, tabelas,
  // diagramas, próximos passos) faziam o post sair com cara de artigo científico, com fontes e "Referências"
  // (conversa de 13/11 sobre as férias da faculdade: o dono do projeto não conseguiu postar).
  if (input.post) {
    return [
      `Extensão: ${size}.`,
      input.shortPost ? `${POST_RULES}\n${SHORT_POST}` : POST_RULES,
      `${PERSONALITY}\nSem jargão de sistema e sem emojis.`,
    ].join("\n");
  }
  return [
    "MODO DE ALTA QUALIDADE (substitui os alvos de tamanho e formato anteriores; as regras sobre o material, a privacidade, a autoria e a fidelidade continuam valendo integralmente).",
    "Entenda primeiro o que a pessoa realmente precisa: a intenção por trás do pedido, o nível dela e o uso que vai fazer da resposta. Se o pedido tiver ambiguidade, assuma a leitura mais útil e diga em uma frase qual foi.",
    "Abra respondendo diretamente, em uma ou duas frases claras. Depois desenvolva com profundidade de verdade: explique o porquê, mostre exemplos concretos e específicos, aponte nuances, exceções e erros comuns, e conecte com o que a pessoa trouxe ou com o que o ambiente já tem.",
    `Extensão: ${size}. Cada parte precisa acrescentar algo; nada de repetir, de frases genéricas ou de encher.`,
    "Organização visual, usando só o que ajuda a entender: títulos curtos (##); listas; **negrito** nos conceitos-chave; uma tabela Markdown (com linha de cabeçalho) quando houver comparação, etapas com atributos ou dados; um diagrama em bloco ```mermaid (flowchart TD, um nó por linha no formato A[\"Rótulo curto\"], setas A --> B, sem HTML) quando houver processo, fluxo, decisão ou relação entre partes, seguido de uma frase dizendo o que ele mostra; uma citação (> ) para destacar a ideia central; uma lista de tarefas (- [ ]) quando houver passos para a pessoa fazer; e, para um aprofundamento opcional que não deve pesar na leitura, um bloco recolhível exatamente assim:\n:::details[Título do aprofundamento]\nconteúdo\n:::\nFórmulas: o app não desenha LaTeX. Nunca use $, $$, \\(, \\[, \\frac, \\cdot, \\hat, \\sum nem blocos ```math: escreva a fórmula em texto com símbolos (ŷ = β₀ + β₁·x, x², √x, Σ, ≤, ≥, ×, ≈), numa linha própria quando for central. Nada de HTML (<br>, <b>, <sup>); numa célula de tabela, nada de quebra de linha.",
    input.post ? (input.shortPost ? `${POST_RULES}\n${SHORT_POST}` : POST_RULES) : "Em respostas que explicam ou desenvolvem algo, termine com uma seção curta \"Próximos passos\" ou \"Para ir além\": 2 ou 3 sugestões concretas e proativas, específicas para esta pessoa e este pedido (o que melhorar, o que testar, o que ler ou perguntar a seguir). Em pergunta simples ou papo, no máximo uma sugestão, numa frase, se for natural.",
    "Pergunta factual sobre o ambiente: responda primeiro o fato exatamente como está no material; o desenvolvimento vem do próprio material (o que mais ele diz sobre o assunto) e de orientação útil, não de suposições. Não faça contas, porcentagens ou conversões que ninguém pediu; quando fizer uma conta, confira o resultado antes de escrever.",
    "Código, matemática, ciência e leis: antes de afirmar como algo funciona, confira mentalmente (rode o código na cabeça, refaça a conta). Se não tiver certeza, diga que não tem, em vez de afirmar.",
    // Personalidade completa (texto do dono do projeto, 11/11): na remota vai inteira, por último, onde o 32B segue melhor.
    `${PERSONALITY}\nSem jargão de sistema e sem emojis.`,
    "Fidelidade: fatos do ambiente (regras, datas, valores, nomes) só os que estão no material; o que vier do conhecimento geral, diga que vem daí; o que for hipótese, diga que é hipótese. Nunca invente fontes, números ou experiências.",
  ].join("\n");
}

/**
 * Raciocínio (o "pensar" do Qwen3) no remoto: só em código, contas e leis, onde a correção cega mostrou
 * erros com ele desligado (afirmação falsa sobre Python, conta contraditória). Em estudo, análise e revisão
 * ele custava 15 a 28 s de silêncio antes da primeira palavra sem mudar a nota (a conta errada do estudo de
 * memória virtual saiu com ele ligado), então ficou desligado. O vLLM devolve o raciocínio à parte
 * (--reasoning-parser) e ele não chega à pessoa. KALLY_REMOTE_THINK="nunca" desliga sempre; "sempre" liga sempre.
 */
export function remoteThinks(input: { competence: CompetenceId | null; mode: string; message: string; brief: boolean }): boolean {
  const setting = process.env.KALLY_REMOTE_THINK;
  if (setting === "nunca") return false;
  if (setting === "sempre") return true;
  if (input.brief) return false;
  // Post: testado com raciocínio em 10/11 e não melhorou a fidelidade (os mesmos detalhes de cena inventados), com +11 s.
  return /```|\bdef |\bimport |\bfunction\b|\bprint\(|\btraceback\b|\b(c[oó]digo|bug|erro no|python|javascript)\b|\b(art\.?|artigo)s?\s*\d|\bcalcul|\bquanto (eu )?(ganho|lucro|custa)/i.test(input.message);
}

/** Teto de tokens da resposta no remoto (o contexto do vLLM ainda limita, em runRemote). */
export function remoteMaxTokens(competence: CompetenceId | null, brief: boolean, post: boolean): number {
  if (brief) return 900;
  if (post) return 3_600;
  return competence === "estudo" || competence === "analise" ? 4_096 : 2_800;
}
