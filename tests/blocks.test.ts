import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeBlocks, recentInteractive } from "@/server/kally/blocks";

test("blocos dentro do contrato ficam", () => {
  const ok = "Texto.\n\n```escolhas\n? Como seguir?\n- Ver um exemplo\n- Fazer exercícios\n```\n\n```progresso\ntitulo: Plano\n- [x] Etapa 1\n- [ ] Etapa 2 | estudando\n```";
  assert.deepEqual(normalizeBlocks(ok), { text: ok, fixed: 0 });
});

test("bloco quebrado vira texto comum", () => {
  const one = normalizeBlocks("```escolhas\n? Como seguir?\n- Só uma opção\n```");
  assert.equal(one.fixed, 1);
  assert.doesNotMatch(one.text, /```/);
  assert.match(one.text, /Como seguir\?\n- Só uma opção/);
  const prog = normalizeBlocks("```progresso\ntitulo: Plano\nnada aqui\n```");
  assert.equal(prog.fixed, 1);
  assert.match(prog.text, /^\*\*Plano\*\*/);
});

test("só um bloco de escolhas por resposta", () => {
  const two = normalizeBlocks("```escolhas\n- a\n- b\n```\n\n```escolhas\n- c\n- d\n```");
  assert.equal(two.fixed, 1);
  assert.equal((two.text.match(/```escolhas/g) ?? []).length, 1);
});

test("uso recente de recurso interativo", () => {
  assert.ok(recentInteractive([{ role: "assistant", content: "```quiz\n? a\n* b\n- c\n```" }, { role: "user", content: "ok" }]));
  assert.ok(!recentInteractive([{ role: "assistant", content: "Uma explicação." }]));
});
