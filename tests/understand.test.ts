import { test } from "node:test";
import assert from "node:assert/strict";
import { fastRoute, settle } from "@/server/kally/understand";
import { INTENT_CASES } from "./intent-cases";

/**
 * Roteador rápido: nas mensagens que dependem do contexto, ele NÃO pode adivinhar (tem que mandar ao interpretador);
 * nas outras, tem que acertar sozinho. O resultado completo (com o interpretador, que usa modelo) é medido na bateria.
 */
const route = (c: (typeof INTENT_CASES)[number]) =>
  fastRoute({ message: c.msg, history: c.history ?? [], requested: "auto", postCommand: false, hasReviewPayload: false, hasAttachment: false, canPublish: true });

test("mensagens que dependem do contexto vão ao interpretador", () => {
  const wrong = INTENT_CASES.filter((c) => c.context).filter((c) => route(c).certainty === "certa" && route(c).kind !== c.expect);
  assert.deepEqual(wrong.map((c) => c.msg), []);
});

test("mensagens sem contexto: o roteador rápido acerta o tipo", () => {
  const cases = INTENT_CASES.filter((c) => !c.context && c.msg.length < 280);
  const misses = cases.filter((c) => route(c).kind !== c.expect).map((c) => `${c.msg} → ${route(c).kind} (esperado ${c.expect})`);
  // Meta: no máximo 10% de erro sem o interpretador; os erros aparecem na mensagem do teste.
  assert.ok(misses.length <= Math.floor(cases.length * 0.1), misses.join("\n"));
});

test("exemplos obrigatórios", () => {
  const r = (msg: string, history: { role: "user" | "assistant"; content: string }[] = []) =>
    fastRoute({ message: msg, history, requested: "auto", postCommand: false, hasReviewPayload: false, hasAttachment: false, canPublish: true });
  assert.equal(r("Oi, tudo bem?").kind, "casual");
  assert.equal(r("Oi, tudo bem?").casual, true);
  assert.equal(r("Aprendi a programar hoje!").kind, "relato");
  assert.equal(r("Aprendi a programar hoje!").mode, "chat");
  assert.equal(r("Quero entender como esse sistema funciona").kind, "ensino");
  for (const c of INTENT_CASES.slice(2, 6)) assert.notEqual(route(c).certainty, "certa", c.msg);
});

test("escolhas explícitas e permissões", () => {
  const base = { message: "quero fazer um post sobre minha rotina", history: [], postCommand: false, hasReviewPayload: false, hasAttachment: false };
  assert.equal(fastRoute({ ...base, requested: "auto", canPublish: false }).mode, "chat", "sem permissão de publicar, nunca modo Idealizar");
  assert.equal(fastRoute({ ...base, requested: "revisar", canPublish: true }).mode, "revisar", "modo escolhido vale");
  assert.equal(fastRoute({ ...base, message: "/post", requested: "auto", postCommand: true, canPublish: true }).kind, "publicacao");
  // O interpretador não concede permissão: "publicacao" sem permissão vira conversa.
  const u = settle(fastRoute({ ...base, requested: "auto", canPublish: false }), { competencia: "post", intencao: "post", pontos: [], estrutura: [], lacunas: [], profundidade: "media", tipo: "publicacao" }, { publish: false });
  assert.equal(u.mode, "chat");
});
