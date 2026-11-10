# Avaliação experimental do Colibrì para a Kally

> Medições de 09 e 10/11/2026 nesta máquina. Dados brutos e scripts em [colibri/](colibri/)
> (`requests.csv`, `summary_*.csv`, `tables.md`, `scripts/`). A seção J (prova da Kally pelo pipeline real)
> é preenchida quando a última rodada termina.

## A. Resumo executivo

- **O Colibrì funciona neste computador?** Sim. A v2.1.0 roda no Windows 11 com CUDA na RTX 2050, lê os GGUF
  do próprio Ollama sem copiar nada e expõe API compatível com OpenAI. Tudo instalou sem privilégios de
  administrador.
- **É viável usar modelos maiores?** Para conversa, não. O 30B-A3B (MoE) roda nos dois motores, mas o melhor
  resultado medido foi ~5,5 tok/s no Ollama (10 camadas na placa) com 19 s até a primeira palavra numa
  conversa curta, e de 2 a 8 minutos até começar num documento longo. No Colibrì, com a RAM liberada,
  chegou a ~9 tok/s, ainda com ~25 s até a primeira palavra. O 14B denso fica em ~4,5 tok/s no Ollama.
- **Houve ganho de qualidade?** Sim, do 4B para o 8B: média cega de 2,17 para 3,00, com 4 em conversa e 4 em
  post. Do 8B para cima o ganho é pequeno nas competências priorizadas (conversa, post, contexto longo): o 30B
  tirou 4,00 contra 3,67 do 8B nessas três, ao custo de 4 a 10 vezes mais tempo.
- **Principal gargalo?** RAM (16 GB, com 2 a 7 GB livres na prática) e VRAM (4 GB). O SSD desta máquina
  entrega ~0,2 GB/s nas leituras pequenas e aleatórias que o Colibrì faz para buscar especialistas, e esse
  é o ponto fraco do motor aqui.
- **Vale integrar o Colibrì à Kally?** Não nesta máquina. Ele não acelera os modelos que cabem na placa
  (4B: 31,8 contra 35,4 tok/s no Ollama), é 3 a 5 vezes mais lento nos densos que não cabem (8B: 2,4 contra
  13–19 tok/s) e perde para o Ollama ajustado no próprio MoE em latência. **O ganho real veio de ajuste do
  Ollama e de quantização:** o 8B com 30 camadas na placa foi de 7,4 para 13,3 tok/s, e o 8B IQ4_XS com 34
  camadas chegou a 16,9 tok/s (19 na conversa).

## B. Hardware e ambiente

Medido nesta máquina em 2026-11-09, antes de qualquer teste:

| Item | Valor |
|---|---|
| Sistema | Windows 11 Home Single Language 10.0.26200 |
| CPU | Intel Core i5-12450H: 8 núcleos (4 P + 4 E), 12 threads |
| RAM | 16 GB DDR5 (2 × 8 GB, 5600 MT/s nominal, configurada a 4800) — 15,7 GB visíveis |
| RAM livre no início | 2,5 GB (memória comprometida: 7,6 GB livres de 41,5 GB; arquivo de paginação de 26 GB) |
| GPU | NVIDIA GeForce RTX 2050, 4 GB, driver 616.64, CUDA 13.4 (UMD), capacidade de computação 8.6 |
| Outras GPUs | Intel UHD (integrada), adaptador virtual do Parsec |
| Disco | SSSTC CL4-4D512-Q62, NVMe, 512 GB; 111 GB livres no início, 84 GB depois dos downloads |
| Ollama | 0.40.6, com `OLLAMA_FLASH_ATTENTION=1`, `OLLAMA_KV_CACHE_TYPE=q8_0`, `OLLAMA_MAX_LOADED_MODELS=2`, `OLLAMA_NUM_PARALLEL=1` |
| Colibrì | v2.1.0 (release oficial de 2026-10-31, SHA-256 conferidos), pacote Windows + pacote CUDA |
| Python do teste | 3.13.1, em ambiente isolado (`kally-bench\venv`, com `psutil` e `requests`) |
| Site | Next.js 16 em Node 23.5, no ar na porta 3000 durante todos os testes |

