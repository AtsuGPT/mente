# Minha Mente

Blog pessoal em Next.js com painel administrativo e MongoDB.

## Stack

- Next.js 16
- React 19
- Prisma ORM 6.19 (conector MongoDB)
- MongoDB em replica set de um nó
- Tailwind CSS

## Banco local

O Prisma usa transações para manter posts e categorias consistentes. Por isso, o MongoDB local precisa estar configurado como replica set, mesmo com apenas um nó.

O ambiente de desenvolvimento desta máquina usa `127.0.0.1:27018` e o replica set `minhaMenteRS`. O serviço MongoDB padrão pode continuar na porta `27017`; não exponha nenhuma porta do MongoDB à internet.

O arquivo `.env.example` mostra a connection string local. Nunca versione `.env` nem compartilhe `DATABASE_URL`.

## Desenvolvimento

```bash
npm install
npm run db:push
npm run dev
```

Build e servidor de produção:

```bash
npm run build
npm run start
```

## Variáveis de ambiente

```env
DATABASE_URL="mongodb://127.0.0.1:27018/minhamente?replicaSet=minhaMenteRS&directConnection=true"
SITE_URL="http://localhost:3000"
ADMIN_EMAIL="admin@exemplo.com"
ADMIN_PASSWORD_HASH="scrypt:16384:8:1:..."
SESSION_SECRET="valor-secreto-com-32+caracteres"
```

Gere o hash administrativo com `npm run admin:hash` e o segredo de sessão com `openssl rand -base64 48`.

## Schema

MongoDB não usa Prisma Migrate. `npm run db:push` sincroniza schema e índices. O comando legado `npm run db:deploy` também executa `prisma db push`.

As pastas antigas em `prisma/migrations/` registram o schema da instalação PostgreSQL anterior e não são usadas pelo MongoDB.

## Importação de dados

O export do PostgreSQL foi guardado em um arquivo JSON privado na pasta `Downloads`. Para repetir a importação em uma instância MongoDB configurada:

```bash
npx tsx scripts/import-mongodb.ts "C:\caminho\para\backup.json"
```

O importador preserva IDs, numeração, status, datas, categorias, relações e foto de perfil. O banco PostgreSQL original não é apagado.

## Hospedagem

GitHub Pages não executa este app full-stack. Para Vercel, use MongoDB Atlas e configure a connection string Atlas em `DATABASE_URL`. Para hospedar o site no próprio PC, mantenha o MongoDB acessível apenas por loopback e exponha somente o Next.js por um túnel HTTPS. Uma instância Mongo instalada apenas no PC não é acessível pela Vercel.
