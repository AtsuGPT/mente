# Kally Intelligence — relatório técnico (17/11/2026)

Evolução do entendimento, do planejamento de resposta, da naturalidade, da memória de aprendizagem, dos recursos interativos, dos artefatos e dos arquivos da Kally. Branch `kally-intelligence` (a partir de `main` em `1f74a0c`). Tudo o que está aqui foi medido ou testado; o que não foi está marcado como pendência.

## 1. Diagnóstico da implementação anterior

| Problema | Onde | Efeito medido ou observado |
| --- | --- | --- |
| Intenção decidida por palavras soltas, sem nível de confiança | `detectIntent` (`src/server/kally.ts`) | 73% de tratamento certo em 48 mensagens diretas; 67% num conjunto separado |
| Interpretador só para mensagens de 280+ caracteres ou com anexo | `needsInterpretation` (`pipeline.ts`) | "Não entendi essa parte", "aquilo deu errado", "transforma aquela ideia em algo publicável" nunca eram interpretadas: 4 de 13 mensagens de contexto tratadas certo por acaso |
| O interpretador via só os 600 primeiros caracteres da última resposta | `interpret` | Sem como saber a que "essa parte" se refere |
| Tamanho fixo por competência no modelo remoto ("estudo: 900 a 1.500 palavras", "conversa: 250 a 700") e "desenvolva com nuances e exceções" em qualquer pedido | `remote-style.ts` | Respostas longas por obrigação; Freud em 736 palavras com 7 seções e "Resumo rápido" |
| Metas de palavras nas competências | `competences/estudo.ts`, `analise.ts` | Idem, no modelo local |
| Fecho com pergunta incentivado em toda resposta | `help.ts` | "Ficou claro?", "Qual dessas situações se aplica?" |
| **Defeito**: interpretação "orientacao" virava análise crítica | `competenceFor` (`pipeline.ts`): tudo que não fosse estudo/post/conversa caía em "analise" | Plano de estudo respondido como crítica de argumento |
| Nenhum registro de progresso de estudo | — | O resultado do quiz voltava só como texto livre |
| Decisões espalhadas na rota (1.130 linhas): post em andamento, prova, casual, interpretador, competência | `kally/route.ts` | Difícil de testar e de manter |
| Pedidos de arquivo naturais não reconhecidos; o PDF só nascia no clique de "Baixar" | `artifacts/intent.ts` | "Organiza nossas explicações em um documento" virava texto comum |
| `clicar()` do teste de artefatos não funcionava em SVG | `runtime.ts` | "el.click is not a function" forçava conserto à toa |
| Sem executor de testes; ESLint quebrado | `package.json` | Só `tsc` validava o código |

## 2. Arquitetura final

```
mensagem ──► rota da Kally
              │
              ├─ artefato/arquivo? ──► artifacts/turn.ts (criar, editar, explicar, listar, exportar)
              │
              ├─ entendimento (understand.ts)
              │    roteador rápido (sem modelo): certa | ambígua | desconhecida
              │    └─ só se não for "certa": interpretador (pipeline.ts, com as 3 últimas trocas)
              │    settle(): tipo final, modo, casual, referência, tema
              │
              ├─ competência (tipo → competences/; regras antigas só para tipos que não a definem)
              ├─ plano de resposta (plan.ts): esforço rápido | normal | profundo, raciocínio, teto de tokens,
              │                               extensão sem número de palavras
              ├─ aprendizagem (learning.ts): registra quiz; contexto curto de estudo; cartão de progresso
              ├─ guia do executor: interpretação + referência + histórico de estudo + aviso contra excesso
              ├─ geração (local / remoto / Kally Coding, como antes)
              └─ pós: conferência de quizzes (quiz-check.ts), blocos interativos validados (blocks.ts),
                      cartão de progresso do banco, registro de explicação/dúvida (só conversa salva)
```

Tipos de pedido (`intent-kinds.ts`): casual, relato, pergunta, ensino, esclarecimento, continuacao, depuracao, programacao, conta, prova, publicacao, revisao, analise, orientacao.

## 3. Arquivos

**Novos:** `src/server/kally/understand.ts`, `intent-kinds.ts`, `plan.ts`, `style-lint.ts`, `learning.ts`, `blocks.ts`; `src/server/artifacts/files.ts`; rotas `kally/progresso` e `kally/arquivos/[id]`; no app, `components/markdown/choices.tsx`, `progress.tsx`, `components/kally-file-card.tsx`, `lib/blocks.ts`; `tests/` (unitários, bancadas e `tests/e2e/`).

