/**
 * Entendimento completo (roteador rápido + interpretador de verdade) nas mensagens rotuladas: mede o acerto final, quantas
 * chamadas ao interpretador e quanto tempo elas levam. Usa os modelos do .env do projeto (custo: chamadas curtas de JSON).
 *   npx tsx --tsconfig tests/tsconfig.json tests/bench-interpreter.ts
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync("C:/Users/satan/Downloads/minha-mente/.env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}

async function main() {
const { fastRoute, needsInterpreter, settle } = await import("@/server/kally/understand");
const { interpret, pipelineFor } = await import("@/server/kally/pipeline");
const { INTENT_CASES } = await import("./intent-cases");
const { HOLDOUT_CASES } = await import("./intent-cases-holdout");

const CLASS: Record<string, string> = {
  casual: "leve", relato: "leve", pergunta: "conversa", continuacao: "conversa", ensino: "estudo", esclarecimento: "estudo", orientacao: "estudo", prova: "prova",
  programacao: "codigo", depuracao: "codigo", conta: "conta", publicacao: "post", revisao: "revisao", analise: "analise",
};
const pipeline = pipelineFor(true);
if (!pipeline?.interpreter) throw new Error("pipeline desligado no .env (KALLY_PIPELINE)");

for (const [name, cases] of [["conjunto de ajuste", INTENT_CASES], ["conjunto separado", HOLDOUT_CASES]] as const) {
  let right = 0, kindRight = 0, calls = 0, ms = 0;
  const misses: string[] = [];
  for (const c of cases) {
    const history = c.history ?? [];
    const fast = fastRoute({ message: c.msg, history, requested: "auto", postCommand: false, hasReviewPayload: false, hasAttachment: false, canPublish: true });
    let interpretation = null;
    if (needsInterpreter(fast)) {
      calls++;
      const r = await interpret(pipeline.interpreter, { message: c.msg, history });
      ms += r.ms;
      interpretation = r.result;
    }
    const u = settle(fast, interpretation, { publish: true });
    if (CLASS[u.kind] === CLASS[c.expect]) right++;
    else misses.push(`${c.msg.slice(0, 60)} → ${u.kind}${u.interpreted ? " (interpretador)" : ""}, esperado ${c.expect}`);
    if (u.kind === c.expect) kindRight++;
  }
  console.log(`\n${name}: ${cases.length} mensagens`);
  console.log(`  tratamento certo: ${right}/${cases.length} (${Math.round((right / cases.length) * 100)}%); tipo exato: ${kindRight}/${cases.length}`);
  console.log(`  chamadas ao interpretador: ${calls} (${Math.round((calls / cases.length) * 100)}%), média ${calls ? (ms / calls / 1000).toFixed(1) : 0} s`);
  for (const m of misses) console.log(`  ✗ ${m}`);
}
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
