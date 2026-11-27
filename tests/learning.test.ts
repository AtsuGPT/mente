import { test } from "node:test";
import assert from "node:assert/strict";
import { asksProgress, masteryOf, nextReview, progressBlock, quizResultFrom, shouldAskFolder, topicFromMessage, topicKey } from "@/server/kally/learning";

test("chave do assunto ignora acento, caixa e artigo", () => {
  assert.equal(topicKey("A Lei de Ohm"), "lei de ohm");
  assert.equal(topicKey("Mitose"), topicKey("mitose"));
  assert.equal(topicKey("Função Exponencial!"), "funcao exponencial");
});

test("assunto tirado do pedido de estudo", () => {
  assert.equal(topicFromMessage("me explica o que é inconsciente pra Freud"), "inconsciente pra freud");
  assert.equal(topicFromMessage("me ensina derivada do zero"), "derivada");
  assert.equal(topicFromMessage("como funciona a fotossíntese"), "fotossíntese");
  assert.equal(topicFromMessage("quero aprender sobre redes neurais"), "redes neurais");
  // Sem assunto claro: não registra.
  assert.equal(topicFromMessage("me explica"), null);
  assert.equal(topicFromMessage("quero entender por que eu sempre deixo tudo pra última hora e não consigo mudar"), null);
});

test("domínio só com evidência de quiz", () => {
  // Explicado muitas vezes, sem quiz: continua estudando.
  assert.equal(masteryOf({ quizzes: 0, questions: 0, correct: 0, lastScore: null, doubts: 0 }), "estudando");
  // Um quiz perfeito ainda não é domínio (uma tentativa só).
  assert.equal(masteryOf({ quizzes: 1, questions: 5, correct: 5, lastScore: 1, doubts: 0 }), "estudando");
  assert.equal(masteryOf({ quizzes: 2, questions: 10, correct: 9, lastScore: 0.8, doubts: 0 }), "dominado");
  assert.equal(masteryOf({ quizzes: 2, questions: 10, correct: 6, lastScore: 0.4, doubts: 0 }), "dificuldade");
  assert.equal(masteryOf({ quizzes: 0, questions: 0, correct: 0, lastScore: null, doubts: 2 }), "dificuldade");
});

test("revisão espaçada", () => {
  const now = new Date("2026-11-17T12:00:00Z");
  const days = (m: "dificuldade" | "estudando" | "dominado") => (nextReview(m, now).getTime() - now.getTime()) / 86_400_000;
  assert.deepEqual([days("dificuldade"), days("estudando"), days("dominado")], [1, 3, 7]);
});

test("resultado de quiz do app é validado", () => {
  assert.deepEqual(quizResultFrom({ tema: "Lei de Ohm", total: 5, correct: 3, wrong: ["a", 1, "b"] }), { tema: "Lei de Ohm", total: 5, correct: 3, wrong: ["a", "b"] });
  assert.equal(quizResultFrom({ tema: "x", total: 5, correct: 6 }), null);
  assert.equal(quizResultFrom({ tema: "", total: 5, correct: 1 }), null);
  assert.equal(quizResultFrom({ tema: "x", total: 500, correct: 1 }), null);
  assert.equal(quizResultFrom("Fiz o quiz"), null);
});

test("pedido de progresso e cartão", () => {
  assert.ok(asksProgress("o que eu já estudei?"));
  assert.ok(asksProgress("qual é o meu progresso"));
  assert.ok(!asksProgress("me explica progressão aritmética"));
  const block = progressBlock([
    { title: "Lei de Ohm", mastery: "dominado", quizzes: 2, correct: 9, questions: 10, explanations: 1 },
    { title: "Mitose", mastery: "estudando", quizzes: 0, correct: 0, questions: 0, explanations: 2 },
  ] as never);
  assert.match(block, /^```progresso\ntitulo: /);
  assert.match(block, /- \[x\] Lei de Ohm \| dominado \| 9 de 10 certas/);
  assert.match(block, /- \[ \] Mitose \| estudando \| explicado 2×/);
});

test("pergunta da pasta: só tópico novo, conversa sem pasta e sem recusa", () => {
  // created, hasFolder, declined
  assert.equal(shouldAskFolder(true, false, false), true);
  // Tópico que já existia: não pergunta de novo.
  assert.equal(shouldAskFolder(false, false, false), false);
  // A conversa já tem pasta: o tópico vai direto para ela.
  assert.equal(shouldAskFolder(true, true, false), false);
  // A pessoa disse "agora não" nesta conversa: não insiste.
  assert.equal(shouldAskFolder(true, false, true), false);
  // As demais combinações também não perguntam.
  for (const [created, hasFolder, declined] of [[false, true, false], [false, false, true], [true, true, true], [false, true, true]]) {
    assert.equal(shouldAskFolder(created, hasFolder, declined), false);
  }
});