**Modificados:** `kally/route.ts` (entendimento, plano, aprendizagem, blocos), `pipeline.ts` (interpretador com histórico e campos novos; defeito da orientação), `remote-style.ts`, `help.ts`, `personality.ts`, `competences/estudo.ts` e `analise.ts` (sem metas de palavras), `artifacts/intent.ts`, `prompt.ts`, `runtime.ts`, `turn.ts`, `prisma/schema.prisma` (2 modelos novos, só aditivos), no app `perguntar.tsx`, `markdown.tsx`, `quiz.tsx`, `artifact-file.ts`, `stream.ts`; `package.json` (`npm test`).

**Removido:** `needsInterpretation` (`pipeline.ts`), substituída pelo roteador rápido; nenhuma outra referência a ela existia.

## 4. Recursos implementados

1. **Entendimento em duas etapas.** O roteador decide sozinho só o que é inequívoco (comandos, modos escolhidos, cumprimento e agradecimento, prova com alternativas, código, contas com números, plano de estudo, relato pessoal sem pedido). Mensagem curta no meio da conversa, referência a algo anterior ("isso", "essa parte", "deu errado"), texto longo e anexo vão ao interpretador, que recebe as 3 últimas trocas e devolve tipo, referência, tema e esforço. Evidência explícita de "não entendi" vale mais que um "pergunta" genérico do interpretador. O interpretador não concede nada: sem permissão de publicar, "publicacao" vira conversa.
2. **Plano de resposta.** O esforço sai do tipo de pedido, não do tamanho da mensagem. Rápido (papo, relato): só personalidade e naturalidade no prompt (cerca de 2.500 tokens a menos), teto baixo. Normal: "o necessário para entender e usar". Profundo (código, contas, prova, análise, documento grande): planejar e conferir. O raciocínio só liga em código, contas e prova, e não por causa da palavra "prova" num plano de estudo ou num relato. O esforço escolhido pela pessoa (Aprofundado/Máximo) continua por cima.
3. **Naturalidade.** Sem metas de palavras; regra explícita contra elogio, repetir o pedido, saudação, conclusão genérica, pergunta obrigatória no fim, títulos em resposta curta e emoji; fecho sem pergunta genérica. Esclarecimento: só a parte não entendida, de outro jeito. Depuração: parte do que já foi tentado.
4. **Verificador de estilo** (`style-lint.ts`, sem modelo) para medir esses vícios.
5. **Memória de aprendizagem.** Assunto, explicações, dúvidas, quizzes, acertos, pontos fracos e datas no banco. Progresso ≠ domínio: domínio só com 2+ quizzes, 6+ questões, último ≥ 80% e acerto total ≥ 75%. Revisão espaçada (1, 3 ou 7 dias); sugestão de revisão só em pedido de estudo, no máximo a cada 3 dias por assunto e nunca por 14 dias depois de recusada. No prompt entra só um resumo dos assuntos ligados à mensagem. Só conversa salva grava (como a memória pessoal). A pessoa vê e apaga em `GET/DELETE /kally/progresso`.
6. **Recursos interativos.** ```escolhas (orientação sem resposta certa: o toque manda a opção como próxima mensagem) e ```progresso (barra e etapas) como componentes nativos; o quiz ganhou a linha `tema:` e manda o resultado estruturado. O servidor valida os blocos e converte o que estiver fora do contrato em lista comum. Contra excesso: no máximo um recurso por resposta e, se houve escolhas ou quiz nas duas últimas respostas, a Kally é avisada para não repetir.
7. **Artefatos.** Níveis visuais (básico, intermediário, avançado, 3D), Three.js r147 com OrbitControls e conferência de WebGL (com versão 2D de reserva), regras de fidelidade para anatomia, circuitos e algoritmos. O teste no navegador passou a reprovar rótulos sobrepostos (2+ pares) e texto menor que 8 px numa tela de 380 px. Conserto só de layout roda sem raciocínio, com teto de 90 s.
8. **Arquivos.** "Transforma isso em PDF", "cria uma apostila desse conteúdo", "organiza nossas explicações em um documento" e "faz um relatório para baixar" são reconhecidos. Com artefato na conversa, ele é exportado direto, sem modelo; sem artefato, um documento é montado a partir da conversa. O servidor gera o arquivo, conta as páginas e só então anuncia, com um cartão de download. O arquivo fica 24 horas e só quem pediu, no mesmo ambiente, baixa.

