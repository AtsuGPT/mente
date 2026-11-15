/**
 * Figuras que a Kally desenha ela mesma (14/11/2026): um SVG simples num bloco ```desenho, que o app desenha nítido
 * (mobile/src/components/markdown/drawing.tsx, que também limpa tudo o que não é forma). Serve para o que um texto
 * explica mal: a forma de algo, as partes de um objeto, uma relação no espaço, uma comparação visual. Fluxo e
 * processo continuam em ```mermaid. As cores são as da Mente (o app é escuro).
 */
/**
 * Figuras por modelo pronto (15/11/2026): a Kally escreve só os dados num bloco ```figura e o app desenha
 * (mobile/src/components/markdown/figure.tsx), com posições calculadas. Os SVGs escritos pelo modelo saíam com formas
 * sobrepostas e texto ilegível; o ```desenho livre fica só para o que nenhum modelo cobre.
 */
export const FIGURE_RULE = [
  "Figuras: quando uma imagem explicar melhor que o texto, use um bloco ```figura com os dados; o app desenha no visual da Mente. Modelos (tipo):",
  "- blocos: etapas, divisões ou passos em sequência (de 2 a 7);",
  "- ciclo: algo que se repete em volta (de 3 a 7 etapas);",
  "- objetos: objetos lado a lado com setas entre eles (de 2 a 5), ex.: Sol, Lua e Terra num eclipse; tamanho p, m ou g no terceiro campo e o texto de uma seta numa linha → logo abaixo do item de onde ela sai;",
  "- partes: um tema no centro (titulo) e as partes em volta (de 3 a 8);",
  "- comparacao: duas ou três colunas, cada uma aberta por uma linha lado: Nome;",
  "- barras: valores comparados (o número no terceiro campo);",
  "- tempo: linha do tempo (de 2 a 7 marcos; cada item é - Marco | ano ou data).",
  "Formato: primeira linha tipo: e o nome do modelo; titulo: opcional; depois um item por linha, começando com - (rótulo curto, até 3 palavras; depois de | uma nota opcional, até 6 palavras; depois de outro | o tamanho ou o valor, quando o modelo usa). Exemplos:\n```figura\ntipo: objetos\ntitulo: Eclipse solar\n- Sol | fonte de luz | g\n→ luz\n- Lua | bloqueia a luz | p\n→ sombra\n- Terra | recebe a sombra | m\n```\n```figura\ntipo: comparacao\nlado: Reler\n- leitura passiva\n- sensação de saber\nlado: Flashcards\n- puxa da memória\n- mostra o que falta\n```\n```figura\ntipo: tempo\n- ARPANET | 1969\n- Web | 1991\n- Smartphones | 2007\n```",
  "Ao lado de um parágrafo: ```figura lado=direita, os dados, uma linha --- e o parágrafo que ela ilustra, dentro do bloco. Depois de uma figura numa resposta, diga em uma frase o que ela mostra; num post, não comente a figura.",
  "Só se nenhum modelo servir (a forma de um objeto, um desenho de verdade), desenhe um SVG num bloco ```desenho, pelas regras abaixo.",
].join("\n");

/**
 * 15/11/2026: nos testes, as figuras saíam com preenchimento lilás opaco e texto claro por cima (ilegível), a Terra
 * como um quadrado e rótulos em cima das linhas. A regra agora diz como compor (forma fiel, margem, rótulo fora da
 * forma, preenchimento translúcido) e traz um exemplo curto no estilo certo.
 */
const DRAWING_EXAMPLE = [
  '<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">',
  '  <circle cx="90" cy="140" r="46" fill="#8461F0" fill-opacity="0.2" stroke="#C7B7FA" stroke-width="2.5"/>',
  '  <text x="90" y="215" fill="#F2EFFA" font-size="16" text-anchor="middle">Origem</text>',
  '  <line x1="146" y1="140" x2="246" y2="140" stroke="#B65CF2" stroke-width="2.5" stroke-linecap="round"/>',
  '  <polygon points="246,132 262,140 246,148" fill="#B65CF2"/>',
  '  <text x="200" y="124" fill="#C7B7FA" font-size="14" text-anchor="middle">passa para</text>',
  '  <circle cx="312" cy="140" r="28" fill="#8461F0" fill-opacity="0.2" stroke="#C7B7FA" stroke-width="2.5"/>',
  '  <text x="312" y="215" fill="#F2EFFA" font-size="16" text-anchor="middle">Destino</text>',
  '</svg>',
].join("\n");

