import "server-only";
import { completeChat, openChatStream, type AiMessage, type FinishReason } from "@/server/ai";
import { logPerf } from "@/server/ai/perf";
import { codingConfig, codingServes, remoteConfig, remoteHealth } from "@/server/ai/remote";
import { addMessage, createConversation, dropLastAnswer, findRelevantPosts, toSources } from "@/server/kally";
import { asksEnvironment } from "@/server/kally/need";
import { markDone, markRunning } from "@/server/kally/running";
import type { Access } from "@/server/environments";
import { parseArtifactBlocks, parseEditBlocks, serializeArtifact } from "./block";
import { applyEdits } from "./edits";
import { artifactTask, requestedThing, wantsFileOut, type ArtifactTask } from "./intent";
import { exportArtifact } from "./export";
import { pdfPages, storeFile } from "./files";
import { kindFrom, KIND_LABEL, LIMITS } from "./kinds";
import { artifactPrompt, fullRewritePrompt, repairPrompt, type BaseArtifact } from "./prompt";
import { artifactForKally, findArtifactByMention, listArtifacts } from "./store";
import { validateArtifact } from "./validate";
import { browserPath, runArtifact, takeTest, type RuntimeReport } from "./runtime";

/**
 * A conversa com a Kally quando o pedido é um artefato (decidido por intent.ts). Separado da rota principal da Kally
 * (kally/route.ts) de propósito: geração, validação e armazenamento ficam em módulos próprios, e o fluxo de conversa
 * comum não muda. Fala o mesmo protocolo de eventos (Server-Sent Events) que o app já entende:
 *
 *   { conversationId, temporary, mode: "artefato" } → { status }... → { text }... → { replace }? → { artifact } → { done }
 *
 * - criar: a Kally escreve a página; o servidor valida e, se houver erro (biblioteca de fora, script cortado), pede um
 *   conserto uma vez antes de entregar;
 * - editar: a Kally devolve só as trocas (artefato-edicao); o servidor aplica no código atual e devolve o artefato
 *   inteiro já atualizado (evento replace). Trocas que não se encaixam → a Kally reescreve o artefato inteiro;
 * - explicar: resposta de tutora sobre o código atual, sem código novo;
 * - listar: os artefatos do ambiente, direto do banco (sem modelo).
 */

