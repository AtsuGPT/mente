
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL não definida.");

const db = new PrismaClient();

const categories = [
  {
    name: "Amor",
    slug: "amor",
    description: "Afeto, vínculos e as formas como o amor transforma a vida.",
    color: "#72C8D6",
    position: 1,
  },
  {
    name: "Aprendizado",
    slug: "aprendizado",
    description: "O que fica depois de errar, estudar e tentar de novo.",
    color: "#78BFAF",
    position: 2,
  },
  {
    name: "Reflexões",
    slug: "reflexoes",
    description: "Perguntas, ideias e pensamentos que merecem tempo.",
    color: "#8BAFDC",
    position: 3,
  },
  {
    name: "Visões de mundo",
    slug: "visoes-de-mundo",
    description: "Perspectivas sobre a sociedade, a cultura e o modo como vivemos.",
    color: "#A5C6D7",
    position: 4,
  },
];

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

const samples = [
  {
    slug: "exemplo-o-silencio-tambem-pensa",
    title: "O silêncio também pensa",
    categories: ["reflexoes"],
    publishedAt: daysAgo(2),
    content: `Este é um texto de exemplo, criado só para você ver como o site se comporta. Apague-o pelo painel quando quiser.

Existe um tipo de pensamento que só aparece quando paramos de procurá-lo. Não chega com argumentos nem com conclusões; chega como uma espécie de clareza lateral, a mesma que faz um nome esquecido voltar enquanto lavamos a louça.

## Pensar sem pressa

Talvez a pressa seja o principal inimigo da reflexão. Queremos respostas rápidas porque o desconforto da dúvida cansa, mas uma pergunta bem feita costuma valer mais do que uma resposta apressada.

> Uma dúvida cuidada é uma forma de atenção.

Escrever, nesse sentido, é uma maneira de dar tempo ao pensamento. O texto não nasce pronto; ele vai sendo descoberto enquanto é escrito.

- Anotar antes de organizar.
- Reler no dia seguinte.
- Aceitar que algumas perguntas ficam abertas.

No fim, o silêncio não é ausência de pensamento. É o espaço onde ele respira.`,
  },
  {
    slug: "exemplo-escutar-antes-de-responder",
    title: "Escutar antes de responder",
    categories: ["amor", "aprendizado"],
    publishedAt: daysAgo(9),
    content: `Texto de exemplo. Substitua por algo seu.

Quase toda conversa difícil melhora quando a gente troca a vontade de ter razão pela vontade de entender. Parece simples, mas exige treino: segurar a resposta pronta e deixar a outra pessoa terminar de dizer o que precisa.

Entender não é concordar. É apenas reconhecer que existe uma experiência do outro lado que não é a minha.

Vale tentar uma pergunta antes de qualquer defesa: *o que, exatamente, você quis dizer com isso?* Muitas vezes o conflito era só um mal-entendido com roupa de discussão.`,
  },
  {
    slug: "exemplo-um-caderno-que-se-organiza-sozinho",
    title: "Um caderno que se organiza sozinho",
    categories: ["visoes-de-mundo"],
    publishedAt: daysAgo(21),
    content: `Texto de exemplo.

E se um caderno de anotações soubesse reaproximar ideias que parecem distantes? Não para decidir por mim, mas para me mostrar conexões que eu mesmo ainda não percebi.

Ainda é só um rascunho. Registrar a ideia já é metade do caminho: ela deixa de ser uma vontade solta e passa a ser algo que posso revisitar, criticar e, talvez, construir.`,
  },
  {
    slug: "exemplo-errar-em-voz-alta",
    title: "Errar em voz alta",
    categories: ["aprendizado", "reflexoes"],
    publishedAt: daysAgo(40),
    content: `Texto de exemplo.

Aprender em público tem um custo: os erros ficam visíveis. Mas também tem um benefício raro, que é transformar o erro em material compartilhável em vez de vergonha privada.

Quando um erro vira texto, ele ganha contorno. Deixa de ser uma sensação difusa de fracasso e passa a ser uma pergunta concreta: *o que aconteceu, e o que eu faria diferente?*`,
  },
];

async function main() {
  for (const c of categories) {
    await db.category.upsert({
      where: { slug: c.slug },
      update: { color: c.color },
      create: c,
    });
  }
  console.log(`Categorias garantidas: ${categories.map((c) => c.name).join(", ")}`);

  if (process.env.SEED_SAMPLES === "1") {
    for (const s of samples) {
      const linkedCategories = await db.category.findMany({
        where: { slug: { in: s.categories } },
        select: { id: true },
      });
      const categories = linkedCategories.map(({ id }) => ({ id }));
      if (await db.post.findUnique({ where: { slug: s.slug }, select: { id: true } })) continue;

      const { value: number } = await db.postCounter.upsert({
        where: { id: "posts" },
        update: { value: { increment: 1 } },
        create: { id: "posts", value: 1 },
      });
      await db.post.create({
        data: {
          number,
          slug: s.slug,
          title: s.title,
          content: s.content,
          status: "PUBLISHED",
          publishedAt: s.publishedAt,
          categories: { connect: categories },
        },
      });
    }
    console.log(`Pensamentos de exemplo garantidos: ${samples.length}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