export const DRAWING_RULE = [
  FIGURE_RULE,
  "Desenho livre (só quando nenhum modelo de ```figura servir; fluxo e processo continuam em ```mermaid): um SVG num bloco ```desenho (o rótulo é desenho, não svg).",
  "Como desenhar: comece com <svg viewBox=\"0 0 400 300\" xmlns=\"http://www.w3.org/2000/svg\">; use só rect, circle, ellipse, line, polyline, polygon, path, g e text; traço de 2 a 3 (stroke-width) com stroke-linecap=\"round\"; sem fundo, porque o app é escuro; cores: linhas #C7B7FA, destaques #8461F0 e #B65CF2, apoio #6E6787; texto #F2EFFA, font-size de 14 a 18, text-anchor=\"middle\" ao centralizar. Nada de script, style, imagem externa, filtro, animação ou fonte própria.",
  "Posições (faça a conta antes de escrever o SVG): N objetos lado a lado têm os centros em x = 400 × i ÷ (N + 1), para i de 1 a N (3 objetos: x = 100, 200, 300), todos em y = 140; o raio ou a meia-largura de cada um é no máximo 400 ÷ (N + 1) ÷ 2 − 10, para sobrar espaço entre eles; nada se sobrepõe, a não ser que a sobreposição seja o assunto; uma seta liga a borda de um objeto à borda do seguinte; o rótulo fica 30 abaixo da forma (y = 140 + raio + 30). Objetos em pilha: a mesma conta no eixo y (300 de altura).",
  "Composição: desenhe cada coisa com a forma que ela tem (Sol, Terra, Lua e planetas são círculos; uma casa tem telhado), em tamanhos e posições coerentes com a realidade; preenchimento sempre translúcido (fill-opacity de 0.12 a 0.3) ou fill=\"none\", nunca uma cor clara opaca, porque o texto é claro; direção com uma linha e uma ponta (polygon pequeno); deixe 20 de margem nas bordas; rótulos curtos em português, fora das formas (embaixo ou ao lado), sem cruzar linhas nem se sobrepor; no máximo 8 rótulos.",
  `Exemplo do estilo (o assunto é outro; copie a forma, não o conteúdo):\n${DRAWING_EXAMPLE}`,
  "Figura ao lado de um parágrafo: abra o bloco com ```desenho lado=direita (ou esquerda), escreva o SVG, uma linha com ---, e o parágrafo que ela ilustra. Sozinha e centralizada: só ```desenho com o SVG. Num post (dentro de <rascunho>), use a figura ao lado do parágrafo e não comente a figura no texto do post (nada de \"o desenho acima mostra\").",
  "No máximo duas figuras por resposta, e só quando elas ajudam de verdade; numa resposta (fora de post), depois de cada uma, diga em uma frase o que ela mostra. Nunca desenhe para enfeitar.",
].join("\n");

/** Pedido explícito de desenho (mensagens curtas e o modelo local recebem só este lembrete, no fim). */
/** Desenho pedido num post: a figura fica ao lado do parágrafo que ela ilustra, sem comentário no texto do post. */
export const DRAWING_POST_REMINDER = [
  " A figura, dentro do rascunho, segue este modelo (troque só o que está entre colchetes; tipo é um destes: blocos, ciclo, objetos, partes, comparacao, barras, tempo):",
  "```figura lado=direita",
  "tipo: [modelo]",
  "- [Rótulo curto] | [nota curta]",
  "- [Rótulo curto] | [nota curta]",
  "---",
  "[o parágrafo do post que a figura ilustra]",
  "```",
  "Nenhuma frase do post comenta a figura.",
].join("\n");
export const WANTS_DRAWING = /\b(desenh\w*|ilustr\w*|esquemas? visua\w*|rabisc\w*|imagem explicativa)\b/i;
export const DRAWING_REMINDER =
  " Formato: a pessoa pediu um desenho, então é uma figura, não um diagrama mermaid nem uma lista. Use um bloco ```figura com o modelo que servir, no formato das regras de figura (a primeira linha diz tipo: seguido de blocos, ciclo, objetos, partes, comparacao, barras ou tempo). Só se nenhum modelo servir, um bloco cuja primeira linha é exatamente ```desenho, com um SVG simples (viewBox 0 0 400 300; só rect, circle, ellipse, line, path, polygon e text; traço #C7B7FA, destaques #8461F0, texto #F2EFFA de 14 a 18; cada coisa com a forma real dela; preenchimento translúcido (fill-opacity até 0.3), nunca cor clara opaca; rótulos fora das formas; 20 de margem; sem fundo, sem script ou estilo) e explique em seguida o que ela mostra.";
