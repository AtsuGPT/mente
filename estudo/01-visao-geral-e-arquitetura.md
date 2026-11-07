# 01 · Visão geral e arquitetura (com o código)

> Companheiro do PDF **"01 · Visão geral e arquitetura"**. O PDF diz *o quê*; este arquivo mostra
> *onde está no código*, *como o dado anda* e *o que acontece quando dá errado*.
>
> Legenda: 🟣 **essencial** (saber sem consultar) · 🔵 **importante** (saber onde está) · ⚪ **aprofundamento**

---

## 0. A frase que resume tudo 🟣

> **Um backend único (Next.js) guarda os dados e aplica as regras; o site e o app são duas
> "janelas" para esse backend; a IA roda localmente, feita para caber numa placa de 4 GB.**

Se na banca você esquecer tudo, volte a essa frase e vá abrindo cada pedaço dela:

| Pedaço da frase | Onde está no projeto |
|---|---|
| "backend único (Next.js)" | `src/app/` (páginas e rotas de API) + `src/server/` (regras) |
| "guarda os dados" | `prisma/schema.prisma` → arquivo SQLite `mente.db` via `src/lib/db.ts` |
| "aplica as regras" | `src/server/environments.ts` → `resolveAccess()` |
| "o site" | `src/app/(site)/...`, `src/app/admin/...` |
| "o app" | `mobile/` (Expo) → fala com `src/app/api/mobile/...` |
| "IA local" | `src/server/ai.ts`, `src/server/ai/model-manager.ts`, `src/server/kally/*` |
| "caber em 4 GB" | gerenciador de modelos: **um modelo de texto carregado por vez** |

---

## 1. As peças e como elas conversam 🟣

```
   ┌──────────────┐                                   ┌───────────────── O MESMO PC (Windows, RTX 2050 4 GB, 16 GB RAM) ───────────────┐
   │  Navegador   │──┐                                │                                                                                 │
   │ site + /app  │  │   HTTPS      ┌────────────┐    │   ┌──────────────────────────┐      Prisma       ┌────────────┐             │
   └──────────────┘  ├────────────▶ │ Cloudflare │───────▶│        Next.js 16         │ ────────────────▶ │  SQLite    │             │
   ┌──────────────┐  │              │   Tunnel   │    │   │  páginas do site          │                   │  mente.db  │             │
   │   Celular    │──┘              └────────────┘    │   │  /api/mobile/... (app)    │                   └────────────┘             │
   │  app Expo    │                localhost:3000     │   │  /api/chat (Kally site)   │   HTTP :11434     ┌────────────┐             │
   └──────┬───────┘                                   │   │  regras + permissões      │ ────────────────▶ │  Ollama    │ LLMs +      │
          │  (só durante o desenvolvimento:           │   │  gerenciador de modelos   │                   │            │ embeddings  │
          │   o CÓDIGO do app chega pelo              │   └──────────────────────────┘   HTTP :8001      ┌────────────┐             │
          └── Expo + ngrok, não os dados)             │                              └──────────────────▶ │  Whisper   │ áudio→texto │
                                                      │                                                  └────────────┘             │
                                                      └─────────────────────────────────────────────────────────────────────────────────┘
```

**Detalhe que derruba muita gente:** existem **dois túneis diferentes**.

| Túnel | O que transporta | Para quê |
|---|---|---|
| **Cloudflare Tunnel** | os **pedidos de dados** (`/api/...`, páginas) | publicar `localhost:3000` como `minhamente.space` sem abrir portas no roteador |
| **Expo + ngrok** | só o **código JavaScript do app** | o Expo Go no celular baixar o app durante o desenvolvimento |

Foi exatamente a confusão entre os dois que causou um bug real (ver arquivo 03, seção "endereço do servidor").

### Cada peça, com o arquivo onde ela "encosta" no código 🔵

| Peça | Papel | Onde aparece no código |
|---|---|---|
| Next.js 16 | backend único | `src/app/**/route.ts` (APIs), `src/app/**/page.tsx` (páginas), `src/proxy.ts` (primeira barreira) |
| Prisma 6 | ORM tipado | `prisma/schema.prisma`; cliente em `src/lib/db.ts` |
| SQLite | banco em um arquivo | `DATABASE_URL="file:./mente.db"` (`.env`) — `src/lib/db.ts:7` recusa qualquer coisa que não comece com `file:` |
| Expo / React Native | app | pasta `mobile/` |
| Ollama | roda os LLMs | `src/server/ai.ts` (chama `.../api/chat`), `src/server/ai/model-manager.ts` |
| faster-whisper | fala → texto | `src/app/api/whisper/server.py` (porta 8001, só em loopback) |
| Cloudflare | publica o site | `clientIp()` em `src/app/api/mobile/_lib/http.ts:44` confia em `cf-connecting-ip` |

