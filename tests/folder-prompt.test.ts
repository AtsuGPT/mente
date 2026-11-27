import { test } from "node:test";
import assert from "node:assert/strict";
import { asksSaveTopic, folderChoiceFrom, suggestedFolderName } from "@/server/kally/folder-prompt";

test("resposta do cartão: só as três formas, validadas", () => {
  assert.deepEqual(folderChoiceFrom({ kind: "recusa" }), { kind: "recusa" });
  assert.deepEqual(folderChoiceFrom({ kind: "existente", categoryId: "abc" }), { kind: "existente", categoryId: "abc" });
  assert.deepEqual(folderChoiceFrom({ kind: "nova", name: "  Física   moderna " }), { kind: "nova", name: "Física moderna" });
  assert.equal(folderChoiceFrom({ kind: "nova", name: "   " }), null);
  assert.equal(folderChoiceFrom({ kind: "nova", name: "x".repeat(61) }), null);
  assert.equal(folderChoiceFrom({ kind: "existente" }), null);
  assert.equal(folderChoiceFrom({ kind: "apagar" }), null);
  assert.equal(folderChoiceFrom(null), null);
});

test("pedido de guardar o tópico abre o cartão da pasta", () => {
  for (const m of [
    "salva esse tópico",
    "Salvar este assunto numa pasta",
    "guarda isso numa pasta",
    "coloca esse tema na pasta de Física",
    "quero guardar esse tópico",
    "pode salvar numa pasta?",
    "põe na pasta",
    "move esse assunto pra uma pasta",
  ]) assert.ok(asksSaveTopic(m), m);
});

test("pedidos de estudo e outros pedidos de salvar não abrem o cartão", () => {
  for (const m of [
    "me explica o que é uma pasta no Linux",
    "o que é um tópico em Kafka?",
    "salva esse post",
    "guarda isso na memória",
    "como funciona a pasta compartilhada do Drive?",
    "qual o melhor jeito de organizar pastas no computador?",
    "explica de novo o tópico de derivadas, não entendi a parte da regra da cadeia e quero mais exemplos com funções compostas e trigonometria",
  ]) assert.ok(!asksSaveTopic(m), m);
});

test("nome sugerido da pasta nova", () => {
  assert.equal(suggestedFolderName("lei de ohm", []), "Lei de ohm");
  assert.equal(suggestedFolderName("  Mitose   celular ", []), "Mitose celular");
  // Já existe pasta com esse nome: não sugere repetir (o nome da pasta é único no ambiente).
  assert.equal(suggestedFolderName("Física", [{ name: "fisica" }]), "");
});
