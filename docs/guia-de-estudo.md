# Guia de estudo do Minha Mente

Este guia percorre o projeto na ordem em que uma pessoa pode entendê-lo: primeiro a aplicação inicia, depois uma página é montada, os dados chegam do SQLite e, por fim, os fluxos de administração e de leitura assistida conectam interface, servidor e serviços externos. A proposta é ajudar você a abrir os arquivos e confirmar cada etapa no próprio código.

## 1. O que o projeto faz

O Minha Mente é um arquivo pessoal de pensamentos. Uma pessoa administradora cria textos em Markdown, organiza-os em categorias e decide quando publicá-los. Visitantes podem navegar pelo feed, buscar e abrir os pensamentos publicados. Opcionalmente, podem pedir uma leitura assistida ou conversar sobre o arquivo usando um modelo servido pelo Ollama.

É uma aplicação full-stack em uma única base de código:

- **Next.js App Router** define páginas, layouts, Server Actions e rotas de API.
- **React** monta a interface. As páginas de conteúdo buscam dados no servidor; alguns componentes interativos rodam no navegador.
- **Prisma** consulta e altera um banco **SQLite** local.
- **Zod** valida dados recebidos dos formulários.
- **Ollama** é uma integração opcional, chamada pelo servidor para gerar respostas em streaming.

## 2. Prepare e inicie o projeto

Na raiz do repositório:

1. Instale as dependências com `npm install`.
2. Copie `.env.example` para `.env` e configure as variáveis. O arquivo `.env` contém configurações privadas e não deve ser versionado.
3. Defina `DATABASE_URL` para um arquivo SQLite, por exemplo `file:./mente.db`.
4. Configure `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` e `SESSION_SECRET`. Para gerar o hash, execute `npm run admin:hash`; para gerar um segredo, use `openssl rand -base64 48`.
5. Crie ou sincronize as tabelas com `npm run db:push`.
6. Inicie o servidor de desenvolvimento com `npm run dev` e abra `http://localhost:3000`.

O script `npm run db:seed` cria ou atualiza as categorias iniciais. Ele só adiciona textos de exemplo quando `SEED_SAMPLES=1`. Para abrir uma interface de inspeção do banco, use `npm run db:studio`.

Para validar o código, existem `npm run lint` e `npm run typecheck`. O `package.json` não define um script de testes automatizados. O build de produção é `npm run build`, que gera o cliente Prisma e constrói o Next.js; `npm run start` inicia esse build.

## 3. Siga a inicialização da aplicação

Leia estes arquivos nessa ordem:

1. `package.json`: veja os comandos que iniciam, verificam e constroem a aplicação.
2. `prisma/schema.prisma`: entenda quais dados existem e como o cliente Prisma é gerado em `src/generated/prisma`.
3. `src/lib/db.ts`: veja como o cliente de banco é criado e reutilizado durante o desenvolvimento.
4. `src/app/layout.tsx`: ponto de entrada dos layouts; configura idioma, fontes, metadados globais e estilos.
5. `src/app/(site)/layout.tsx` e `src/components/site-shell.tsx`: a área pública recebe uma estrutura compartilhada com navegação e rodapé.
6. `src/proxy.ts` e `src/lib/auth/session.ts`: acompanhe as duas camadas que protegem a área administrativa.

O diretório `src/app` usa convenções do App Router. Os parênteses em `(site)` e `(panel)` agrupam rotas e layouts sem fazer parte do endereço. Por exemplo, `src/app/(site)/pensamentos/page.tsx` atende `/pensamentos`.

## 4. Entenda os dados antes das páginas

O schema em `prisma/schema.prisma` define quatro modelos:

- **`Post`** representa um pensamento. Tem título, `slug` único, conteúdo Markdown, estado `DRAFT` ou `PUBLISHED`, datas e uma relação com categorias. A data de publicação pode estar no futuro; nesse caso, o texto ainda não é público.
- **`Category`** guarda nome, endereço, descrição, cor e posição de exibição. A relação com pensamentos é muitos-para-muitos: um pensamento pode pertencer a várias categorias e uma categoria pode agrupar vários pensamentos.
- **`SiteSettings`** guarda configurações do site, hoje incluindo a imagem de perfil.
- **`PostCounter`** mantém a numeração sequencial dos pensamentos.

`npm run db:push` sincroniza esse schema com o SQLite indicado por `DATABASE_URL`. O arquivo do banco é dado local, não código-fonte. O `prisma/seed.ts` prepara categorias iniciais e, opcionalmente, pensamentos de exemplo.

