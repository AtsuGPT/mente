import type { IntentKind } from "@/server/kally/intent-kinds";

/**
 * Mensagens rotuladas para medir o entendimento (Kally Intelligence, 17/11/2026). `expect` = o tipo certo;
 * `context` = precisa do histórico (o roteador rápido deve mandar ao interpretador em vez de adivinhar).
 * As 7 primeiras são os exemplos obrigatórios do pedido.
 */
export type IntentCase = { msg: string; expect: IntentKind; context?: boolean; history?: { role: "user" | "assistant"; content: string }[] };

const EXPLICACAO_RECURSAO = [
  { role: "user" as const, content: "me explica recursão" },
  { role: "assistant" as const, content: "Recursão é quando uma função chama a si mesma para resolver uma versão menor do problema. Toda função recursiva precisa de um caso base, que para a recursão, e de um passo recursivo, que se aproxima dele. Exemplo: fatorial(n) = n × fatorial(n − 1), com fatorial(0) = 1. A pilha de chamadas guarda cada chamada até o caso base ser alcançado." },
];
const CODIGO = [
  { role: "user" as const, content: "por que isso retorna null? const el = document.getElementById('menu'); el.classList.add('aberto')" },
  { role: "assistant" as const, content: "O getElementById devolve null quando o elemento ainda não existe no momento em que o script roda. Coloque o <script> no fim do <body> ou use DOMContentLoaded." },
];
const IDEIA = [
  { role: "user" as const, content: "tava pensando que estudar de manhã cedo rende mais pra mim porque a casa tá em silêncio e eu ainda não abri o celular" },
  { role: "assistant" as const, content: "Faz sentido: o silêncio e a ausência de notificações reduzem as interrupções, e a atenção costuma estar mais descansada no começo do dia." },
];
const PROJETO = [
  { role: "user" as const, content: "vou fazer o deploy do site com aquele script que você me passou" },
  { role: "assistant" as const, content: "Combinado. Rode primeiro o build local, confira se a variável DATABASE_URL está certa e depois execute o script de deploy." },
];

