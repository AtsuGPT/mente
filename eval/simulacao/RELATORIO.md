# Simulação da Kally: rodada 1, diagnóstico e otimização

Data: 8 de novembro de 2026.

Ambiente: "Treinamento Kally" no app em produção (minhamente.space), com 10 personas fictícias, e uma instância local de teste para comparar versões.

Juiz: Claude, numa sessão, às cegas, pela [rubrica](rubrica.md).

## 1. O que foi feito

- **Rodada 1 em produção:**
  - 35 ações das personas: 11 posts, 7 documentos pessoais, 3 rascunhos escritos pela Kally e publicados, 20 conversas;
  - a prova de 40 perguntas com RAG (25 de núcleo, 10 novas, 5 armadilhas);
  - as 36 perguntas elegíveis repetidas num ambiente vazio, o controle sem RAG.
- **Correção:** 95 itens corrigidos pelo juiz (19 interações e 76 respostas da prova), com justificativa em [notas-juiz-sessao.json](resultados/rodada-01/notas-juiz-sessao.json), e checagens automáticas em [checagens.json](resultados/rodada-01/checagens.json).
- **Recuperação isolada:** `qwen3-embedding:0.6b` real (o mesmo do servidor), rodado aqui na CPU via Ollama ([eval/embeddings](../embeddings/resultados/2026-11-08-qwen3-embedding_0.6b.md)).
- **Teste A/B local:** o conteúdo da rodada 1 replicado numa instância local com o mesmo modelo executor da produção (`qwen3:4b-instruct-2507-q4_K_M`), e as mesmas 40 perguntas na versão de produção e nas versões corrigidas.

## 2. Resultado da rodada 1 (produção)

| | Com RAG | Sem RAG (controle) |
|---|---|---|
| Nota média (0–5) | **2,55** | 1,22 |
| Respostas 5/5 | 33% | 6% |
| Fatos completos | 32% | 0% |
| Fonte certa recuperada | 42% | — |
| Armadilhas: disse que não encontrou | 75% | 75% |
| Erro factual (precisão ≤ 2) | 55% | 92% |
| Tempo mediano | 2,9 s | 2,6 s |

- **Ganho atribuível à recuperação: +1,22.**
- **Interações das personas:** nota média **2,05**, 5% com nota 5/5. Tempo mediano por resposta: 22 s.
- **Privacidade: 1 vazamento grave.** O post de divulgação que a Kally escreveu para a Sônia levou dados do documento pessoal dela (faturamento, aluguel e o código de conferência). Publicado, esses dados chegaram ao Igor na pergunta seguinte. Nas sondagens diretas sobre documentos e conversas privados, nada vazou.

Relatório completo: [resultados/rodada-01/relatorio.md](resultados/rodada-01/relatorio.md).

## 3. Diagnóstico: por que a Kally errou

Cada causa foi encontrada no código e conferida com as mensagens reais ([analise-busca.md](resultados/rodada-01/analise-busca.md)).

| Causa | Evidência | Componente |
|---|---|---|
| Mensagem curta sem "?" era tratada como papo casual: sem memória, sem documentos e com resposta curta | 9 das 40 perguntas da prova ("qnd é a prova de residencia da carla") | Interpretação (`detectIntent`) |
| "Plano de estudo" e "como organizo" acionavam a análise crítica | O plano da Carla e a caderneta do João viraram "premissas falsas" | Interpretação (`ANALYSIS_RULE`) |
| "Revisão" como substantivo ativava o modo Revisar | "a revisão dele" (Igor) | Interpretação |
| Pergunta de informação que cita "post" ou "publicar" virava pedido de post | "o que é preciso publicar no fim do ciclo?" | Interpretação |
| A regra dizia que todo post era do "dono do ambiente", e os posts chegavam sem autor | A Kally disse ao Rafael que a redação do Dudu era dele; respondeu como a Marta | Organização do contexto |
| O nome de quem escreveu não contava na busca de posts | "o EP do Theo", "o estudo da Luíza" sem fonte | Recuperação (posts) |
| As conversas salvas nunca passavam do filtro do modo conversa (nota dividida por 2 e filtro de 0,4) | A conversa do João (cosseno 0,61) ficava de fora | Recuperação (bug) |
| O rascunho de post recebia os documentos pessoais da autora | O post da Sônia | Geração e privacidade |
| O modo conversa tinha teto de 800 tokens | Código do Rafael e conta da Sônia cortados | Geração |
| Regras do ambiente completadas com o que é comum | "não há limite no Diário", "o ambiente é gratuito" | Geração |
| Sem o interpretador, a profundidade era sempre média | "explica rapidinho" virou seis seções | Geração |

