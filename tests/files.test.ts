import { test } from "node:test";
import assert from "node:assert/strict";
import { artifactTask, wantsFileOut } from "@/server/artifacts/intent";

test("pedidos naturais de arquivo", () => {
  for (const m of ["Transforma isso em PDF.", "Cria uma apostila desse conteúdo.", "Organiza nossas explicações em um documento.", "Faz um relatório para baixar."]) assert.equal(wantsFileOut(m), "pdf", m);
  assert.equal(wantsFileOut("exporta isso em markdown"), "md");
  assert.equal(wantsFileOut("me explica o que é um documento de requisitos?"), null);
  assert.equal(wantsFileOut("li um artigo sobre pdfs"), null);
});

test("com artefato na conversa, exporta direto; sem, cria um documento", () => {
  assert.equal(artifactTask("Transforma isso em PDF.", { hasArtifact: true, attached: false }), "exportar");
  assert.equal(artifactTask("Transforma isso em PDF.", { hasArtifact: false, attached: false }), "criar");
  assert.equal(artifactTask("Organiza nossas explicações em um documento.", { hasArtifact: false, attached: false }), "criar");
  // Pedido de mudança no artefato continua sendo edição.
  assert.equal(artifactTask("deixa o botão maior", { hasArtifact: true, attached: true }), "editar");
});
