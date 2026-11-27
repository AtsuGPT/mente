/**
 * Dados de teste do Mapa de Conhecimento (KNOWLEDGE-001): três ambientes isolados, com ~20, ~100 e ~500 nós, para
 * medir o mapa e conferir isolamento e privacidade. Só roda num banco de desenvolvimento: recusa qualquer DATABASE_URL
 * que aponte para o mente.db de produção.
 *
 *   npx tsx --tsconfig tests/tsconfig.json --env-file=.env scripts/seed-mapa-teste.ts <usuario-dono>
 *
 * Cria também, em cada ambiente, uma segunda pessoa ("mapa-outra") com tópicos e conversas próprios e um pensamento
 * privado, para conferir que nada disso aparece para o dono.
 */
import { db } from "@/lib/db";

const url = process.env.DATABASE_URL ?? "";
if (/mente\.db/i.test(url) && !/dev|teste|pasta/i.test(url)) {
  console.error("Recusado: DATABASE_URL parece o banco de produção.");
  process.exit(1);
}

const owner = process.argv[2];
if (!owner) {
  console.error("Uso: seed-mapa-teste.ts <usuario-dono>");
  process.exit(1);
}

// Gerador determinístico: o mesmo banco a cada execução.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];

const THEMES: [string, string[]][] = [
  ["Física", ["Lei de Ohm", "Circuitos em série", "Circuitos em paralelo", "Potência elétrica", "Campo elétrico", "Indução", "Cinemática", "Leis de Newton", "Energia mecânica", "Termodinâmica", "Ondas", "Óptica geométrica"]],
  ["Biologia", ["Mitose", "Meiose", "Fotossíntese", "Respiração celular", "Genética mendeliana", "DNA e RNA", "Evolução", "Ecologia", "Sistema nervoso", "Sistema imune", "Botânica", "Citologia"]],
  ["Química", ["Tabela periódica", "Ligações químicas", "Estequiometria", "Soluções", "Termoquímica", "Cinética", "Equilíbrio químico", "Ácidos e bases", "Eletroquímica", "Química orgânica", "Isomeria", "Polímeros"]],
  ["Matemática", ["Funções", "Função exponencial", "Logaritmos", "Trigonometria", "Matrizes", "Probabilidade", "Estatística", "Geometria plana", "Geometria espacial", "Derivadas", "Integrais", "Sequências"]],
  ["História", ["Revolução Francesa", "Revolução Industrial", "Era Vargas", "Ditadura militar", "Guerra Fria", "Primeira Guerra", "Segunda Guerra", "Iluminismo", "Brasil Colônia", "Independência", "República Velha", "Renascimento"]],
  ["Redação", ["Tese", "Argumentação", "Repertório", "Proposta de intervenção", "Coesão", "Coerência", "Introdução", "Conclusão", "Competência 1", "Competência 3", "Citações", "Estrutura"]],
  ["Filosofia", ["Platão", "Aristóteles", "Descartes", "Kant", "Nietzsche", "Ética", "Política", "Epistemologia", "Existencialismo", "Contratualismo", "Sócrates", "Lógica"]],
  ["Geografia", ["Clima", "Relevo", "Urbanização", "Globalização", "Agropecuária", "Energia", "Hidrografia", "Biomas", "Demografia", "Geopolítica", "Cartografia", "Indústria"]],
  ["Inglês", ["Present perfect", "Phrasal verbs", "Conditionals", "Reported speech", "Passive voice", "Modal verbs", "Reading", "Vocabulary", "Prepositions", "Linking words", "False friends", "Tenses"]],
  ["Sociologia", ["Durkheim", "Weber", "Marx", "Cultura", "Movimentos sociais", "Trabalho", "Desigualdade", "Estado", "Cidadania", "Indústria cultural", "Gênero", "Religião"]],
  ["Literatura", ["Modernismo", "Romantismo", "Realismo", "Barroco", "Arcadismo", "Machado de Assis", "Clarice Lispector", "Drummond", "Guimarães Rosa", "Poesia concreta", "Simbolismo", "Parnasianismo"]],
  ["Programação", ["Variáveis", "Laços", "Funções puras", "Recursão", "Listas", "Árvores", "Grafos", "Complexidade", "Ordenação", "Banco de dados", "APIs", "Testes"]],
  ["Música", ["Escalas", "Acordes", "Harmonia", "Ritmo", "Intervalos", "Campo harmônico", "Progressões", "Modos gregos", "Leitura de partitura", "Contraponto", "Forma musical", "Timbre"]],
  ["Economia", ["Inflação", "Juros", "Oferta e demanda", "PIB", "Câmbio", "Política fiscal", "Política monetária", "Mercado de trabalho", "Comércio exterior", "Desenvolvimento", "Microeconomia", "Macroeconomia"]],
];
const MASTERY = ["estudando", "estudando", "dificuldade", "dominado"];
const KINDS = ["simulador", "grafico", "diagrama", "documento"];

/** [temas, tópicos por tema, pensamentos por tema, conversas por tema, artefatos] ≈ 20, 100 e 500 nós. */
const SIZES: [string, number, number, number, number, number][] = [
  ["mapa-20", 3, 2, 2, 1, 2],
  ["mapa-100", 6, 6, 6, 3, 6],
  ["mapa-500", 14, 12, 14, 7, 24],
];