**Recuperação isolada** (`qwen3-embedding:0.6b`, conjuntos de calibração e avaliação):
- Trechos de 600 caracteres, em vez de 1.100, deixam o trecho certo em 1º lugar em 82% e 83% das perguntas (calibração e avaliação), contra 68% e 61%.
- Com trechos de 600, o corte em 0,40 entrega o trecho certo em 100% e 94% das perguntas, contra 93% e 89% com 0,45.
- Overlap, peso das palavras e trecho de 900 não melhoraram nos dois conjuntos e ficaram de fora.
- **Nenhum limiar separa as perguntas sem resposta de assunto próximo** (cosseno mediano 0,59) das que têm resposta (0,50). A resistência a inventar tem de vir da geração.
- O documento revogado ganha do vigente em 6 perguntas: a busca não distingue versões.

## 4. Correções aplicadas

Cada correção é um commit separado, com a evidência na mensagem.

| Commit | Correção | Medida antes de aplicar |
|---|---|---|
| `8107a2c` | Papo casual só sem pergunta nem pedido | 9/40 → 0/40 perguntas sem busca; 12/12 casuais de verdade continuam casuais |
| `9de2446` | "Revisão" substantivo não ativa Revisar | Mensagens reais da rodada |
| `6af74c4` | Pergunta de informação não vira pedido de post | Os 3 pedidos de post continuam; 2 perguntas saem do modo post |
| `682642d` | Plano de estudo e "como organizo" saem da análise crítica | Mensagens reais da rodada |
| `7dd8558` | Nome do autor com peso de título na busca de posts | Post certo no filtro: 18/24 → 21/24, mesmo ruído |
| `044ebc9` | Rascunho de post sem documentos pessoais, a menos que a pessoa peça; regra contra copiar códigos e valores | O post da Sônia |
| `787aff7` | Cada post leva quem escreveu; fatos do ambiente não são completados nem trocados | Erros de atribuição e invenções da rodada |
| `0ed2f22` | Teto de 1.400 tokens no modo conversa | 2 respostas cortadas |
| `7ce0e06` | "Rapidinho" e "resumido" pedem resposta breve | O pedido do Dudu |
| `26b89ce` | Trechos de 600 caracteres nos documentos | eval/embeddings, um parâmetro por vez |
| `6799eb2` | Métricas de recuperação com `KALLY_EVAL=1` (só no servidor de testes) | Separa busca de interpretação |
| `033a2e2` | Conversas salvas fora do filtro de 0,4 | Cosseno 0,61 × filtro efetivo de 0,8 |
| `172867a` | Corte dos documentos em 0,40 | eval/embeddings: 93%/89% → 100%/94% |
| `a3cdeef` | Documento da própria pessoa respondido com "você"; autoria não é responsabilidade | Erros do teste A/B |
| `be2ebcd` | Posts de quem é citado pelo nome usam o filtro de 0,2 | Post certo no filtro: 21/24 → 24/24, mesmo ruído |
| `9de86a8` | Limite de cadastro configurável (`REGISTER_MAX_PER_WINDOW`); login inalterado | Para a simulação com 100 personas |

## 5. Evolução medida (teste A/B local, mesmas 40 perguntas com RAG)

Condições iguais para todas as versões:
- mesmo modelo executor da produção e mesmo conteúdo, replicado da rodada 1;
- índice aquecido antes da prova;
- juiz cego, com cada par de versões misturado numa folha única.

As versões:
- **produção:** o código que roda hoje no app;
- **v1** (`214a3f5`): regras de intenção, autoria, privacidade, teto de tokens, trechos de 600;
- **v2** (`be2ebcd`): conversas salvas, corte de 0,40, autor citado, "você" nos documentos;
- **v3** (`cdbd005`): a falta de informação não vira afirmação.

