import { test } from "node:test";
import assert from "node:assert/strict";
import { lintStyle } from "@/server/kally/style-lint";

test("aponta os vícios da lista", () => {
  assert.deepEqual(lintStyle("Ótima pergunta! A mitose gera duas células.", "o que é mitose?").issues, ["elogio"]);
  assert.deepEqual(lintStyle("Olá! A mitose gera duas células.", "o que é mitose?").issues, ["saudacao"]);
  assert.ok(lintStyle("A mitose gera duas células idênticas. Espero ter ajudado!", "o que é mitose?").issues.includes("conclusao_generica"));
  assert.ok(lintStyle("A mitose gera duas células idênticas.\n\nFicou claro?", "o que é mitose?").issues.includes("pergunta_generica_final"));
  assert.ok(lintStyle("## Mitose\nGera duas células.", "o que é mitose?").issues.includes("titulos_em_resposta_curta"));
  assert.ok(lintStyle("A mitose gera duas células 🙂", "o que é mitose?").issues.includes("emoji"));
  assert.ok(lintStyle("Você quer saber o que é mitose. A mitose gera duas células.", "o que é mitose?").issues.includes("repete_pergunta"));
  assert.ok(lintStyle("Entendi: você quer transformar a ideia em um post. Aqui está.", "transforma aquela ideia em post").issues.includes("repete_pergunta"));
});

test("não acusa resposta natural", () => {
  assert.deepEqual(lintStyle("Oi! Tudo ótimo por aqui. E com você, como foi o dia?", "oi, tudo bem?").issues, []);
  assert.deepEqual(lintStyle("Que bom! Programar a primeira vez costuma dar uma sensação boa de controle.", "aprendi a programar hoje!").issues, [], "reagir a uma boa notícia não é elogio automático");
  assert.deepEqual(lintStyle("A mitose gera duas células-filhas idênticas à mãe. Ela acontece em quatro fases: prófase, metáfase, anáfase e telófase.", "o que é mitose?").issues, []);
  // Código não conta (um "Olá" dentro de um print não é saudação).
  assert.deepEqual(lintStyle("Use assim:\n```python\nprint('Olá')\n```\nO print escreve na tela.", "como imprimo algo em python?").issues, []);
});