async function main() {
  const dono = await db.user.findUniqueOrThrow({ where: { username: owner } });
  const outra = await db.user.upsert({ where: { username: "mapa-outra" }, create: { username: "mapa-outra", displayName: "Outra pessoa" }, update: {} });

  for (const [slug, nThemes, topicsPer, postsPer, convsPer, nArtifacts] of SIZES) {
    const old = await db.environment.findUnique({ where: { slug } });
    if (old) await db.environment.delete({ where: { id: old.id } });
    const env = await db.environment.create({ data: { slug, name: `Mapa teste ${slug.split("-")[1]}`, ownerId: dono.id } });
    await db.membership.createMany({ data: [{ environmentId: env.id, userId: dono.id, role: "OWNER" }, { environmentId: env.id, userId: outra.id, role: "MEMBER" }] });

    let postNumber = 0;
    const posts: { id: string; slug: string; theme: number }[] = [];
    const conversations: string[] = [];
    for (let t = 0; t < nThemes; t++) {
      const [themeName, topics] = THEMES[t];
      const category = await db.category.create({ data: { environmentId: env.id, name: themeName, slug: `${themeName.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}-${t}`, position: t, color: pick(["#8461F0", "#5B8DEF", "#3FBF7F", "#E0A040", "#D96CA8"]) } });
      // Conversas da pasta; cada tópico nasce numa delas.
      const convIds: string[] = [];
      for (let c = 0; c < convsPer; c++) {
        const conv = await db.kallyConversation.create({ data: { environmentId: env.id, userId: dono.id, categoryId: category.id, title: `${themeName}: ${topics[c % topics.length]} e mais` } });
        convIds.push(conv.id);
        conversations.push(conv.id);
      }
      for (let k = 0; k < topicsPer; k++) {
        const title = topics[k % topics.length] + (k >= topics.length ? ` (${Math.floor(k / topics.length) + 1})` : "");
        await db.kallyLearningTopic.create({
          data: { environmentId: env.id, userId: dono.id, key: `${t}-${k}-${title.toLowerCase()}`, title, categoryId: category.id, conversationId: convIds[k % convIds.length], mastery: pick(MASTERY), explanations: 1 + Math.floor(rand() * 4), lastStudiedAt: new Date(Date.now() - Math.floor(rand() * 20) * 86_400_000) },
        });
      }
      for (let p = 0; p < postsPer; p++) {
        postNumber += 1;
        const post = await db.post.create({
          data: { environmentId: env.id, number: postNumber, title: `${pick(topics)}: anotação ${p + 1}`, slug: `${slug}-p${postNumber}`, content: `Resumo sobre ${pick(topics)} em ${themeName}.`, status: "PUBLISHED", publishedAt: new Date(Date.now() - postNumber * 3_600_000), authorId: dono.id, categories: { connect: { id: category.id } } },
        });
        posts.push({ id: post.id, slug: post.slug, theme: t });
      }
    }
    // Relações reais entre pensamentos (links no texto), algumas entre temas diferentes.
    for (const post of posts) {
      if (rand() > 0.35) continue;
      const other = pick(posts);
      if (other.id === post.id) continue;
      await db.post.update({ where: { id: post.id }, data: { content: `Ligado a [outro pensamento](/pensamento/${other.slug}).` } });
    }
    // Um pensamento em duas pastas (sem duplicar).
    if (posts.length > 3) {
      const cats = await db.category.findMany({ where: { environmentId: env.id }, select: { id: true }, take: 2, orderBy: { position: "asc" } });
      await db.post.update({ where: { id: posts[0].id }, data: { categories: { connect: cats.map((c) => ({ id: c.id })) } } });
    }
    // Fontes citadas pela Kally nas conversas (relação real entre conversa e pensamento).
    for (const conv of conversations) {
      const cited = [pick(posts), pick(posts)].map((p) => ({ title: "fonte", slug: p.slug, kind: "post" }));
      await db.kallyMessage.createMany({ data: [{ conversationId: conv, role: "user", content: "me explica" }, { conversationId: conv, role: "assistant", content: "Explicação.", sources: JSON.stringify(cited) }] });
    }
    for (let a = 0; a < nArtifacts; a++) {
      await db.artifact.create({ data: { environmentId: env.id, authorId: dono.id, title: `${pick(KINDS)} ${a + 1}`, kind: pick(KINDS), conversationId: pick(conversations) } });
    }

    // Isolamento e privacidade: o que é da outra pessoa ou privado não pode aparecer para o dono como dele.
    const cat0 = await db.category.findFirstOrThrow({ where: { environmentId: env.id }, orderBy: { position: "asc" } });
    const conv = await db.kallyConversation.create({ data: { environmentId: env.id, userId: outra.id, categoryId: cat0.id, title: "SEGREDO conversa da outra pessoa" } });
    await db.kallyLearningTopic.create({ data: { environmentId: env.id, userId: outra.id, key: "segredo", title: "SEGREDO tópico da outra pessoa", categoryId: cat0.id, conversationId: conv.id } });
    await db.artifact.create({ data: { environmentId: env.id, authorId: outra.id, title: "SEGREDO artefato privado", kind: "simulador", private: true, conversationId: conv.id } });
    await db.post.create({ data: { environmentId: env.id, number: ++postNumber, title: "SEGREDO pensamento privado", slug: `${slug}-privado`, content: "privado", status: "PUBLISHED", private: true, publishedAt: new Date(), authorId: outra.id, categories: { connect: { id: cat0.id } } } });
    console.log(`${slug}: pronto`);
  }
}

main().finally(() => db.$disconnect());
