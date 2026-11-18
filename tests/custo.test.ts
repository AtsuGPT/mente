import { test } from "node:test";
import assert from "node:assert/strict";
import { codingLimitUsd } from "@/server/ai/spend";
import { repairPrompt } from "@/server/artifacts/prompt";
import { parseEditBlocks } from "@/server/artifacts/block";
import { applyEdits } from "@/server/artifacts/edits";

test("teto diário do Kally Coding", () => {
  delete process.env.KALLY_CODING_MAX_USD_PER_DAY;
  assert.equal(codingLimitUsd(), 0.3);
  process.env.KALLY_CODING_MAX_USD_PER_DAY = "0.5";
  assert.equal(codingLimitUsd(), 0.5);
  process.env.KALLY_CODING_MAX_USD_PER_DAY = "abc";
  assert.equal(codingLimitUsd(), 0.3);
  delete process.env.KALLY_CODING_MAX_USD_PER_DAY;
});

test("conserto por trocas pede só os trechos; sem código, o artefato inteiro", () => {
  const trocas = repairPrompt([], "resposta", ["No teste, falhou: o botão não esconde"], "<button id=b>x</button>").at(-1)!.content;
  assert.match(trocas, /```artefato-edicao/);
  assert.match(trocas, /Não repita o artefato inteiro/);
  const inteiro = repairPrompt([], "resposta", ["O bloco do artefato não foi fechado."], null).at(-1)!.content;
  assert.doesNotMatch(inteiro, /artefato-edicao/);
  assert.match(inteiro, /bloco ```artefato completo/);
});

test("as trocas de um conserto se aplicam ao código atual", () => {
  const source = "<button id=\"b\">Esconder</button>\n<script>\nb.onclick = () => painel.style.display = 'block';\n</script>";
  const fix = "Agora o botão esconde e mostra.\n```artefato-edicao\nnota: alternar\n<<<<<<< BUSCAR\nb.onclick = () => painel.style.display = 'block';\n=======\nb.onclick = () => painel.classList.toggle('oculto');\n>>>>>>> FIM\n```";
  const edits = parseEditBlocks(fix).flatMap((e) => e.edits);
  const applied = applyEdits(source, edits);
  assert.ok(applied.ok);
  assert.match(applied.ok ? applied.source : "", /classList\.toggle\('oculto'\)/);
});
