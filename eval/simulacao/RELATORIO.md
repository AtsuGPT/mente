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
- **v3** (`cdbd005`): a falta de informação não vira afirmação;
- **v4** (`6ac4619`): pasta com peso 1 na busca, conversa com temperatura 0,2;
- **v5** (`bb8b819`): a memória de posts divide por parágrafo.

| Métrica | Produção | v1 | v2 | v3 | v4 | v5 |
|---|---|---|---|---|---|---|
| Nota média (0–5) | 2,50 | 3,60 | 4,17 | 4,22 | 4,30 | **4,40** |
| Respostas 5/5 | 30% | 55% | 68% | 70% | 68% | **73%** |
| Respostas 4 ou 5 | 40% | 60% | 80% | 78% | 83% | **88%** |
| Fatos completos | 29% | 77% | 97% | 94% | 97% | 97% |
| Fonte certa recuperada | 42% | 77% | 97% | 97% | 97% | 97% |
| Armadilhas: disse que não encontrou | 75% | 75% | 50% | 75% | 75% | 75% |
| Erro factual (precisão ≤ 2) | 53% | 25% | 13% | 10% | 8% | 10% |
| Inventou | 10% | 5% | 8% | 5% | 5% | 5% |

**A instância local reproduz a produção:** a versão produção teve 29% de fatos completos (produção real: 32%) e 42% de fonte certa (igual).

**Ruído entre execuções.** A v3 rodou duas vezes, com a mesma versão e o mesmo conteúdo ([v3 × v3](resultados/ab-rodada-01-depois3-x-depois3r/relatorio.md)):
- nota 4,22 × 4,25; 5/5 70% × 65%; fatos 94% × 97%; armadilhas 75% nas duas;
- só 12 das 40 respostas saíram com texto idêntico, e 7 perguntas mudaram de nota.

Diferenças abaixo de ~0,1 na nota e de ~5 pontos percentuais nas porcentagens são ruído. Portanto:
- os ganhos de produção → v1 → v2 são reais;
- v3, v4 e v5 somam uma melhora pequena e contínua (4,17 → 4,40), mas cada passo isolado está no limite do ruído.

**A v2 piorou as armadilhas.** Com a busca trazendo mais conteúdo, a Kally passou a afirmar a partir da ausência ("o ambiente é gratuito"). A v3 corrigiu isso, e o resultado se repetiu nas duas execuções.

**v4 e v5:**
- A v4 não teve efeito mensurável. A temperatura mais baixa não reduziu os acréscimos de interpretação.
- A v5 corrigiu um bug real: os posts viravam uma linha só e eram cortados no meio das frases. Com isso, a Kally passou a corrigir a premissa falsa do Diário com o valor certo (1.500).

**O que ainda falha na v5 (5 de 40 respostas abaixo de 4):**
- **Post contaminado (2):** os dados privados da Sônia aparecem porque o teste replica o conteúdo original da rodada 1. Em produção, o post já foi editado.
- **Limite do Diário:** "qual o limite de caracteres no Diário?" deixa o guia com nota ~0,39, logo abaixo do filtro de 0,40.
- **Coordenação inventada:** a Kally deduz que a "Coordenação do Treinamento" coordena o encontro por ser a autora do guia.
- **Interpretação a mais:** na explicação do "pão do menino", acrescenta leituras e chama o pão de "biscoito".
- **Voz:** uma resposta sobre o documento da própria Carla ainda sai em primeira pessoa.

Relatórios por par de versões: [produção × v1](resultados/ab-rodada-01-antes-x-depois/relatorio.md), [v1 × v2](resultados/ab-rodada-01-depois-x-depois2/relatorio.md), [v2 × v3](resultados/ab-rodada-01-depois2-x-depois3/relatorio.md), [v3 × v4](resultados/ab-rodada-01-depois3-x-depois4/relatorio.md) e [v4 × v5](resultados/ab-rodada-01-depois4-x-depois5/relatorio.md). Os nomes das pastas usam antes, depois, depois2 e assim por diante. Painel: [eval/painel.html](../painel.html).

## 6. Calibração do juiz

Relatório: [resultados/calibracao/relatorio.md](resultados/calibracao/relatorio.md).

- **Consistência:** em respostas com o mesmo texto corrigidas em folhas diferentes (só correções independentes; as notas reaproveitadas entre folhas ficam de fora), a nota foi a mesma nos 37 pares. São quase sempre respostas simples, então isso mostra coerência, não validade.
- **Concordância com a checagem objetiva:** em 94% das 186 respostas a perguntas com resposta na base, a nota de precisão do juiz bate com "os fatos do gabarito estão na resposta".
- **Correção humana (feita):** você corrigiu às cegas as 20 respostas sorteadas. Resultado:
  - mesma nota em 50%, diferença de até 1 ponto em 75%;
  - kappa ponderado de 0,63 (concordância moderada a boa);
  - o juiz era 0,4 ponto mais severo que você.
- **O que as 10 divergências mostraram:**
  - "curto demais" aparece em 7 dos seus comentários, inclusive em respostas certas (H01: juiz 5, você 4);
  - resposta na voz da pessoa ("trabalho no hospital…") recebeu 1 de você e 3 do juiz (H11);
  - "[P1]" e "material fornecido" incomodam (H05, H09);
  - o juiz foi mais duro que você com respostas certas que traziam um detalhe a mais ou um conselho sensato coerente com o guia (H06, H08, H16: juiz 1 ou 2, você 4).
- **Rubrica v2:** os ajustes viraram regras escritas na [rubrica](rubrica.md):
  - voz trocada vale no máximo 1;
  - nota 5 exige orientação (resposta certa mas seca vale 4);
  - rótulo interno exposto limita a nota a 4;
  - conselho coerente com o guia vale 3 ou 4.
- **Efeito da rubrica v2 na escala:** com a v2, a mesma v5 cai de 4,40 para 3,60. A Kally não piorou: a régua ficou mais exigente, sobretudo no 5. Por isso as versões corrigidas com a v1 e com a v2 não se comparam diretamente: a tabela da seção 5 separa as duas réguas.

## 7. Limites

- **O servidor de produção ainda roda a versão antiga.** A pasta "minha-mente" do seu computador não é oferecida a sessões na nuvem. O `publicar-servidor.ps1` faz a publicação na sua máquina.
- **Amostra:** 40 perguntas por versão, com a margem de ruído medida acima. A rodada 2 e as seguintes trazem mais perguntas (100 no total, com 25 de núcleo fixo).
- **CPU em vez de GPU:** a instância local roda na CPU deste container. A qualidade é a mesma (mesmo modelo e quantização), mas os tempos não são os da GPU.
- **O modelo de 4B ainda erra conteúdo:** detalhes acrescentados em explicações e textos criativos, e erros jurídicos fora da base. Prompt e regras ajudam pouco nisso.

## 8. Próximos passos

1. **Publicar no servidor:** `powershell -ExecutionPolicy Bypass -File eval\simulacao\publicar-servidor.ps1` e reiniciar o servidor.
2. **Calibração humana:** corrigir as 20 respostas da página.
3. **Rodada 2 em produção:** `preparar` (cria as 10 contas novas) e `rodada 2`. Depois, `publicar-servidor.ps1 -FimDoCadastro`.
4. **Rodadas 3 a 5:** roteiros e prova já gerados para 100 personas. A cada rodada, rodar `preparar` (só cria quem falta) e `rodada N`.
