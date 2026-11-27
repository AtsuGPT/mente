import { test } from "node:test";
import assert from "node:assert/strict";
import { folderFirst } from "@/server/kally-memory";

const item = (id: string, score: number, inFolder = false) => ({ id, score, inFolder });

test("pensamentos da pasta vêm primeiro, os outros completam até o limite", () => {
  const out = folderFirst([item("fora-forte", 0.9), item("pasta-media", 0.5, true), item("fora-media", 0.6), item("pasta-fraca", 0.3, true)], 3);
  assert.deepEqual(out.map((i) => i.id), ["pasta-media", "pasta-fraca", "fora-forte"]);
});

test("a nota mínima vale para os dois lados (post da pasta fora do assunto continua de fora)", () => {
  const out = folderFirst([item("pasta-sem-assunto", 0.05, true), item("fora", 0.5)], 5);
  assert.deepEqual(out.map((i) => i.id), ["fora"]);
});

test("sem pasta, é a ordem de antes (só a nota)", () => {
  const out = folderFirst([item("b", 0.3), item("a", 0.8), item("c", 0.11)], 5);
  assert.deepEqual(out.map((i) => i.id), ["a", "b"]);
});

test("nenhum post repetido e limite respeitado", () => {
  const items = [item("x", 0.9, true), item("y", 0.8), item("z", 0.7, true)];
  const out = folderFirst(items, 2);
  assert.equal(out.length, 2);
  assert.equal(new Set(out.map((i) => i.id)).size, 2);
});
