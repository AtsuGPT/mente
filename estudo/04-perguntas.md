# 04 · Perguntas de verificação

> Responda **sem consultar** os arquivos 01–03 nem o código. Depois mande as respostas no chat que eu
> corrijo com o gabarito detalhado (arquivo 05, que fica guardado até você responder).

## Como responder

Mande no formato abaixo (pode ser tudo numa mensagem só):

```
A1: c
A4: F — porque ...
A5: o app guarda ...
A8: (i) true (ii) false ...
```

## Tipos de questão e pontos

| Sigla | Tipo | Pontos | Como é corrigida |
|---|---|---|---|
| **ME** | múltipla escolha | 1 | certo ou errado |
| **VF** | verdadeiro ou falso **com justificativa** | 2 | 1 ponto pelo V/F + 1 pela justificativa (sem justificativa: no máximo 1) |
| **C** | resposta curta / explicação | 2 | pontos parciais pelos elementos pedidos |
| **CÓD** | leitura de código ou cenário | 3 | pontos parciais por item |

## Critério de desempenho

Some os pontos e divida pelo total (**108**). O resultado também sai **por parte**, para você saber
qual arquivo reler.

| Resultado | Nível |
|---|---|
| **≤ 50 %** | 🔴 precisa estudar novamente |
| **> 50 % e ≤ 70 %** | 🟠 quase lá |
| **> 70 % e ≤ 90 %** | 🟢 satisfatório |
| **> 90 %** | 🟣 sabe o suficiente para apresentar a uma banca tranquilamente |

| Parte | Arquivo | Total de pontos |
|---|---|---|
| A | 01 · Visão geral e arquitetura | 30 |
| B | 02 · Dados, ambientes e segurança | 41 |
| C | 03 · Aplicativo e estilo | 37 |
| **Total** | | **108** |

---

## Parte A · Visão geral e arquitetura (30 pontos)

**A1 (ME, 1)** Qual frase resume melhor a arquitetura do Minha Mente?

- a) O site usa Next.js e o app tem um servidor próprio em Node, ambos lendo o mesmo SQLite.
- b) O app guarda os dados localmente e sincroniza com o site quando há internet.
- c) Um backend único (Next.js) guarda os dados e aplica as regras; site e app são duas "janelas" para ele; a IA roda localmente, numa arquitetura feita para caber numa placa de 4 GB.
- d) O site e o app chamam diretamente o Ollama, e o Next.js só serve as páginas.

**A2 (ME, 1)** O que o túnel **Expo + ngrok** transporta?

- a) Os pedidos `/api/mobile/...` do app até o Next.js.
- b) Só o código JavaScript do app, para o Expo Go durante o desenvolvimento.
- c) O arquivo `mente.db` para backup.
- d) As respostas do Ollama até o celular.

**A3 (ME, 1)** Em que arquivo está a função que decide se uma pessoa pode ver, publicar ou gerenciar um ambiente?

- a) `mobile/src/lib/api.ts`
- b) `src/proxy.ts`
- c) `prisma/schema.prisma`
- d) `src/server/environments.ts`

**A4 (VF, 2)** "O arquivo `src/proxy.ts` é quem protege as rotas `/api/mobile/...` contra pedidos sem permissão."

**A5 (C, 2)** Numa conversa **temporária** com a Kally do app, quem guarda o histórico? Como ele chega ao servidor e quais limites o servidor aplica a ele?

**A6 (ME, 1)** Em que ordem a rota da Kally do app envia os eventos do stream?

- a) metadados (`conversationId`, `temporary`, `mode`) → `sources` → vários `text` → `done`
- b) vários `text` → `sources` → `done` → metadados
- c) `sources` → `done` → vários `text`
- d) um único evento com o texto inteiro

**A7 (C, 2)** Se a geração da Kally falhar **no meio** da resposta, por que o servidor não responde com HTTP 500? Como o erro chega ao app?

**A8 (CÓD, 3)** Observe a função:

```ts
export function needsInterpretation(input) {
  if (input.requested !== "auto" || input.postCommand || input.hasReviewPayload) return false;
  if (input.message.length >= 280) return true;
  return input.hasAttachment && input.intentMode === "chat";
}
```

Diga **true** ou **false** para cada caso:

- (i) `requested: "auto"`, mensagem de 300 caracteres, sem anexo, sem `/post`, sem revisão.
- (ii) `requested: "aprender"`, mensagem de 500 caracteres, sem anexo.
- (iii) `requested: "auto"`, mensagem de 100 caracteres, **com** anexo, `intentMode: "chat"`.
- (iv) `requested: "auto"`, mensagem de 100 caracteres, sem anexo, `intentMode: "chat"`.

