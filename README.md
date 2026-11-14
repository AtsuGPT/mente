# Minha Mente

Plataforma de ambientes de pensamentos: um app (Expo, em `mobile/`) para celular e web, com backend em Next.js e SQLite.

## Estrutura

- `mobile/`: o app (Expo Router). Roda no celular (Expo Go) e na web; a versão web é exportada para `public/` e servida pelo próprio Next na raiz do site (`/`).
- `src/app/api/`: as APIs do app (`/api/mobile/…`), a leitura assistida (`/api/thoughts/[slug]/insight`) e o serviço Whisper (`api/whisper/server.py`).
- `src/app/convite/[code]`: página do link de convite. `/uploads/posts/…` entrega as imagens dos pensamentos.
- `src/server/` e `src/lib/`: regras de negócio, autenticação, permissões, Kally e acesso ao banco (Prisma).

O endereço antigo do app web, `/app` (e subrotas como `/app/feed`), redireciona para `/` mantendo a query string. Os endereços da primeira versão do site (`/pensamento/<slug>`, `/pensamentos`, `/conversar`, `/entrar`, `/admin`) também redirecionam para as telas equivalentes do app.

## O app

- **Abas:** Feed, Kally e Ambiente, nesta ordem. Ao entrar num ambiente, o app abre na Kally. Só a aba escolhida fica em destaque; as outras ficam apagadas e um pouco menores, como se estivessem atrás dela.
- **Painel da esquerda** (`mobile/src/components/left-dashboard.tsx`): busca de pensamentos (título e texto, com filtro de pasta), as pastas com a contagem e os atalhos para o mapa de conexões e para todas as pastas. No celular e no tablet ele desliza da borda (botão no cabeçalho de cada aba); no computador fica fixo na barra lateral, abaixo das abas.
- **Feed:** os pensamentos chegam em páginas de 15 (`FEED_PAGE_SIZE`, em `src/server/posts.ts`), carregadas ao rolar. A busca e as pastas usam o mesmo tamanho.
- **Kally:** a órbita mostra o que ela está fazendo (ouvindo, processando, consultando memórias, pesquisando, lendo um documento, escrevendo um post, respondendo), com uma frase curta logo abaixo. A última conversa salva reabre sozinha quando a Kally abre de novo, mesmo no outro dia, e continua de onde parou. Detalhes em `docs/kally/memoria-e-painel.md`.
- **Permissões por papel:** publicar, editar os próprios, gerenciar todo o conteúdo, gerenciar participantes e ver pensamentos privados (quem não vê os privados continua vendo os que escreveu). O proprietário ajusta por pessoa em *Ambiente → Participantes*.

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

Para a interface em `/`, exporte o app web (gera `public/index.html`, `public/_expo/` etc., fora do Git):

```bash
cd mobile && npm install && npm run export:web
```

O app web usa a origem da própria página como endereço da API, então funciona em `minhamente.space`, no IP da rede ou em `localhost` sem CORS. Com `next start`, reinicie o servidor depois de exportar: em produção o Next só serve os arquivos de `public/` que existiam ao iniciar.

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

Essas credenciais valem para o login do app (celular e web). A conta do administrador é achada pelo papel do `.env` e não pelo nome de usuário: mudar o @ ou o nome de exibição no banco não cria outra conta. Se duas contas do mesmo dono já existirem, `scripts/unificar-contas.py` junta tudo na que fica (simula primeiro; com `--aplicar`, faz backup e roda numa transação só).

## Schema

`npm run db:push` sincroniza o schema SQLite. `npm run db:deploy` é um alias para o mesmo comando.

## Importação de dados

O backup JSON da base anterior foi guardado em `Downloads`. Para importar categorias, posts, relações e configurações para SQLite:

```bash
npx tsx scripts/import-mongodb.ts "C:\caminho\para\backup.json"
```

O importador preserva IDs, numeração, status, datas, categorias, relações e foto de perfil. As bases de origem não são apagadas.

## Leitura assistida com Ollama
O detalhe dos pensamentos oferece ações de resumo, esclarecimento e aprofundamento. A resposta é gerada em streaming, aparece separada e nunca modifica o texto original.

A aba **Kally** do app consulta os pensamentos, as memórias e as bases de documentos do ambiente. Ela responde por modelos via API (a Kally 32 e a Kally 1.5, com teto de gasto por dia) e usa o Ollama do PC como último recurso; a arquitetura está em `docs/kally/arquitetura-hibrida.md`.

Instale o Ollama e baixe um modelo com suporte a chat, por exemplo `ollama pull llama3.2`. Inicie o serviço e configure `OLLAMA_BASE_URL` e `OLLAMA_MODEL` no `.env`; os padrões são `http://127.0.0.1:11434` e `llama3.2:latest`. A chamada acontece no backend, então o Ollama precisa estar acessível a partir do servidor Next.js.

Se o Ollama não estiver acessível, o app continua funcionando e a leitura assistida informa que não conseguiu conectar.

No editor de pensamentos do app, **Gravar áudio** envia a gravação ao Whisper local; o Ollama corrige a pontuação e organiza os parágrafos sem resumir nem acrescentar ideias. A revisão é inserida na posição do cursor (ou no fim do texto), preservando o conteúdo existente. O navegador precisa permitir acesso ao microfone.

Com as dependências Python do ambiente instaladas, inicie o Whisper na raiz do projeto com `.venv/Scripts/python.exe -m uvicorn src.app.api.whisper.server:app --host 127.0.0.1 --port 8001` no Windows. O modelo `medium` carrega ao iniciar; FFmpeg precisa estar instalado. A URL pode ser alterada por `WHISPER_URL`. Não exponha a porta 8001 publicamente; somente a aplicação Next deve estar acessível pela rede.

## Hospedagem

GitHub Pages não executa este app full-stack. SQLite é adequado para uma única instância persistente; plataformas serverless como Vercel não são adequadas para um arquivo SQLite local. Para hospedar no próprio PC, persista o arquivo `.db` e exponha somente o Next.js por HTTPS, nunca o banco.
