/**
 * Benchmark do entendimento sem modelo: a lógica antiga (detectIntent + regras de competência e de prova da rota) ×
 * o roteador rápido novo, nas mensagens rotuladas de intent-cases.ts. Rodar:
 *   npx tsx --tsconfig tests/tsconfig.json tests/bench-intent.ts
 * As mensagens que dependem do contexto são contadas à parte: a lógica antiga não tinha como entendê-las (o
 * interpretador só via mensagens de 280+ caracteres); a nova manda ao interpretador, medido na bateria com modelo.
 */
import { detectIntent } from "@/server/kally";
import { competenceFor, EXAM_QUESTION, EXAM_REQUEST } from "@/server/kally/pipeline";
import { asksForCode, asksForMath } from "@/server/kally/remote-style";
import { fastRoute } from "@/server/kally/understand";
import type { IntentKind } from "@/server/kally/intent-kinds";
import { INTENT_CASES } from "./intent-cases";

/** Classes de tratamento: o que muda na resposta que a pessoa recebe. */
const CLASS: Record<IntentKind, string> = {
  casual: "leve", relato: "leve", pergunta: "conversa", continuacao: "conversa", ensino: "estudo", esclarecimento: "estudo", orientacao: "estudo", prova: "prova",
  programacao: "codigo", depuracao: "codigo", conta: "conta", publicacao: "post", revisao: "revisao", analise: "analise",
};

/** O que a rota antiga fazia com a mensagem (sem interpretador: mensagens curtas nunca passavam por ele). */
function legacyClass(msg: string): string {
  const intent = detectIntent(msg);
  if (EXAM_QUESTION.test(msg) || EXAM_REQUEST.test(msg)) return "prova";
  if (intent.mode === "ideia") return "post";
  if (intent.mode === "revisar") return "revisao";
  const competence = competenceFor({ mode: intent.mode, interpretation: null, message: msg, reviewKind: null });
  if (competence === "analise") return "analise";
  const casual = intent.casual && !competence;
  if (casual) return "leve";
  if (asksForCode(msg)) return "codigo";
  if (asksForMath(msg)) return "conta";
  if (competence === "estudo" || intent.mode === "aprender") return "estudo";
  return "conversa";
}

const rows = INTENT_CASES.map((c) => {
  const r = fastRoute({ message: c.msg, history: c.history ?? [], requested: "auto", postCommand: false, hasReviewPayload: false, hasAttachment: false, canPublish: true });
  return { c, legacy: legacyClass(c.msg), fast: r, want: CLASS[c.expect] };
});
const direct = rows.filter((r) => !r.c.context && r.c.msg.length < 280);
const contextual = rows.filter((r) => r.c.context);
const long = rows.filter((r) => !r.c.context && r.c.msg.length >= 280);
const pct = (a: number, b: number) => `${a}/${b} (${Math.round((a / b) * 100)}%)`;

console.log(`Mensagens diretas (sem depender do contexto), ${direct.length}:`);
console.log(`  antiga, tratamento certo: ${pct(direct.filter((r) => r.legacy === r.want).length, direct.length)}`);
console.log(`  nova (só o roteador rápido), tratamento certo: ${pct(direct.filter((r) => CLASS[r.fast.kind] === r.want).length, direct.length)}`);
console.log(`  nova, tipo exato: ${pct(direct.filter((r) => r.fast.kind === r.c.expect).length, direct.length)}`);
const alone = direct.filter((r) => r.fast.certainty === "certa");
console.log(`  nova, decididas pelo roteador sozinho: ${alone.length}; erradas entre elas: ${alone.filter((r) => CLASS[r.fast.kind] !== r.want).length}; mandadas ao interpretador: ${direct.length - alone.length}`);
console.log(`\nMensagens que dependem do contexto, ${contextual.length}:`);
console.log(`  antiga: nenhuma chegava ao interpretador; tratamento certo por acaso: ${pct(contextual.filter((r) => r.legacy === r.want).length, contextual.length)}`);
console.log(`  nova: mandadas ao interpretador: ${pct(contextual.filter((r) => r.fast.certainty !== "certa").length, contextual.length)}; tipo provisório certo: ${pct(contextual.filter((r) => r.fast.kind === r.c.expect).length, contextual.length)}`);
console.log(`\nMensagens longas (${long.length}): as duas mandam ao interpretador.`);
console.log("\nDiferenças (mensagens diretas):");
for (const r of direct) if (r.legacy !== r.want || CLASS[r.fast.kind] !== r.want) console.log(`  ${r.legacy === r.want ? "✓" : "✗"} antiga ${r.legacy.padEnd(8)} ${CLASS[r.fast.kind] === r.want ? "✓" : "✗"} nova ${r.fast.kind.padEnd(13)} esperado ${r.c.expect.padEnd(13)} ${r.c.msg.slice(0, 70)}`);
