# Recuperação da Kally: qwen3-embedding:0.6b (2026-11-08, commit 8e677fb)

Corpus: 10 documentos, 14.203 caracteres · perguntas: calibração 36, avaliação 23, validação 12 (guardada) · dimensões do vetor: 1024

Parâmetros atuais (lidos do código): floor 0.3, min 0.4, span 0.3, weight 0.7, conversationMin 0.55; trecho de documentos 1100, de posts 900; corte dos documentos 0.45; overlap 0.

## A. Base de documentos

### A1. Tamanho do trecho e overlap (configuração atual de corte e limite; conjunto de calibração)

| Trecho | Overlap | Trechos | Recall@1 | Recall@4 | MRR | Entregue ao modelo | Sem resposta: traz algo | Busca (ms/pergunta) |
|---|---|---|---|---|---|---|---|---|
| 600 | 0 | 35 | 82% | 100% | 0.90 | 93% | 50% | 0.32 |
| 600 | 150 | 35 | 75% | 96% | 0.85 | 89% | 50% | 0.33 |
| 600 | 300 | 35 | 75% | 96% | 0.84 | 82% | 50% | 0.30 |
| 900 | 0 | 20 | 64% | 93% | 0.79 | 68% | 50% | 0.20 |
| 900 | 150 | 20 | 68% | 93% | 0.81 | 71% | 50% | 0.20 |
| 900 | 300 | 20 | 75% | 96% | 0.86 | 75% | 50% | 0.22 |
| 1100 (atual) | 0 | 19 | 68% | 93% | 0.80 | 64% | 50% | 0.20 |
| 1100 (atual) | 150 | 19 | 64% | 93% | 0.78 | 64% | 50% | 0.20 |
| 1100 (atual) | 300 | 19 | 64% | 96% | 0.80 | 68% | 50% | 0.21 |
| 1400 | 0 | 16 | 68% | 96% | 0.81 | 61% | 38% | 0.18 |
| 1400 | 150 | 16 | 71% | 96% | 0.83 | 61% | 38% | 0.19 |
| 1400 | 300 | 16 | 64% | 96% | 0.80 | 61% | 38% | 0.21 |

Recall@k: o trecho-gabarito está entre os k mais parecidos (só significado). Entregue ao modelo: passou pelo corte, pelo limite por documento e pelo limite total, como na busca de produção.

### A2. Melhor configuração da grade × atual

Grade: 12 índices (tamanho × overlap) × 15 cortes × 4 pesos de palavras × 3 limites × 2 máximos por documento = 4320 configurações. Escolhida pelo objetivo (entregue + 0,25 × entregue em 1º − 0,5 × (sem resposta: traz algo) − 0,1 × trechos errados entregues) na **calibração**; os números de **avaliação** são de perguntas que não participaram da escolha.

- Atual: trecho 1100, overlap 0, corte 0.45, palavras 0.04, limite 4, máx. 3 por documento
- Melhor na calibração: trecho 600, overlap 0, corte 0.4, palavras 0.1, limite 3, máx. 2 por documento

| Conjunto | Config. | Recall@1 | Recall@4 | MRR | Entregue | Entregue em 1º | Trechos errados entregues | Sem resposta: traz algo | Perto: traz algo |
|---|---|---|---|---|---|---|---|---|---|
| calibracao | atual | 68% | 93% | 0.80 | 64% | 54% | 0.68 | 50% | 100% |
| calibracao | melhor | 82% | 100% | 0.90 | 100% | 86% | 1.39 | 50% | 100% |
| avaliacao | atual | 61% | 100% | 0.81 | 89% | 56% | 0.89 | 60% | 100% |
| avaliacao | melhor | 83% | 100% | 0.92 | 94% | 83% | 1.44 | 60% | 100% |

#### Um parâmetro por vez (o resto como está hoje)