export const INTENT_CASES: IntentCase[] = [
  // Exemplos obrigatórios
  { msg: "Oi, tudo bem?", expect: "casual" },
  { msg: "Aprendi a programar hoje!", expect: "relato" },
  { msg: "Aquilo que falamos anteriormente deu errado", expect: "continuacao", context: true, history: PROJETO },
  { msg: "Não entendi essa parte", expect: "esclarecimento", context: true, history: EXPLICACAO_RECURSAO },
  { msg: "Meu código continua retornando null", expect: "depuracao", context: true, history: CODIGO },
  { msg: "Transforma aquela ideia em algo publicável", expect: "publicacao", context: true, history: IDEIA },
  { msg: "Quero entender como esse sistema funciona", expect: "ensino" },
  // Casual e relato
  { msg: "oii kally", expect: "casual" },
  { msg: "bom dia!", expect: "casual" },
  { msg: "valeu, ajudou demais", expect: "casual" },
  { msg: "kkkk", expect: "casual" },
  { msg: "tudo bem e vc?", expect: "casual" },
  { msg: "hoje passei na prova de cálculo!!", expect: "relato" },
  { msg: "finalmente terminei meu tcc", expect: "relato" },
  { msg: "tô muito cansado hoje", expect: "relato" },
  { msg: "comecei a ler Freud essa semana", expect: "relato" },
  { msg: "consegui fazer o código rodar", expect: "relato" },
  // Perguntas e ensino
  { msg: "qual a capital da austrália?", expect: "pergunta" },
  { msg: "quanto tempo dura a mitose?", expect: "pergunta" },
  { msg: "me explica o que é inconsciente pra Freud", expect: "ensino" },
  { msg: "como funciona a fotossíntese", expect: "ensino" },
  { msg: "qual a diferença entre mitose e meiose?", expect: "ensino" },
  { msg: "quero aprender sobre redes neurais", expect: "ensino" },
  { msg: "me ensina derivada do zero", expect: "ensino" },
  { msg: "o que é o complexo de édipo", expect: "ensino" },
  { msg: "oq é mielina", expect: "ensino" },
  { msg: "pq o ceu é azul", expect: "pergunta" },
  // Programação e contas
  { msg: "como faço um loop em python que soma uma lista", expect: "programacao" },
  { msg: "escreve uma função em javascript que inverte uma string", expect: "programacao" },
  { msg: "TypeError: Cannot read properties of undefined (reading 'map') no meu react", expect: "programacao" },
  { msg: "calcula a integral de x² de 0 a 3", expect: "conta" },
  { msg: "quanto é 15% de 340?", expect: "conta" },
  { msg: "qual a corrente num resistor de 10 ohms com 12 V", expect: "conta" },
  { msg: "resolve o sistema 2x + y = 5 e x - y = 1", expect: "conta" },
  // Prova
  { msg: "me faz uma prova de 5 questões de anatomia", expect: "prova" },
  { msg: "monta um quiz de psicanálise", expect: "prova" },
  { msg: "Qual alternativa é correta?\nA) mitose gera 4 células\nB) meiose gera gametas\nC) mitose ocorre só em plantas", expect: "prova" },
  { msg: "acertei? marquei a letra B", expect: "prova" },
  // Post
  { msg: "quero fazer um post sobre minha rotina de estudos", expect: "publicacao" },
  { msg: "faz um post com isso", expect: "publicacao", context: true, history: IDEIA },
  { msg: "transforma isso num pensamento pra eu publicar", expect: "publicacao", context: true, history: IDEIA },
  // Revisão e análise
  { msg: "revisa esse parágrafo pra mim: a gente vamos no cinema amanha e depois nós vai comer", expect: "revisao" },
  { msg: "analise esse argumento: todo mundo que estuda muito passa, então quem não passou não estudou", expect: "analise" },
  { msg: "esse argumento se sustenta? se chove a rua molha, a rua está molhada, logo choveu", expect: "analise" },
  // Orientação
  { msg: "monta um plano de estudos pra eu passar em cálculo 1", expect: "orientacao" },
  { msg: "por onde eu começo a estudar anatomia?", expect: "orientacao" },
  { msg: "me orienta, tenho prova de psicologia semana que vem e não sei nada", expect: "orientacao" },
  // Contexto (precisam do histórico)
  { msg: "e no caso de uma lista vazia?", expect: "continuacao", context: true, history: EXPLICACAO_RECURSAO },
  { msg: "explica de outro jeito", expect: "esclarecimento", context: true, history: EXPLICACAO_RECURSAO },
  { msg: "como assim caso base?", expect: "esclarecimento", context: true, history: EXPLICACAO_RECURSAO },
  { msg: "ainda dá o mesmo erro", expect: "depuracao", context: true, history: CODIGO },
  { msg: "coloquei no fim do body e continua null", expect: "depuracao", context: true, history: CODIGO },
  { msg: "deu errado de novo", expect: "continuacao", context: true, history: PROJETO },
  { msg: "mas e se eu usar docker?", expect: "continuacao", context: true, history: PROJETO },
  // Informais e com erro de digitação
  { msg: "mano n entendi nada de derivada", expect: "ensino" },
  { msg: "me explca o q é entropia", expect: "ensino" },
  { msg: "quero escrever um texto sobre ansiedade pra postar", expect: "publicacao" },
  { msg: "kally me ajuda com essa conta 3x + 7 = 22", expect: "conta" },
  { msg: "tá tudo bem, só queria conversar um pouco", expect: "casual" },
  { msg: "fui mal na prova de anatomia, errei quase tudo de sistema nervoso", expect: "relato" },
  // Longas
  {
    msg: "Estou escrevendo meu TCC sobre o impacto das redes sociais na atenção de adolescentes e queria entender melhor como a dopamina funciona nesse processo, porque li em alguns lugares que é viciante como droga mas não sei se isso é exagero ou se tem base científica de verdade. Pode me explicar com calma?",
    expect: "ensino",
  },
  {
    msg: "Hoje foi um dia esquisito. Acordei cedo, fui pra faculdade, a aula de cálculo foi cancelada e eu fiquei duas horas na biblioteca sem conseguir focar em nada. Voltei pra casa, dormi a tarde toda e agora tô aqui pensando se vale a pena continuar no curso. Sei lá.",
    expect: "relato",
  },
];