## 5 e 6. Problemas encontrados durante o trabalho e correções

| Problema | Como apareceu | Correção |
| --- | --- | --- |
| As regras do roteador decoraram o conjunto de ajuste (100%) e não generalizaram (71% no conjunto separado) | Conjunto separado escrito depois, rodado uma vez | Mudança estrutural: as "redes de pegar tudo" e mensagens curtas no meio da conversa vão ao interpretador |
| `\b` do JavaScript não reconhece fim de palavra acentuada ("tô", "é", "Olá") | Testes | Fim de palavra explícito `(?=[\s,.!?;:]|$)` |
| Import circular entre `understand.ts` e `pipeline.ts` | Revisão | `intent-kinds.ts` à parte |
| "valeu, ajudou demais" ia ao interpretador (+7 s) | Bateria | Agradecimento é decidido pelo roteador |
| Plano de estudo "pra prova" virava pedido de prova e ligava o raciocínio (34 s até o 1º texto) | Bateria | Plano é orientação; raciocínio desligado em orientação, relato e post. Medido de novo: 4 s, 1º texto em 1 s |
| "o que eu já estudei?" passava pelo interpretador e buscava posts (~6 s) | Bateria | Decidido pelo roteador, sem busca nos posts |
| Abertura "Entendi: você quer…" | Leitura das respostas | Regra no estilo remoto, nas regras de post e na personalidade; o verificador passou a pegar |
| Conserto de rótulos de 8,1 px levou ~5 min (raciocínio num artefato de 600 linhas) | Bateria de artefatos | Conserto de layout sem raciocínio, teto de 90 s; limite de 8 px |
| Erro meu na asserção do teste de memória (esperava "dominado" com último quiz em 75%) | Teste de ponta a ponta | Asserção corrigida; o sistema estava certo |

## 7. Decisões técnicas

- **Híbrido em vez de só interpretador:** o interpretador custa ~2,5 s e um pedido à API; o roteador resolve sozinho 56% a 76% das mensagens (conforme o conjunto) com 1 erro em 65 decisões medidas (47 + 18).
- **Interpretador com o modelo principal**, não o DeepSeek: o DeepSeek ficou para código, artefatos e contas, como decidido em 15/11.
- **Domínio só com evidência:** explicar não prova aprendizagem; um quiz perfeito isolado também não.
- **Conversa temporária não grava aprendizagem:** é a promessa da conversa temporária (a memória pessoal segue a mesma regra). O custo é que quem só usa conversa temporária não acumula progresso.
- **Componentes nativos para escolhas e progresso**, com contrato validado, em vez de o modelo gerar interface.
- **Cartão de progresso montado pelo servidor** com os dados do banco: o modelo comenta, mas não escreve os números.
- **3D só quando ensina:** "prefira um esquema 2D correto a um 3D impreciso" está no prompt; Three.js r147 porque é a última com build global e controles sem módulos.
- **PDF antes do anúncio:** o texto "Arquivo pronto" é escrito pelo servidor depois de gerar o arquivo, não pelo modelo.

## 8. Testes

- **Unitários** (`npm test`, 19 testes): roteador e permissões, verificador de estilo, aprendizagem (assunto, domínio, revisão, validação do quiz, cartão), blocos, pedidos de arquivo. Todos passam.
- **Tipos:** `tsc --noEmit` do servidor e do app passam.
- **Build:** `next build --webpack` passa. Com Turbopack, o build falha **na worktree** porque o Next vem da pasta de cima; no checkout principal (onde a publicação compila) isso não acontece.
- **ESLint:** não roda. O `typescript-eslint` instalado não suporta o TypeScript 7 do projeto. Já era assim; não foi mexido.
- **Ponta a ponta** (sites de teste com cópias do banco e contas de teste só nas cópias):
  - memória de aprendizagem: 8/8 (explicação registrada como progresso; um quiz perfeito não é domínio; dois quizzes com último em 75% continuam "estudando"; ponto fraco registrado; nome do assunto; cartão de progresso; isolamento entre contas no mesmo ambiente, pela API e pela resposta);
  - arquivo: 6/6 (PDF gerado em 2,9 s sem modelo, anunciado depois de pronto, download válido, outra conta 404, sem login 401);
  - checagem visual nova: 3/3 páginas sintéticas (boa passa; sobreposta e minúscula reprovam com mensagem acionável).
