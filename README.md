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

## Leitura assistida com Ollama
O detalhe dos pensamentos oferece ações de resumo, esclarecimento e aprofundamento. A resposta é gerada em streaming, aparece separada, é guardada apenas no navegador de cada pessoa e nunca modifica o texto original.

A aba **Perguntar** permite conversar com o mesmo modelo. O servidor procura primeiro em pensamentos publicados, mostra os textos relacionados e usa apenas esse conteúdo para falar sobre o que Kayk escreveu. Se não encontrar relação, informa isso antes de oferecer uma resposta geral, sem atribuí-la a Kayk.

Instale o Ollama e baixe um modelo com suporte a chat, por exemplo `ollama pull llama3.2`. Inicie o serviço e configure `OLLAMA_BASE_URL` e `OLLAMA_MODEL` no `.env`; os padrões são `http://127.0.0.1:11434` e `llama3.2:latest`. A chamada acontece no backend, então o Ollama precisa estar acessível a partir do servidor Next.js.

Se o Ollama não estiver acessível, o site continua funcionando e a leitura assistida informa que não conseguiu conectar.

## Hospedagem

GitHub Pages não executa este app full-stack. SQLite é adequado para uma única instância persistente; plataformas serverless como Vercel não são adequadas para um arquivo SQLite local. Para hospedar no próprio PC, persista o arquivo `.db` e exponha somente o Next.js por HTTPS, nunca o banco.