Uma regra importante aparece em `src/server/categories.ts`: um pensamento é visível ao público somente quando está publicado **e** sua data de publicação já chegou. As consultas públicas em `src/server/posts.ts` reutilizam esse filtro.

## 5. Percorra uma requisição pública

Use a página inicial para seguir uma leitura de ponta a ponta:

1. `src/app/(site)/page.tsx` é a página do feed. Ela pede categorias, contagens e pensamentos recentes ao servidor.
2. `src/server/categories.ts` e `src/server/posts.ts` montam as consultas Prisma e aplicam a regra de visibilidade pública.
3. `src/lib/db.ts` fornece a conexão compartilhada com o SQLite.
4. A página transforma os dados em componentes visuais, como `src/components/post-list-item.tsx`.
5. O layout de `(site)` envolve a página em `SiteShell`; componentes de navegação e apresentação ficam em `src/components/`.

As outras telas públicas reaproveitam essa separação:

| Endereço | Página | O que observar |
| --- | --- | --- |
| `/` | `src/app/(site)/page.tsx` | Feed recente agrupado por categoria |
| `/pensamentos` | `src/app/(site)/pensamentos/page.tsx` | Arquivo paginado |
| `/pensamento/[slug]` | `src/app/(site)/pensamento/[slug]/page.tsx` | Texto, metadados, relacionados e leitura assistida |
| `/categoria/[slug]` | `src/app/(site)/categoria/[slug]/page.tsx` | Pensamentos de uma categoria |
| `/buscar` | `src/app/(site)/buscar/page.tsx` | Busca por texto, categoria e intervalo de datas |
| `/arquivo` | `src/app/(site)/arquivo/page.tsx` | Navegação pelo arquivo |
| `/sobre` | `src/app/(site)/sobre/page.tsx` | Conteúdo estático |
| `/conversar` | `src/app/(site)/conversar/page.tsx` | Interface do chat |

`src/server/posts.ts` concentra consultas comuns: paginação, filtros, busca, pensamentos relacionados e entradas do sitemap. `src/lib/text.ts` prepara trechos e estimativas de leitura; `src/lib/format.ts` formata datas e números.

## 6. Acompanhe o ciclo de vida de um pensamento

Para aprender como uma alteração chega ao banco, siga o fluxo de criação no painel:

1. A página `src/app/admin/(panel)/pensamentos/novo/page.tsx` exige uma sessão administrativa e carrega as categorias.
2. `src/components/admin/post-editor.tsx` apresenta o formulário e envia os dados à Server Action.
3. `src/app/admin/actions.ts` chama `requireAdmin()` novamente, lê os campos e usa `parsePostForm()` em `src/server/validation.ts`.
4. O schema Zod valida campos, slug, categorias, data e intenção (`save`, `publish` ou `unpublish`). Se o slug não foi preenchido, o utilitário `src/lib/slug.ts` o deriva do título.
5. `src/server/posts.ts` executa a criação ou atualização. A numeração é alocada dentro de uma transação; categorias são associadas pelo Prisma.
6. Depois de salvar, a Server Action invalida as páginas públicas. Erros de validação voltam para o formulário; ao criar, o painel redireciona para a edição do registro.
7. A prévia fica em `/admin/previa/[id]` e usa o layout de leitura, mas continua protegida e mostra a versão salva, não alterações ainda não salvas.

Publicar define o estado como `PUBLISHED`; uma data futura mantém o texto fora das consultas públicas até essa data. Despublicar retorna o estado a `DRAFT`. Categorias seguem o mesmo padrão geral: interface em `src/components/admin/category-forms.tsx`, ações em `src/app/admin/actions.ts`, validação em `src/server/validation.ts` e persistência em `src/server/categories.ts`.

## 7. Entenda a autenticação administrativa

Há um único administrador, configurado por variáveis de ambiente, em vez de uma tabela de usuários:

1. `src/app/admin/login/actions.ts` valida os dados e limita tentativas de login por endereço IP.
2. `src/lib/auth/password.ts` verifica a senha usando scrypt e comparação em tempo constante. O hash é produzido por `scripts/hash-password.mjs`.
3. Após o login, `src/lib/auth/session.ts` cria um token assinado por `src/lib/auth/token.ts` e o envia em um cookie `httpOnly` com validade de sete dias.
4. `src/proxy.ts` faz uma primeira checagem para os caminhos `/admin`.
5. A autorização definitiva continua no servidor: páginas e Server Actions chamam `requireAdmin()`, que valida o token e confirma que o e-mail ainda corresponde ao administrador configurado.

