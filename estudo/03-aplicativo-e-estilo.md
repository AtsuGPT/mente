# 03 · O aplicativo: telas, navegação e estilização (com o código)

> Companheiro do PDF **"03 · O aplicativo: telas, navegação e estilização"**.
> Legenda: 🟣 **essencial** · 🔵 **importante** · ⚪ **aprofundamento**

Versões: **Expo SDK 58**, **React Native 0.88**, Skia 2.14, Reanimated 4.7 (`mobile/package.json`).

> **Analogia do PDF:** React é a **receita** (o que aparece e quando). React Native é a **cozinha
> do celular** (prepara com ingredientes nativos). Expo é o **restaurante pronto** (câmera,
> arquivos, áudio, armazenamento seguro, recarga instantânea).

---

## 1. Como o app é montado

### 1.1 Navegação por arquivos (Expo Router) 🟣

**Cada arquivo em `mobile/src/app/` é uma tela; cada pasta vira um pedaço do caminho.**
Pastas entre **parênteses** são **grupos**: organizam, mas **não aparecem no endereço**.
Colchetes são **parâmetros**.

```
mobile/src/app/
├─ _layout.tsx            ← moldura de TUDO (fontes, provedores, WebFrame)        → (nenhuma URL)
├─ index.tsx              ← central de ambientes                                  → /
├─ login.tsx              →  /login        cadastro.tsx → /cadastro    ambiente-novo.tsx → /ambiente-novo
└─ (app)/                 ← grupo: NÃO aparece na URL
   ├─ _layout.tsx         ← pilha (Stack) de telas dentro de um ambiente
   ├─ (tabs)/             ← grupo das 5 abas
   │  ├─ _layout.tsx      ← barra de abas
   │  ├─ feed.tsx         → /feed        Início
   │  ├─ buscar.tsx       → /buscar      Buscar
   │  ├─ mapa.tsx         → /mapa        Mapa de conhecimento
   │  ├─ perguntar.tsx    → /perguntar   Kally
   │  └─ conta.tsx        → /conta       Ambiente (pastas, participantes, base, conta)
   ├─ post/[slug].tsx     → /post/meu-pensamento     ([slug] = parâmetro)
   ├─ editor/[id].tsx     → /editor/abc123
   ├─ pastas.tsx, base.tsx, categoria/[slug].tsx, sobre.tsx
   └─ painel/             → /painel, /painel/categorias, /painel/participantes, /painel/configuracoes
```

Pergunta clássica: *qual a URL de `(app)/(tabs)/feed.tsx`?* → **`/feed`** (os dois grupos somem).

### 1.2 A "cebola" de provedores — `mobile/src/app/_layout.tsx` 🔵

```tsx
<GestureHandlerRootView>         // gestos (mapa, toques)
  <ThemeProvider>                // tema escuro da navegação
    <AuthProvider>               // QUEM é a pessoa (token)         → lib/auth.tsx
      <EnvironmentProvider>      // EM QUAL ambiente ela está        → lib/environment.tsx
        <WebFrame>               // só na web: coluna de 480 pontos
          <RootStack />          // as telas
```

Enquanto as fontes carregam, a tela fica vazia (`return null`); **se as fontes falharem, o app segue
com as do sistema** em vez de travar (comentário "Se as fontes falharem…").

### 1.3 Sessão no app — `mobile/src/lib/auth.tsx` + `secure-storage.ts` 🔵

```
 abrir o app ─▶ getItem("minha-mente.token.v2")
                    │
            ┌───────┴────────┐
          sem token        tem token ─▶ api.me()
            │                         ┌──────┼──────────────┐
            ▼                         ▼      ▼              ▼
     visitante (user: null)        200: ok  401: apaga token     sem rede: estado "offline"
                                            "Sua sessão expirou"  (mantém o token, botão tentar de novo)
```

- No celular o token vai para o **Keychain (iOS) / Keystore (Android)** via `expo-secure-store`.
- Na web cai para `localStorage` (envolvido em `try/catch`: sem armazenamento, a sessão dura só a aba).
- **Detalhe fino:** sem rede, o app **não apaga** o token — só 401 apaga. Ficar offline não desloga ninguém.