- **Regressão:** login (401 sem credencial), permissões (testes), modos manuais (testes), post com cartão de publicar (bateria), memória, seleção local/remoto/Kally Coding, streaming, artefatos e exportação (bateria). **Não testados ao vivo:** modo desenvolvedor, revisão de textos e anexos (o código desses caminhos não mudou, mas eles passam pela rota alterada).

## 9. Benchmarks antes/depois

### Entendimento (sem modelo e com o interpretador de verdade)

| | Antes | Depois |
| --- | --- | --- |
| Conjunto de ajuste, 62 mensagens (tratamento certo) | 39/62 (63%)¹ | 62/62 (100%) |
| Conjunto separado, 32 mensagens (tratamento certo) | 20/32 (63%) | 26/32 (81%) na 1ª rodada; 27/32 (84%) depois da regra do "não entendi"² |
| Mensagens de contexto tratadas certo | 4/13 e 4/8 (por acaso) | 13/13 e 6/8 |
| Chamadas ao interpretador | só mensagens de 280+ caracteres | 24% (ajuste) e 44% (separado) das mensagens, ~2,5 s cada |

¹ 35/48 diretas + 4/13 de contexto + a longa. ² A regra veio de um erro do conjunto de ajuste, mas também acerta um caso do separado; o interpretador varia entre rodadas.

### Respostas (20 pedidos, uma rodada em cada versão, sites de teste em modo de desenvolvimento)

| | Antes | Depois |
| --- | --- | --- |
| Tempo total médio | 8,5 s | 9,8 s (1ª rodada; com as correções da bateria, o caso de 40 s caiu para 4 s e o de 8 s para 2 s) |
| 1º texto, média | 4,5 s | 6,6 s (1ª rodada) |
| Palavras, média | 342 | 249 (−27%) |
| Vícios de estilo (verificador) | 3 | 0 (o verificador ainda não pegava "Entendi: você quer", achado na leitura e corrigido depois) |
| Pedidos ao modelo remoto | 14/20 | 17/20 (as 3 mensagens de contexto passaram a ir ao modelo grande) |
| Tokens de prompt (soma) | 118.946 | 151.825 (+28%) |
| Tokens de saída (soma) | 16.237 | 16.075 |
| Contas (integral de x·sen x = π; capacitor = 1,62 V) | 2/2 certas | 2/2 certas |
| Código (remover duplicados, executado) | certo | certo |

**Leitura manual (exemplos):**
- **"Não entendi essa parte da pilha":** antes, a mesma explicação abstrata com "Em resumo"; depois, a analogia da pilha de pratos e o fatorial(4) quadro a quadro.
- **"Meu código continua retornando null":** antes, as mesmas três causas da resposta anterior; depois, parte do que já foi tentado e dá um diagnóstico em passos (inclusive iframe e shadow DOM).
- **"Transforma aquela ideia em algo publicável":** antes, um artigo genérico, em segunda pessoa e com tabela, **sem rascunho** (sem o cartão de publicar); depois, rascunho na voz da pessoa, fiel ao que ela disse.
- **Freud e mitose:** depois, mais direto e proporcional; antes, mais extenso e com estrutura de relatório. Antes cobria mais tópicos (ego, id, superego, críticas), não pedidos.
- **Plano de anatomia:** os dois úteis; o novo, enxuto e no cartão de progresso; o antigo, com tabela, estratégias e erros comuns.
- **Regressão:** "Aprendi a programar hoje!" ganhou uma oferta de ajuda não pedida no fim.

### Artefatos (2 pedidos, uma amostra por versão)

| | Antes | Depois |
| --- | --- | --- |
| Encéfalo | 152 s, 533 linhas, teste ok, silhueta única dividida em lobos | 212 s, 268 linhas, **teste da Kally falhou**, lobos como formas soltas |
| Computador | 25 s, 365 linhas, teste ok | 349 s, 600 linhas, teste ok (5 min num conserto de texto pequeno; corrigido depois, sem nova medição) |

Com uma amostra por lado, a qualidade visual **não teve melhora comprovada**: o encéfalo antigo saiu melhor. As checagens novas medem legibilidade, não fidelidade de forma.

## 10. Desempenho e custo

