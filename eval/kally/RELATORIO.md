# Avaliação da Kally: modelos isolados × pipeline (Etapa 6)

Data: 3 de novembro de 2026 · Máquina: RTX 2050 (4 GB), 16 GB de RAM, Ollama 0.40.6 · Banco: cópia de testes (mente-dev.db)

## Como foi feita

- **18 casos inéditos** ([casos.json](casos.json)): 5 de estudo (A), 5 de post a partir da fala da pessoa (B), 5 de análise e orientação (C) e 3 com base de documentos (D). Nenhum aparece nos 30 exemplos de referência nem nos testes das etapas anteriores. Para cada caso, o que uma boa resposta precisa ter foi escrito **antes** de gerar qualquer resposta.
- **Configurações** (escolhidas por pedido, só no servidor de testes, com `KALLY_EVAL=1`):

  | Nome | Executor | Interpretador | Competências e bases |
  |---|---|---|---|
  | `producao` | llama3.2 3B | — | não (a Kally de hoje) |
  | `llama` | llama3.2 3B | — | sim |
  | `qwen` | qwen3 4B | — (só regras) | sim |
  | `llama-qwen` | qwen3 4B | llama3.2 3B | sim |
  | `qwen-qwen` | qwen3 4B | qwen3 4B | sim |

  Casos curtos não acionam o interpretador; neles, `qwen`, `llama-qwen` e `qwen-qwen` dariam a mesma resposta. Por isso:
  - casos longos: `producao`, `qwen`, `llama-qwen` e `qwen-qwen`;
  - casos curtos: `producao`, `llama` e `qwen`;
  - casos com documentos: `producao` (sem bases) e `qwen`.

  Ao todo, 60 respostas ([gerar.js](gerar.js)).
- **Notas às cegas:** as respostas de cada caso receberam letras sorteadas, e a configuração só foi revelada depois de todas as notas ([juntar.js](juntar.js)).
  - **Rubrica (0 a 5):** fidelidade (ao pedido, à fala da pessoa ou ao documento), profundidade, coerência, precisão (erros factuais pesam muito), clareza e geral. Boa formatação não soma ponto.
  - **Checagens automáticas** ([checagens.js](checagens.js)): links, cumprimentos, texto cortado, pontos da pessoa presentes nos posts e bases da LGPD citadas.
- As notas e a chave estão em [resultados/](resultados/). As 60 respostas completas ficaram fora do repositório, porque citam títulos de posts reais do ambiente.

## Resultados

### Qualidade (nota geral, média de 0 a 5)

| Grupo | producao | llama | qwen | llama-qwen | qwen-qwen |
|---|---|---|---|---|---|
| Curtos (6) | 1,50 | 1,83 | **3,83** | — | — |
| Longos (9) | 1,56 | — | 2,33 | **3,00** | 2,89 |
| Com documentos (3) | 0,33 | — | **3,67** | — | — |
| **Todos (18)** | **1,33** | — | **3,06** | — | — |

Por critério, em todos os casos: produção → qwen.

| Critério | producao | qwen |
|---|---|---|
| fidelidade | 2,11 | 3,56 |
| profundidade | 1,61 | 3,17 |
| coerência | 2,44 | 3,33 |
| precisão | 1,78 | 2,83 |
| clareza | 2,78 | 3,94 |

### Tempo e memória (medianas)

| Configuração | 1º texto | Resposta completa | Velocidade | Trocas de modelo por pedido | Pico de VRAM | RAM livre mínima |
|---|---|---|---|---|---|---|
| producao | 0,6 s | 10 s | 44 tok/s | 0 | 3,2 GB* | 1,78 GB |
| llama | 1,7 s | 15 s | 42 tok/s | 0 | 2,6 GB | 2,24 GB |
| qwen | 1,6 s | 23 s | 33 tok/s | 0 | 3,2 GB | 0,98 GB |
| qwen-qwen (longos) | 12,3 s | 38 s | 32 tok/s | 0 (interpretação: 10,3 s) | 3,2 GB | 0,61 GB |
| llama-qwen (longos) | 22,3 s | 49 s | 32 tok/s | 11,2 s (interpretação: 11,1 s) | 3,2 GB | 1,08 GB |

\* O pico na configuração de produção inclui o Qwen que já estava carregado de antes. O llama3.2 sozinho ocupa 2,6 GB.

- **Garantia de um modelo de texto por vez:** nas etapas 3 e 5, o vigia do Ollama nunca encontrou dois modelos de texto carregados ao mesmo tempo, nem com pedidos simultâneos para três modelos.

## O que os resultados mostram

