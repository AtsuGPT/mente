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

Para ativar o assistente de leitura Gemini, crie uma chave no [Google AI Studio](https://aistudio.google.com/apikey) e defina `GEMINI_API_KEY` no `.env` local (e no ambiente do servidor, se publicado). A chave é usada apenas no backend. Opcionalmente, ajuste o modelo com `GEMINI_MODEL`; o padrão é `gemini-2.5-flash`. Sem a chave, o site segue funcionando, mas a API de leitura responde que o recurso ainda não foi configurado.

## Schema

MongoDB não usa Prisma Migrate. `npm run db:push` sincroniza schema e índices. O comando legado `npm run db:deploy` também executa `prisma db push`.

As pastas antigas em `prisma/migrations/` registram o schema da instalação PostgreSQL anterior e não são usadas pelo MongoDB.

## Importação de dados

O export do PostgreSQL foi guardado em um arquivo JSON privado na pasta `Downloads`. Para repetir a importação em uma instância MongoDB configurada:

```bash
npx tsx scripts/import-mongodb.ts "C:\caminho\para\backup.json"
```

O importador preserva IDs, numeração, status, datas, categorias, relações e foto de perfil. O banco PostgreSQL original não é apagado.

## Leitura assistida com Gemini
O detalhe dos pensamentos oferece ações de resumo, esclarecimento e aprofundamento. A resposta é gerada sob demanda, aparece separada e nunca modifica nem é salva junto ao texto original.
Crie uma chave no [Google AI Studio](https://aistudio.google.com/apikey) e configure `GEMINI_API_KEY` no `.env` local e no ambiente do servidor. O modelo pode ser ajustado com `GEMINI_MODEL` (padrão: `gemini-3.8-flash`). A chave permanece somente no servidor; não use prefixo `NEXT_PUBLIC_`.

O detalhe dos pensamentos oferece ações de resumo, esclarecimento e aprofundamento. A resposta é gerada sob demanda, aparece separada e nunca modifica nem é salva junto ao texto original.

Crie uma chave no [Google AI Studio](https://aistudio.google.com/apikey) e configure `GEMINI_API_KEY` no `.env` local e no ambiente do servidor. O modelo pode ser ajustado com `GEMINI_MODEL` (padrão: `gemini-2.5-flash`). A chave permanece somente no servidor; não use prefixo `NEXT_PUBLIC_`.

Sem `GEMINI_API_KEY`, o site continua funcionando e o painel informa que a leitura assistida não está configurada.

## Hospedagem

GitHub Pages não executa este app full-stack. Para Vercel, use MongoDB Atlas e configure a connection string Atlas em `DATABASE_URL`. Para hospedar o site no próprio PC, mantenha o MongoDB acessível apenas por loopback e exponha somente o Next.js por um túnel HTTPS. Uma instância Mongo instalada apenas no PC não é acessível pela Vercel.