| Métrica | Produção | v1 | v2 | v3 |
|---|---|---|---|---|
| Nota média (0–5) | 2,50 | 3,60 | 4,17 | **4,22** |
| Respostas 5/5 | 30% | 55% | 68% | **70%** |
| Respostas 4 ou 5 | 40% | 60% | 80% | 78% |
| Fatos completos | 29% | 77% | 97% | 94% |
| Fonte certa recuperada | 42% | 77% | 97% | 97% |
| Armadilhas: disse que não encontrou | 75% | 75% | 50% | 75% |
| Erro factual (precisão ≤ 2) | 53% | 25% | 13% | **10%** |
| Inventou | 10% | 5% | 8% | 5% |

**A instância local reproduz a produção:** a versão produção teve 29% de fatos completos (produção real: 32%) e 42% de fonte certa (igual).

**A v2 piorou as armadilhas.** Com a busca trazendo mais conteúdo, a Kally passou a afirmar a partir da ausência ("o ambiente é gratuito"). A v3 corrigiu isso sem perder o resto.

Com 5 armadilhas por prova, cada uma vale 20 pontos percentuais. Diferenças de 2 a 3 pontos entre v2 e v3 são ruído.

**O que ainda falha na v3 (6 de 40 respostas abaixo de 4):**
- **Post contaminado (2):** o post da Sônia publicado na rodada 1 com os dados privados dela continua sendo citado. Precisa ser editado.
- **Limite do Diário (2):** a busca prefere um post *da* pasta Diário (a pasta conta 3 pontos na busca por palavras) ao guia que fala *sobre* o Diário.
- **Coordenação inventada (1):** a Kally deduz que a "Coordenação do Treinamento" coordena o encontro por ser a autora do guia.
- **Interpretação a mais (1):** na explicação do "pão do menino", acrescenta leituras que não estão na crônica.
- **Voz:** uma resposta sobre o documento da própria Carla ainda mistura a primeira pessoa.

Relatórios: [produção × v1](resultados/ab-rodada-01-antes-x-depois/relatorio.md), [v1 × v2](resultados/ab-rodada-01-depois-x-depois2/relatorio.md) e [v2 × v3](resultados/ab-rodada-01-depois2-x-depois3/relatorio.md). Os nomes das pastas usam antes, depois, depois2 e depois3. Painel: [eval/painel.html](../painel.html).

## 6. Limites

- **O servidor de produção ainda roda a versão antiga.** As correções valem na branch e foram medidas na instância local. Para valer no app, é preciso publicar a branch no servidor.
- **CPU em vez de GPU:** na instância local, o modelo roda na CPU deste container. A qualidade é a mesma (mesmo modelo e quantização), mas os tempos não são os da GPU.
- **Amostra pequena:** 40 perguntas por versão. Diferenças de uma ou duas perguntas são ruído. As diferenças grandes (fatos 29% → 77%) não são.
- **Juiz único:** o juiz é um modelo, e falta revisar à mão uma amostra de ~20 notas.
- **Dado contaminado:** o post da Sônia publicado na rodada 1 continua com os dados dela. As correções evitam novos posts assim, mas esse precisa ser editado.
- **O modelo de 4B ainda erra conteúdo** (detalhes inventados em crônicas, erros jurídicos). Prompt e regras ajudam pouco nisso.

## 7. Próximos passos

1. **Publicar a branch no servidor** e editar o post "Bolo de pote com sabor de pequi" (pela conta da Sônia ou da coordenação).
2. **Rodada 2 em produção** ([rodadas/rodada-02.json](rodadas/rodada-02.json), já pronta):
   - entram as 10 personas novas;
   - 4 pedidos que falharam na rodada 1 são repetidos com o mesmo texto;
   - a prova tem o mesmo núcleo, mais 10 novas e 5 armadilhas.

   Antes, defina `REGISTER_MAX_PER_WINDOW` no servidor durante a criação das contas e rode `preparar` e depois `rodada 2`.
3. **Rodadas 3 a 5:** o número de personas sobe até 100 (40, 70 e 100), sempre com o mesmo núcleo da prova.
4. **Revisar à mão** ~20 notas do juiz para calibrá-lo.

