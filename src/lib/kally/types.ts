/**
 * Tipos compartilhados entre o chat (cliente) e a rota /api/chat (servidor)
 * para o fluxo de criação de posts da Kally, anexos e pesquisa na internet.
 */

export const AUTONOMY_LEVELS = ["auto", "consultivo", "educativo"] as const;
export type Autonomy = (typeof AUTONOMY_LEVELS)[number];

export const AUTONOMY_LABELS: Record<Autonomy, { label: string; hint: string }> = {
  auto: { label: "Automático", hint: "Kally interpreta, estrutura e escreve o post completo." },
  consultivo: { label: "Consultivo", hint: "Kally pergunta o essencial e mostra o plano antes de escrever." },
  educativo: { label: "Educativo", hint: "Kally ensina a construir o texto, parte por parte, com você." },
};

export const DEPTHS = ["sintetico", "desenvolvido", "aprofundado", "extensivo"] as const;
export type Depth = (typeof DEPTHS)[number];

export const DEPTH_LABELS: Record<Depth, { label: string; hint: string }> = {
  sintetico: { label: "Sintético", hint: "direto, só o essencial" },
  desenvolvido: { label: "Desenvolvido", hint: "explica cada ideia com exemplos" },
  aprofundado: { label: "Aprofundado", hint: "contexto, argumentos e contrapontos" },
  extensivo: { label: "Extensivo", hint: "explicações, exemplos e fundamentação" },
};

export const APPROACHES = ["informativo", "filosofico", "tecnico", "reflexivo", "argumentativo"] as const;
export type Approach = (typeof APPROACHES)[number];

export const APPROACH_LABELS: Record<Approach, string> = {
  informativo: "Informativo",
  filosofico: "Filosófico",
  tecnico: "Técnico",
  reflexivo: "Reflexivo",
  argumentativo: "Argumentativo",
};

/** Aspectos que o modo consultivo pode perguntar, em ordem de prioridade. */
export const BRIEF_ASPECTS = ["intencao", "abordagem", "profundidade", "publico", "essenciais"] as const;
export type BriefAspect = (typeof BRIEF_ASPECTS)[number];

export const TEACHING_STEPS = ["tese", "introducao", "desenvolvimento", "aprofundamento", "conclusao"] as const;
export type TeachingStep = (typeof TEACHING_STEPS)[number];

export const TEACHING_LABELS: Record<TeachingStep, string> = {
  tese: "Ideia central",
  introducao: "Introdução",
  desenvolvimento: "Desenvolvimento",
  aprofundamento: "Aprofundamento",
  conclusao: "Conclusão",
};

export type PlanSection = { titulo: string; ideias: string };

export type PostPlan = {
  objetivo: string;
  tese: string;
  publico: string;
  abordagem: Approach;
  profundidade: Depth;
  estrutura: PlanSection[];
  essenciais: string;
  tituloSugerido: string;
  categoriaSugerida: string;
};

export type PostDraft = { title: string; category: string; content: string };

export type PostStage = "briefing" | "plan" | "writing" | "draft" | "teaching";

export type WebSource = {
  id: string;
  title: string;
  url: string;
  site: string;
  kind: "web" | "academico" | "livro" | "referencia" | "noticia";
  provider: string;
  published?: string;
  authors?: string;
  /** Trechos efetivamente lidos e usados como contexto. */
  excerpt: string;
  /** true quando o conteúdo da página foi lido; false quando só há o resumo do buscador. */
  read: boolean;
};

export type PostWorkspace = {
  id: string;
  autonomy: Autonomy;
  stage: PostStage;
  /** Pedido original (sem o comando /post). */
  idea: string;
  /** Respostas e pedidos do usuário durante o fluxo. */
  notes: string[];
  /** Aspectos já perguntados no modo consultivo, para não repetir. */
  asked: BriefAspect[];
  plan: PostPlan | null;
  teachingStep: TeachingStep;
  /** Partes escritas pelo próprio usuário no modo educativo. */
  parts: Partial<Record<TeachingStep, string>>;
  draft: PostDraft | null;
  /** Pesquisa feita para esta tarefa; não é gravada em memória permanente. */
  research: WebSource[];
};

export type PostAction =
  | "start"
  | "message"
  | "plan"
  | "approve_plan"
  | "write"
  | "teach_start"
  | "teach_feedback"
  | "teach_next";

export type AttachmentStatus = "ready" | "partial" | "unreadable" | "unsupported" | "received";

export type AttachmentInfo = {
  id: string;
  name: string;
  kind: "pdf" | "texto" | "markdown" | "docx" | "csv" | "imagem" | "audio";
  status: AttachmentStatus;
  /** Explicação legível do resultado do processamento. */
  detail: string;
  chars: number;
  pages?: number;
};

export function emptyWorkspace(autonomy: Autonomy, idea: string): PostWorkspace {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()),
    autonomy,
    stage: "briefing",
    idea,
    notes: [],
    asked: [],
    plan: null,
    teachingStep: "tese",
    parts: {},
    draft: null,
    research: [],
  };
}
