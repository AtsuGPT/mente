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

## Kally: criação de posts, anexos e pesquisa

A aba **Perguntar** (`/conversar`) é a Kally. A conversa sobre o arquivo continua como antes; as funções abaixo foram acrescentadas sobre o mesmo chat e o mesmo Ollama.

### Criação de posts (somente administrador)

- `/post <ideia>` inicia a criação. Pedidos claros ("transforme essa ideia em uma publicação", "produza um post relacionando esses arquivos") também iniciam; pedidos ambíguos ("pensei em escrever sobre isso") recebem uma pergunta antes. Conversar sobre um assunto não vira post.
- O nível de autonomia fica no topo do chat e pode ser trocado no meio da criação sem perder o trabalho:
  - **Automático**: planeja (objetivo, estrutura, profundidade, título e categoria) e escreve o post inteiro; só pergunta se faltar algo sem o qual é impossível escrever.
  - **Consultivo**: pergunta de forma progressiva só o que falta (intenção, abordagem, profundidade, público, ideias obrigatórias), mostra um plano editável e só escreve após a aprovação.
  - **Educativo**: conduz por etapas (ideia central, introdução, desenvolvimento, aprofundamento, conclusão), explica e pergunta, comenta a versão do usuário e não entrega texto pronto. As partes escritas pelo usuário são unidas no rascunho.
- A extensão acompanha a complexidade: temas amplos ou profundidade aprofundada/extensiva são escritos parte por parte; se o modelo atingir o limite de geração, a Kally continua do ponto em que parou.
- O rascunho pode ser editado no próprio chat, revisado por pedido (uma seção específica ou o texto inteiro), desfeito e reescrito com outra profundidade. **Publicar** e **Salvar como rascunho** pedem confirmação e usam o mesmo `createPost` do painel.
- O rascunho em andamento fica salvo apenas no navegador (localStorage).

### Anexos (administrador e usuário com senha)

Vários arquivos por mensagem, com estado individual e remoção antes do envio. O conteúdo é extraído no servidor, dividido em trechos e apenas os trechos relevantes vão ao modelo, com referência `[A1]`, `[A2]`… e página quando houver. Os anexos ficam só na memória do servidor por 3 horas, isolados por perfil, e nunca vão para o banco.

| Formato | Como é lido |
| --- | --- |
| PDF | texto extraído por página (`unpdf`); PDFs digitalizados sem texto são informados como não legíveis (sem OCR) |
| DOCX | texto extraído (`mammoth`) |
| TXT, Markdown | lidos integralmente (UTF-8 ou Windows-1252) |
| CSV/TSV | colunas e linhas organizadas para consulta |
| PNG, JPG, WEBP | interpretados somente se houver modelo com visão (`OLLAMA_VISION_MODEL`); sem ele ficam como "recebido, não interpretado" |
| Áudio (mp3, m4a, wav, ogg, webm, mp4) | transcrito pelo mesmo Whisper local do editor; somente administrador |

Limites: 15 MB por documento, 8 MB por imagem, 25 MB por áudio, 10 arquivos por mensagem.

### Pesquisa na internet

O botão **Internet** (ou `/pesquisar`, ou um pedido explícito como "pesquise…") faz a Kally formular consultas, buscar na web geral, ler as páginas principais e responder com as fontes `[W1]`, `[W2]`… e links. Ordem dos buscadores: SearXNG (`SEARXNG_URL`), Brave Search (`BRAVE_SEARCH_API_KEY`) e, sem configuração, DuckDuckGo HTML (sem chave, pode ser limitado). Também consulta OpenAlex (artigos científicos), Open Library (livros, só metadados) e a Wikipédia apenas como complemento. Páginas em endereços locais ou privados nunca são lidas. Os resultados servem só à resposta atual e não são gravados.

## Hospedagem

GitHub Pages não executa este app full-stack. SQLite é adequado para uma única instância persistente; plataformas serverless como Vercel não são adequadas para um arquivo SQLite local. Para hospedar no próprio PC, persista o arquivo `.db` e exponha somente o Next.js por HTTPS, nunca o banco.