O limitador de login é mantido em memória. Ele é apropriado para uma instância única; várias instâncias não compartilham esse estado.

## 8. Siga as integrações opcionais com Ollama

O site funciona sem Ollama. Para habilitar a geração, inicie o Ollama no servidor e configure `OLLAMA_BASE_URL` e `OLLAMA_MODEL` conforme `.env.example`. As requisições saem do backend Next.js, não diretamente do navegador.

### Leitura de um pensamento

1. `src/components/thought-assistant.tsx` oferece resumir, esclarecer e aprofundar.
2. O componente envia `POST /api/thoughts/[slug]/insight` com o modo escolhido.
3. `src/app/api/thoughts/[slug]/insight/route.ts` valida o pedido, aplica limites de uso, carrega apenas um pensamento publicado e monta instruções para o Ollama.
4. O servidor encaminha a resposta em streaming. O navegador mostra os trechos à medida que chegam e guarda a leitura no `localStorage` daquele navegador, associada à versão do pensamento. A leitura não altera o conteúdo original.

### Conversa sobre o arquivo

1. `src/components/site-chat.tsx` mantém as mensagens da conversa no estado do navegador e envia o histórico recente a `POST /api/chat`.
2. `src/app/api/chat/route.ts` valida tamanho e formato do histórico e aplica limites de requisições.
3. O servidor extrai termos da pergunta, consulta pensamentos publicados por meio de `searchPublishedPostsByTerms()` e ordena candidatos por correspondências no título, categoria e texto.
4. Até cinco pensamentos relacionados são enviados como contexto ao Ollama. Isso é uma busca lexical simples, não uma busca vetorial ou um sistema de embeddings.
5. O endpoint envia fontes e resposta em streaming. Quando não há pensamentos relacionados, informa isso explicitamente antes de permitir uma resposta geral.

As duas rotas usam limites em memória, portanto esses limites também são locais à instância que as atende.

## 9. Use o mapa do repositório

```text
prisma/
  schema.prisma       modelos e relações do SQLite
  seed.ts             categorias e dados de exemplo opcionais
scripts/
  hash-password.mjs   criação de hash da senha administrativa
  import-mongodb.ts   importação de backup JSON para SQLite
src/
  app/                páginas, layouts, Server Actions e rotas de API
  components/         componentes de interface pública e administrativa
  config/site.ts      nome, autoria e metadados editoriais do site
  content/about.ts    conteúdo da página Sobre
  lib/                acesso ao banco, autenticação e funções utilitárias
  server/             consultas, persistência e validação de dados
```

Uma forma útil de investigar qualquer recurso é seguir o caminho **rota → componente → ação/endpoint → validação → função em `src/server` → Prisma/schema**. Para leitura pública, comece na página e siga até `src/server`; para gravações, comece na ação administrativa e acompanhe o retorno até o formulário.

## 10. Exercícios para revisar o código

Ao estudar um fluxo, tente responder antes de avançar:

- Qual arquivo define o endereço e a página?
- Quais dados são carregados no servidor, e quais são mantidos no navegador?
- Onde a entrada é validada? O que acontece quando ela é inválida?
- Qual filtro impede que um rascunho ou uma publicação futura apareça ao público?
- Quais arquivos precisam mudar para adicionar um campo a um pensamento?
- Como o usuário percebe um erro do banco ou do Ollama?

Como exercícios progressivos, acompanhe a geração de um slug, altere temporariamente uma categoria de seed em uma base local, siga um filtro da busca até a consulta Prisma e compare os dados da prévia com os de uma página publicada.

## 11. Limites importantes para execução e hospedagem

O banco é um arquivo SQLite e as limitações de requisição são mantidas na memória do processo. Portanto, o desenho atual pressupõe uma única instância persistente. O arquivo do banco precisa sobreviver a reinicializações e receber backups. Plataformas serverless com disco efêmero ou várias instâncias não são adequadas sem trocar a persistência e o armazenamento dos limites. GitHub Pages não executa este backend full-stack.

Nunca exponha o arquivo SQLite pela web, nem versione `.env`. A integração de IA também não deve ser necessária para iniciar o site: se Ollama estiver indisponível, os demais recursos continuam disponíveis.
