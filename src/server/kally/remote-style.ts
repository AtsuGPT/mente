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

/**
 * Post na remota. Rodada cega de 10/11: o rascunho do 32B saiu só em parágrafos e subtítulos, repetiu a mesma
 * ideia em três seções, não usou nenhuma fonte e ainda inventou "há pouco tempo" e "me acontece com frequência".
 * Agora: duas camadas separadas (a vivência dela, só com o que ela contou; o conhecimento, só das fontes [E…],
 * citado com link), recursos do editor com função e nenhuma repetição.
 */
const POST_RULES = [
  "RASCUNHO DE POST. O texto tem duas camadas, que nunca se misturam (a camada 2 é a única exceção à regra de não acrescentar fatos, e só com fonte [E…]):",
  "1. A vivência e as opiniões dela, em primeira pessoa e na voz dela: SÓ o que ela contou. Toda frase em primeira pessoa (eu, me, meu, a gente) é uma frase DELA: pode ajustar pontuação, ordem e ligação entre frases, mas não crie frase nova em primeira pessoa (nenhum \"no começo eu queria…\", \"percebi que…\", \"aprendi que…\" que ela não disse). O desenvolvimento vem na camada 2, em terceira pessoa. Nenhuma situação, episódio, lembrança, sentimento, frequência ou tempo que ela não disse (nada de \"há pouco tempo\", \"sempre\", \"com frequência\", \"uma vez\", \"por exemplo, quando eu\"). Não troque o que ela disse por algo mais forte.",
  "2. O conhecimento que sustenta ou explica o que ela percebeu: SÓ das fontes externas [E…] recebidas, quando realmente tratarem do assunto dela. Apresente como conhecimento, não como vivência (\"Isso tem nome: …\", \"A explicação mais aceita é…\"), e cite no próprio parágrafo com link Markdown para o endereço exato informado, ex.: [Repetição espaçada](URL). Fonte que não trata do que ela disse é ignorada. Sem fontes, não cite pesquisa, autor, estudo nem número nenhum. Com fontes, use de 3 a 5, de tipos diferentes (referência, notícia nacional, notícia global, rede social, vídeo), preferindo referências e veículos conhecidos a blogs e títulos sensacionalistas; o tipo de cada fonte vem depois do site, ex.: \"exame.com · notícia nacional\". Uma tabela, se houver, compara o que ela disse com o que as fontes explicam; nunca uma expectativa ou um antes que ela não contou.",
  "O exemplo de referência é de OUTRA pessoa: nenhum fato, número, cena ou frase dele entra neste rascunho, mesmo que o tema seja parecido. Antes de escrever, separe o que esta pessoa disse; o rascunho só usa isso.",
  "Proibido em qualquer parte do rascunho: falas entre aspas de outras pessoas, frases que ela ou alguém teria dito, detalhes de cena (roupas, cheiros, sons, gestos, cômodos) e cenas que ela não descreveu. Se ela disse \"cada uma lembra de um detalhe\", o texto diz isso, sem inventar qual detalhe. Fotos, objetos, lugares e pessoas que ela mencionou não ganham descrição: \"ela mandou uma foto do primeiro inverno\" fica exatamente assim, sem dizer o que aparece na foto.",
  "No :::details[Para saber mais] e em qualquer frase de conhecimento, só o que a fonte [E…] diz, com o link; \"estudos apontam\", \"pesquisas mostram\" e afins só se a fonte disser isso.",
  "Proporção: o número de seções acompanha a matéria dela. Com pouca matéria (um ou dois parágrafos de relato), 2 seções curtas e nenhum recurso que exija conteúdo novo; nunca crie uma seção para encher. Recursos só quando houver o que colocar neles.",
  "Construção do post, usando os recursos do editor com função:",
  "- # Título forte e específico; um parágrafo de abertura que apresenta a percepção dela.",
  "- Seções com ## subtítulos que digam a ideia da seção (não rótulos como \"Introdução\" ou \"Conclusão\"). Cada seção traz algo novo: uma percepção dela, a explicação da fonte, a ligação entre as duas ou a consequência. Nunca repita a mesma ideia em outra seção, nem resuma o texto no fim.",
  "- Uma citação em destaque (> ) com a frase central DELA, com as palavras dela.",
  "- Uma tabela quando ela comparar duas formas de fazer ou dois momentos (ex.: copiar × reescrever), com o que ela disse e, se houver, o que a fonte explica.",
  "- Uma lista quando houver passos ou sinais que ela descreveu; um diagrama ```mermaid só se houver um processo claro no que ela contou.",
  "- Um bloco recolhível :::details[Para saber mais] com o aprofundamento das fontes que não cabe no corpo, quando houver fontes.",
  "- No fim do rascunho, se usou fontes, uma seção \"## Referências\" com cada fonte usada como item de lista: [Título](URL) — Fonte.",
  "Fecho: retome a percepção dela numa frase nova, sem lição de moral, chamada ao leitor ou conclusão que ela não tirou.",
  "Expressões de tempo e frequência ficam exatamente como ela disse (\"tenho reparado\" continua \"tenho reparado\", não vira \"há pouco tempo\" nem \"sempre\").",
  "Esqueleto (o tema é outro; siga a forma, não o conteúdo):\n<rascunho>\n# Título que diz a ideia dela\nCategorias: …\n\nAbertura com a percepção dela, nas palavras dela.\n\n## Subtítulo com a primeira ideia dela\nO que ela contou, desenvolvido e ligado.\n\n> A frase central dela.\n\n## Subtítulo com o que explica isso\nIsso tem nome: [Nome do conceito](URL exata da fonte [E…]). O que a fonte explica e como se liga ao que ela percebeu.\n\n| O que ela comparou | Lado A | Lado B |\n|---|---|---|\n| … | … | … |\n\n## Subtítulo com a consequência que ela tirou\n…\n\n:::details[Para saber mais]\nAprofundamento a partir das fontes.\n:::\n\n## Referências\n- [Título da fonte](URL exata) — Wikipédia\n</rascunho>",
  "Revise a gramática antes de entregar (concordância e conjugação, ex.: \"volto ao texto e releio\").",
  "Checagem final do rascunho: nenhum subtítulo genérico (\"Introdução\", \"Conclusão\", \"Considerações finais\"); a citação (> ) usa as palavras dela; toda fonte usada aparece com link no texto E na seção \"## Referências\" no fim; nenhuma frase sobre ela que ela não tenha dito; nenhuma palavra com gênero sobre ela (\"envolvida\", \"cansado\") se ela não revelou o gênero: reescreva sem o adjetivo (\"me envolvo\", \"o cansaço\"); nenhuma palavra truncada ou inventada.",
  "Depois do rascunho, fora dele e em até 4 linhas: o que veio dela e o que veio das fontes, dois títulos alternativos e 2 sugestões do que ela poderia acrescentar com as palavras dela (um caso vivido, um antes e depois) para o texto ficar mais forte.",
].join("\n");

