# Continuidade — visual preto, Kally orbital e conteúdo estruturado

Registro do estado do trabalho para retomar sem depender do histórico da conversa.
Última atualização: 08/11/2026.

## Onde está o trabalho

- Worktree: `C:\Users\satan\Downloads\minha-mente-app`, branch **`app-visual-preto`** (a partir de `d83bfda`, `app-refinamento`).
- **Nada desta branch está commitado** (aguarda o teste no iPhone e a aprovação do dono do projeto). Não há merge nem push.
- O túnel do Expo (`npx expo start --tunnel ngrok --port 8081`, endereço fixo `exp://eu2uiys-56tester-8081.exp.direct`) roda a partir de `mobile/` desta worktree.
- O backend é o `next dev` do checkout principal (`minha-mente`, porta 3000). A mudança em `src/server/kally.ts` desta worktree **não está no ar** até ir para o main e o servidor reiniciar.

## Etapas

| Etapa | Estado |
|---|---|
| Visual preto dominante (tokens, superfícies, abas, telas principais, mapa em constelação) | concluída |
| Símbolo orbital da Kally sem olho: núcleo de luz, perspectiva, partículas; ícone orbital na aba e nas mensagens | concluída |
| Feed priorizando texto (sem imagem decorativa, cards compactos, número na cor da pasta) | concluída |
| Comportamento da Kally: sem emojis por padrão, liberados quando pedidos; regra de formatação rica | concluída (testada no qwen3 4B) |
| Tabelas e diagramas nas respostas, nos pensamentos e no editor | concluída |
| Teste em iPhone real (WebView do diagrama no Expo Go, conversa logada, teclado) | **pendente** (precisa do aparelho e de uma conta) |
| Levar `src/server/kally.ts` ao main e reiniciar o servidor | **pendente** (precisa de autorização) |

## Decisões técnicas

1. **Tiptap**: o editor Tiptap existia no site Next antigo (`src/components/admin/post-editor.tsx` no commit `23bed6f`, com `@tiptap/extension-table`, `@tiptap/markdown` e `details`). Ele saiu quando o site passou a ser o app Expo exportado para a web, e o Tiptap depende de DOM (ProseMirror), o que no iPhone exigiria um editor inteiro dentro de WebView. A estratégia adotada:
   - o formato canônico continua **Markdown GFM**, o mesmo que o Tiptap gravava via `@tiptap/markdown` (tabelas GFM, `:::details`, blocos de código);
   - diagramas são blocos ` ```mermaid `; o `@tiptap/markdown` os preserva como bloco de código com linguagem `mermaid`, então o conteúdo continua compatível se um editor Tiptap voltar;
   - o app reconhece e desenha esses blocos (`components/markdown`) e o editor de posts ganhou editores estruturados para tabela e diagrama.
2. **Mermaid**: desenhado isolado. No celular, numa `react-native-webview` (14.0.1, via `npx expo install`, incluída no Expo Go) que só carrega a página inicial. Na web, num `iframe` com `sandbox="allow-scripts"` (sem mesma origem). O código do diagrama entra como JSON, nunca como HTML; o Mermaid fica em `securityLevel: "strict"`. A biblioteca vem fixada do jsDelivr (`mermaid@11.6.0`); sem conexão, ou com sintaxe inválida, o bloco mostra o código (nada se perde).
3. **Streaming**: um bloco ` ```mermaid ` só é desenhado depois de fechado (`fenceClosed`); antes disso aparece "Diagrama sendo escrito" com as últimas linhas.
4. **Emojis**: nada é filtrado da resposta. O lembrete final do prompt escolhe a variante pela entrada: pedido explícito de emoji (libera), texto da pessoa com emojis (conserva) ou nenhum dos dois (proíbe). O Modo Desenvolvedor (personalidade configurada) não recebe esse lembrete.
5. **Formato rico**: `FORMAT_RULE` (tabela, código, mermaid) fora do papo casual ou quando a mensagem pede estrutura (`WANTS_STRUCTURE`); `structureReminder` reforça no fim do prompt, só quando pedido.

