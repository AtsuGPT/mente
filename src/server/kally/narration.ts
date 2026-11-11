import "server-only";
import { completeChat } from "@/server/ai";

/**
 * O que a Kally diz enquanto trabalha ("etapas"): frases curtas, em primeira pessoa e amistosas, dizendo o que ela
 * está fazendo e por que isso é bom para a pessoa (pedido do dono do projeto, 11/11/2026: "respostas únicas pra
 * cada ocasião").
 *
 *   - abertura: com o modelo remoto no ar, o 32B escreve uma frase própria para o pedido (o que entendeu e o que
 *     vai fazer), numa chamada curta em paralelo; se não ficar pronta a tempo, a etapa simplesmente não aparece.
 *   - as outras etapas: várias versões por ocasião, preenchidas com os dados do momento (tema, quantas fontes,
 *     título da parte), sorteadas sem repetir a última usada. Sem custo de modelo (a local não perde tempo).
 */

export type Step = "gpu" | "gpuFalhou" | "postFontes" | "postPesquisa" | "postLeu" | "raciocinio" | "rascunho" | "revisao" | "planejar" | "planoFalhou" | "primeiraParte" | "parte" | "parteRefeita" | "fechando" | "escrevendo";
export type Ctx = { tempo?: string; termos?: string; paginas?: number; sites?: number; palavras?: number; partes?: string; label?: string; feito?: string };

const POOLS: Record<Step, ((c: Ctx) => string)[]> = {
  gpu: [
    () => "Estou chamando a Kally 32, que dá conta melhor de um pedido assim. Depois de um tempo sem uso, ela leva uns minutos para acordar.",
    () => "Acordando a Kally 32 para este pedido, que merece a versão mais completa. Mais um pouquinho…",
    () => "A Kally 32 estava descansando; estou acordando ela para te responder com mais profundidade.",
    () => "Preparando a Kally 32: vale a espera, porque ela elabora melhor.",
  ],
  gpuFalhou: [
    () => "A Kally 32 demorou mais que o normal para acordar, então eu, a Kally 1.5, respondo, para você não ficar esperando.",
    () => "A Kally 32 não ficou pronta a tempo. Sigo com a Kally 1.5, para você ter a resposta agora.",
    () => "Melhor não te deixar esperando mais: a Kally 32 não acordou, então respondo com a Kally 1.5.",
  ],
  postFontes: [
    () => "Vou buscar fontes para dar base ao seu post. Escolho só os conceitos gerais do tema; nada pessoal seu sai daqui.",
    () => "Antes de escrever, quero apoiar o seu texto em fontes de verdade. Pesquiso só o tema, nunca o que você me contou.",
    () => "Seu post vai ficar mais forte com base: vou pesquisar os conceitos que ele toca, sem levar nada pessoal para a busca.",
  ],
  postPesquisa: [
    (c) => `Pesquisando ${c.termos} em notícias, redes sociais e sites de referência…`,
    (c) => `Procurando o que se fala de ${c.termos} em notícias do Brasil e de fora, redes e sites de referência…`,
    (c) => `Garimpando boas fontes sobre ${c.termos}…`,
  ],
  postLeu: [
    (c) => `Li ${c.paginas} páginas em ${c.sites} sites e separei as mais confiáveis. Agora escrevo o rascunho com a sua voz…`,
    (c) => `Passei por ${c.paginas} páginas de ${c.sites} sites e fiquei com as melhores. Hora de escrever, do seu jeito…`,
    (c) => `Das ${c.paginas} páginas que encontrei (${c.sites} sites), escolhi as que valem citar. Escrevendo o rascunho…`,
  ],
  raciocinio: [
    () => "Vou conferir o raciocínio antes de escrever, porque conta ou código errado não ajudam ninguém…",
    () => "Deixa eu pensar com calma antes: aqui um detalhe errado muda tudo…",
    () => "Conferindo passo a passo antes de te responder, para você poder confiar no resultado…",
  ],
  rascunho: [
    (c) => `Escrevendo o seu rascunho… ${c.palavras} palavras até agora`,
    (c) => `O rascunho está saindo: ${c.palavras} palavras`,
    (c) => `Já são ${c.palavras} palavras do seu post…`,
  ],
  revisao: [
    () => "Rascunho pronto. Estou conferindo frase por frase se tudo veio de você ou das fontes, para não colocar nada na sua boca…",
    () => "Antes de te mostrar, releio o rascunho para tirar qualquer coisa que você não disse…",
    () => "Última passada: confiro se cada frase é sua ou tem fonte. O texto tem que soar como você…",
  ],
  planejar: [
    (c) => `Vou planejar a resposta em ${c.partes} partes, para ela ficar completa e bem amarrada. Demora um pouco mais, mas vale a pena…`,
    (c) => `Pedido com fôlego: vou montar um plano em ${c.partes} partes antes de escrever, para nada ficar solto…`,
    (c) => `Organizando a resposta em ${c.partes} partes, para te entregar algo completo e na ordem certa…`,
  ],
  planoFalhou: [
    () => "Desta vez não consegui dividir em partes; vou responder direto, para não te deixar esperando.",
    () => "O plano em partes não saiu como eu queria. Respondo direto, que é melhor do que te fazer esperar.",
  ],
  primeiraParte: [
    (c) => `Plano pronto. Escrevendo a ${c.label}…`,
    (c) => `Com o plano em mãos, começo pela ${c.label}…`,
    (c) => `Tudo planejado. Primeiro, a ${c.label}…`,
  ],
  parte: [
    (c) => `Escrevendo a ${c.label}. Confiro cada parte antes de mostrar, para não sair do assunto…`,
    (c) => `Seguindo para a ${c.label}…`,
    (c) => `Agora a ${c.label}, continuando de onde parei…`,
    (c) => `Partindo para a ${c.label}. Ela só aparece depois de conferida…`,
  ],
  parteRefeita: [
    (c) => `A ${c.label} fugiu um pouco do que você perguntou, então estou reescrevendo para ficar no ponto…`,
    (c) => `Não gostei da ${c.label}: desviou do seu pedido. Refazendo…`,
    (c) => `Reescrevendo a ${c.label} para ela tratar exatamente do que você quer saber…`,
  ],
  fechando: [
    (c) => `Para a resposta chegar inteira em até 5 minutos, a ${c.label} vai concluir com o essencial do que faltava…`,
    (c) => `O tempo do Aprofundado está no fim: uso a ${c.label} para fechar a resposta, sem deixar nada pela metade…`,
    (c) => `Fechando na ${c.label}, com o principal do que viria depois, para não passar dos 5 minutos…`,
  ],
  escrevendo: [
    (c) => `${c.feito}. Agora escrevo a resposta…`,
    (c) => `${c.feito}. Juntando tudo na resposta…`,
    (c) => `${c.feito}. Já estou escrevendo…`,
  ],
};

