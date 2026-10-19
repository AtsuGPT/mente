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
SITE_USERNAME="leitor"
SITE_PASSWORD_HASH="scrypt:16384:8:1:..."
SESSION_SECRET="valor-secreto-com-32+caracteres"
```

`SITE_USERNAME` e `SITE_PASSWORD_HASH` são opcionais. Gere um hash com `npm run admin:hash` e use a parte `scrypt:...` como `SITE_PASSWORD_HASH`; o hash administrativo continua separado. Sem essas variáveis, o acesso por usuário/senha aceita apenas o administrador, e qualquer pessoa também pode entrar como convidado. Gere o segredo de sessão com `openssl rand -base64 48`.

A primeira visita ao site abre a tela de acesso. Convidados veem posts públicos; o usuário configurado e o administrador também podem ver posts marcados como privados.

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

No editor de pensamentos do admin, **Gravar áudio** envia a gravação ao Whisper local; o Ollama corrige a pontuação e organiza os parágrafos sem resumir nem acrescentar ideias. A revisão é inserida na posição do cursor (ou no fim do texto), preservando o conteúdo existente. O navegador precisa permitir acesso ao microfone.

Com as dependências Python do ambiente instaladas, inicie o Whisper na raiz do projeto com `.venv/Scripts/python.exe -m uvicorn src.app.api.whisper.server:app --host 127.0.0.1 --port 8001` no Windows. O modelo `medium` carrega ao iniciar; FFmpeg precisa estar instalado. A URL pode ser alterada por `WHISPER_URL`. Não exponha a porta 8001 publicamente; somente a aplicação Next deve estar acessível pela rede.

## Hospedagem

GitHub Pages não executa este app full-stack. SQLite é adequado para uma única instância persistente; plataformas serverless como Vercel não são adequadas para um arquivo SQLite local. Para hospedar no próprio PC, persista o arquivo `.db` e exponha somente o Next.js por HTTPS, nunca o banco.