/** ids do código original que sumiram no novo (só quando o original tem vários; os de layout contam igual). */
function missingIds(before: string, after: string) {
  const ids = (s: string) => new Set([...s.matchAll(/\bid\s*=\s*["']([\w-]+)["']/g)].map((m) => m[1]));
  const a = ids(before);
  if (a.size < 3) return [];
  const b = ids(after);
  const lost = [...a].filter((id) => !b.has(id));
  return lost.length >= Math.max(1, Math.ceil(a.size * 0.15)) || lost.some((id) => new RegExp(`<(input|select|button|canvas|textarea)[^>]*id\\s*=\\s*["']${id}["']`).test(before)) ? lost : [];
}

type History ={ role: "user" | "assistant"; content: string }[];
/** Histórico como a rota recebe (o papel vem como texto). */
type LooseHistory = { role: string; content: string }[];

const MAX_CONTINUATIONS = 2;

function continueFrom(base: AiMessage[], written: string): AiMessage[] {
  const tail = written.length > 8_000 ? written.slice(-8_000) : written;
  return [...base, { role: "assistant", content: tail }, { role: "user", content: "Continue exatamente de onde você parou (no meio do código, se for o caso), sem repetir nada e sem comentar que está continuando." }];
}

/** Artefato em jogo: o que o app mandou (aberto pela pessoa ou o último da conversa) ou um salvo citado pelo nome. */
async function resolveBase(access: Access, body: Record<string, unknown>): Promise<{ base: BaseArtifact | null; attached: boolean }> {
  const a = body.artifact && typeof body.artifact === "object" ? (body.artifact as Record<string, unknown>) : null;
  if (!a) return { base: null, attached: false };
  const attached = a.attached === true;
  const source = typeof a.source === "string" ? a.source.slice(0, LIMITS.source) : "";
  if (typeof a.id === "string" && a.id) {
    // Salvo: o artefato precisa ser visível para a pessoa (mesmo porteiro dos pensamentos). A base é o código mais
    // recente DA CONVERSA, quando o app manda: as mudanças pedidas em sequência se acumulam mesmo sem salvar cada uma.
    // Antes, cada pedido partia da versão salva e o anterior se perdia (laboratório cósmico, 15/11: "esconder o botão e
    // trazer de volta" nunca ficava, porque a mudança seguinte refazia tudo a partir da versão 1).
    const saved = await artifactForKally(access, a.id);
    if (saved) return { base: { id: saved.id, title: saved.title, kind: saved.kind, format: saved.format, source: source.trim() ? source : saved.source, version: saved.version }, attached };
  }
  if (!source.trim()) return { base: null, attached: false };
  return { base: { id: null, title: typeof a.title === "string" ? a.title.slice(0, LIMITS.title) : "Artefato", kind: kindFrom(typeof a.kind === "string" ? a.kind : "") ?? "ferramenta", format: a.format === "markdown" ? "markdown" : "html", source }, attached };
}

export type ArtifactTurnInput = {
  access: Access;
  userId: string;
  userName: string | null;
  message: string;
  history: LooseHistory;
  body: Record<string, unknown>;
  conversation: { id: string } | null;
  startedAt: number;
  /** Cabeçalhos das respostas da API (CORS de teste), os mesmos das outras rotas. */
  headers?: Headers;
};

/** Devolve a resposta em streaming quando o pedido é de artefato; null quando não é (a Kally segue o caminho de sempre). */
export async function maybeArtifactTurn(input: ArtifactTurnInput): Promise<Response | null> {
  let { base, attached } = await resolveBase(input.access, input.body);
  let task = artifactTask(input.message, { hasArtifact: !!base, attached });
  // "muda o simulador de circuito RC que eu salvei": o artefato citado pelo nome vira a base.
  if ((!task || task === "criar") && !base && /\b(que (eu )?salvei|salv[oa] na biblioteca|meu (simulador|artefato|gr[aá]fico)|o artefato)\b/i.test(input.message)) {
    const found = await findArtifactByMention(input.access, input.message);
    if (found) {
      base = { id: found.id, title: found.title, kind: found.kind, format: found.format, source: found.source, version: found.version };
      attached = true;
      task = artifactTask(input.message, { hasArtifact: true, attached: true });
    }
  }
  if (!task) return null;
  if ((task === "editar" || task === "explicar" || task === "exportar") && !base) task = "criar";
  return artifactStream({ ...input, task, base });
}

function artifactStream(input: ArtifactTurnInput & { task: ArtifactTask; base: BaseArtifact | null }): Response {
  const { access, userId, message, task, base } = input;
  const history: History = input.history.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
  const encoder = new TextEncoder();
  const cancel = new AbortController();
  let detached = false;
  // Conversa salva: a pergunta é gravada já (e a resposta no fim, mesmo se a pessoa sair). O stream só começa depois
  // de a conversa existir (o primeiro evento leva o id).
  let conversationId: string | null = input.conversation?.id ?? null;
  const ready = (async () => {
    if (!conversationId && input.body.save === true) {
      const created = await createConversation(access.environment.id, userId, "chat", message);
      conversationId = created.id;
    }
    if (conversationId && input.body.retry === true) await dropLastAnswer(conversationId);
    else if (conversationId) await addMessage(conversationId, "user", message);
  })();

  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      if (conversationId) detached = true;
      else cancel.abort();
    },
    async start(controller) {
      await ready.catch((cause) => console.error("Kally artefato: conversa:", cause instanceof Error ? cause.message : cause));
      const send = (event: Record<string, unknown>) => {
        if (cancel.signal.aborted || detached) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          if (conversationId) detached = true;
          else cancel.abort();
        }
      };
      const heartbeat = setInterval(() => {
        if (cancel.signal.aborted || detached) return;
        try {
          controller.enqueue(encoder.encode(": ainda escrevendo\n\n"));
        } catch {
          // fechado
        }
      }, 15_000);
      let answer = "";
      let target: "coding" | "remote" | "local" = "local";
      let failed: string | null = null;
      let firstText = 0;
      const report: Record<string, unknown> = { task, base: base ? { saved: !!base.id, chars: base.source.length } : null };
      // Arquivo pedido ("transforma isso em PDF"): o servidor gera ANTES de anunciar e manda a referência real (files.ts).
      const fileFormat = wantsFileOut(message);
      const deliverFile = async (a: { title: string; format: string; source: string }, to: "pdf" | "md" | "html") => {
        send({ status: to === "pdf" ? "Gerando o PDF no servidor e conferindo as páginas." : "Gerando o arquivo no servidor.", step: "arquivo" });
        try {
          const out = await exportArtifact(a, to);
          const id = await storeFile({ environmentId: access.environment.id, userId, name: out.name, type: out.type, body: out.body });
          const pages = to === "pdf" ? pdfPages(out.body) : null;
          const kb = Math.max(1, Math.round(out.body.length / 1024));
          send({ file: { id, name: out.name, format: to, bytes: out.body.length, pages } });
          report.file = { ok: true, format: to, bytes: out.body.length, pages };
          return `_Arquivo pronto: **${out.name}** (${pages ? `${pages} ${pages === 1 ? "página" : "páginas"}, ` : ""}${kb} KB). O cartão abaixo baixa o arquivo; ele fica disponível por 24 horas._`;
        } catch (cause) {
          report.file = { ok: false, error: cause instanceof Error ? cause.message.slice(0, 200) : String(cause) };
          return "_Não consegui gerar o arquivo agora. O conteúdo está acima, e o botão Baixar dele tenta de novo._";
        }
      };
      try {
        if (conversationId) markRunning(conversationId, cancel);
        send({ conversationId, temporary: !conversationId, mode: "artefato", searched: false });

        // Exportar o artefato que já está na conversa: sem modelo, direto para o arquivo.
        if (task === "exportar" && base) {
          answer = await deliverFile(base, fileFormat ?? "pdf");
          send({ text: answer });
          send({ done: true });
          return;
        }

        if (task === "listar") {
          const { artifacts } = await listArtifacts(access);
          answer = artifacts.length
            ? `Neste ambiente ${artifacts.length === 1 ? "há 1 artefato" : `há ${artifacts.length} artefatos`} que você pode abrir:\n\n${artifacts
                .slice(0, 30)
                .map((a) => `- **${a.title}** · ${KIND_LABEL[a.kind] ?? a.kind}${a.category ? ` · ${a.category}` : ""} · v${a.version}${a.author ? ` · ${a.author.isMe ? "seu" : a.author.name}` : ""}`)
                .join("\n")}\n\nEles ficam na aba Artefatos. Para mudar um deles, abra e toque em "Editar com a Kally", ou me diga o nome.`
            : "Ainda não há artefatos salvos neste ambiente. Peça um (\"cria um simulador de circuito RC\", \"faz um gráfico da função seno\") e toque em Salvar quando ele aparecer.";
          send({ text: answer });
          send({ done: true });
          return;
        }

        // Interpretação → material do ambiente (só quando a pessoa pede dados do ambiente: "um gráfico dos meus posts").
        const material: { title: string; excerpt: string; author?: string | null }[] = [];
        if (task !== "explicar" && asksEnvironment(message)) {
          const found = await findRelevantPosts(access.scope, message, 4, { draftAuthorId: userId });
          const posts = found.filter((p) => p.kind !== "conversa" && p.score >= 0.4);
          material.push(...posts.map((p) => ({ title: p.title, excerpt: p.excerpt, author: p.author })));
          if (posts.length) send({ sources: toSources(posts) });
          report.material = posts.length;
        }
        const attachment = input.body.attachment && typeof input.body.attachment === "object" ? (input.body.attachment as Record<string, unknown>) : null;
        if (attachment && typeof attachment.text === "string" && attachment.text.trim()) {
          material.push({ title: `Anexo: ${typeof attachment.name === "string" ? attachment.name : "arquivo"}`, excerpt: attachment.text.slice(0, 12_000) });
        }

        const thing = requestedThing(message);
        send({
          status:
            task === "criar"
              ? `Vou montar ${/^(a|o)\s/.test(thing) ? thing : `o ${thing}`}: escrevo o código, confiro e te mostro funcionando.`
              : task === "editar"
                ? `Mudando «${base?.title}» só onde precisa, sem refazer o resto.`
                : `Lendo o código de «${base?.title}».`,
          step: "artefato",
        });

        const prompt = artifactPrompt({ task: task === "exportar" ? "criar" : task, message, history, base, environmentName: access.environment.name, userName: input.userName, material });
        // Kally Coding (DeepSeek) cria e conserta artefatos; sem ele, o modelo principal; sem os dois, o local.
        const cfg = remoteConfig();
        target = codingServes() ? "coding" : cfg.enabled && (await remoteHealth()).state === "disponivel" ? "remote" : "local";
        report.target = target;
        const generation = Date.now();

        // Geração em streaming (o app mostra "Construindo o artefato…" enquanto o bloco não fecha).
        let messages = prompt;
        for (let round = 0; round <= MAX_CONTINUATIONS; round++) {
          let reason = "other" as FinishReason;
          const chunks = await openChatStream(messages, {
            target,
            temperature: 0.3,
            maxTokens: target === "coding" ? 16_000 : target === "remote" ? 9_000 : 5_000,
            think: false,
            timeoutMs: 120_000,
            signal: cancel.signal,
            onFinish: (r) => (reason = r),
          });
          const before = answer.length;
          for await (const chunk of chunks) {
            if (!firstText) firstText = Date.now();
            answer += chunk;
            send({ text: chunk });
          }
          // Rodada sem texto (o teto foi todo para o raciocínio): continuar só repetiria o gasto.
          if (reason !== "length" || cancel.signal.aborted || answer.length === before) break;
          report.continuations = round + 1;
          messages = continueFrom(prompt, answer);
        }
        report.generationMs = Date.now() - generation;

        // Validação e montagem final.
        let final = answer;
        // Consertos com raciocínio ligado (depurar pede pensar no fluxo inteiro); o teto de tokens cobre o pensar + a página.
        const complete = (msgs: AiMessage[], think = false) => completeChat(msgs, { target, temperature: 0.2, maxTokens: target === "coding" ? (think ? 20_000 : 16_000) : target === "remote" ? (think ? 14_000 : 9_000) : 5_000, timeoutMs: think ? 240_000 : 180_000, think, signal: cancel.signal });
        let note = "";
        if (task === "editar" && base) {
          const edits = parseEditBlocks(final);
          report.edits = edits.reduce((n, e) => n + e.edits.length, 0);
          if (edits.length) {
            note = edits.map((e) => e.note).filter(Boolean).join("; ");
            const all = edits.flatMap((e) => e.edits);
            // Dezenas de trocas não são uma mudança localizada (15/11: 442 trocas e 7 minutos): reescreve inteiro.
            const applied = all.length > 40 ? ({ ok: false, reason: `trocas demais (${all.length})` } as const) : applyEdits(base.source, all);
            if (applied.ok) {
              const block = serializeArtifact({ title: base.title, kind: base.kind, ref: base.id, format: base.format === "markdown" ? "markdown" : "html", source: applied.source });
              final = final.replace(edits[0].raw, block);
              for (const e of edits.slice(1)) final = final.replace(e.raw, "");
              report.editApplied = true;
            } else {
              report.editApplied = false;
              report.editFailure = applied.reason;
              send({ status: "As trocas não encaixaram no código atual; escrevendo o artefato inteiro já com a mudança.", step: "artefato-inteiro" });
              final = await complete(fullRewritePrompt(prompt, answer, applied.reason)).catch(() => answer);
            }
          }
        }

        if (task !== "explicar") {
          // Conferência em três camadas, até 2 consertos: (1) o bloco existe e fechou; (2) validação estática (formato,
          // bibliotecas, sintaxe dos scripts); (3) o artefato roda num navegador de verdade e o teste da Kally
          // (```teste-artefato) confere o que a pessoa pediu (runtime.ts). Qualquer problema volta para a Kally com o
          // código atual inteiro; ela entrega o artefato corrigido e o teste de novo.
          let test = takeTest(answer).test;
          let run: RuntimeReport | null = null;
          const repairs: string[][] = [];
          for (let attempt = 0; ; attempt++) {
            const split = takeTest(final);
            final = split.rest;
            if (split.test) test = split.test;
            const b = parseArtifactBlocks(final)[0];
            let problems: string[] = [];
            if (!b) problems = ["Não encontrei o bloco ```artefato na resposta."];
            else if (!b.closed) problems = ["O bloco do artefato não foi fechado (o código parece cortado)."];
            else {
              const v = validateArtifact({ title: b.title, kind: b.kind, description: b.description, category: b.category, format: b.format, source: b.source });
              if (!v.ok) problems = v.errors;
              // Mudança num artefato existente: o que já existia continua (ids de controles e áreas). Na bateria de
              // 15/11, "deixa a velocidade ir de 0,1× a 5×" trocou o laboratório cósmico inteiro por outro programa.
              const lost = task === "editar" && base && base.format === "html" && !/\b(remov|tir[ae]|apag|exclu|tira|sem o|sem a)\w*/i.test(message) ? missingIds(base.source, v.ok ? v.artifact.source : b.source) : [];
              if (lost.length) problems = [...problems, `Você removeu o que já existia no artefato (${lost.slice(0, 8).map((i) => `#${i}`).join(", ")}${lost.length > 8 ? "…" : ""}). Parta do código atual e mude só o que a pessoa pediu, mantendo todo o resto.`];
              if (!v.ok || lost.length) {
                // já tem problema: conserta antes de testar
              } else if (v.artifact.format === "html" && browserPath()) {
                send({ status: test ? "Testando o artefato num navegador: clicando e conferindo o que você pediu." : "Rodando o artefato num navegador para ver se carrega sem erro.", step: "artefato-teste" });
                run = await runArtifact(v.artifact.source, test);
                if (run.ran && !run.ok) problems = [...run.errors.map((e) => `Erro de JavaScript ao rodar: ${e}`), ...run.failures.map((f) => `No teste, falhou: ${f}`)];
                // Quais elementos o código procurou e não existem: a causa mais comum de "null.addEventListener".
                if (run.ran && !run.ok && run.missing?.length) problems.push(`O código procura elementos que não existem no HTML: ${run.missing.join(", ")}. Crie esses elementos com exatamente esse id ou classe, ou corrija o seletor no script.`);
              }
            }
            // Teto de tempo: depois de ~2 minutos, entrega o melhor que tem (com o aviso) em vez de deixar a pessoa esperando.
            if (!problems.length || attempt >= 2 || cancel.signal.aborted || Date.now() - input.startedAt > 120_000) {
              report.problems = problems;
              break;
            }
            repairs.push(problems);
            send({ status: `Encontrei ${problems.length === 1 ? "um problema" : `${problems.length} problemas`} e vou corrigir antes de entregar: ${problems[0]}`, step: `artefato-conserto-${attempt}` });
            const repair = repairPrompt(prompt, final, problems, b?.closed ? b.source : null, test);
            // Com raciocínio alto, às vezes o modelo gasta todos os tokens pensando e a resposta vem vazia: refaz sem ele.
            const fixed = await complete(repair, true).catch(() => complete(repair, false)).catch(() => "");
            if (parseArtifactBlocks(fixed).length) final = fixed;
            else break;
          }
          report.repaired = repairs;
          if (run?.ran) report.runtime = { ok: run.ok, passed: run.passed, failures: run.failures.length, errors: run.errors.length, ms: run.ms };
          const b = parseArtifactBlocks(final)[0];
          if (b) {
            const v = validateArtifact({ title: b.title, kind: b.kind, description: b.description, category: b.category, format: b.format, source: b.source });
            // Refinamento de um artefato salvo: o bloco aponta para ele (o app oferece "Salvar como versão N+1").
            const ref = task === "editar" && base?.id ? base.id : null;
            if (v.ok) {
              const normalized = serializeArtifact({ ...v.artifact, ref });
              final = final.replace(b.raw, normalized);
            }
            send({
              artifact: {
                title: v.ok ? v.artifact.title : b.title,
                kind: v.ok ? v.artifact.kind : b.kind,
                ref,
                baseVersion: ref ? base?.version ?? null : null,
                valid: v.ok,
                errors: v.ok ? [] : v.errors,
                warnings: v.warnings,
                note,
              },
            });
            report.valid = v.ok;
            report.chars = b.source.length;
            // O que foi conferido, em uma linha visível (sem o código do teste).
            if (run?.ran) {
              final = `${final.trimEnd()}\n\n${
                run.ok
                  ? `_Testei num navegador: ${run.passed ? `${run.passed} ${run.passed === 1 ? "verificação passou" : "verificações passaram"}` : "carregou sem erros"}._`
                  : `_Atenção: no teste do navegador ainda ${run.failures.length + run.errors.length === 1 ? "há um problema" : "há problemas"}: ${[...run.errors, ...run.failures].slice(0, 2).join("; ")}. Me diga o que aparece aí que eu corrijo._`
              }`;
            }
          }
          send({ artifactTest: run?.ran ? { ok: run.ok, passed: run.passed, failures: run.failures, errors: run.errors } : null });
          // Documento ou artefato pedido como arquivo: só depois de validado.
          const made = parseArtifactBlocks(final)[0];
          if (fileFormat && made && task === "criar") {
            const v = validateArtifact({ title: made.title, kind: made.kind, description: made.description, category: made.category, format: made.format, source: made.source });
            if (v.ok) final = `${final.trimEnd()}

${await deliverFile(v.artifact, fileFormat)}`;
          }
        }
        if (final !== answer) {
          answer = final;
          send({ replace: final });
        }
        send({ done: true });
      } catch (cause) {
        failed = cancel.signal.aborted ? "cancelada por quem perguntou" : cause instanceof Error ? cause.message : String(cause);
        if (!cancel.signal.aborted) console.error("Kally artefato:", failed);
        send({ error: "Não consegui terminar o artefato agora. Tente de novo." });
      } finally {
        clearInterval(heartbeat);
        if (conversationId && answer.trim()) await addMessage(conversationId, "assistant", answer.trim()).catch(() => undefined);
        if (conversationId) markDone(conversationId);
        try {
          controller.close();
        } catch {
          // já fechado
        }
        void logPerf({
          route: "artefato",
          ...report,
          messageChars: message.length,
          historyMessages: history.length,
          executor: { model: target === "coding" ? codingConfig().model : target === "remote" ? remoteConfig().model : "local" },
          backend: { target },
          firstTextMs: firstText ? firstText - input.startedAt : null,
          totalMs: Date.now() - input.startedAt,
          error: failed,
        });
      }
    },
  });

  const headers = new Headers(input.headers);
  headers.set("Cache-Control", "no-store, no-transform");
  headers.set("Content-Type", "text/event-stream; charset=utf-8");
  headers.set("X-Accel-Buffering", "no");
  return new Response(stream, { headers });
}