| Mudança | Conjunto | Recall@1 | Recall@4 | Entregue | Entregue em 1º | Trechos errados entregues | Sem resposta: traz algo |
|---|---|---|---|---|---|---|---|
| nenhuma (atual) | calibracao | 68% | 93% | 64% | 54% | 0.68 | 50% |
| nenhuma (atual) | avaliacao | 61% | 100% | 89% | 56% | 0.89 | 60% |
| trecho 600 | calibracao | 82% | 100% | 93% | 79% | 1.14 | 50% |
| trecho 600 | avaliacao | 83% | 100% | 89% | 78% | 1.33 | 60% |
| trecho 900 | calibracao | 64% | 93% | 68% | 54% | 0.82 | 50% |
| trecho 900 | avaliacao | 94% | 100% | 89% | 83% | 0.94 | 60% |
| overlap 150 | calibracao | 64% | 93% | 64% | 50% | 0.79 | 50% |
| overlap 150 | avaliacao | 61% | 100% | 89% | 56% | 0.94 | 60% |
| overlap 300 | calibracao | 64% | 96% | 68% | 50% | 0.68 | 50% |
| overlap 300 | avaliacao | 72% | 100% | 83% | 67% | 0.94 | 60% |
| trecho 1400 | calibracao | 68% | 96% | 61% | 57% | 0.54 | 38% |
| trecho 1400 | avaliacao | 83% | 100% | 89% | 78% | 0.44 | 60% |
| corte 0.35 | calibracao | 68% | 93% | 96% | 64% | 2.07 | 50% |
| corte 0.35 | avaliacao | 61% | 100% | 89% | 56% | 2.06 | 60% |
| corte 0.4 | calibracao | 68% | 93% | 86% | 64% | 1.46 | 50% |
| corte 0.4 | avaliacao | 61% | 100% | 89% | 56% | 1.61 | 60% |
| corte 0.5 | calibracao | 68% | 93% | 46% | 39% | 0.36 | 38% |
| corte 0.5 | avaliacao | 61% | 100% | 78% | 50% | 0.50 | 60% |
| palavras 0 | calibracao | 68% | 93% | 64% | 54% | 0.68 | 50% |
| palavras 0 | avaliacao | 61% | 100% | 89% | 56% | 0.89 | 60% |
| palavras 0.1 | calibracao | 68% | 93% | 64% | 54% | 0.68 | 50% |
| palavras 0.1 | avaliacao | 61% | 100% | 89% | 67% | 0.89 | 60% |
| palavras 0.2 | calibracao | 68% | 93% | 64% | 54% | 0.68 | 50% |
| palavras 0.2 | avaliacao | 61% | 100% | 89% | 72% | 0.89 | 60% |
| limite 3 | calibracao | 68% | 93% | 64% | 54% | 0.61 | 50% |
| limite 3 | avaliacao | 61% | 100% | 89% | 56% | 0.83 | 60% |
| limite 6 | calibracao | 68% | 93% | 64% | 54% | 0.75 | 50% |
| limite 6 | avaliacao | 61% | 100% | 89% | 56% | 0.94 | 60% |
| máx. 2 por documento | calibracao | 68% | 93% | 64% | 54% | 0.68 | 50% |
| máx. 2 por documento | avaliacao | 61% | 100% | 89% | 56% | 0.89 | 60% |

Se a melhora some na avaliação, ela era ajuste às perguntas da calibração: não leve para produção. Com poucas perguntas por conjunto, diferenças de uma ou duas perguntas são ruído.

### A3. Cossenos (trecho 1100, calibração)

| Grupo | n | p5 | p25 | mediana | p75 | p95 |
|---|---|---|---|---|---|---|
| Gabarito | 28 | 0.373 | 0.425 | 0.496 | 0.599 | 0.695 |
| Melhor trecho errado (mesma pergunta) | 28 | 0.311 | 0.367 | 0.431 | 0.488 | 0.592 |
| Sem resposta, assunto próximo: melhor trecho | 4 | 0.465 | 0.499 | 0.593 | 0.674 | 0.680 |
| Sem resposta, fora do assunto: melhor trecho | 4 | 0.263 | 0.282 | 0.294 | 0.303 | 0.317 |

| Parâmetro | Atual | Pelos dados | Regra |
|---|---|---|---|
| floor | 0.3 | 0.678 | p95 do melhor trecho das perguntas sem resposta |
| corte dos documentos | 0.45 | 0.350 | maior corte que deixa passar 95% dos gabaritos |
| span | 0.3 | — (gabarito não se separa do ruído) | mediana do gabarito − floor |

### A4. Erros de 1º lugar (atual, calibração e avaliação)