/**
 * Post com pouca matéria (menos de ~400 caracteres dela): com o alvo de 500 a 1.000 palavras, o 32B enchia com o que
 * ela não disse ("perder uns quilos", "no parque, na areia"; teste de 10/11 com duas frases sobre começar a correr).
 */
const SHORT_POST = "Matéria curta: o rascunho tem de 120 a 300 palavras, no máximo um subtítulo, sem tabela e sem diagrama. Cada frase vem do que ela disse ou da fonte; o que faltar fica para as sugestões depois do rascunho.";

export function remoteStyle(input: { competence: CompetenceId | null; brief: boolean; post: boolean; shortPost?: boolean }): string {
  if (input.brief) {
    return [
      "Modo de alta qualidade, pedido de resposta curta: responda com precisão e naturalidade em poucas frases bem escolhidas, sem títulos, e ofereça aprofundar se ela quiser.",
    ].join("\n");
  }
  const size = input.shortPost ? "de 120 a 300 palavras no rascunho" : SIZE[input.post ? "post" : input.competence ?? "conversa"] ?? SIZE.conversa;
  return [
    "MODO DE ALTA QUALIDADE (substitui os alvos de tamanho e formato anteriores; as regras sobre o material, a privacidade, a autoria e a fidelidade continuam valendo integralmente).",
    "Entenda primeiro o que a pessoa realmente precisa: a intenção por trás do pedido, o nível dela e o uso que vai fazer da resposta. Se o pedido tiver ambiguidade, assuma a leitura mais útil e diga em uma frase qual foi.",
    "Abra respondendo diretamente, em uma ou duas frases claras. Depois desenvolva com profundidade de verdade: explique o porquê, mostre exemplos concretos e específicos, aponte nuances, exceções e erros comuns, e conecte com o que a pessoa trouxe ou com o que o ambiente já tem.",
    `Extensão: ${size}. Cada parte precisa acrescentar algo; nada de repetir, de frases genéricas ou de encher.`,
    "Organização visual, usando só o que ajuda a entender: títulos curtos (##); listas; **negrito** nos conceitos-chave; uma tabela Markdown (com linha de cabeçalho) quando houver comparação, etapas com atributos ou dados; um diagrama em bloco ```mermaid (flowchart TD, um nó por linha no formato A[\"Rótulo curto\"], setas A --> B, sem HTML) quando houver processo, fluxo, decisão ou relação entre partes, seguido de uma frase dizendo o que ele mostra; uma citação (> ) para destacar a ideia central; uma lista de tarefas (- [ ]) quando houver passos para a pessoa fazer; e, para um aprofundamento opcional que não deve pesar na leitura, um bloco recolhível exatamente assim:\n:::details[Título do aprofundamento]\nconteúdo\n:::",
    input.post ? (input.shortPost ? `${POST_RULES}\n${SHORT_POST}` : POST_RULES) : "Termine com uma seção curta \"Próximos passos\" ou \"Para ir além\": 2 ou 3 sugestões concretas e proativas, específicas para esta pessoa e este pedido (o que melhorar, o que testar, o que ler ou perguntar a seguir).",
    "Pergunta factual sobre o ambiente: responda primeiro o fato exatamente como está no material; o desenvolvimento vem do próprio material (o que mais ele diz sobre o assunto) e de orientação útil, não de suposições. Não faça contas, porcentagens ou conversões que ninguém pediu; quando fizer uma conta, confira o resultado antes de escrever.",
    "Código, matemática, ciência e leis: antes de afirmar como algo funciona, confira mentalmente (rode o código na cabeça, refaça a conta). Se não tiver certeza, diga que não tem, em vez de afirmar.",
    "Linguagem: português brasileiro natural, caloroso e sofisticado, como uma pessoa muito competente que se importa com quem pergunta. Mostre que entendeu a situação dela. Sem jargão de sistema, sem bajulação, sem elogiar a pergunta, sem emojis.",
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