1. **O ganho maior vem do modelo.** Os prompts ajudam, mas pouco sozinhos. Nos casos curtos, as competências com o llama3.2 subiram a nota de 1,50 para 1,83; o Qwen com as mesmas competências chegou a 3,83. O llama3.2 com o prompt de competência ainda teve um defeito em todas as 6 respostas: começar com a palavra "assistant", um vazamento do formato de conversa provocado pelo lembrete final.
2. **A base de documentos é a alavanca mais forte para precisão.**
   - LGPD: sem a base, a produção inventou números de artigos e bases inexistentes (nota 0). Com a base, nove das dez bases saíram corretas (nota 4).
   - Plano da disciplina: sem a base, um plano genérico; com ela, o plano seguiu as 6 unidades do programa salvo.
   - Post das anotações de corrida: sem a base, tudo inventado; com ela, 10 de 10 fatos presentes.
3. **O interpretador vale para textos longos.** Só com as regras, vários pedidos longos caíram na conversa comum (o Qwen respondeu "Ah, isso é lindo 😊" a quem pedia um post). Com interpretador, a competência certa foi escolhida em todos os 9 casos longos, e todos os pontos da pessoa entraram nos posts (8/8, 8/8, 6/6).
4. **Llama ou Qwen como interpretador: empate técnico na qualidade**, com 3,00 contra 2,89 em 9 casos, diferença dentro do ruído de uma amostra tão pequena. A diferença real está no custo:
   - o Llama exige descarregar o Qwen e recarregá-lo (~11 s por pedido);
   - o primeiro texto sai ~10 s mais tarde (22 s contra 12 s).
5. **Fraquezas que continuam**, todas medidas:
   - **Precisão sem documentos:**
     - isomeria: todas as respostas fracas, com exemplos errados ("etanona");
     - Primeira Guerra: o Qwen trocou datas (o certo é 28 de junho de 1914) e inventou uma "Guerra do Congo";
     - o modelo de 4B não sabe o bastante desses assuntos.
   - **Posts:** ficaram fiéis nos fatos, mas ainda acrescentam reflexões; em dois casos, a última frase do post repetia o pedido.
   - **Análise e orientação:**
     - o formato de análise apareceu em pedidos de plano ("falhas de raciocínio no pedido");
     - no plano do concurso, nenhuma resposta mandou conferir os pesos no edital;
     - uma resposta inventou um estudo ("estudo da USP, 70%") como exemplo.
6. **O `/post` só com o tema** é o caso em que a produção mais falha: ela inventou uma viagem inteira. Com a regra da Etapa 4, a Kally faz uma pergunta.

## Recomendação

Em ordem de prioridade (qualidade, custo, velocidade, memória):

1. **Levar o pipeline para produção com o qwen3 4B como executor**, competências e bases. A nota média subiu de 1,33 para 3,06 (de 0,33 para 3,67 com documentos). O custo é zero. A resposta completa fica mais lenta (mediana de 23 s contra 10 s), porque é mais longa e o Qwen gera 33 tok/s contra 44.
2. **Interpretador: usar o próprio Qwen (`qwen-qwen`) como padrão**, mantendo o Llama como opção (`KALLY_INTERPRETER_MODEL`). A qualidade empatou; o Qwen elimina as trocas de modelo e dá o primeiro texto ~10 s mais cedo. Isso diverge do desenho original (Llama interpretando). A decisão é sua; ela muda uma variável e nenhum código.
3. **Alimentar a base institucional** com materiais de referência dos assuntos estudados no Minha Mente. É o que mais corrige a precisão.
4. **Ajustes pequenos já identificados:**
   - separar o formato de análise do formato de plano na competência C;
   - pedir que planos de concurso indiquem conferir o edital;
   - tirar do post a repetição do pedido;
   - para executores que não sejam Qwen, pôr o lembrete final dentro da mensagem, e não como mensagem de sistema.

## Limitações

- **Um avaliador só** (eu, Claude), que também escreveu os 30 exemplos de referência. As notas foram dadas às cegas e contra critérios escritos antes, mas convém conferir uma amostra. Sugestões: B4 (a viagem inventada), D1 (LGPD), A2 (API REST) e C2 (EAD).
- **Amostra pequena:** 3 a 9 respostas por grupo. Diferenças menores que ~0,5 ponto não são conclusivas.
- **Configuração da produção:** foi medida com as configurações novas do Ollama (camadas na placa, cache de contexto compacto) e com a busca por significado nova; os tempos da Kally de hoje são um pouco maiores.
- **Cobertura:** casos longos em português, sem histórico de conversa e sem busca na internet.