> **Analogia do PDF:** o Next.js é o **balcão de atendimento**. Site e app são **dois guichês do
> mesmo balcão**. Por isso uma regra escrita uma vez vale para os dois.

---

## 2. O caminho de um dado, passo a passo (com código) 🟣

Cenário do PDF: no app, a pessoa pergunta à Kally **"Me explica juros compostos com um exemplo"**.

Vamos seguir **o texto dessa mensagem** desde o dedo da pessoa até voltar como resposta.

```
 [1] tela perguntar.tsx ─▶ [2] stream.ts ─▶ [3] Cloudflare ─▶ [4] route.ts (POST)
                                                                   │
            ┌──────────────────────────────────────────────────────┘
            ▼
 [5] envAccess → resolveAccess (quem é? participa? qual papel?) ──✖──▶ 401/403/404 (fim)
            │ ok
            ▼
 [6] validações (tamanho, limite de uso) ──✖──▶ 400 / 413 / 429 (fim)
            │ ok
            ▼
 [7] intenção (regras de texto; se texto longo → interpretador)
            ▼
 [8] contexto: posts do ambiente (filtrados pelo escopo) + documentos + exemplos
            ▼
 [9] gerenciador de modelos: o modelo certo está na placa? (descarrega/carrega)
            ▼
 [10] Ollama gera token a token ──▶ servidor reempacota em SSE ──▶ app monta o texto
            ▼
 [11] finally: salva resposta (se conversa salva) + linha em logs/kally-perf.jsonl
```

### [1] A tela monta o pedido — `mobile/src/app/(app)/(tabs)/perguntar.tsx:326`

```ts
const payload = {
  message,                       // "Me explica juros compostos com um exemplo"
  mode,                          // "auto" por padrão
  conversationId,                // null se a conversa é temporária
  save: !conversationId && save, // true só se a pessoa pediu para salvar
  history: temporaryHistory,     // conversa temporária: o APP manda o histórico (últimas 10)
  web, attachment, review, dev,
};
```

Ponto-chave: **numa conversa temporária o servidor não guarda nada**, então é o app que reenvia o
histórico a cada mensagem (`.slice(-10)` na linha 321).

### [2] O pedido sai com o token — `mobile/src/lib/stream.ts:12`