**A9 (C, 2)** Por que o interpretador **não** roda em todas as mensagens? Por que, mesmo assim, texto longo passa sempre por ele?

**A10 (C, 2)** Descreva o que o gerenciador de modelos faz quando chega um pedido de um modelo **diferente** do que está carregado (os passos, na ordem). O que acontece se o modelo antigo não sair da memória?

**A11 (ME, 1)** Dois pedidos para o **mesmo** modelo chegam quase juntos ao gerenciador de modelos. O que acontece?

- a) O segundo espera o primeiro terminar por completo.
- b) O modelo é descarregado e carregado de novo para o segundo.
- c) Os dois seguem juntos, sem descarregar nada.
- d) O segundo recebe 429.

**A12 (C, 2)** Entre o Ollama e o Next.js os dados viajam num formato; entre o Next.js e o app, em outro. Quais são e qual a diferença entre eles?

**A13 (ME, 1)** O que é gravado em `logs/kally-perf.jsonl`?

- a) A pergunta e a resposta completas, para melhorar o modelo.
- b) Tempos (fila, carga, geração), memória e metadados, sem o conteúdo das mensagens.
- c) Só os erros.
- d) O token JWT de quem perguntou.

**A14 (C, 2)** Que código HTTP a pessoa recebe em cada caso?

- (i) Chama a Kally de um ambiente privado sem estar logada.
- (ii) Está logada, mas não participa do ambiente.
- (iii) O ambiente foi arquivado e ela é MEMBER.
- (iv) Envia a 41ª mensagem em 15 minutos e é MEMBER.
- (v) Envia uma mensagem com 4 500 caracteres.

**A15 (C, 2)** "Por que não usar uma API de IA pronta?" Dê os três motivos e o resultado medido.

**A16 (C, 2)** Cite **um contraponto** de usar SQLite e **um contraponto** de guardar os limites de uso num `Map` em memória.

**A17 (VF, 2)** "A Kally recebe no contexto todos os posts do ambiente, inclusive os privados, mas o prompt a instrui a não citar os que a pessoa não pode ver."

**A18 (ME, 1)** Para que serve `import "server-only"` no topo de `src/server/*.ts`?

- a) Faz o arquivo rodar mais rápido no servidor.
- b) Impede que o arquivo seja lido pelo Git.
- c) Ativa o cache do Prisma.
- d) Faz o build falhar se alguém importar esse código numa parte que vai para o navegador.

---

## Parte B · Dados, ambientes e segurança (41 pontos)

**B1 (ME, 1)** O que impede que a mesma pessoa tenha duas participações no mesmo ambiente?

- a) Uma verificação no app antes de aceitar o convite.
- b) `@@unique([environmentId, userId])` em `Membership`.
- c) `@@index([userId])` em `Membership`.
- d) `onDelete: Cascade`.

**B2 (C, 2)** Explique `onDelete: Cascade` (em `Membership`) e `onDelete: SetNull` (em `Post.author`). Dê a consequência prática de cada um.

**B3 (C, 2)** Por que `environmentId String @default("mente")` em `Post` facilitou a criação dos ambientes sem perder dados?

**B4 (CÓD, 3)** Usando a regra:

```ts
const pick = (flag, fallback) => (membership.role === "OWNER" ? true : flag ?? fallback);
publish: pick(membership.canPublish, base.publish),
manageSettings: membership.role === "OWNER",
```

Responda:

- (i) MEMBER com `canPublish = null` → `publish` = ?
- (ii) MEMBER com `canPublish = false` → `publish` = ?
- (iii) VIEWER com `canPublish = true` → `publish` = ?
- (iv) OWNER com `canPublish = false` → `publish` = ?
- (v) ADMIN com todos os ajustes nulos → `manageSettings` = ?

**B5 (C, 2)** Por que o código usa `flag ?? fallback` e não `flag || fallback`? Dê um exemplo em que os dois dariam resultados diferentes.

**B6 (ME, 1)** Um participante com papel **VIEWER** vê os pensamentos privados do ambiente?

- a) Sim: qualquer participante tem `seePrivate: true`.
- b) Não: só OWNER e ADMIN veem privados.
- c) Só se o dono ligar `canManageContent`.
- d) Só se o ambiente tiver `guestAccess`.

**B7 (CÓD, 3)** Para cada cenário, diga o que `resolveAccess` devolve (o código de erro, ou "acesso liberado" com o papel):