type Registry = { __kallyNarration?: Map<Step, number> };
const registry = globalThis as typeof globalThis & Registry;
const lastUsed = (registry.__kallyNarration ??= new Map<Step, number>());

/** Uma versão da etapa, sorteada sem repetir a última usada nesta ocasião. */
export function say(step: Step, ctx: Ctx = {}) {
  const pool = POOLS[step];
  const previous = lastUsed.get(step);
  let i = Math.floor(Math.random() * pool.length);
  if (pool.length > 1 && i === previous) i = (i + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length;
  lastUsed.set(step, i);
  return pool[i](ctx);
}

/**
 * Abertura própria para o pedido, escrita pelo 32B (o que entendeu, o que vai fazer e por que ajuda). Chamada curta,
 * sem raciocínio; devolve null se não ficar pronta em `timeoutMs` ou se o modelo fugir do formato.
 */
export async function personalOpener(input: { message: string; plans: string[]; timeoutMs?: number }): Promise<string | null> {
  try {
    const raw = await completeChat(
      [
        {
          role: "system",
          content: [
            "Você escreve a frase de andamento que a Kally mostra enquanto prepara a resposta. Uma frase só, em primeira pessoa, amistosa e natural, com até 28 palavras: o que você entendeu que a pessoa quer e o que vai fazer agora para ajudar melhor (use os passos informados).",
            "Seja específica para ESTE pedido (cite o assunto), sem repetir o pedido palavra por palavra, sem saudação, sem emojis, sem prometer o que os passos não fazem, sem a resposta em si.",
            'Responda só com o JSON: {"frase":"..."}',
          ].join("\n"),
        },
        { role: "user", content: `Pedido: """${input.message.slice(0, 800)}"""\nPassos: ${input.plans.join("; ") || "responder com cuidado"}` },
      ],
      { target: "remote", json: true, temperature: 0.7, maxTokens: 90, timeoutMs: input.timeoutMs ?? 4_000, think: false },
    );
    const frase = (JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { frase?: unknown }).frase;
    if (typeof frase !== "string") return null;
    const clean = frase.trim().replace(/\s+/g, " ").replace(/^["“]|["”]$/g, "");
    return clean.length >= 15 && clean.length <= 260 ? clean : null;
  } catch {
    return null;
  }
}
