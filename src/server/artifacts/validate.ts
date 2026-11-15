import { Script } from "node:vm";
import { ALLOWED_SCRIPT_HOSTS, ALLOWED_STYLE_HOSTS, ARTIFACT_FORMATS, kindFrom, LIMITS, type ArtifactFormat, type ArtifactKind } from "./kinds";
import { looksLikeHtml } from "./block";

/**
 * Validação de um artefato antes de salvar (e da resposta da Kally antes de chegar à pessoa).
 *
 * A segurança de verdade NÃO está aqui: o código sempre roda numa caixa de areia sem acesso ao app (iframe com
 * sandbox sem "allow-same-origin" e uma política de conteúdo que bloqueia rede, formulários e navegação; ver
 * mobile/src/lib/artifact.ts). Esta etapa é a segunda camada: recusa o que nunca deveria estar num artefato (outra
 * página embutida, redirecionamento, scripts de endereços fora da lista) e avisa do que vai falhar na caixa (pedidos de
 * rede, cookies), para a Kally corrigir antes de entregar.
 */

export type ArtifactDraft = { title: string; kind: string | null; description?: string; category?: string; format?: string; source: string };
export type ValidArtifact = { title: string; kind: ArtifactKind; description: string; category: string; format: ArtifactFormat; source: string };
export type Validation = { ok: true; artifact: ValidArtifact; warnings: string[] } | { ok: false; errors: string[]; warnings: string[] };

const clip = (v: string | undefined, max: number) => (v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function hostOf(url: string) {
  try {
    return new URL(url, "https://exemplo.invalid").hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Tipo deduzido do código, quando o cabeçalho não diz. */
export function guessKind(source: string, title = ""): ArtifactKind {
  const t = `${title} ${source.slice(0, 4000)}`.toLowerCase();
  if (/mermaid|flowchart|graph td|mapa mental|fluxograma|grafo|árvore|arvore/.test(t)) return "diagrama";
  if (/chart\.js|new chart\(|plotly|d3\.|gr[aá]fico|histograma|dashboard/.test(t)) return "grafico";
  if (/simula|requestanimationframe|velocidade|gravidade|circuito|<input[^>]+type=["']?range/.test(t)) return "simulador";
  if (/react|createelement|componente/.test(t)) return "codigo";
  return "ferramenta";
}

export function validateArtifact(draft: ArtifactDraft): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const source = (draft.source ?? "").replace(/\r\n/g, "\n").trim();
  const title = clip(draft.title, LIMITS.title) || "Artefato";
  // Markdown só para documento declarado (ou sem tipo) que não parece HTML; o resto é página e passa pelas checagens.
  const declared = kindFrom(draft.kind);
  const format: ArtifactFormat = (ARTIFACT_FORMATS as readonly string[]).includes(draft.format ?? "") && !(draft.format === "markdown" && looksLikeHtml(source))
    ? (draft.format as ArtifactFormat)
    : (declared === "documento" || !declared) && !looksLikeHtml(source) && !/<[a-z][\w-]*[\s>/]/i.test(source)
      ? "markdown"
      : "html";
  const kind = declared ?? (format === "markdown" ? "documento" : guessKind(source, title));

  if (!source) errors.push("O artefato está vazio.");
  if (source.length > LIMITS.source) errors.push(`O código passou do limite de ${LIMITS.source.toLocaleString("pt-BR")} caracteres.`);

  if (format === "html" && source) {
    if (!/<[a-z][\s\S]*>/i.test(source)) errors.push("Não encontrei HTML no artefato.");
    if (/<base[\s>]/i.test(source)) errors.push("O artefato não pode usar <base>.");
    if (/<meta[^>]+http-equiv\s*=\s*["']?refresh/i.test(source)) errors.push("O artefato não pode redirecionar a página (meta refresh).");
    if (/<(iframe|frame|frameset|object|embed|portal)[\s>]/i.test(source)) errors.push("O artefato não pode embutir outras páginas (iframe, object, embed).");
    if (/<form[^>]+action\s*=\s*["']?\s*https?:/i.test(source)) errors.push("O artefato não pode enviar formulários para outros endereços.");
    for (const m of source.matchAll(/<script[^>]*\ssrc\s*=\s*["']?([^"'\s>]+)/gi)) {
      const host = hostOf(m[1]);
      if (!(ALLOWED_SCRIPT_HOSTS as readonly string[]).includes(host)) errors.push(`Script de endereço não permitido: ${host || m[1]}. Use só ${ALLOWED_SCRIPT_HOSTS.join(", ")}.`);
      if (!/@\d/.test(m[1]) && host !== "cdnjs.cloudflare.com") warnings.push(`A biblioteca ${m[1]} está sem versão fixa (use nome@versão).`);
    }
    for (const m of source.matchAll(/<link[^>]+href\s*=\s*["']?([^"'\s>]+)/gi)) {
      const host = hostOf(m[1]);
      if (/^https?:/i.test(m[1]) && !(ALLOWED_STYLE_HOSTS as readonly string[]).includes(host)) errors.push(`Estilo de endereço não permitido: ${host}.`);
    }
    if (/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/.test(source) || /new\s+(XMLHttpRequest|WebSocket|EventSource)\b/.test(source)) warnings.push("O artefato tenta acessar a rede; na caixa de areia isso é bloqueado.");
    if (/document\.cookie|indexedDB/.test(source)) warnings.push("O artefato usa cookies ou indexedDB, que não existem na caixa de areia.");
    if (/\b(window\.)?(top|parent)\.(location|document)/.test(source)) errors.push("O artefato não pode mexer na página do app (top/parent).");
    if (/<script[^>]*>[\s\S]*$/i.test(source) && (source.match(/<script\b/gi)?.length ?? 0) > (source.match(/<\/script>/gi)?.length ?? 0)) errors.push("Há um <script> sem fechamento (o código parece cortado).");
    if (/<html[\s>]/i.test(source) && !/<\/html>/i.test(source)) warnings.push("A página não fecha </html> (pode ter sido cortada).");
    // Sintaxe dos scripts: cada <script> é compilado (sem rodar) pelo próprio Node. Um erro aqui quebraria o artefato
    // inteiro na tela (bateria de 15/11: "var(--mm-text)" escrito dentro do JavaScript).
    for (const [i, m] of [...source.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)].entries()) {
      const attrs = m[1] ?? "";
      if (/\ssrc\s*=/i.test(attrs) || /type\s*=\s*["']?(module|application\/json|text\/(?!javascript))/i.test(attrs) || !m[2].trim()) continue;
      try {
        new Script(m[2], { filename: `script-${i + 1}.js` });
      } catch (cause) {
        const line = cause instanceof Error ? cause.stack?.match(/script-\d+\.js:(\d+)/)?.[1] : undefined;
        errors.push(`Erro de sintaxe no ${i + 1}º script${line ? ` (linha ${line} do script)` : ""}: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
    }
  }

  if (errors.length) return { ok: false, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
  return {
    ok: true,
    artifact: { title, kind, description: clip(draft.description, LIMITS.description), category: clip(draft.category, LIMITS.category), format, source },
    warnings: [...new Set(warnings)],
  };
}