- (i) O slug pedido não existe.
- (ii) Ambiente arquivado; a pessoa é MEMBER.
- (iii) Ambiente arquivado; a pessoa é OWNER.
- (iv) `guestAccess: false`; pedido sem token.
- (v) `guestAccess: false`; pessoa logada sem participação.
- (vi) `guestAccess: true`; pedido sem token. (Diga também o valor de `canSeePrivate`.)

**B8 (C, 2)** Por que, ao tentar remover o documento de **outra** pessoa, o servidor responde 404 e não 403?

**B9 (C, 2)** O que é o **escopo** (`Scope`), quais são seus dois campos e como ele vira filtro de consulta? Escreva o `where` aproximado de uma lista de posts para um **visitante** no ambiente `"mente"`.

**B10 (VF, 2)** "Se um visitante descobrir o slug de um post privado, consegue lê-lo pelo app, porque a rota busca o post pelo slug."

**B11 (C, 2)** O hash de senha é guardado como `scrypt:N:r:p:salt:hash`. Para que serve o **sal**? Por que o scrypt é lento **de propósito**? Por que os parâmetros ficam dentro do próprio texto?

**B12 (C, 2)** Para que serve `burnPasswordCheck` quando o usuário digitado **não existe**? Que ataque ele evita?

**B13 (ME, 1)** O que vai dentro do JWT do app?

- a) O id da pessoa e o papel em cada ambiente.
- b) O nome de usuário e a senha em hash.
- c) Só o id da pessoa (`uid`), além dos campos de validade.
- d) A lista de ambientes que ela participa.

**B14 (C, 2)** Qual a consequência prática de o token do app **não** carregar o papel? Dê um exemplo.

**B15 (C, 2)** Os tokens usam `subject` diferentes (`"mobile-user"`, `"site-access"`, `"admin"`). Que problema isso evita?

**B16 (ME, 1)** Quantas tentativas de login erradas um mesmo IP pode fazer antes de ser bloqueado, e por quanto tempo vale a janela?

- a) 3 tentativas, 5 minutos
- b) 5 tentativas, 15 minutos
- c) 10 tentativas, 15 minutos
- d) 40 tentativas, 15 minutos

**B17 (CÓD, 3)** Um convite tem `maxUses = 3` e `uses = 2`. Duas pessoas tocam em "aceitar" **no mesmo instante**. Observe:

```ts
const claimed = await tx.invite.updateMany({
  where: { id: invite.id, revokedAt: null, ...(invite.maxUses !== null ? { uses: { lt: invite.maxUses } } : {}) },
  data: { uses: { increment: 1 } },
});
if (!claimed.count) return { ok: false, status: 400, error: "Este convite já foi usado." };
```

O que acontece com cada pessoa? Por que a condição `uses < maxUses` está **dentro** do `updateMany` e não num `if` feito depois de ler o convite?

**B18 (C, 2)** Explique o princípio "filtrar na consulta, nunca depois", usando as bases de documentos da Kally como exemplo.

**B19 (C, 2)** Os limites de uso (login e Kally) ficam num `Map` em memória. Cite **uma limitação** disso e **como evoluiria**. Por que é aceitável neste projeto?

**B20 (ME, 1)** O proprietário pode sair do próprio ambiente?

- a) Sim, e o ambiente passa para o ADMIN mais antigo.
- b) Sim, e o ambiente é apagado.
- c) Não; ele deve arquivar o ambiente se não for mais usá-lo.
- d) Não; só o administrador da plataforma pode removê-lo.

**B21 (VF, 2)** "O Modo Desenvolvedor permite ao administrador da plataforma conversar com a Kally sobre ambientes dos quais ele não participa."

**B22 (ME, 1)** Quais são os limites da Kally do **site**?

- a) 40 mensagens por pessoa a cada 15 min.
- b) 10 pedidos por IP e 80 no total a cada 15 min.
- c) 5 pedidos por IP a cada 15 min.
- d) Não há limite no site.

---

## Parte C · Aplicativo e estilo (37 pontos)

**C1 (ME, 1)** Qual é a URL da tela `mobile/src/app/(app)/(tabs)/feed.tsx`?

- a) `/app/tabs/feed`
- b) `/(app)/(tabs)/feed`
- c) `/feed`
- d) `/tabs/feed`

**C2 (ME, 1)** No arquivo `post/[slug].tsx`, o que significa `[slug]`?

- a) Uma pasta oculta.
- b) Um parâmetro da rota: `/post/meu-pensamento` abre essa tela com `slug = "meu-pensamento"`.
- c) Um grupo que não aparece na URL.
- d) Um arquivo só da versão web.

