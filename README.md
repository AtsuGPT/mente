# Minha Mente

Blog pessoal em Next.js com painel administrativo e SQLite.

## Stack

- Next.js 16
- React 19
- Prisma ORM 6.19
- SQLite
- Tailwind CSS

## Banco local

O banco é um arquivo local. O `.env.example` usa `file:./mente.db`; nesta máquina `DATABASE_URL` aponta para `C:/Users/satan/mente.db`. Nunca versione `.env`.

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
DATABASE_URL="file:./mente.db"
SITE_URL="http://localhost:3000"
ADMIN_EMAIL="admin@exemplo.com"
ADMIN_PASSWORD_HASH="scrypt:16384:8:1:..."
SESSION_SECRET="valor-secreto-com-32+caracteres"
```

Gere o hash administrativo com `npm run admin:hash` e o segredo de sessão com `openssl rand -base64 48`.

## Schema

`npm run db:push` sincroniza o schema SQLite. `npm run db:deploy` é um alias para o mesmo comando.

## Importação de dados

O backup JSON da base anterior foi guardado em `Downloads`. Para importar categorias, posts, relações e configurações para SQLite:

```bash
npx tsx scripts/import-mongodb.ts "C:\caminho\para\backup.json"
```

O importador preserva IDs, numeração, status, datas, categorias, relações e foto de perfil. As bases de origem não são apagadas.

## Leitura assistida com Gemini
O detalhe dos pensamentos oferece ações de resumo, esclarecimento e aprofundamento. A resposta é gerada em streaming, aparece separada, é guardada apenas no navegador de cada pessoa e nunca modifica o texto original.

Crie uma chave no [Google AI Studio](https://aistudio.google.com/apikey) e configure `GEMINI_API_KEY` no `.env` local e no ambiente do servidor. O modelo padrão é `gemini-3.5-flash-lite`, ajustável via `GEMINI_MODEL`. A chave permanece somente no backend; não use prefixo `NEXT_PUBLIC_`. Para privacidade, chamadas usam `store: false`.

Sem `GEMINI_API_KEY`, o site continua funcionando e o painel informa que a leitura assistida não está configurada.

## Hospedagem

GitHub Pages não executa este app full-stack. SQLite é adequado para uma única instância persistente; plataformas serverless como Vercel não são adequadas para um arquivo SQLite local. Para hospedar no próprio PC, persista o arquivo `.db` e exponha somente o Next.js por HTTPS, nunca o banco.