- **Gasto dos testes de 17/11:** cerca de US$ 0,12 (US$ 0,108 nos registros dos dois sites, mais ~US$ 0,01 estimado da bancada do interpretador), dentro do limite de US$ 0,15. A rodada de artefatos foi a mais cara (US$ 0,056).
- **Interpretador:** acrescenta ~2,5 s e um pedido curto ao modelo principal em 24% a 44% das mensagens. Nas mensagens de contexto, o 1º texto subiu de 1 a 2 s para 6 a 16 s, em troca de respostas que retomam a conversa de verdade.
- **Tokens:** +28% de prompt na bateria, quase todos das mensagens de contexto que passaram a ir ao modelo grande; no papo, o prompt diminuiu.

## 11. Limitações conhecidas

- Os números de resposta e de artefato vêm de **uma rodada** de 20 e 2 pedidos; a variação entre rodadas não foi medida.
- Qualidade visual dos artefatos: nada comprovado como melhor.
- Correções feitas depois da bateria (abertura "Entendi:" no post, sublistas no progresso, busca no pedido de progresso, conserto de layout rápido) foram testadas só em parte ou não foram medidas de novo, por causa do limite de custo.
- Mensagens de contexto ficaram mais lentas (interpretador e modelo maior).
- A aprendizagem não grava em conversa temporária, e o tema de uma explicação só é registrado quando vem do interpretador, de um quiz ou de um pedido simples ("me explica X").
- O cartão de arquivo some ao recarregar uma conversa salva (o texto "Arquivo pronto" fica; o arquivo vale 24 horas).
- Modo desenvolvedor, revisão de textos e anexos não foram exercitados ao vivo.
- ESLint do projeto não roda (dependência incompatível com TypeScript 7).

## 12. Melhorias recomendadas

1. Repetir as baterias com 3 rodadas por pedido para medir a variação, antes de novas mudanças de prompt.
2. Artefatos de anatomia: uma biblioteca de contornos de referência (SVG validados) em vez de desenho livre do modelo.
3. Cache do interpretador por conversa, para "e no caso de…" seguidos não pagarem 2,5 s cada.
4. Tema da explicação extraído junto com a resposta (sem chamada extra), para o progresso registrar mais assuntos.
5. Corrigir o ESLint (atualizar o `typescript-eslint` ou fixar o TypeScript na versão suportada).
6. Tela de progresso no app, usando `GET /kally/progresso`.

## 13. Arquivos removidos

Nenhum arquivo removido. Removida só a função `needsInterpretation` (sem referências). Limpeza fora do repositório: a worktree temporária da versão antiga, as pastas de build de teste e os arquivos e registros dos sites de teste.

## 14. Git

Commits da branch `kally-intelligence` (do mais antigo ao mais novo): `776af73` entendimento e plano; `ce838ac` verificador de estilo; `ca12760` memória de aprendizagem; `994f970` escolhas e progresso; `8e65e21` artefatos; `416e867` arquivos; `6dd6158` limpeza; `22d33d3` regra do "não entendi" e bancada; `9375122` e `90ebd8a` correções da bateria; `72ec2df` conserto de layout rápido; e este relatório. Revisado o diff completo: nenhum segredo, nenhuma alteração fora do escopo (`tsconfig.json` modificado pelo `next dev` e o arquivo pessoal `fdvfrf` ficaram de fora). Integração na `main` por avanço rápido, sem force push; a publicação aplica as tabelas novas com `prisma db push` (só aditivo, com backup antes).

### Atualização do Next.js e publicação (17/11/2026, fim do dia)

O build de produção foi bloqueado pelo próprio Next.js (`SecurityFatalError`): a versão 16.4.3 tem duas falhas moderadas de vazamento de cache ([GHSA-mfr8-8qww-v76h](https://github.com/advisories/GHSA-mfr8-8qww-v76h) e [GHSA-vc7v-qv4w-wrv8](https://github.com/advisories/GHSA-vc7v-qv4w-wrv8)), ligadas a `'use cache'` e `unstable_cache`. O projeto não usa nenhum dos dois (nenhuma ocorrência em `src/`), então o site não estava exposto, mas o build não passava. Com o OK do dono do projeto, o Next e o `eslint-config-next` foram para 16.4.6 (só os pacotes do Next mudaram no lockfile) no commit `a0a2317`.

Publicado com `publicar.ps1`: build em `.next-a`, backup do banco, `prisma db push` criou as duas tabelas novas (só aditivo), site no ar respondendo, cabeçalho de segurança presente, rotas novas recusando quem não está logado e os componentes novos (escolhas, progresso, cartão de arquivo) no pacote do app web. O app do celular foi atualizado no link fixo. `main` e o GitHub estão em `a0a2317` mais este registro.