```ts
response = await streamingFetch(`${API_URL}${path}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...authHeaders() },
  body: JSON.stringify(body),
});
```

`authHeaders()` (`mobile/src/lib/api.ts:50`) devolve `{ Authorization: "Bearer <token>" }`.
`API_URL` vem de `mobile/src/lib/config.ts` (regra de prioridade, arquivo 03).

### [3] Cloudflare → Next.js

O Cloudflare entrega o pedido ao `localhost:3000`. O IP real da pessoa vem no cabeçalho
`cf-connecting-ip`, que é o único em que o código confia de verdade (`http.ts:44`).

> ⚪ Repare: `src/proxy.ts` (no Next 16, o antigo `middleware.ts`) **não roda para `/api`**:
> o `matcher` exclui `api` (`proxy.ts:86`). A segurança das APIs fica toda dentro das rotas.

### [4] A rota recebe — `src/app/api/mobile/env/[env]/kally/route.ts:69`

O `[env]` da URL (`/api/mobile/env/mente/kally`) vira o parâmetro `env = "mente"`.

### [5] Autorização: "quem é você e o que pode aqui?" — `route.ts:71`

```ts
const access = await envAccess(context);          // ← porteiro
if (access instanceof Response) return access;    // ← 401/403/404 já pronto: para aqui
if (!access.userId) return error("Entre com sua conta para conversar com a Kally.", 401);
```

`envAccess` (`src/app/api/mobile/_lib/http.ts:78`) faz duas coisas:

```ts
const access = await resolveAccess(env, await currentUserId()); // currentUserId lê o JWT
if (isAccessError(access)) return error(access.error, access.status);
```

E `currentUserId()` → `getMobileUser()` (`src/lib/auth/session.ts:22`) **verifica a assinatura do
JWT e confere se a conta ainda existe no banco**. Detalhes no arquivo 02.

### [6] Validações e limites — `route.ts:76–100`

| Linha | Verificação | Se falhar |
|---|---|---|
| 76 | corpo JSON até 80 000 bytes (`readJson`) | 413 "Pedido grande demais." / 400 "Pedido inválido." |
| 78–79 | mensagem vazia ou > 4 000 caracteres | 400 "Escreva uma mensagem de até 4000 caracteres." |
| 82 | `/post` sem permissão de publicar | 403 |
| 86 | `conversationId` que não é seu / não existe | 404 "Conversa não encontrada." |
| 89 | modo "ideia" pedido sem permissão | 403 |
| 100 | mais de 40 mensagens em 15 min (exceto dono e admin da plataforma) | 429 |

### [7] Intenção — `detectIntent` em `src/server/kally.ts:42`

Regras de texto (expressões regulares). "me explica" + "passo/do zero" cairia em `aprender`;
pedidos claros de estudo viram a **competência `estudo`** no pipeline.

O **interpretador** (um LLM que só classifica, sem responder) só entra se
`needsInterpretation` (`src/server/kally/pipeline.ts:80`) disser que sim:

```ts
if (input.requested !== "auto" || input.postCommand || input.hasReviewPayload) return false;
if (input.message.length >= 280) return true;          // texto longo: regras erram
return input.hasAttachment && input.intentMode === "chat";
```

Por quê? **Trocar de modelo custa ~14 s.** Mensagem curta fica com as regras (rápidas e de graça).

### [8] Contexto (RAG) — `route.ts:174–215`

Três fontes, **todas filtradas pelo escopo da pessoa**:

```ts
findRelevantPosts(access.scope, query, ...)      // posts do ambiente (respeita canSeePrivate)
searchDocuments({ userId, query, ... })          // base pessoal (WHERE userId = eu) + institucional
selectExamples(competence, message, ...)         // exemplos de referência da competência
```

Note que `access.scope` foi **produzido pelo porteiro no passo 5**. A IA nunca "vê" mais do que a
pessoa veria.

### [9] Gerenciador de modelos — `src/server/ai/model-manager.ts`

`streamChat` → `request()` (`src/server/ai.ts:127`) pede a vez:

```ts
lease = await acquireModel(baseUrl, model, { numCtx, maxMs: timeoutMs + 5_000 });
```

Dentro do gerenciador (`prepare`, linha 134):

```
1. GET /api/ps            → quais modelos estão carregados?
2. outro modelo de texto?  → POST /api/generate { model: outro, keep_alive: 0 }   (descarrega)
3. confirma em /api/ps que saiu (até 30 s; senão ModelBusyError)
4. carrega o pedido        → POST /api/generate { model, keep_alive: "30m", options }
```

A fila é **uma só por servidor** (`globalThis.__kallyModelManagers`), então vale para o site e o
app ao mesmo tempo. Pedidos **do mesmo modelo** passam juntos (linha 94).

### [10] Geração e streaming — `route.ts:224–271`

```ts
const send = (event) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
send({ conversationId, temporary: !conversationId, mode, ... });   // 1º evento: metadados
send({ sources });                                                  // 2º: fontes usadas
for await (const chunk of streamChat(prompt, {...})) {
  answer += chunk;
  send({ text: chunk });                                            // N eventos de texto
}
send({ done: true });                                               // fim
```

Duas "línguas" diferentes no caminho:

```
 Ollama ──(NDJSON: um JSON por linha)──▶ Next.js ──(SSE: "data: {...}\n\n")──▶ app
