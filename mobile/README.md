# Minha Mente — app (React Native + Expo)

Aplicativo do Minha Mente para iPhone/Android, aberto pelo **Expo Go** (SDK 58).
O backend continua sendo o Next.js da raiz do repositório: o app consome a API
`/api/mobile/*` por HTTP e reaproveita as regras, a autenticação e o banco existentes.

## Rodar no iPhone

1. Instale o **Expo Go** pela App Store.
2. Deixe o backend ligado no computador (`npm run dev` na raiz, porta 3000).
3. Celular e computador na **mesma rede Wi-Fi**.
4. Nesta pasta:

   ```bash
   npm run lan
   ```

5. Abra a **Câmera** do iPhone, aponte para o QR Code do terminal e toque em "Abrir no Expo Go".

Se o computador tiver várias redes (VPN, WSL), fixe o IP do Wi-Fi que o Expo anuncia:

```bash
REACT_NATIVE_PACKAGER_HOSTNAME=192.168.1.108 npm run lan
```

O Expo SDK 58 exige Node `^22.13 || ^24.3`. Neste computador o `node` padrão é o 23.5;
use o Node 24 (`C:\Users\satan\node_modules\node\bin\node.exe`) para os comandos do Expo.

## Endereço do backend

`src/lib/config.ts` decide, nesta ordem:

| Situação | Como configurar | Endereço usado |
|---|---|---|
| Internet / produção | `EXPO_PUBLIC_API_URL=https://minhamente.space` em `mobile/.env` | o valor definido (HTTPS) |
| Mesmo Wi-Fi (padrão) | nada | IP do computador que serve o app + `EXPO_PUBLIC_API_PORT` (3000) |
| Navegador do próprio PC | nada | `http://localhost:3000` |

`npm run tunnel` (Expo pela internet) não alcança o backend local: use junto com
`EXPO_PUBLIC_API_URL=https://minhamente.space`. A tela **Conta** e o rodapé do login
mostram qual servidor está em uso.

## Arquitetura

```
mobile/
  src/app/            telas (Expo Router: cada arquivo é uma rota)
    (tabs)/           Início, Buscar, Mapa, Perguntar, Conta
    post/[slug]       leitura + leitura assistida + relacionados
    categoria/[slug]  pasta
    editor/[id]       criar/editar (admin)
    painel/           pensamentos, categorias, configurações (admin)
  src/components/     sistema visual, Markdown nativo, mapa (Skia), ilustração do login
  src/lib/            API, sessão, configuração, layout do grafo, uploads
  src/theme/tokens.ts cores, tipografia, espaçamentos
```

- **Código compartilhado**: `@shared/*` aponta para `../src/lib` (slug, texto, datas, cores)
  e `@content/*` para `../src/content` (texto "Sobre"). Configurado em `tsconfig.json` e `metro.config.js`.
- **Autenticação**: `POST /api/mobile/auth/login` (credenciais configuradas no backend) ou
  `/auth/guest` devolvem um token JWT assinado com o `SESSION_SECRET` do backend, guardado no
  Keychain (`expo-secure-store`) e enviado como `Authorization: Bearer`. No backend,
  `getSession()`/`getAccessRole()` aceitam esse token quando não há cookie, então todas as
  regras existentes (posts privados, `requireAdmin`, upload, leitura assistida, chat) valem igual.
- **Mapa de arquivos**: `GET /api/mobile/map` monta o grafo só com relações que já existem:
  pensamento → pasta (categorias), pensamento → imagem (imagens citadas no Markdown) e
  pensamento → pensamento (links `/pensamento/...` no texto). Layout por `d3-force`, desenho com
  React Native Skia e gestos (arrastar, pinça, toque) com Gesture Handler + Reanimated.
- **Editor**: Markdown com barra de formatação e prévia (o mesmo formato dos pensamentos antigos,
  escritos no editor da primeira versão do site).

## Verificações

```bash
npm run typecheck   # TypeScript
npm run doctor      # expo-doctor (compatibilidade com a SDK)
npx expo export --platform ios   # empacota como o Expo Go recebe
```

### Web

A versão web publicada é a raiz do site (`minhamente.space/`), servida pelo próprio Next:

```bash
npm run export:web   # exporta para ../public (index.html, _expo/, assets/…)
```

O build web usa a origem da página como endereço da API (sem CORS). Na web as abas viram barra
lateral a partir de 768 px e o conteúdo tem largura máxima de leitura (`src/theme/layout.ts`).

Para desenvolver no navegador do PC com recarga automática:

```bash
npm run web:setup   # copia o CanvasKit do Skia para public/
npm run web
```

Nesse modo o navegador exige CORS: defina `MOBILE_WEB_ORIGIN=http://localhost:8081` no backend
que for usado. O app nativo não precisa disso.

## Limitações conhecidas (Expo Go / estado atual)

- **Editor**: não é visual (WYSIWYG); é Markdown com barra de ferramentas e prévia.
  Tabelas e blocos recolhíveis entram por modelos prontos.
- **Fórmulas matemáticas**: o backend não renderiza fórmulas, então o app não as exibe.
- **Anexos/PDFs e gerenciamento de usuários**: não existem no backend atual (há um administrador e
  um leitor configurados por variáveis de ambiente). Nada foi removido; não há o que adaptar ainda.
- **Ditado por voz no editor** (Whisper): o editor do app não tem; o áudio entra pela Kally.
- **Leitura assistida**: guardada só enquanto o app está aberto.
- **Pinça no mapa**: testada só no código e no navegador com botões de zoom; o gesto de dois dedos
  precisa ser conferido no aparelho.