### 1.4 Esconder × bloquear 🟣

O app **esconde** o que a pessoa não pode usar:

```tsx
// mobile/src/app/(app)/(tabs)/conta.tsx:90
{permissions.manageContent ? <Row icon="folder" label="Categorias" href="/painel/categorias" /> : null}

// perguntar.tsx:145 — Modo Desenvolvedor só para o admin da plataforma
const isAdmin = signedUser?.legacyKind === "ADMIN";
```

De onde vem `permissions`? Do servidor: `GET /api/mobile/env/[env]/session` devolve `{ role,
permissions }` calculado por `resolveAccess`. **O app só reflete; quem decide é o servidor**
(arquivo 02).

---

## 2. Falando com o servidor 🔵

### 2.1 Qual servidor? — `mobile/src/lib/config.ts:30`

```ts
function resolveApiUrl() {
  const explicit = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "");
  if (explicit) return { url: explicit, source: "EXPO_PUBLIC_API_URL" };            // 1º
  const host = devServerHost();                                                     // de onde o app veio
  if (host && isExpoTunnel(host)) return { url: PRODUCTION_API, source: "túnel do Expo" }; // 2º
  if (host) return { url: `http://${host}:${port}`, source: "rede local" };        // 3º
  return { url: `http://localhost:${port}`, source: ... };                          // 4º
}

// linha 28: "túnel" = qualquer coisa que NÃO seja IP (ex.: 192.168.1.105) nem *.local
const isExpoTunnel = (host) => !/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && !host.endsWith(".local");
```

| Situação | `host` | Resultado |
|---|---|---|
| `.env` do app com `EXPO_PUBLIC_API_URL=https://minhamente.space` | qualquer | `https://minhamente.space` |
| Expo Go pelo túnel ngrok | `abc123.ngrok-free.app` | não é IP → **produção** |
| Expo Go na mesma Wi-Fi | `192.168.1.105` | `http://192.168.1.105:3000` |
| navegador do próprio PC | `localhost` → `null` | `http://localhost:3000` |

> 🟣 **O bug real que essa regra resolveu:** pelo túnel, o app tentava
> `http://<endereço-do-túnel>:3000`. Mas o túnel do Expo **só leva o código do app, não o backend**
> → nada respondia. A regra 2 ("todo endereço que não é IP local é túnel ⇒ use produção") corrigiu.
> Antes ela listava domínios (`*.exp.direct`, `*.on.expo.app`), e quebrava a cada domínio novo; a
> versão final é uma **regra negativa** (não é IP), que não depende do nome do túnel.
> Depois o túnel passou a ser o **ngrok**, que guarda um sufixo aleatório em `.expo/settings.json`
> e mantém **o mesmo endereço entre reinícios**.

> ⚪ No iPhone, `localhost` seria o próprio celular — por isso `localhost` nunca é o padrão no aparelho.

### 2.2 Pedidos comuns — `mobile/src/lib/api.ts:56`

```ts
export async function request<T>(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS); // 20 s
  const headers = { Accept: "application/json", ...authHeaders() };                          // token
  ...
  try { response = await fetch(`${API_URL}${path}`, { ..., signal: controller.signal }); }
  catch (cause) {
    throw new ApiError(aborted ? "O servidor demorou demais para responder."
                               : `Não consegui conectar ao Minha Mente em ${API_URL}. ...`, 0);
  } finally { clearTimeout(timer); }
  ...
  if (!response.ok) {
    if (response.status === 401 && authToken) onUnauthorized?.();   // linha 95
    throw new ApiError(payload.error || `Erro ${response.status} no servidor.`, response.status, payload.fieldErrors);
  }
  return data;
}
```

Pontos que valem ponto:

| Detalhe | Por quê |
|---|---|
| `AbortController` + `setTimeout` | `fetch` não tem tempo-limite próprio; abortar libera a tela |
| tempos diferentes por rota | documentos 4 min, transcrição 6 min, imagens 60 s (`timeoutMs` em `api.ts`) |
| status `0` no erro de rede | diferencia "não chegou ao servidor" de um erro HTTP real |
| mensagem do servidor reaproveitada | o backend já responde em português (`{ error }`) |
| `fieldErrors` | erros por campo nos formulários (ex.: "Este nome de usuário já está em uso.") |
| **401 só desloga se havia token** | sem token, 401 é só "esse ambiente pede login", não "sessão expirou" |

