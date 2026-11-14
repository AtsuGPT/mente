/**
 * Figuras que a Kally desenha ela mesma (14/11/2026): um SVG simples num bloco ```desenho, que o app desenha nítido
 * (mobile/src/components/markdown/drawing.tsx, que também limpa tudo o que não é forma). Serve para o que um texto
 * explica mal: a forma de algo, as partes de um objeto, uma relação no espaço, uma comparação visual. Fluxo e
 * processo continuam em ```mermaid. As cores são as da Mente (o app é escuro).
 */
export const DRAWING_RULE = [
  "Figuras próprias: quando uma imagem simples explicar melhor que o texto (a forma de algo, as partes de um objeto, uma relação no espaço, uma comparação visual) e não for um fluxo (fluxo e processo continuam em ```mermaid), desenhe você mesma um SVG num bloco ```desenho (o rótulo é desenho, não svg).",
  "Como desenhar: comece com <svg viewBox=\"0 0 400 300\" xmlns=\"http://www.w3.org/2000/svg\">; use só rect, circle, ellipse, line, polyline, polygon, path, g e text; traço de 2 a 3 (stroke-width) com stroke-linecap=\"round\"; sem fundo, porque o app é escuro; cores: linhas #C7B7FA, destaques #8461F0 e #B65CF2, apoio #6E6787, preenchimentos suaves com fill-opacity entre 0.15 e 0.35; texto #F2EFFA, font-size de 14 a 18, text-anchor=\"middle\" ao centralizar; rótulos curtos em português, longe das bordas e sem se sobrepor. Nada de script, style, imagem externa, filtro, animação ou fonte própria.",
  "Figura ao lado de um parágrafo: abra o bloco com ```desenho lado=direita (ou esquerda), escreva o SVG, uma linha com ---, e o parágrafo que ela ilustra. Sozinha e centralizada: só ```desenho com o SVG.",
  "No máximo duas figuras por resposta, e só quando elas ajudam de verdade; depois de cada uma, diga em texto o que ela mostra. Nunca desenhe para enfeitar.",
].join("\n");

/** Pedido explícito de desenho (mensagens curtas e o modelo local recebem só este lembrete, no fim). */
export const WANTS_DRAWING = /\b(desenh\w*|ilustr\w*|esquemas? visua\w*|rabisc\w*|imagem explicativa)\b/i;
export const DRAWING_REMINDER =
  " Formato: faça a figura num bloco ```desenho (rótulo desenho, não svg) com um SVG simples (viewBox 0 0 400 300; só rect, circle, ellipse, line, path, polygon e text; traço #C7B7FA, destaques #8461F0, texto #F2EFFA de 14 a 18; sem fundo, sem script ou estilo) e explique em seguida o que ela mostra.";