**C3 (CÓD, 3)** Usando a regra de `resolveApiUrl` (`mobile/src/lib/config.ts`), qual endereço o app usa em cada caso?

- (i) `EXPO_PUBLIC_API_URL="https://minhamente.space/"` (com barra no fim).
- (ii) Sem `EXPO_PUBLIC_API_URL`; o app veio de `abc123.ngrok-free.app`.
- (iii) Sem `EXPO_PUBLIC_API_URL`; o app veio de `192.168.1.105`.
- (iv) Sem `EXPO_PUBLIC_API_URL`; aberto no navegador do próprio PC (`localhost`).

**C4 (C, 2)** Conte o bug real do túnel do Expo: o que o app tentava acessar e por que falhava? Por que a regra final ("qualquer endereço que não seja IP local é túnel") é melhor do que listar domínios de túnel?

**C5 (C, 2)** Em `api.ts`, um 401 só chama `onUnauthorized` (que apaga o token) **se havia token**. Por quê?

**C6 (C, 2)** No leitor de SSE, por que existe `buffer = frames.pop() ?? ""` depois do `split("\n\n")`?

**C7 (ME, 1)** Qual o tempo-limite padrão dos pedidos comuns do app?

- a) 5 s
- b) 20 s
- c) 60 s
- d) Não há tempo-limite.

**C8 (C, 2)** Por que os tokens `faint` (#6E6884) e `violet500` (#7C5CE0) nunca são usados em texto normal? Cite a regra e os valores.

**C9 (ME, 1)** Qual é a regra de uso do roxo no app?

- a) Roxo para títulos, cinza para botões.
- b) Roxo marca o que é interativo ou selecionado; cinzas carregam o secundário.
- c) Roxo só em erros.
- d) Roxo em todo texto principal.

**C10 (C, 2)** Qual o papel de cada família de fonte (Newsreader e Instrument Sans)? Por que o estilo `body` tem 17 de tamanho e 28 de altura de linha?

**C11 (CÓD, 3)** No editor, a versão com bug era (simplificando):

```tsx
const discard = () => {
  setDirty(false);
  navigation.dispatch(data.action);   // sai na hora
};
```

Explique por que ela fazia o aviso "Descartar alterações?" aparecer de novo, e descreva **a ordem** da correção (o que muda em `discard` e o que o `useEffect` faz).

**C12 (C, 2)** Sobre `KeyboardScreen`: o que faz `behavior="padding"`, por que ele é usado **também no Android**, e de onde vem o valor `insets.top + 56`?

**C13 (C, 2)** A versão web do app vive em `minhamente.space/app`. Como uma URL como `/app/feed` funciona se não existe o arquivo `feed` em `public/app`? E o que o `WebFrame` faz?

**C14 (C, 2)** Quais são os três tipos de ligação (aresta) do mapa de conhecimento e de onde cada um é tirado?

**C15 (C, 2)** Por que o layout do mapa é **determinístico**? Para que serve o peso `Math.sqrt(posts + 1) + 0.6` de cada pasta?

**C16 (CÓD, 3)** No toque do mapa:

```ts
const worldX = (event.x - tx.value) / scale.value;
const worldY = (event.y - ty.value) / scale.value;
const hit = hitTest(layout, worldX, worldY, 16 / scale.value);
```

- (i) O que essas duas primeiras linhas fazem?
- (ii) Com `scale = 0.5`, qual a tolerância em unidades do mundo? E com `scale = 2`?
- (iii) Por que dividir 16 pela escala em vez de usar sempre 16?

**C17 (VF, 2)** "Enquanto a pessoa faz a pinça no mapa, o React re-renderiza todos os nós a cada quadro para atualizar as posições."

**C18 (ME, 1)** Quem vê os rascunhos no mapa de conhecimento?

- a) Todos os participantes.
- b) Só quem tem `manageContent` no ambiente.
- c) Só o autor de cada rascunho.
- d) Ninguém: rascunhos nunca aparecem.

**C19 (VF, 2)** "Uma pasta cujos posts são todos privados aparece **vazia** no mapa de um visitante."

**C20 (ME, 1)** Onde o app guarda o token no celular?

- a) Em `AsyncStorage`, em texto puro.
- b) No Keychain (iOS) / Keystore (Android), via `expo-secure-store`.
- c) Num cookie `httpOnly`.
- d) Não guarda: pede a senha toda vez.

---

Quando terminar, mande as respostas. Eu corrijo item a item, explico os erros e digo seu nível em
cada parte e no total.
