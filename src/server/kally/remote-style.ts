import type { CompetenceId } from "@/server/kally/competences";
import { PERSONALITY } from "@/server/kally/personality";
import { DRAWING_RULE } from "@/server/kally/drawing";
import { HELP_RULE, QUIZ_RULE } from "@/server/kally/help";

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
// Usado só quando não há plano de resposta (plan.ts); com plano, a extensão vem do esforço, sem número de palavras.
const SIZE: Record<string, string> = {
  estudo: "completa para a pessoa entender e aplicar, sem esticar",
  analise: "a necessária para avaliar cada ponto relevante, sem esticar",
  orientacao: "a necessária para ela saber o que fazer, em que ordem",
  post: "de 200 a 450 palavras, proporcional ao que ela contou",
  postElaborado: "o que a matéria da pessoa sustentar (sem inventar para alongar), em geral de 500 a 1.000 palavras",
  // Ponto 4 da personalidade: pergunta simples, resposta direta; assunto complexo, resposta completa.
  conversa: "proporcional ao pedido: pergunta simples ou papo, algumas frases diretas e naturais, sem títulos; assunto que pede explicação, o necessário para entender, sem esticar",
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
/**
 * Post elaborado (pedido grande: esforço Aprofundado ou Máximo, "post completo/estruturado/com fontes", muita matéria):
 * a estrutura de antes, com seções, citação, tabela quando houver comparação, fontes no texto e "Referências" no fim.
 * O post comum é o casual (POST_RULES); este só entra quando o pedido é grande (dono do projeto, 13/11/2026).
 */
const STRUCTURED_POST_RULES = [
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
  "- Uma figura (```figura lado=direita, com o parágrafo que ela ilustra ao lado, pelas regras de figura) quando ajudar a mostrar algo que ela descreveu ou que a fonte explica; nunca para enfeitar, e no máximo uma.",
  "- Um bloco recolhível :::details[Para saber mais] com o aprofundamento das fontes que não cabe no corpo, quando houver fontes.",
  "- No fim do rascunho, se usou fontes, uma seção \"## Referências\" com cada fonte usada como item de lista: [Título](URL) — Fonte.",
  "Fecho: retome a percepção dela numa frase nova, sem lição de moral, chamada ao leitor ou conclusão que ela não tirou.",
  "Expressões de tempo e frequência ficam exatamente como ela disse (\"tenho reparado\" continua \"tenho reparado\", não vira \"há pouco tempo\" nem \"sempre\").",
  "Esqueleto (o tema é outro; siga a forma, não o conteúdo):\n<rascunho>\n# Título que diz a ideia dela\nCategorias: …\n\nAbertura com a percepção dela, nas palavras dela.\n\n## Subtítulo com a primeira ideia dela\nO que ela contou, desenvolvido e ligado.\n\n> A frase central dela.\n\n## Subtítulo com o que explica isso\nIsso tem nome: [Nome do conceito](URL exata da fonte [E…]). O que a fonte explica e como se liga ao que ela percebeu.\n\n| O que ela comparou | Lado A | Lado B |\n|---|---|---|\n| … | … | … |\n\n## Subtítulo com a consequência que ela tirou\n…\n\n:::details[Para saber mais]\nAprofundamento a partir das fontes.\n:::\n\n## Referências\n- [Título da fonte](URL exata) — Fonte\n</rascunho>",
  "Revise a gramática antes de entregar (concordância e conjugação, ex.: \"volto ao texto e releio\").",
  "Checagem final do rascunho: nenhum subtítulo genérico (\"Introdução\", \"Conclusão\", \"Considerações finais\"); a citação (> ) usa as palavras dela; toda fonte usada aparece com link no texto E na seção \"## Referências\" no fim; nenhuma frase sobre ela que ela não tenha dito; nenhuma palavra com gênero sobre ela (\"envolvida\", \"cansado\") se ela não revelou o gênero: reescreva sem o adjetivo (\"me envolvo\", \"o cansaço\"); nenhuma palavra truncada ou inventada.",
  "Depois do rascunho, fora dele e em até 4 linhas: o que veio dela e o que veio das fontes, dois títulos alternativos e 2 sugestões do que ela poderia acrescentar com as palavras dela (um caso vivido, um antes e depois) para o texto ficar mais forte.",
].join("\n");

const SHORT_POST = "Matéria curta: o rascunho tem de 120 a 250 palavras, sem subtítulos. Escreva mesmo assim, a partir do tema e do que ela disse, completando com reflexões coerentes (sem fatos concretos inventados).";

/**
 * Vícios de assistente que deixam a resposta artificial (lista do dono do projeto, 17/11/2026). Medidos pelo
 * style-lint.ts na bateria de respostas; aqui viram instrução direta.
 */
export const NATURAL_RULE =
  "Evite: elogiar a pessoa ou a pergunta; repetir ou parafrasear a pergunta antes de responder; saudação no começo de toda resposta; conclusão genérica que só resume o que acabou de ser dito (\"Em resumo\", \"Espero ter ajudado\"); pergunta obrigatória no fim (só pergunte se a resposta dela mudar o próximo passo); títulos e listas numa resposta que cabe em poucos parágrafos; tom de relatório ou formalidade à toa; emojis. Responda no tom da conversa: leve no papo, claro e rigoroso no técnico.";

/** structured: post elaborado (pedido grande); sem ele, o post é casual. */
export function remoteStyle(input: {
  competence: CompetenceId | null;
  brief: boolean;
  post: boolean;
  shortPost?: boolean;
  structured?: boolean;
  /** plano de resposta (plan.ts): o esforço decide a extensão e o quanto desenvolver */
  plan?: { effort: "rapido" | "normal" | "profundo"; sizeGuide: string };
}): string {
  if (input.brief) {
    return [
      "Modo de alta qualidade, pedido de resposta curta: responda com precisão e naturalidade em poucas frases bem escolhidas, sem títulos, e ofereça aprofundar se ela quiser.",
    ].join("\n");
  }
  // Papo e relato (esforço rápido): só a personalidade e a naturalidade. As regras de organização visual, quiz e figura
  // não servem a um "aprendi a programar hoje!" e custavam ~2.500 tokens de prompt.
  if (input.plan?.effort === "rapido" && !input.post) {
    return [`Extensão: ${input.plan.sizeGuide}.`, NATURAL_RULE, `${PERSONALITY}\nSem jargão de sistema e sem emojis.`].join("\n");
  }
  const size = input.shortPost
    ? "de 120 a 250 palavras no rascunho"
    : input.post
      ? SIZE[input.structured ? "postElaborado" : "post"]
      : (input.plan?.sizeGuide ?? SIZE[input.competence ?? "conversa"] ?? SIZE.conversa);
  // Post: só as regras de post casual. As de "alta qualidade" (profundidade, exemplos, nuances, títulos, tabelas,
  // diagramas, próximos passos) faziam o post sair com cara de artigo científico, com fontes e "Referências"
  // (conversa de 13/11 sobre as férias da faculdade: o dono do projeto não conseguiu postar).
  if (input.post && !input.structured) {
    return [
      `Extensão: ${size}.`,
      input.shortPost ? `${POST_RULES}\n${SHORT_POST}` : POST_RULES,
      // Figura no post casual: só quando ela pede um desenho (teste de 15/11: a figura saía no fim, ilegível e
      // comentada no próprio post, "o desenho acima ilustra…").
      "Figura: só se ela pedir um desenho ou uma ilustração; aí, uma única figura ao lado do parágrafo que ela ilustra, seguindo as regras abaixo.",
      DRAWING_RULE,
      `${PERSONALITY}\nSem jargão de sistema e sem emojis.`,
    ].join("\n");
  }
  return [
    "MODO DE ALTA QUALIDADE (substitui os alvos de tamanho e formato anteriores; as regras sobre o material, a privacidade, a autoria e a fidelidade continuam valendo integralmente).",
    "Entenda primeiro o que a pessoa realmente precisa: a intenção por trás do pedido, o nível dela e o uso que vai fazer da resposta. Pedido claro: responda direto, sem repetir nem resumir o que ela pediu (\"Entendi: você quer…\"). Só se houver duas leituras que mudam a resposta, assuma a mais útil e diga em uma frase qual foi.",
    input.plan?.effort === "normal"
      ? "Abra respondendo diretamente, em uma ou duas frases claras. Desenvolva o que a dúvida pede: o porquê e um exemplo concreto quando ajudarem; nuances e exceções só se mudarem a resposta para ela."
      : "Abra respondendo diretamente, em uma ou duas frases claras. Depois desenvolva com profundidade de verdade: explique o porquê, mostre exemplos concretos, aponte nuances, exceções e erros comuns, e conecte com o que a pessoa trouxe ou com o que o ambiente já tem.",
    NATURAL_RULE,
    "Exemplos: prefira situações típicas e casos ilustrativos (\"imagine que…\", \"num computador comum…\"). Um caso real com data, lugar, número, nome ou trajetória só entra se estiver nas fontes [E…] ou se você tiver certeza absoluta; na dúvida, use um exemplo genérico. Exemplo ilustrativo (\"imagine que…\") não usa data, cidade nem evento real, e os números dele são redondos e ditos aproximados. Errar um fato concreto estraga a resposta inteira.",
    "A pessoa está no Brasil: no que muda com o lugar (hemisfério, estações, como a Lua aparece no céu, unidades, leis, moeda, datas comemorativas), use o padrão brasileiro (hemisfério sul, sistema métrico, real) e diga quando for diferente em outro lugar. Escreva tudo em português; termo estrangeiro só quando não houver tradução comum, com a tradução entre parênteses.",
    "Fontes: quando usar uma fonte [E…], cite no próprio parágrafo com link Markdown para o endereço exato, ex.: [título curto](URL). Nunca escreva a marca [E…], nunca liste fonte sem link, não use notas de rodapé ([^1]) e nunca cite estudo, autor ou número que não esteja nas fontes recebidas. Citação de fonte em outra língua vai traduzida.",
    `Extensão: ${size}. Cada parte precisa acrescentar algo; nada de repetir, de frases genéricas ou de encher.`,
    "Organização visual, usando só o que ajuda a entender: títulos curtos (##); listas; **negrito** nos conceitos-chave; uma tabela Markdown (com linha de cabeçalho) quando houver comparação, etapas com atributos ou dados; um diagrama em bloco ```mermaid (flowchart TD, um nó por linha no formato A[\"Rótulo curto\"], setas A --> B, sem HTML) quando houver processo, fluxo, decisão ou relação entre partes, seguido de uma frase dizendo o que ele mostra (pedido de desenho, ilustração ou figura não é mermaid: é um ```figura, pelas regras de figura); uma citação (> ) para destacar a ideia central; uma lista de tarefas (- [ ]) quando houver passos para a pessoa fazer; e, para um aprofundamento opcional que não deve pesar na leitura, um bloco recolhível exatamente assim:\n:::details[Título do aprofundamento]\nconteúdo\n:::\nFórmulas: o app não desenha LaTeX. Nunca use $, $$, \\(, \\[, \\frac, \\cdot, \\hat, \\sum nem blocos ```math: escreva a fórmula em texto com símbolos (ŷ = β₀ + β₁·x, x², √x, Σ, ≤, ≥, ×, ≈), numa linha própria quando for central. Nada de HTML (<br>, <b>, <sup>); numa célula de tabela, nada de quebra de linha.",
    // "Próximos passos" obrigatório deixava toda resposta com o mesmo fecho (bateria de 15/11): agora o fecho é livre.
    input.post ? STRUCTURED_POST_RULES : `${HELP_RULE}\n${QUIZ_RULE}`,
    "Pergunta factual sobre o ambiente: responda primeiro o fato exatamente como está no material; o desenvolvimento vem do próprio material (o que mais ele diz sobre o assunto) e de orientação útil, não de suposições. Não faça contas, porcentagens ou conversões que ninguém pediu; quando fizer uma conta, confira o resultado antes de escrever.",
    DRAWING_RULE,
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
  // Provas, quizzes e exercícios: as respostas precisam estar certas (pedido do dono do projeto, 15/11), então pensa antes.
  if (/\b(prova|simulado|quiz|exerc[ií]cios?|quest(ão|ões|oes)|acertei|resposta final)\b/i.test(input.message)) return true;
  // Post: testado com raciocínio em 10/11 e não melhorou a fidelidade (os mesmos detalhes de cena inventados), com +11 s.
  return /```|\bdef |\bimport |\bfunction\b|\bprint\(|\btraceback\b|\b(c[oó]digo|bug|erro no|python|javascript)\b|\b(art\.?|artigo)s?\s*\d|\bcalcul|\bquanto (eu )?(ganho|lucro|custa)/i.test(input.message);
}

/** Teto de tokens da resposta no remoto (o contexto do vLLM ainda limita, em runRemote). */
export function remoteMaxTokens(competence: CompetenceId | null, brief: boolean, post: boolean): number {
  if (brief) return 900;
  if (post) return 3_600;
  return competence === "estudo" || competence === "analise" ? 4_096 : 2_800;
}

/**
 * Pedido de programação (vai para o Kally Coding, codingConfig em ai/remote.ts): código colado, linguagem ou
 * ferramenta citada, ou pedido de escrever/consertar código. "Código civil", "programa de TV" e "programação da
 * semana" ficam de fora.
 */
const CODE_SIGNAL =
  /```|\b(def|import|function|const|let|var|class|return|print|console\.log|#include|public static)\b[^\n]{0,40}[({=:]|\btraceback\b|\bstack ?trace\b|\b(python|javascript|typescript|java|kotlin|swift|c\+\+|c#|golang|rust|php|ruby|sql|html|css|react|vue|angular|node(\.?js)?|django|flask|fastapi|bash|powershell|regex|json|api rest|git|docker|prisma|next\.?js|expo|arduino|matlab)\b|\b(c[oó]digo|programa(r|ndo|dor|dora)|programa[cç][aã]o (em|de computadores|orientada|funcional|web)|script|algoritmo|fun[cç][aã]o (em|que|para|recursiva)|debugar|depurar|compila(r|dor|ção)|bug|refatora\w*|endpoint|array|lista encadeada|recurs[aã]o)\b/i;
const NOT_CODE = /\bc[oó]digo (civil|penal|de defesa|tribut\w+|eleitoral|de [eé]tica|postal|de barras|de conduta|florestal|de tr[aâ]nsito)\b|\bprograma[cç][aã]o (da|do|de) (semana|dia|tv|festa|evento|viagem)\b/i;

export function asksForCode(message: string): boolean {
  return CODE_SIGNAL.test(message) && !NOT_CODE.test(message);
}

/**
 * Pedido de conta ou de questão de exatas (vai para o Kally Coding junto com programação, pedido de 15/11: "a precisão
 * matemática é crucial"). Integral, derivada, limite, matriz, probabilidade, juros, circuito, ou uma expressão com números.
 */
const MATH_SIGNAL =
  /\b(integr(al|ais|e|ar)|deriv(ada|adas|e|ar)|limite|equa[cç](ão|ões|ao|oes) (diferencial|do|de)|resolv(a|e|er) (a|o|as|os|esta|essa|este|esse)? ?(equa|sistema|conta|integral|problema|quest)|calcul(e|a|ar|o)|quanto (é|e|vale|d[aá])|matriz|determinante|autovalor|autovetor|vetor gradiente|probabilidade|combina[cç](ão|ões)|permuta[cç]|arranjo|juros|montante|parcela|tabela price|circuito el[eé]trico|resist[eê]ncia equivalente|imped[aâ]ncia|fator de pot[eê]ncia|bhaskara|logaritmo|trigonometr|seno|cosseno|s[eé]rie (geom|aritm|de taylor|de maclaurin|de fourier|de pot[eê]ncias)|progress[aã]o (aritm|geom)|desvio padr[aã]o|vari[aâ]ncia)\b|\d\s*[+\-*/^×÷]\s*\(?\d|∫|∑|√|∂|\bquanto (é|e|vale|d[aá])(?=[\s?]|$)|\d+([.,]\d+)?\s*%|\d\s*[a-z]\s*[+\-*/]\s*\d+\s*=\s*-?\d/i;
const MATH_SUBJECT = /\b(c[aá]lculo|[aá]lgebra|geometria|f[ií]sica|eletricidade|eletr[oô]nica|matem[aá]tica|estat[ií]stica|exatas|qu[ií]mica)\b/i;
// Palavras do dia a dia (tensão, corrente, potência, média, circuito) só contam junto de números ou unidades.
const MATH_WITH_NUMBERS =
  /\b(tens[aã]o|corrente|pot[eê]ncia|resist[eê]ncia|resistor|capacitor|indutor|circuito|m[eé]dia|mediana|porcentagem|tangente)\b[^\n]{0,80}\d|\d[^\n]{0,40}\b(volts?|amp[eè]res?|ohms?|watts?|hz)\b|\d\s*(v|a|ω|w|kw|kva|μf|mh)\b/i;

export function asksForMath(message: string): boolean {
  return MATH_SIGNAL.test(message) || MATH_WITH_NUMBERS.test(message) || (MATH_SUBJECT.test(message) && /\b(prova|quiz|simulado|exerc[ií]cios?|quest(ão|ões|oes)|lista)\b/i.test(message));
}