### 2.3 Streaming da Kally — `mobile/src/lib/stream.ts:12`

O servidor manda **Server-Sent Events**:

```
data: {"conversationId":null,"temporary":true,"mode":"chat"}\n\n
data: {"sources":[...]}\n\n
data: {"text":"Juros "}\n\n
data: {"text":"compostos são"}\n\n
data: {"done":true}\n\n
```

O app lê assim (simplificado):

```ts
let buffer = "";
while (true) {
  const { value, done } = await reader.read();
  buffer += decoder.decode(value, { stream: !done });
  const frames = buffer.split("\n\n");   // eventos completos
  buffer = frames.pop() ?? "";           // o último pode estar pela metade: guarda
  for (const frame of frames) handle(frame);
  if (done) break;
}
```

> 🔵 **Por que `frames.pop()`?** A rede corta os bytes onde quiser. Um pedaço pode terminar em
> `data: {"te`. Esse resto fica no `buffer` e é completado na próxima leitura. Sem isso, o
> `JSON.parse` quebraria ao acaso.

Usa `fetch` de `expo/fetch` porque o `fetch` padrão do React Native não entrega o corpo aos
pedaços. E se chegar um evento `{ error }`, `handle` lança exceção (linha 43) → a bolha da Kally
fica marcada como falha.

---

## 3. O sistema visual 🟣

**Tudo sai de um arquivo: `mobile/src/theme/tokens.ts`.** Nenhuma tela inventa cor ou tamanho.

### 3.1 Cores e contraste

```ts
export const colors = {
  bg: "#07060B",                         // fundo
  text: "#ECE9F5",   muted: "#A19CB3",   faint: "#6E6884",
  violet300: "#BFAEF7",  violet500: "#7C5CE0",  violet600: "#5B3AAE",
  ...
};
```

| Token | Uso | Contraste sobre `bg` | Pode ser texto normal? |
|---|---|---|---|
| `text` | texto principal | 16,9 : 1 | ✅ |
| `muted` | texto secundário | 7,6 : 1 | ✅ |
| `faint` | **só** rótulos e detalhes | 3,8 : 1 | ❌ (< 4,5) |
| `violet300` | links e interativos | 10,2 : 1 | ✅ |
| `violet600` | fundo do botão primário (texto branco) | 7,9 : 1 (branco sobre ele) | ✅ |
| `violet500` | **só** linhas e preenchimentos | 4,3 : 1 | ❌ nunca texto |

> 🟣 **Regra WCAG:** texto normal precisa de **≥ 4,5 : 1**. Por isso `faint` (3,8) e `violet500`
> (4,3) nunca carregam texto corrido. Os valores estão anotados no comentário do topo de
> `tokens.ts`.

> Regra de identidade: **roxo = interativo ou selecionado; cinzas = secundário.** Se algo é roxo e
> não dá para tocar, está errado.

⚪ Como se calcula o contraste: `(L_clara + 0,05) / (L_escura + 0,05)`, onde `L` é a luminância
relativa da cor (0 = preto, 1 = branco).

### 3.2 Tipografia 🔵 — `tokens.ts:55`

| Estilo | Fonte / tamanho / altura de linha | Uso |
|---|---|---|
| `display` | Newsreader 40 / 44, espaçamento −0,8 | títulos grandes |
| `title` | Newsreader Medium 26 / 32 | títulos de tela |
| `body` | Newsreader 17 / **28** | texto dos pensamentos |
| `ui` / `small` | Instrument Sans 15/21 · 13/18 | botões, listas |
| `label` | Instrument Sans Medium 11, CAIXA ALTA, espaçamento 1,4 | rótulos de seção |

- **Newsreader (serifada)** = leitura. **Instrument Sans (sem serifa)** = interface.
- `body` 17/28 ≈ **1,65** de altura de linha: generoso de propósito, cansa menos em tela pequena e fundo escuro.

### 3.3 Espaço, cantos, movimento 🔵