```

No app (`stream.ts:39–55`), o texto recebido é cortado em `\n\n`; cada pedaço com `data: ` vira um
evento. A tela junta os textos e **atualiza a cada ~60 ms** (`perguntar.tsx:340–349`) para não
renderizar a cada token.

### [11] Registro — `route.ts:304–356` (bloco `finally`)

```ts
if (conversationId && answer.trim()) await addMessage(conversationId, "assistant", answer.trim(), sources);
controller.close();
logPerf({ route: "app", mode, competence, retrievalMs, executor: {...}, error: failed, ... });
```

- Só **conversas salvas** gravam a resposta (mesmo parcial, se caiu no meio).
- `logPerf` (`src/server/ai/perf.ts`) grava **tempos e memória, nunca o conteúdo** em
  `logs/kally-perf.jsonl`. Se falhar ao gravar, engole o erro: "o registro nunca derruba a resposta".

---

## 3. O que acontece quando dá errado (mapa de erros) 🔵

| Onde | Situação | O que a pessoa vê | Quem gera |
|---|---|---|---|
| app | servidor desligado / sem rede | "Não consegui conectar ao servidor em …" | `stream.ts:22` |
| app (pedido comum) | demorou > 20 s | "O servidor demorou demais para responder." | `api.ts:70–76` |
| porteiro | ambiente não existe ou arquivado (e você não é dono) | 404 "Ambiente não encontrado." | `environments.ts:103/109` |
| porteiro | sem login em ambiente privado | 401 "Este ambiente é privado. Entre com sua conta…" | `environments.ts:115` |
| porteiro | logado mas não participa | 403 "Você não participa deste ambiente…" | `environments.ts:114` |
| app | 401 **com** token salvo | app apaga o token: "Sua sessão expirou." | `api.ts:95` + `auth.tsx` |
| gerenciador | modelo anterior não saiu da VRAM em 30 s | 503 "O modelo anterior não saiu da memória a tempo…" | `model-manager.ts:176` |
| Ollama | fora do ar | 503 "Não consegui conectar ao provedor de IA do servidor." | `ai.ts:140` |
| Ollama | demorou demais | 504 "A IA demorou demais para responder." | `ai.ts:140` |
| meio do stream | erro depois que a resposta começou | evento `{ error: "A resposta foi interrompida…" }` | `route.ts:303` |

> ⚪ **Pegadinha boa:** depois que o stream começa, o status HTTP já foi **200**. Por isso um erro
> no meio da geração **não pode** virar 500: ele vai como **evento** `{ error }` dentro do stream, e o
> app (`stream.ts:43`) transforma esse evento em exceção.

---

## 4. Decisões de arquitetura e contrapontos 🔵

| Decisão | Por quê | Contraponto (o preço) |
|---|---|---|
| **Um backend Next.js** para site e app | regra de permissão escrita uma vez; menos código duplicado | site e app ficam acoplados ao mesmo servidor; se ele cai, caem os dois |
| **SQLite + Prisma** | um arquivo, sem servidor de banco, backup = copiar arquivo; Prisma permite migrar depois | um escritor por vez; não serve para várias instâncias nem para serverless (Vercel) |
| **IA local (Ollama)** | custo zero, privacidade, aprendizado | limite de hardware → modelos pequenos (3–4 B), um por vez, trocas lentas (~11–14 s) |
| **Expo / React Native** | um código para Android, iOS e web | camada extra entre o código e o nativo; algumas APIs (Alert) não funcionam na web |
| **Cloudflare Tunnel** | HTTPS e domínio sem abrir portas | o PC precisa ficar ligado; dependência de um serviço externo |
| **Limites de uso em memória** (`Map`) | simples e suficiente para uma instância | zeram quando o servidor reinicia; não funcionariam com vários servidores |
| **Mesmo modelo como interpretador e executor** | nada é descarregado entre as etapas | avaliação mostrou que o llama3.2 empatava em qualidade, mas custava ~11 s de troca |

### Resposta pronta para "por que não usar uma API de IA pronta?" 🟣

1. **Custo:** zero por mês.
2. **Privacidade:** pensamentos pessoais nunca saem do computador.
3. **Aprendizado:** resolver as restrições de hardware foi parte do trabalho.
4. **E foi medido:** a nova Kally subiu de **1,33 para 3,06** (escala 0–5), documento 07.

> Observação honesta: o código **permite** um provedor externo (`AI_PROVIDER="openai"` no
> `.env.example`), mas o padrão e o que roda em produção é o Ollama local.

---

## 5. Onde mora cada coisa (mapa do repositório) 🔵

```
mente/
├─ prisma/schema.prisma          ← TODAS as tabelas (arquivo 02)
├─ src/
│  ├─ proxy.ts                   ← 1ª barreira do /admin + contador de visitantes
│  ├─ lib/
│  │  ├─ db.ts                   ← cliente Prisma único (globalThis)
│  │  ├─ env.ts                  ← valida o .env com zod, sob demanda
│  │  └─ auth/                   ← senha (scrypt), tokens (JWT), sessão, limite de login
│  ├─ server/                    ← REGRAS (só roda no servidor: import "server-only")
│  │  ├─ environments.ts         ← papéis, permissões, resolveAccess, convites
│  │  ├─ scope.ts / categories.ts← escopo e filtros de consulta
│  │  ├─ posts.ts, map.ts        ← leitura de posts, grafo do mapa
│  │  ├─ ai.ts, ai/              ← falar com o Ollama, gerenciador de modelos, perf
│  │  └─ kally/, kally.ts        ← pipeline, competências, documentos, prompts
│  └─ app/
│     ├─ (site)/…                ← páginas públicas
│     ├─ admin/…                 ← painel
│     └─ api/
│        ├─ chat/route.ts        ← Kally do SITE
│        └─ mobile/…             ← TODAS as rotas do APP (_lib/http.ts = utilitários)
└─ mobile/                       ← app Expo (arquivo 03)
```

> ⚪ `import "server-only"` no topo de `src/server/*` e `src/lib/db.ts` faz o build **quebrar** se
> alguém tentar importar esse código numa parte que vai para o navegador. É uma trava contra vazar
> regras e segredos para o cliente.

---

## 6. Como o projeto evoluiu 🔵

Método em todas as fases: **diagnóstico → plano aprovado → implementação → testes com evidência →
publicação só com autorização.**

| Fase | O que entrou | Marca no código |
|---|---|---|
| Base | site, posts, pastas, imagens, mapa, painel, SQLite | `Post.environmentId @default("mente")` — dados antigos ficaram no ambiente "mente" sem cópia |
| Ambientes | contas, ambientes, convites, papéis | `Membership`, `Invite`, `resolveAccess` |
| Aplicativo | Expo, feed, busca, mapa, editor, `/app` na web | `mobile/`, `src/app/api/mobile/` |
| Kally 1–3 | memória, conversas salvas/temporárias, anexos, internet, posts, Modo Dev | `kally.ts`, `KallyConversation`, `KallyChunk` |
| Arquitetura inteligente (6 etapas) | gerenciador de modelos, pipeline, competências, RAG, avaliação | `model-manager.ts`, `pipeline.ts`, `competences/`, `documents.ts`, `eval/kally/` |

---

## 7. Vocabulário mínimo 🟣

| Termo | Em uma linha | Exemplo no projeto |
|---|---|---|
| Backend / frontend | servidor com dados e regras / interface | `src/server` / `mobile/src/app` |
| Rota de API | endereço que responde a pedidos | `POST /api/mobile/env/[env]/kally` |
| ORM | traduz objetos ↔ tabelas | `db.post.findMany({ where })` |
| JWT | token assinado que prova quem é | `Authorization: Bearer eyJ…` |
| Ambiente | espaço com posts, membros e permissões | `Environment` com id `"mente"` |
| LLM | modelo que prevê o próximo pedaço de texto | qwen3 4B |
| Token (de IA) | pedaço de palavra (~3,5 caracteres em PT) | `maxTokens: 800` |
| VRAM | memória da placa de vídeo | 4 GB na RTX 2050 |
| Embedding | lista de números que representa significado | `KallyDocumentChunk.vector` |
| RAG | buscar trechos e pôr no contexto antes de gerar | `searchDocuments` + `findRelevantPosts` |
| SSE | servidor manda a resposta em pedaços | `data: {"text":"Ju"}\n\n` |

---

## 8. Se tivesse que reconstruir do zero (ordem sugerida) ⚪

1. **Banco primeiro:** escreva `schema.prisma` (User, Environment, Membership, Post, Category) e rode `prisma db push`.
2. **Autenticação:** `hashPassword/verifyPassword` (scrypt) → `signMobileToken/verifyMobileToken` (JWT só com `uid`).
3. **O porteiro:** `permissionsFor` + `resolveAccess` + `envAccess`. Escreva testes mentais com a tabela de papéis.
4. **Uma rota simples de ponta a ponta:** `GET /api/mobile/env/[env]/feed` usando `access.scope`.
5. **App mínimo:** `config.ts` → `api.ts` → tela de login → tela de feed.
6. **Só então a IA:** `streamChat` sem gerenciador → SSE no app → depois o gerenciador de modelos → depois RAG.

> Regra de ouro para lembrar em cada passo: **o cliente nunca decide o que pode.**