## Arquivos

Novos:
- `mobile/src/lib/structured.ts`: HTML isolado do diagrama, fechamento de bloco, tabela ↔ GFM, localização de blocos no texto.
- `mobile/src/components/markdown/diagram.tsx`: moldura, carregando, erro, código, tela cheia.
- `mobile/src/components/markdown/diagram-surface.tsx` (WebView) e `diagram-surface.web.tsx` (iframe).
- `mobile/src/components/editor/structure-sheets.tsx`: editor de tabela (grade de células, linhas e colunas) e de diagrama (definição com prévia).

Alterados (principais):
- `mobile/src/theme/tokens.ts`: paleta preta, `tint` para seleção.
- `mobile/src/components/markdown/markdown.tsx`: tabelas com largura por conteúdo, linhas alternadas, alinhamento e tela cheia; bloco de código com linguagem; diagramas.
- `mobile/src/app/(app)/editor/[id].tsx`: ferramentas Tabela e Diagrama (inserir ou editar o bloco sob o cursor).
- `mobile/src/app/(app)/(tabs)/perguntar.tsx`: "Abrir no editor" em respostas com estrutura; marca orbital nas mensagens; ícone de clipe no lugar de emoji.
- `mobile/src/components/kally/orbital-skia.tsx` e `kally-orb.tsx`: núcleo de luz sem olho, partículas, perspectiva.
- `mobile/src/components/ui/icon.tsx`: ícones `kally`, `table`, `flow`, `copy`, `expand`.
- `mobile/src/components/post-card.tsx`, `feed.tsx`, `buscar.tsx`, `conta.tsx`, `mapa.tsx`, `knowledge-map.tsx`, `tab-bar.tsx`, `(tabs)/_layout.tsx`, `surface.tsx`, `primitives.tsx`: visual preto e navegação.
- `src/server/kally.ts`: só texto de prompt (`WRITING_RULE`, `FORMAT_RULE`, `writingReminder`, `structureReminder`).
- `mobile/package.json` e `package-lock.json`: `react-native-webview`.
- Removido: `mobile/src/components/ambient-glow.tsx` (aurora de fundo).

## Como validar

```bash
cd mobile && npx tsc --noEmit
```

```bash
cd mobile && npx expo export -p web --output-dir dist-teste
```

No iPhone (Expo Go, `exp://eu2uiys-56tester-8081.exp.direct`): pedir à Kally "compare X, Y e Z em uma tabela" e "faça um fluxograma de …"; conferir a tabela larga (arrastar e tela cheia), o diagrama (desenho, tela cheia com zoom, "Código"), o streaming (o diagrama só aparece ao fechar o bloco) e "Abrir no editor"; no editor, Tabela e Diagrama (inserir, editar no lugar e conferir na Prévia).

## Pendências e riscos conhecidos

- O diagrama no celular depende da WebView do Expo Go; validado no bundle iOS (compila pelo túnel) e na web (iframe), ainda **não no aparelho**.
- Mermaid vem do CDN: precisa de internet na primeira vez em cada sessão. Empacotar a biblioteca no app exigiria um arquivo de ~2,6 MB e foi evitado.
- A referência visual citada nos pedidos não chegou como imagem; o refinamento seguiu só o texto.
- O modelo pequeno às vezes erra a sintaxe Mermaid; nesse caso o bloco mostra o código e o aviso. As instruções pedem rótulos entre aspas para reduzir isso.

## Prompt para retomar

> Continue o trabalho registrado em `mobile/CONTINUIDADE.md` na worktree `minha-mente-app` (branch `app-visual-preto`). Leia o documento, confira `git status`, rode `npx tsc --noEmit` em `mobile/` e siga as pendências na ordem. Não faça commit, merge ou push sem a minha autorização.