```ts
export const space  = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 6, md: 10, lg: 14, xl: 20, pill: 999 };   // 999 = totalmente redondo
export const motion = { fast: 140, base: 220, slow: 420 };            // milissegundos
```

> **Analogia do PDF:** os tokens são a **escala musical**. Com notas fixas, qualquer melodia soa
> afinada; com espaços e cores fixos, toda tela nova nasce "afinada" com o resto.

As mensagens da Kally entram com `FadeInDown` de **220 ms** (= `motion.base`).

### 3.4 Componentes primitivos — `mobile/src/components/ui/primitives.tsx` 🔵

| Peça | Faz |
|---|---|
| `AppText` | texto com as variantes da tipografia (`variant="body"`) |
| `Touchable` | área tocável; com `haptic`, vibra (`Haptics.selectionAsync`) |
| `Button`, `IconButton`, `Chip` | botões, ícone com rótulo acessível, filtros |
| `Card`, `Divider`, `SectionLabel` | caixas, linhas, rótulos de seção |
| `StateView` | os 3 estados de qualquer tela: **carregando**, **erro com "tentar de novo"**, **vazio** |

> Por que `StateView` importa: toda tela que busca dados tem os mesmos três casos de borda. Centralizar
> garante que nenhuma tela esqueça o caso de erro.

---

## 4. Problemas de interface resolvidos 🔵

### 4.1 Teclado cobrindo os campos — `mobile/src/components/keyboard-screen.tsx`

```tsx
<KeyboardAvoidingView
  style={[{ flex: 1 }, style]}
  behavior={Platform.OS === "web" ? undefined : "padding"}    // web: não faz nada
  keyboardVerticalOffset={header ? insets.top + 56 : 0}       // área segura do topo + 56 do cabeçalho
>
```

- `"padding"`: quando o teclado sobe, a tela ganha um espaço embaixo do tamanho dele.
- `"padding"` **também no Android**: com *edge-to-edge* (padrão no SDK 58) a janela não encolhe sozinha.
- O deslocamento usa a **área segura real** do aparelho (`useSafeAreaInsets`): sobrar um pouco é melhor que cobrir.

### 4.2 "Descartar alterações" perguntando sem parar 🟣 — `editor/[id].tsx:119–142`

**O erro:** ao tocar "Descartar", a tela tentava sair na hora, mas o bloqueio
(`usePreventRemove(dirty && ...)`) ainda via `dirty = true` → perguntava de novo → loop.

**A correção:**

```tsx
const [pendingLeave, setPendingLeave] = useState(null);

usePreventRemove(dirty && !saving, ({ data }) => {
  const discard = () => {
    setDirty(false);                         // (1) marca como não alterado...
    setPendingLeave({ action: data.action }); //     ...e GUARDA a saída (não executa ainda)
  };
  Alert.alert("Descartar alterações?", "...", [
    { text: "Continuar editando", style: "cancel" },
    { text: "Descartar", style: "destructive", onPress: discard },
  ]);
});

useEffect(() => {                            // (2) roda DEPOIS da nova renderização
  if (!pendingLeave || dirty) return;        //     só quando dirty já é false de verdade
  setPendingLeave(null);
  navigation.dispatch(pendingLeave.action);  // (3) repete a saída: o bloqueio não dispara mais
}, [pendingLeave, dirty, navigation]);
```

Linha do tempo:

```
 ERRADO:  toque "Descartar" → setDirty(false) → dispatch(saída) ─▶ bloqueio ainda vê dirty=true ─▶ PERGUNTA DE NOVO
                                    (o valor novo ainda não existe!)

 CERTO:   toque "Descartar" → setDirty(false) + setPendingLeave(saída)
          ── React renderiza de novo (agora dirty=false, bloqueio desligado) ──
          useEffect vê pendingLeave && !dirty → dispatch(saída) ─▶ SAI
```

> 🟣 **Lição de lógica:** em React, `setX(novo)` **não muda `x` na hora**; o novo valor só existe na
> **próxima renderização**. Ação que depende do estado novo deve rodar **depois**, num efeito.

⚪ Na web, `Alert.alert` do React Native não aparece → o código usa `window.confirm` (linha 130).

