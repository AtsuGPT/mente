import "dotenv/config";
import { readFile } from "node:fs/promises";
import { PrismaClient, type PostStatus } from "../src/generated/prisma";

type ExportCategory = {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};

type ExportPost = {
  id: string;
  number: number;
  title: string;
  slug: string;
  content: string;
  status: PostStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  categoryIds: string[];
};

type Backup = {
  format: number;
  categories: ExportCategory[];
  posts: ExportPost[];
  siteSettings: { id: string; profileImageData: string | null; updatedAt: string } | null;
};

const db = new PrismaClient();

function parseDate(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

async function main() {
  const backupPath = process.argv[2];
  if (!backupPath) throw new Error("Uso: npx tsx scripts/import-mongodb.ts <caminho-do-backup.json>");
  const backup = JSON.parse(await readFile(backupPath, "utf8")) as Backup;
  if (backup.format !== 1 || !Array.isArray(backup.categories) || !Array.isArray(backup.posts)) {
    throw new Error("Formato do backup não reconhecido.");
  }

  for (const category of backup.categories) {
    const postIDs = backup.posts.filter((post) => post.categoryIds.includes(category.id)).map((post) => post.id);
    await db.category.upsert({
      where: { id: category.id },
      update: {
        name: category.name,
        slug: category.slug,
        description: category.description,
        color: category.color,
        position: category.position,
        createdAt: new Date(category.createdAt),
        updatedAt: new Date(category.updatedAt),
        postIDs,
      },
      create: {
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
        color: category.color,
        position: category.position,
        createdAt: new Date(category.createdAt),
        updatedAt: new Date(category.updatedAt),
        postIDs,
      },
    });
  }

  for (const post of backup.posts) {
    await db.post.upsert({
      where: { id: post.id },
      update: {
        number: post.number,
        title: post.title,
        slug: post.slug,
        content: post.content,
        status: post.status,
        publishedAt: parseDate(post.publishedAt),
        createdAt: new Date(post.createdAt),
        updatedAt: new Date(post.updatedAt),
        categoryIDs: post.categoryIds,
      },
      create: {
        id: post.id,
        number: post.number,
        title: post.title,
        slug: post.slug,
        content: post.content,
        status: post.status,
        publishedAt: parseDate(post.publishedAt),
        createdAt: new Date(post.createdAt),
        updatedAt: new Date(post.updatedAt),
        categoryIDs: post.categoryIds,
      },
    });
  }

  if (backup.siteSettings) {
    await db.siteSettings.upsert({
      where: { id: backup.siteSettings.id },
      update: {
        profileImageData: backup.siteSettings.profileImageData,
        updatedAt: new Date(backup.siteSettings.updatedAt),
      },
      create: {
        id: backup.siteSettings.id,
        profileImageData: backup.siteSettings.profileImageData,
        updatedAt: new Date(backup.siteSettings.updatedAt),
      },
    });
  }

  const maxNumber = backup.posts.reduce((max, post) => Math.max(max, post.number), 0);
  await db.postCounter.upsert({
    where: { id: "posts" },
    update: { value: maxNumber },
    create: { id: "posts", value: maxNumber },
  });

  const [categoryCount, postCount] = await Promise.all([db.category.count(), db.post.count()]);
  if (categoryCount !== backup.categories.length || postCount !== backup.posts.length) {
    throw new Error(`Contagens divergentes após importação: ${categoryCount}/${backup.categories.length} categorias, ${postCount}/${backup.posts.length} posts.`);
  }
  console.log(`Importação verificada: ${categoryCount} categorias e ${postCount} posts no MongoDB.`);
}

main()
  .catch((error) => {
    console.error("Importação MongoDB falhou:", error instanceof Error ? error.message : "Erro desconhecido");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());