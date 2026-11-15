import "server-only";
import { completeChat, openChatStream, type AiMessage, type FinishReason } from "@/server/ai";
import { logPerf } from "@/server/ai/perf";
import { remoteConfig, remoteHealth } from "@/server/ai/remote";
import { addMessage, createConversation, dropLastAnswer, findRelevantPosts, toSources } from "@/server/kally";
import { asksEnvironment } from "@/server/kally/need";
import { markDone, markRunning } from "@/server/kally/running";
import type { Access } from "@/server/environments";
import { parseArtifactBlocks, parseEditBlocks, serializeArtifact } from "./block";
import { applyEdits } from "./edits";
import { artifactTask, requestedThing, type ArtifactTask } from "./intent";
import { kindFrom, KIND_LABEL, LIMITS } from "./kinds";
import { artifactPrompt, fullRewritePrompt, repairPrompt, type BaseArtifact } from "./prompt";
import { artifactForKally, findArtifactByMention, listArtifacts } from "./store";
import { validateArtifact } from "./validate";

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

type History = { role: "user" | "assistant"; content: string }[];
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
  if (typeof a.id === "string" && a.id) {
    // Salvo: o código vem do banco, pelo mesmo porteiro (o app não consegue mandar o código de um artefato que a pessoa não vê).
    const saved = await artifactForKally(access, a.id);
    if (saved) return { base: { id: saved.id, title: saved.title, kind: saved.kind, format: saved.format, source: saved.source, version: saved.version }, attached };
  }
  const source = typeof a.source === "string" ? a.source.slice(0, LIMITS.source) : "";
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
  if ((task === "editar" || task === "explicar") && !base) task = "criar";
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
      let target: "remote" | "local" = "local";
      let failed: string | null = null;
      let firstText = 0;
      const report: Record<string, unknown> = { task, base: base ? { saved: !!base.id, chars: base.source.length } : null };
      try {
        if (conversationId) markRunning(conversationId, cancel);
        send({ conversationId, temporary: !conversationId, mode: "artefato", searched: false });

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

        const prompt = artifactPrompt({ task, message, history, base, environmentName: access.environment.name, userName: input.userName, material });
        const cfg = remoteConfig();
        target = cfg.enabled && (await remoteHealth()).state === "disponivel" ? "remote" : "local";
        report.target = target;
        const generation = Date.now();

        // Geração em streaming (o app mostra "Construindo o artefato…" enquanto o bloco não fecha).
        let messages = prompt;
        for (let round = 0; round <= MAX_CONTINUATIONS; round++) {
          let reason = "other" as FinishReason;
          const chunks = await openChatStream(messages, {
            target,
            temperature: 0.3,
            maxTokens: target === "remote" ? 9_000 : 5_000,
            think: false,
            timeoutMs: 120_000,
            signal: cancel.signal,
            onFinish: (r) => (reason = r),
          });
          for await (const chunk of chunks) {
            if (!firstText) firstText = Date.now();
            answer += chunk;
            send({ text: chunk });
          }
          if (reason !== "length" || cancel.signal.aborted) break;
          report.continuations = round + 1;
          messages = continueFrom(prompt, answer);
        }
        report.generationMs = Date.now() - generation;

        // Validação e montagem final.
        let final = answer;
        const complete = (msgs: AiMessage[]) => completeChat(msgs, { target, temperature: 0.2, maxTokens: target === "remote" ? 9_000 : 5_000, timeoutMs: 180_000, think: false, signal: cancel.signal });
        let note = "";
        if (task === "editar" && base) {
          const edits = parseEditBlocks(final);
          report.edits = edits.reduce((n, e) => n + e.edits.length, 0);
          if (edits.length) {
            note = edits.map((e) => e.note).filter(Boolean).join("; ");
            const applied = applyEdits(base.source, edits.flatMap((e) => e.edits));
            if (applied.ok) {
              const block = serializeArtifact({ title: base.title, kind: base.kind, ref: base.id, format: base.format === "markdown" ? "markdown" : "html", source: applied.source });
              final = final.replace(edits[0].raw, block);
              for (const e of edits.slice(1)) final = final.replace(e.raw, "");
              report.editApplied = true;
            } else {
              report.editApplied = false;
              report.editFailure = applied.reason;
              send({ status: "As trocas não encaixaram no código atual; escrevendo o artefato inteiro já com a mudança.", step: "artefato-inteiro" });
              final = await complete(fullRewritePrompt(prompt, answer, applied.reason));
            }
          }
        }

        if (task !== "explicar") {
          let blocks = parseArtifactBlocks(final);
          let problems: string[] = [];
          const checkFirst = () => {
            const b = blocks[0];
            if (!b) return ["Não encontrei o bloco ```artefato na resposta."];
            if (!b.closed) return ["O bloco do artefato não foi fechado (o código parece cortado)."];
            const v = validateArtifact({ title: b.title, kind: b.kind, description: b.description, category: b.category, format: b.format, source: b.source });
            return v.ok ? [] : v.errors;
          };
          problems = checkFirst();
          if (problems.length) {
            report.repaired = problems;
            send({ status: `Conferi o código e vou corrigir antes de entregar: ${problems[0]}`, step: "artefato-conserto" });
            const fixed = await complete(repairPrompt(prompt, final, problems));
            if (parseArtifactBlocks(fixed).length) {
              final = fixed;
              blocks = parseArtifactBlocks(final);
              problems = checkFirst();
            }
          }
          const b = blocks[0];
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
          executor: { model: target === "remote" ? remoteConfig().model : "local" },
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