### 4.3 A versão web em `/app` 🔵

```
 mobile/  npm run export:web  ──▶  public/app/  (site estático)  ──▶  Next.js serve em minhamente.space/app
                (scripts/export-web.js:
                 EXPO_PUBLIC_WEB_BASE=/app
                 EXPO_PUBLIC_API_URL=https://minhamente.space)
```

- É uma **SPA**: rotas como `/app/feed` não têm arquivo próprio. O `next.config.ts` resolve com um
  `rewrite` de **fallback**: `/app/:path*` → `/app/index.html`, **só quando não há arquivo com esse nome**.
- **`WebFrame`** (`_layout.tsx:41`): só na web, centraliza uma coluna de até **480 pontos**
  (`WEB_MAX_WIDTH`, linha 40) com bordas finas, e pinta o `body` da página com `colors.bg`.
- As folhas inferiores (ex.: Modo Desenvolvedor) ganharam a mesma largura máxima.

---

## 5. O mapa de conhecimento 🔵

### 5.1 De onde vem o grafo — `src/server/map.ts`

Só relações **que já existem nos dados** (nada inventado):

```ts
const IMAGE_IN_MARKDOWN     = /\/uploads\/posts\/([^)\s?"#]+)/g;      // pensamento → imagem
const POST_LINK_IN_MARKDOWN = /\]\(\/pensamento\/([a-z0-9-]+)\)/g;    // pensamento → pensamento
// + post.categories                                                  // pensamento → pasta
```

| Aresta | Vem de | `kind` |
|---|---|---|
| pensamento → pasta | categorias do post | `"pasta"` |
| pensamento → imagem | `/uploads/posts/<arquivo>` citado no Markdown | `"imagem"` |
| pensamento → pensamento | link `](/pensamento/<slug>)` no texto | `"mencao"` |

Regras de privacidade **também aqui** (`map/route.ts` + `map.ts:46`):

```ts
where: options.includeDrafts ? { environmentId } : { ...publiclyVisible(), ...scopeFilter(scope) }
// includeDrafts = access.permissions.manageContent
```

E **pastas vazias para este papel não aparecem** (`map.ts:70`): uma pasta só com posts privados não
revela nem que existe para um visitante.

### 5.2 O layout radial — `mobile/src/lib/graph-layout.ts`

```
                     ● pensamento
           ● pens.  /
              \    /         ● pens.
               ◉ PASTA ──── ● pens.          (pasta com 3 posts → setor maior)
                    \
                     \
                   ◎ AMBIENTE (centro, raio 54)
                    /         \
               ◉ pasta        ◉ pasta
                 |               \
               ● pens.            ● pens. ─ · imagem (folha)
```

```ts
export const NODE_RADIUS = { ambiente: 54, pasta: 30, pensamento: 13, imagem: 7 };   // linha 23
const weights = groups.map((g) => Math.sqrt(g.posts.length + 1) + 0.6);             // linha 52
const ringRadius = Math.max(250, 70 * folders.length);                               // linha 54
let cursor = -Math.PI / 2;  // começa no topo, sentido horário                        // linha 62
const sector = (weights[index] / totalWeight) * TAU;                                  // fatia do círculo
```

| Decisão | Efeito |
|---|---|
| peso = `√(posts + 1) + 0,6` | pasta maior ganha setor maior, mas **não** engole o círculo (raiz quadrada suaviza) |
| `+ 1` e `+ 0,6` | pasta com 0 posts ainda tem um setor mínimo |
| anel ≥ 250 e cresce 70 por pasta | muitas pastas não se sobrepõem |
| começa em `−π/2` | a primeira pasta fica no topo |
| **determinístico** (sem aleatoriedade, sem simulação de física) | o mapa sai igual a cada abertura → **memória espacial**: a pessoa lembra onde as coisas estão |

Pensamentos sem pasta ligam-se direto ao centro, num anel mais próximo (`ringRadius - 120`).

### 5.3 Desenho e gestos sem travar ⚪ — `mobile/src/components/knowledge-map.tsx`

