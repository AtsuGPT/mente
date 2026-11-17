import type { IntentCase } from "./intent-cases";

/**
 * Conjunto separado (escrito depois de ajustar o roteador e NÃO usado para ajustá-lo): mede se as regras generalizam
 * ou só decoraram intent-cases.ts. Rodado uma vez, sem mudanças depois do resultado.
 */
const AULA = [
  { role: "user" as const, content: "explica a lei de ohm" },
  { role: "assistant" as const, content: "A lei de Ohm diz que a tensão sobre um resistor é proporcional à corrente: V = R × I. Se a resistência é 10 Ω e passa 2 A, a tensão é 20 V." },
];
const POST = [
  { role: "user" as const, content: "às vezes acho que a faculdade ensina a decorar e não a pensar" },
  { role: "assistant" as const, content: "É uma crítica comum: avaliações que cobram memorização incentivam esse tipo de estudo." },
];

export const HOLDOUT_CASES: IntentCase[] = [
  { msg: "eaí kally, beleza?", expect: "casual" },
  { msg: "boa noite kally", expect: "casual" },
  { msg: "obrigado pela ajuda de ontem", expect: "casual" },
  { msg: "hoje eu fiz minha primeira apresentação em público", expect: "relato" },
  { msg: "terminei de ler o livro que você indicou", expect: "relato" },
  { msg: "acabei de sair da academia, tô morto", expect: "relato" },
  { msg: "o que significa epistemologia", expect: "ensino" },
  { msg: "me explica a teoria da relatividade de um jeito simples", expect: "ensino" },
  { msg: "como funcionam as vacinas de RNA?", expect: "ensino" },
  { msg: "quem descobriu a penicilina?", expect: "pergunta" },
  { msg: "que horas são em Tóquio agora?", expect: "pergunta" },
  { msg: "faz um código em python que lê um csv e calcula a média de uma coluna", expect: "programacao" },
  { msg: "meu useEffect está rodando duas vezes no react, por quê?", expect: "programacao" },
  { msg: "quanto rende 5 mil a 1% ao mês por um ano?", expect: "conta" },
  { msg: "qual a derivada de sen(x)·x²?", expect: "conta" },
  { msg: "cria uma lista de exercícios de geometria analítica", expect: "prova" },
  { msg: "me testa com umas perguntas sobre o sistema nervoso", expect: "prova" },
  { msg: "quero postar sobre como foi meu primeiro semestre", expect: "publicacao" },
  { msg: "corrige os erros desse texto: eu fui na escola ontem e a professora me deu os parabém", expect: "revisao" },
  { msg: "avalie criticamente a ideia de que redes sociais causam depressão", expect: "analise" },
  { msg: "como eu organizo meus estudos pra residência?", expect: "orientacao" },
  { msg: "tenho 3 semanas até a prova de farmaco, me ajuda a planejar", expect: "orientacao" },
  { msg: "não sei nada de estatística e preciso aprender", expect: "ensino" },
  { msg: "q q é um neurotransmissor", expect: "ensino" },
  // Contexto
  { msg: "pode dar outro exemplo?", expect: "continuacao", context: true, history: AULA },
  { msg: "não ficou claro o que é o R", expect: "esclarecimento", context: true, history: AULA },
  { msg: "e se a resistência dobrar?", expect: "continuacao", context: true, history: AULA },
  { msg: "vira um post isso", expect: "publicacao", context: true, history: POST },
  { msg: "escreve isso como um pensamento meu", expect: "publicacao", context: true, history: POST },
  { msg: "como assim proporcional?", expect: "esclarecimento", context: true, history: AULA },
  { msg: "show, entendi agora", expect: "casual", context: true, history: AULA },
  { msg: "faz uns exercícios disso", expect: "prova", context: true, history: AULA },
];