Processos que disputaram memória durante os testes (não foram fechados): um aplicativo da área de trabalho (~2 GB),
VS Code (~1,2 GB), Discord (~0,6 GB), Docker Desktop com WSL (~0,6 GB de RAM, 2 GB comprometidos),
o servidor Next da produção (~2 GB comprometidos) e um `server.py` do ambiente Python do projeto,
iniciado em 05/11, com ~4,5 GB de memória comprometida. Na maior parte dos testes a RAM livre ficou
entre 1,5 e 7 GB. **Esse é o limite real desta máquina hoje, e foi medido assim de propósito**; com
esses programas fechados, os modelos que não cabem na placa (8B, 14B, 30B) devem melhorar.

### Ambiente de teste

Tudo fora do repositório, em `C:\Users\satan\kally-bench\`:

- `colibri\` (motores com Vulkan e CPU) e `colibri-cuda\` (os mesmos com o pacote CUDA por cima);
- `models\`: vínculos (hard links) para os arquivos GGUF que o Ollama já tem, importados no Colibrì em
  modo `link` (`coli import`, sem cópia nem reconversão). Nenhum peso foi duplicado;
- `bench\`: os scripts (cópia em [colibri/scripts](colibri/scripts));
- `results*\`: os JSONL brutos de cada sessão, com as respostas completas, e os logs dos servidores.

### Garantias sobre a produção

- O banco de dados, as rotas, a autenticação, as variáveis de ambiente e o código da Kally não foram
  alterados. O servidor do site não foi parado.
- Nenhum modelo existente foi apagado. Foram baixados, com autorização, `qwen3:14b` (9,3 GB) e
  `qwen3:30b-a3b-instruct-2507-q4_K_M` (18,6 GB).
- O Colibrì usou a porta 8010, separada do Ollama (11434) e do site (3000). Ele não foi ligado à Kally.
- Um modelo por vez: antes de cada sessão o harness confere que nenhum motor do teste ficou rodando e,
  ao fim, que a VRAM voltou ao valor inicial. Antes e depois de cada pedido ele lê o `/api/ps` do
  Ollama; um pedido em que apareceu outro modelo carregado (por exemplo, uma conversa real da
  produção) seria marcado como contaminado e descartado. Nenhum foi.

## Pesquisa técnica do Colibrì (Fase 2)

Fontes: o README e a pasta `docs/` do repositório oficial (commit `0a5504a`, 31/10/2026) e o release
v2.1.0. Benchmarks externos citados abaixo são do projeto, não desta máquina.

- **O que é.** Motor de inferência em C puro, um arquivo por família de modelos, feito para modelos
  *Mixture of Experts* grandes: a parte densa fica na RAM (ou na placa) e os especialistas são lidos do
  disco sob demanda, com um cache que aprende quais especialistas o uso real aciona.
- **Windows 11.** Suportado, com binários prontos. O pacote CUDA para Windows exige capacidade de
  computação 8.0 ou mais; a RTX 2050 (8.6) atende. O launcher precisa de Python 3.
- **Backends.** CPU (sempre), Vulkan (qualquer GPU com Vulkan 1.2) e CUDA (NVIDIA). Os dois foram
  testados aqui. Os autores descrevem o projeto como plataforma de pesquisa, com mudanças frequentes
  (v2.0.0 em 06/10, v2.1.0 em 31/10, um CHANGELOG de 90 KB).
- **Modelos.** Aceita apenas as arquiteturas que tem motor: Qwen3/3.5/3.6/3.8 (densos e MoE), Qwen3-Coder,
  GLM-5.x, DeepSeek V4/V4.1, MiMo, Kimi K3, Inkling, OLMoE, Flint, LFM3 e alguns outros. Lê GGUF
  diretamente (de IQ1_S a Q8_0, F16, BF16). **Não** roda Gemma, Llama nem Mistral pequenos: dos modelos
  do Ollama desta máquina, só os Qwen3 servem (o `gemma3:4b` da revisão e o `llama3.2` não).
- **Densos x MoE.** Roda os dois, mas o projeto é otimizado para MoE. Para um modelo denso todo peso é
  lido a cada token; a documentação diz isso e os testes aqui confirmaram (seção C).
- **RAM e SSD.** O instalador recomenda, para esta máquina, o Qwen3.6-35B-A3B (23 GB) e o
  Qwen3-Coder-30B-A3B (19 GB) "com cache pequeno de especialistas"; os modelos de centenas de bilhões
  de parâmetros pedem de 24 a 120 GB de RAM ou mais disco do que há livre. O desempenho de um MoE
  depende de quantos especialistas cabem em RAM/VRAM; o que falta vem do NVMe.
- **API.** `coli serve` expõe API compatível com OpenAI (`/v1/chat/completions` com streaming e `usage`),
  compatível com Anthropic, e um painel web. `seed` é aceito e ignorado.
- **Limitações declaradas.** `--ram` não é respeitado pelo motor Qwen (o cache se controla com `--cap`);
  no Windows o Smart App Control pode bloquear binários próprios (aqui está desligado, nada foi mudado);
  prompts longos são lentos na CPU (a própria documentação cita ~2 min para ~500 tokens em cache frio no
  Qwen3-Coder-30B).
- **Benchmarks publicados (externos).** Qwen3.6-35B-A3B: 6 tok/s só na CPU de um Ryzen 7 8700GE com
  64 GB, 30 tok/s numa RTX 3070 8 GB com CUDA, 93–105 tok/s numa RTX PRO 4000 de 24 GB.
  Qwen3-Coder-30B-A3B: 8,5–9,6 tok/s com todos os especialistas em RAM (15 GB), 5,1 tok/s com 32 por
  camada (6,5 GB). Todas essas máquinas têm 4 a 8 vezes a RAM e 2 a 6 vezes a VRAM desta.

## Seleção de modelos (Fase 3)

| Categoria | Modelo | Por quê | Arquivo |
|---|---|---|---|
| Atual | Qwen3-4B-Instruct-2507 Q4_K_M | o executor da Kally hoje | já estava no disco |
| 8B | Qwen3-8B Q4_K_M (sem modo de pensar) | mesma família da Kally, bom português, já estava no disco | 4,9 GB |
| 14B | Qwen3-14B Q4_K_M (sem modo de pensar) | o maior denso da família que cabe em 16 GB | 9,3 GB, baixado |
| 30B | Qwen3-30B-A3B-Instruct-2507 Q4_K_M | MoE com ~3B ativos por token, instruções gerais, sem modo de pensar | 18,6 GB, baixado |

Todos da mesma família, de propósito: as diferenças medidas vêm do tamanho e da arquitetura, não do
fornecedor. Os quatro rodam nos dois motores a partir do **mesmo arquivo**, então a comparação Ollama x
Colibrì é do motor, não do modelo. O Qwen3.6-35B-A3B (o modelo em que o Colibrì é mais otimizado) ficou
de fora por decisão do proprietário, para economizar disco; é o primeiro candidato a testar depois.
Modelos de código (Qwen3-Coder) não entraram: as tarefas da Kally são de texto e análise.

## Metodologia (Fases 4 a 6)

- **Harness** (`bench.py`): sobe o motor, mede o tempo até a primeira resposta de um pedido mínimo
  ("subida a frio" = carregar + responder), roda os cenários em streaming e mede, por pedido: TTFT
  (envio → primeiro token), velocidade de geração (tokens − 1 ÷ tempo entre o primeiro e o último
  token, sem o processamento do prompt), tempo total e tokens de entrada e saída. Em paralelo, a cada
  0,5 s: RAM do sistema e do motor (inclusive o `llama-server` do Ollama), CPU, VRAM e uso da GPU
  (`nvidia-smi`, a cada 1 s), leitura de disco e uso do arquivo de paginação. Ao fim, derruba o motor e
  confere a liberação da memória.
- **Mesmas condições para todos:** o mesmo prompt de sistema, os mesmos seis pedidos, temperatura 0,4,
  top-p 0,9, contexto de 8.192 tokens, os mesmos tetos de saída (300, 1.100, 1.600, 1.300, 1.000 e 700
  tokens). No Ollama, top-k 20 e repeat_penalty 1,0, os valores dos próprios modelos. O Colibrì não
  aceita top-k pela API nem semente; a temperatura e o top-p são os mesmos.
- **Repetições:** 3 por cenário nos modelos rápidos. Nos lentos (30B), 3 nos cenários curtos (A, F) e 1
  nos longos (B–E), porque uma única resposta longa leva de 10 a 25 minutos. Está marcado nas tabelas.
- **Frio x aquecido:** a "subida" é o primeiro pedido com o modelo recém-carregado; as repetições
  seguintes são aquecidas. No Colibrì o cache de especialistas também aquece entre pedidos, e isso é
  medido (a 1ª e a 2ª repetição aparecem separadas). Não foi possível esvaziar o cache de arquivos do
  Windows sem privilégios de administrador, então o "frio" pode ter parte do arquivo já em memória.
- **Ajustes antes das rodadas completas:** para cada modelo foram testadas as opções de colocação
  (camadas na placa no Ollama; memória da placa, cache de especialistas, Vulkan, CPU e threads no
  Colibrì) com pedidos curtos, e a rodada completa usou a configuração mais rápida de cada motor.
- **Cenários** (`scenarios.py`): A conversa curta; B explicação técnica (memória virtual); C post a
  partir de uma ideia bruta, sem inventar experiências; D análise crítica de um argumento falho sobre IA
  na educação; E síntese de um regimento sintético de ~2.700 tokens, com um conflito escondido e uma
  pergunta sem resposta no texto; F RAG com quatro trechos, um deles com uma instrução maliciosa
  embutida. Todo o material é sintético.

## C. Resultados dos benchmarks

Configuração mais rápida de cada modelo em cada motor (rodadas completas: 6 cenários × 3 repetições; os
lentos com 1 repetição nos cenários longos). "1ª palavra" é a mediana do TTFT com o modelo já carregado; a
geração não inclui o processamento do prompt. Qualidade: média cega de 0 a 5 nos cenários A–F (seção F).

| Modelo | Motor e colocação | Geração (tok/s) | 1ª palavra | Subida a frio | RAM máx. (motor) | VRAM máx. | Qualidade |
|---|---|---|---|---|---|---|---|
| 4B (atual) | Ollama, 37 camadas (tudo na placa) | 35,4 | 0,2 s | 5 s | ~0,1 GB* | 3,7 GB | 2,17 |
| 4B | Colibrì CUDA, `CUDA_EXPERT_GB=2.8` | 31,8 | 0,6 s | 9 s | 3,9 GB | 3,5 GB | (mesmos pesos) |
| 8B Q4_K_M | Ollama, automático | 7,4 | 0,25 s | 17 s | n/d* | 3,7 GB | 3,00 |
| 8B Q4_K_M | **Ollama, 30 camadas** | 13,3 | 0,2 s | 11 s | 4,8 GB | 3,9 GB | 3,00 |
| 8B IQ4_XS | **Ollama, 34 camadas** | **16,9** | 0,2 s | 8 s | 3,5 GB | 3,9 GB | ≈ 8B Q4 (seção F) |
| 8B Q4_K_M | Colibrì CUDA 2,8 GB | 2,4 | 41 s | 31 s | 5,7 GB | 3,1 GB | — |
| 14B Q4_K_M | Ollama, 20 camadas (o automático não carrega) | 4,4 | 0,35 s** | 21–55 s | 6,7 GB | 3,9 GB | 3,33 |
| 14B Q4_K_M | Colibrì CUDA 2,8 GB | 1,1 | 78 s | 85 s | 8,4 GB | 3,1 GB | — |
| 30B-A3B | Ollama, 10 camadas | 5,5 (A) | 19 s (A) | 205 s; 71–83 s com RAM livre | 8,1 GB | 3,9 GB | 3,50 |
| 30B-A3B | Colibrì CUDA 2,8 GB + cache 32 | 3,2 | 76 s | 49 s | 5,7 GB | 3,4 GB | 3,50 |
| 30B-A3B | Colibrì CUDA 2,8 GB + cache 48 (RAM livre) | 9,3 (A) | 25 s (A) | 48 s | 6,5 GB | 3,0 GB | — |

\* O Ollama 0.40 roda a inferência em `llama-server.exe`; nas duas primeiras sessões o monitor ainda não
contava esse processo (a RAM do sistema foi medida normalmente). \*\* Mediana puxada para baixo pelo
reaproveitamento do prompt entre repetições; o primeiro pedido longo levou de 4 a 30 s.

Tempo total por cenário, mediana (o que se espera até a resposta inteira; o texto aparece desde a 1ª palavra):

| Cenário | 4B Ollama | 8B Q4 (30 c.) | 8B IQ4 (34 c.) | 14B (20 c.) | 30B Colibrì |
|---|---|---|---|---|---|
| A conversa curta | 6,9 s | 10,9 s | 6,4 s | ~27 s | 79–117 s |
| A2 conversa enxuta (até 4 frases) | — | 3,4 s | 3,2 s | 14 s | — |
| B explicação técnica | 31 s | 84 s | 68 s | ~250 s | 486 s |
| C post | 38 s | 51 s | 46 s | 134–182 s | 250 s |
| D análise crítica | 37 s | 92 s | 67 s | — | 389 s |
| E contexto longo (~2.700 tokens) | 30 s | 87 s | 66 s | 230 s | 778 s |
| F RAG | 7,7 s | 16 s | 13 s | — | 199–231 s |

### Ajustes que mais mudaram o resultado

- **Camadas na placa no Ollama** (`num_gpu`): 8B de 7,9 para 14,8 tok/s com 30 camadas; com 34 piora (8–9 tok/s,
  o driver passa a usar memória compartilhada). 14B: o automático e 16 camadas não carregam ("unable to
  allocate CUDA_Host buffer", memória comprometida esgotada); 20 é o melhor e 24 piora. 30B: automático com
  2,6 tok/s e 266 s até a 1ª palavra; com 10 camadas, 5,5 tok/s e 19 s.
- **Quantização IQ4_XS no 8B**: cabe mais na placa (34 camadas) e ganha ~25% de velocidade.
- **Colibrì**: `CUDA_EXPERT_GB=2.8` põe o 4B inteiro na placa (8,5 → 30 tok/s; TTFT de 11 s para 0,4 s). No
  30B a alavanca é o cache em RAM (`--cap`): 8 → 1,7 tok/s, 16 → 2,5, 32 → 3,9, 48 → 9,3 com RAM livre e
  64 → 3,9 (passa do limite da RAM). Vulkan, CPU pura e o número de threads não ajudaram (o padrão usa os 4
  núcleos P).
- **Contexto de 4k em vez de 8k**: nenhum ganho no 8B; ficou 8k.
- **Fechar Discord e VS Code** (memória comprometida livre de ~1 para 16,6 GB): o 30B no Ollama passou a
  carregar em 71–83 s em vez de 205–220 s.

### Custo de troca de modelo (Ollama, como o gerenciador da Kally faz)

| Troca | Carga | 1ª palavra do pedido que chegou durante a troca |
|---|---|---|
| 8B → 14B | 16–17 s | 20–21 s |
| 14B → 8B | 9 s | 11 s |
| 8B → 30B | 71–83 s | 141–150 s |
| 30B → 8B | 10–13 s | 12–16 s |

### Concorrência (autorizada): 8B na placa e 30B na CPU ao mesmo tempo

Enquanto o 30B (Colibrì, só CPU, cache 32) escrevia um post, 32 conversas no 8B tiveram mediana de 3,8 s no
total e 15,0 tok/s, contra 3,5 s e 15,5 tok/s com o 8B sozinho. Nada travou; a RAM livre mínima foi
0,33 GB. Mas o post do 30B levou **10 min** (82 s até a 1ª palavra, 1,8 tok/s, 939 tokens): funciona, mas não
compensa.

### Respostas ricas (títulos, listas, tabela, diagrama) no 8B

| Pedido | Tamanho | 1ª palavra | Total, 8B IQ4_XS | Total, 8B Q4_K_M |
|---|---|---|---|---|
| Conversa simples, enxuta | ~50 tokens | 0,1 s | 3–5 s | 3–4 s |
| Conversa simples, rica e extensa | ~590 tokens | 0,2 s | ~56 s | ~45 s (379 tokens) |
| Explicação técnica, rica e extensa | ~1.450 tokens | 0,5 s | ~3 min | ~3 min |

O diagrama Mermaid saiu válido em 4 de 5 respostas e a tabela em todas, mas forçar a estrutura levou o modelo
a criar uma tabela sem base e a deixar de acolher o que a pessoa contou. Por isso a v14 (seção J) só pede
tabela e diagrama quando houver comparação ou processo, e mantém o papo casual curto.

## D. Análise individual

- **4B atual.** Rápido e estável (variação abaixo de 1%), cabe inteiro na placa. É o que menos acerta: escreve
  demais e bate no limite, usa emoji apesar da regra e erra contas. Média 2,17, abaixo do mínimo de 3.
- **8B (Q4_K_M e IQ4_XS).** O melhor equilíbrio. Passa no mínimo de qualidade, com 4 em conversa e em post; a
  conversa simples fica entre 3 e 9 s e o post sai em menos de 1 minuto. Limites: RAM apertada (1,7 a 3,5 GB
  livres), o mesmo erro de fidelidade dos outros (inventa que os backups são criptografados) e não acha o
  conflito do regimento. O IQ4_XS empatou com o Q4_K_M na correção cega e é ~25% mais rápido.
- **14B.** Mais lento que o 8B (4,4 tok/s) sem ganho nas competências priorizadas (post 3, contexto longo 2). Foi
  o único fiel no RAG. Carga de 20 a 55 s e RAM no limite (0,04 a 0,36 GB livres); falha ao carregar em outras
  configurações. Não se justifica aqui.
- **30B-A3B.** A melhor escrita e análise (explicação técnica 4, análise 4, conversa 5) e o único exemplo
  numérico certo. Também inventou a criptografia, e o custo é alto: 19 a 80 s até começar, 2 a 13 minutos
  por resposta longa e 71 a 150 s de troca. Útil, no máximo, para uma tarefa do tipo "receba depois".

## E. Comparação com a Kally atual

O 8B ganha do 4B em qualidade (+0,83 na média; +1 em conversa, +2 em post, +1 em contexto longo) e custa de
1,3 a 2 vezes o tempo total nas respostas longas. Na conversa simples com instrução de resposta enxuta, fica
em 3 a 5 s. O ganho justifica o custo. Os modelos maiores não: o 30B ganha 0,33 nas competências priorizadas
e custa de 4 a 10 vezes mais.

## F. Avaliação da qualidade

Correção cega, uma resposta por modelo e cenário (rótulos sorteados), rubrica de 0 a 5 (`grades.json`): 5
cumpre tudo sem erro nem invenção; 4 tem falha menor; 3 tem uma falha relevante ou foi cortada no limite; 2
tem duas falhas relevantes ou um erro que muda a conclusão; 1 inventa um fato central; 0 é inútil ou segue a
instrução maliciosa. Avaliador único, sem calibração humana: é indicativo, não medida objetiva.

| Modelo | A | B | C | D | E | F | Média | A/C/E |
|---|---|---|---|---|---|---|---|---|
| 4B atual | 3 | 2 | 2 | 3 | 2 | 1 | 2,17 | 2,33 |
| 8B Q4_K_M | 4 | 2 | 4 | 3 | 3 | 2 | 3,00 | 3,67 |
| 14B | 4 | 3 | 3 | 4 | 2 | 4 | 3,33 | 3,00 |
| 30B-A3B | 5 | 4 | 4 | 4 | 3 | 1 | 3,50 | 4,00 |

Segunda correção cega (outras repetições, só os dois 8B, cenários A, C, E e F): Q4_K_M 3/4/2/2, IQ4_XS
3/3/2/2. Nenhum modelo seguiu a instrução maliciosa do RAG; quatro de cinco inventaram que os backups são
criptografados, o que pede uma regra no pipeline, não outro modelo.

## G. Limitações e incertezas

- Uma resposta por cenário na correção e um único avaliador. A prova pelo pipeline real (seção J) amplia para
  40 perguntas, com checagens automáticas.
- Os prompts dos cenários A–F são crus (sem as competências e bases da Kally); na produção o 4B rende mais.
- Não foi possível esvaziar o cache de arquivos do Windows sem privilégios de administrador: a "subida a frio"
  pode ter parte do arquivo já em memória.
- As condições de RAM mudaram durante os testes (apps fechados às 13:57 de 09/11); os resultados com "RAM
  livre" estão separados.
- Não testados: o Qwen3.6-35B-A3B (o modelo em que o Colibrì é mais otimizado; ficou de fora para economizar
  disco), o MTP do Colibrì e várias conversas simultâneas (`--kv-slots`).
- Erros do próprio teste, corrigidos e registrados: o monitor não contava o `llama-server` nas primeiras
  sessões; um falso "contaminado" pelo nome `:latest`; um reinício de um aplicativo da área de trabalho derrubou site, Ollama e
  Whisper em 09/11 (religados em 10/11, sem perda de dados).

## H. Plano de integração futura (não executado)

1. **Modelo**: `KALLY_EXECUTOR_MODEL="qwen3-8b-iq4xs"` (o intérprete segue o executor) e `KALLY_GPU_LAYERS`
   com `qwen3-8b-iq4xs=30` (34 só vale com prompt curto; ver seção J) e `KALLY_NO_THINK_MODELS`. Criar o modelo no Ollama a partir do GGUF da unsloth (`Qwen3-8B-IQ4_XS.gguf`,
   SHA-256 `30a43337…857801cb`) com o template do `qwen3:8b`. Já criado nesta máquina como `qwen3-8b-iq4xs`.
2. **Gerenciador de modelos** (`src/server/ai/model-manager.ts`): a conversa nunca troca de modelo; troca só
   quando o modo muda para uma tarefa grande; depois dela, recarrega o 8B em segundo plano, antes do próximo
   pedido, para esconder os ~11 s de carga. Com o 8B como modelo único, nada disso é necessário.
3. **Conversa simples** (detecção de papo casual em `kally.ts`): continua curta, para ficar abaixo de 10 s.
4. **Perguntas e pedidos**: respostas estruturadas e mais extensas (v14, seção J), com o streaming atual; a 1ª
   palavra continua abaixo de 1 s.
5. **Fidelidade**: regra contra completar atributos ausentes nos documentos (o caso da criptografia), a medir
   na prova.
6. **Colibrì**: não integrar. Com 32 GB de RAM ou mais, ou uma placa maior, rever o 30B-A3B e o
   Qwen3.6-35B-A3B nele.

## I. Decisão do proprietário

1. **Manter a arquitetura atual (4B):** a mais rápida, mas abaixo do mínimo de qualidade (2,17).
2. **Adotar o 8B como modelo único (recomendado):** passa no mínimo, empata com o 30B em post e contexto longo,
   cabe na latência pedida e não tem troca de modelo. Contra-argumento: respostas longas levam o dobro do tempo
   do 4B e a RAM fica mais apertada.
3. **Arquitetura híbrida (8B + 30B para pedidos grandes):** ganho de qualidade pequeno nas competências
   priorizadas, com 2 a 2,5 minutos de troca, ou 10 minutos por post em concorrência. Só faria sentido para uma
   tarefa explicitamente "para depois".

A decisão final é do proprietário.

## J. Prova da Kally pelo pipeline real (parcial)

Instância de teste isolada (banco próprio semeado com a rodada 1 da simulação, porta 3002), as 40
perguntas da prova da rodada 1, sem a condição de controle, e um teste de latência com 5 papos
casuais e 5 perguntas simples de conhecimento geral. Checagens automáticas da própria simulação
(fatos do gabarito, termos proibidos, armadilhas). A série foi interrompida pelo proprietário antes
da rodada 2 e das versões v14/v15 (respostas mais extensas e com menos exemplos), que não rodaram.

| Versão | Fatos completos | Vazou dado privado | Armadilhas admitidas | Prova: 1ª palavra / total (mediana) | Papo casual (total) | Pergunta simples (total) |
|---|---|---|---|---|---|---|
| v13 + 4B (produção) | 29/32 | 0/4 | 3/5 | 1,0 s / 4,0 s | 1,1 s | 8,2 s |
| v13 + 8B IQ4_XS | 26/32 | 0/4 | 2/5 | 5,7 s / 10,1 s | 2,6 s | 12,6 s |
| código híbrido + 8B, remoto desligado | 27/32 | 0/4 | 2/5 | 2,5 s / 10,6 s | 5,4 s | 12,7 s |

O que isso acrescenta às seções anteriores:

- **Nas perguntas factuais sobre o ambiente, o 8B não ganhou do 4B.** Os ganhos do 8B nos cenários
  A–F (post, conversa) vieram de tarefas abertas; com a base, o 4B já acertava quase tudo.
- **Duas correções eram obrigatórias para o 8B no pipeline:** `think: false` (o `qwen3:8b`
  raciocina por padrão: 1ª palavra de 30 a 52 s) e 30 camadas na placa em vez de 34 (com o prompt
  real de ~2.000 tokens, 34 camadas caíam para 8 tok/s; 30 dão ~15).
- **A latência do 8B vem do prompt:** ~2.000 tokens de regras e, nas competências, dois exemplos de
  ~330 palavras (3.700 tokens: 31 s até a 1ª palavra numa pergunta de estudo). O papo casual, com o
  prompt em cache, começa em ~0,6 s.
- A linha "código híbrido" confirma que o roteamento, com o remoto desligado, não muda o
  comportamento (mesmos acertos, sem vazamento, mesma latência dentro da variação).
