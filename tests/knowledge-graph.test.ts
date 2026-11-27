import { test } from "node:test";
import assert from "node:assert/strict";
import { buildKnowledgeGraph, NO_THEME, type GraphInput } from "@/server/knowledge/graph";

const day = new Date("2026-11-20T12:00:00Z");
const base = (): GraphInput => ({
  categories: [
    { id: "fis", name: "Física", slug: "fisica", color: "#5B8DEF" },
    { id: "bio", name: "Biologia", slug: "biologia", color: "#3FBF7F" },
    { id: "vazia", name: "Vazia", slug: "vazia", color: "#999999" },
  ],
  topics: [
    { id: "ohm", title: "Lei de Ohm", categoryId: "fis", conversationId: "c1", mastery: "dificuldade", lastStudiedAt: day },
    { id: "serie", title: "Circuitos em série", categoryId: "fis", conversationId: "c1", mastery: "estudando", lastStudiedAt: day },
    { id: "solto", title: "Mitose", categoryId: null, conversationId: null, mastery: "dominado", lastStudiedAt: day },
  ],
  posts: [
    { id: "p1", title: "Resistores", slug: "resistores", content: "veja [o outro](/pensamento/vida)", categoryIds: ["fis", "bio"], draft: false, private: false, excerpt: "", publishedAt: day },
    { id: "p2", title: "Vida", slug: "vida", content: "volta [aqui](/pensamento/resistores)", categoryIds: ["bio"], draft: false, private: false, excerpt: "", publishedAt: day },
  ],
  conversations: [
    { id: "c1", title: "Eletricidade", categoryId: "fis", updatedAt: day, citedSlugs: ["vida", "nao-visivel"] },
    { id: "c2", title: "Conversa solta", categoryId: null, updatedAt: day, citedSlugs: [] },
  ],
  artifacts: [
    { id: "a1", title: "Simulador RC", conversationId: "c1", updatedAt: day },
    { id: "a2", title: "De conversa fora do mapa", conversationId: "c2", updatedAt: day },
  ],
});

const ids = (g: ReturnType<typeof buildKnowledgeGraph>) => new Set(g.nodes.map((n) => n.id));
const has = (g: ReturnType<typeof buildKnowledgeGraph>, source: string, target: string, type: string) => g.edges.some((e) => e.source === source && e.target === target && e.type === type);

test("hierarquia: tema contém tópicos, tópicos levam à conversa, conversa ao artefato", () => {
  const g = buildKnowledgeGraph(base());
  assert.ok(has(g, "t:fis", "k:ohm", "CONTAINS"));
  assert.ok(has(g, "k:ohm", "r:c1", "HAS_RESOURCE"));
  assert.ok(has(g, "k:serie", "r:c1", "HAS_RESOURCE"));
  assert.ok(has(g, "r:c1", "a:a1", "HAS_RESOURCE"));
});

test("material em vários temas é um nó só, com uma ligação para cada tema", () => {
  const g = buildKnowledgeGraph(base());
  assert.equal(g.nodes.filter((n) => n.id === "p:p1").length, 1);
  assert.ok(has(g, "t:fis", "p:p1", "HAS_RESOURCE"));
  assert.ok(has(g, "t:bio", "p:p1", "HAS_RESOURCE"));
  assert.equal(g.nodes.filter((n) => n.id === "r:c1").length, 1, "a conversa de dois tópicos também não duplica");
});

test("relações só com dados reais e sem apontar para o que não está no grafo", () => {
  const g = buildKnowledgeGraph(base());
  const related = g.edges.filter((e) => e.type === "RELATED_TO");
  // p1 → p2 e p2 → p1 são a mesma relação; a conversa cita "vida" (visível) e "nao-visivel" (fora).
  assert.equal(related.length, 2);
  assert.ok(has(g, "r:c1", "p:p2", "RELATED_TO"));
  for (const e of g.edges) assert.ok(ids(g).has(e.source) && ids(g).has(e.target), e.id);
});

test("sem pasta vira grupo virtual; conversa solta e artefato dela ficam fora; pasta vazia some", () => {
  const g = buildKnowledgeGraph(base());
  const none = g.nodes.find((n) => n.id === NO_THEME);
  assert.ok(none?.virtual);
  assert.ok(has(g, NO_THEME, "k:solto", "CONTAINS"));
  assert.ok(!ids(g).has("r:c2"));
  assert.ok(!ids(g).has("a:a2"));
  assert.ok(!ids(g).has("t:vazia"));
});

test("contagens e progresso do tema vêm do que está no grafo", () => {
  const g = buildKnowledgeGraph(base());
  const fis = g.nodes.find((n) => n.id === "t:fis")!;
  assert.deepEqual(fis.counts, { topics: 2, materials: 2 }); // p1 e a conversa c1 (o artefato fica dentro da conversa)
  assert.deepEqual(fis.progress, { estudando: 1, dificuldade: 1, dominado: 0 });
  const bio = g.nodes.find((n) => n.id === "t:bio")!;
  assert.equal(bio.progress, undefined, "sem tópicos, sem progresso inventado");
});

test("nada privado entra se não veio nos dados (a filtragem é de quem chama)", () => {
  const input = base();
  input.posts = input.posts.filter((p) => p.id !== "p2");
  const g = buildKnowledgeGraph(input);
  assert.ok(!ids(g).has("p:p2"));
  assert.ok(!g.edges.some((e) => e.target === "p:p2" || e.source === "p:p2"));
});