| Pergunta | Conjunto | Tipo | Posição do gabarito | Cosseno do gabarito | 1º lugar veio de | Cosseno do 1º |
|---|---|---|---|---|---|---|
| R01: Qual é o prazo de entrega dos trabalhos semestrais no Coletivo Aurora? | calibracao | direta | 3 | 0.592 | regulamento-coletivo-aurora-2024-revogado.md | 0.744 |
| R08: Que dia e horário é a mentoria coletiva? | avaliacao | distrator | 2 | 0.616 | regulamento-coletivo-aurora-2024-revogado.md | 0.671 |
| R09: Quantas mentorias individuais eu posso ter por mês e com quanta antecedência agendo? | avaliacao | direta | 2 | 0.646 | regulamento-coletivo-aurora-2024-revogado.md | 0.664 |
| R12: Depois de quanto tempo sem atividade um membro vira só leitor? | calibracao | distrator | 2 | 0.442 | regulamento-coletivo-aurora-2024-revogado.md | 0.503 |
| R13: Acabei de entrar por convite. Posso publicar em qualquer pasta já nas primeiras semanas? | calibracao | parafrase | 5 | 0.379 | regulamento-coletivo-aurora.md | 0.482 |
| R15: Qual é a punição para plágio? | avaliacao | distrator | 2 | 0.483 | regulamento-coletivo-aurora-2024-revogado.md | 0.552 |
| T04: Qual é a nota mínima para ser aprovado na defesa do TCC? | calibracao | direta | 2 | 0.538 | guia-tcc-aurora.md | 0.603 |
| T08: Não estou me dando bem com meu orientador. Posso trocar? | calibracao | parafrase | 3 | 0.450 | regulamento-coletivo-aurora-2024-revogado.md | 0.494 |
| L03: como limpo a bancada antes de começar | avaliacao | vaga | 2 | 0.327 | guia-tcc-aurora.md | 0.340 |
| L05: Quebrei um vidro e me cortei no laboratório, o que faço? | calibracao | parafrase | 2 | 0.404 | protocolo-laboratorio-fermentacao.md | 0.486 |
| P02: Quem é o encarregado de dados do Coletivo e como falo com ele? | avaliacao | direta | 2 | 0.595 | politica-dados-coletivo-aurora.md | 0.628 |
| P03: Qual base legal o Coletivo usa para mandar a newsletter? | avaliacao | distrator | 2 | 0.518 | politica-dados-coletivo-aurora.md | 0.574 |
| A01: Qual é o tema do TCC da Ana? | calibracao | direta | 2 | 0.416 | guia-tcc-aurora.md | 0.458 |
| A03: quando é minha qualificação mesmo? | calibracao | vaga | 7 | 0.370 | guia-tcc-aurora.md | 0.475 |
| A04: Com quantas pessoas fiz as entrevistas-piloto? | calibracao | parafrase | 2 | 0.381 | guia-tcc-aurora.md | 0.417 |
| G01: Quais são as bases legais da LGPD para tratar dados pessoais? | avaliacao | direta | 2 | 0.699 | lgpd-bases-legais.md | 0.747 |

## B. Memória de posts (kally-memory.ts)

Cada documento faz o papel de um post. "Passa no filtro da conversa": o post certo fica com nota ≥ 0,4, o mínimo da rota no modo conversa quando a pessoa não pede os posts explicitamente.

| Conjunto | Config. | Recall@1 | Recall@5 | Passa no filtro da conversa | Sem resposta passa no filtro |
|---|---|---|---|---|---|
| calibracao | atual (weight 0.7, min 0.4) | 79% | 86% | 82% | 50% |
| calibracao | melhor (weight 0.6, min 0.45) | 82% | 93% | 82% | 50% |
| avaliacao | atual (weight 0.7, min 0.4) | 89% | 94% | 89% | 60% |
| avaliacao | melhor (weight 0.6, min 0.45) | 94% | 100% | 83% | 60% |

Este modelo não inclui o empurrão por pasta (+0,08) e por link (+0,15) da busca real; no ambiente da simulação, com poucas pastas, esse empurrão pode trazer posts sem relação. A simulação mede o efeito no uso real.

## C. Latência e recursos (nesta máquina)

- Vetor de uma pergunta: — ms em média (só o que não estava em cache) · busca por pergunta na base atual: 0.20 ms com 19 trechos
- Memória do processo: 110.56 MB · tempo total: 0.41 s