```ts
const scale = useSharedValue(fitScale);            // valores que vivem no thread de interface
const tx = useSharedValue(width / 2);
const ty = useSharedValue(height / 2);
const transform = useDerivedValue(() => [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }]);
...
<Group transform={transform}> ...todos os nós e arestas... </Group>
```

- **Skia** desenha; **Reanimated** move. Caminhos, ícones e posições são calculados **uma vez**.
- Durante arrastar/pinça, **só a transformação do grupo muda**, no thread de interface, sem passar
  pelo JavaScript a cada quadro → **60 fps mesmo com centenas de nós**.

**O toque** (`hitTest`, `graph-layout.ts:133`, chamado em `knowledge-map.tsx:191`):

```ts
const worldX = (event.x - tx.value) / scale.value;     // desfaz a transformação: tela → mundo
const worldY = (event.y - ty.value) / scale.value;
const hit = hitTest(layout, worldX, worldY, 16 / scale.value);   // tolerância de 16 pontos NA TELA
```

Dentro de `hitTest`: distância até a **borda** do nó (`Math.hypot(dx, dy) - node.r`); ganha o mais
próximo abaixo da tolerância.

> Por que `16 / scale`? Com o mapa **afastado** (`scale = 0,5`), 16 pontos de tela são **32 unidades
> do mundo** → a área de toque continua do tamanho de um dedo. Aproximado (`scale = 2`), vira 8.

> **Analogia do PDF:** mapa de papel sobre a mesa. Você não redesenha as ruas a cada movimento; só
> arrasta e aproxima a folha. Skia desenha a folha uma vez; Reanimated só a move.

**Efeitos decorativos:** `AmbientGlow` e `neural-brain` usam `withRepeat`, `withSequence`,
`withTiming` — animam propriedades no thread de interface, não a árvore de componentes. O mapa
também respeita `useReducedMotion` (quem pediu menos movimento no sistema).

---

## 6. O site 🔵

`src/app/globals.css` (Tailwind 4, bloco `@theme`):

```css
@theme {
  --color-bg: #080808;   --color-fg: #eaeaea;   --color-muted: #929292;
  --font-serif: "Newsreader Variable", ..., Georgia, serif;
  --font-sans:  "Instrument Sans Variable", ui-sans-serif, system-ui, ...;
  --ease-soft: cubic-bezier(0.22, 1, 0.36, 1);
}
```

- **Mesmas fontes, tema escuro e hierarquia por cinzas** → identidade comum entre site e app.
  (O site é mais neutro, quase preto e cinza; o roxo é a marca do app.)
- O `body` usa a **serifada** por padrão (`font-family: var(--font-serif)`): o site é de leitura.
- Páginas: início, arquivo, pensamento, pensamentos, categorias, busca, **conversar** (Kally do
  site), sobre, `/admin`.
- O chat do site mostra as fontes em **três grupos**: pensamentos relacionados, fontes da internet,
  documentos de referência.

---

## 7. Decisões e contrapontos 🔵

| Decisão | Ganho | Contraponto |
|---|---|---|
| Expo Router (rotas por arquivo) | estrutura de pastas = mapa do app | renomear arquivo muda a URL; grupos `( )` confundem no começo |
| Tokens centralizados | consistência, contraste medido, troca em um lugar | disciplina: uma cor "solta" numa tela quebra a regra sem aviso |
| Layout radial determinístico | memória espacial, sem custo de simulação | não "se arruma" sozinho como um grafo de forças; muitos nós numa pasta viram vários anéis |
| Skia + transformação no thread de UI | 60 fps | mais complexo que `View`s comuns; a web precisou de `map-canvas.web.tsx` |
| Mesmo código exportado para a web | um código só | `Alert` não existe na web, token em `localStorage`, precisou do `WebFrame` |
| `EXPO_PUBLIC_*` no app | configuração simples | **tudo que é `EXPO_PUBLIC_` vai dentro do app**: nunca colocar segredo ali |

---

## Para a apresentação 🟣

Mostre **três decisões de interface com o motivo**:

1. **Tokens com contraste medido** → acessibilidade (WCAG 4,5 : 1).
2. **Mapa determinístico + transformação no thread de interface** → memória espacial e fluidez.
3. **A correção do "descartar"** → o estado do React só muda na renderização seguinte.
