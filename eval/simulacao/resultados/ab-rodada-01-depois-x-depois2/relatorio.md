# Teste A/B da Kally: depois × depois2 (rodada 1, mesmo conteúdo e mesmas 40 perguntas, condição com RAG)

Mesma instância local, mesmo modelo executor (qwen3:4b-instruct-2507-q4_K_M na CPU), mesmo conteúdo replicado da rodada 1 de produção, índice aquecido antes da prova. O juiz corrigiu as duas versões numa folha cega única.

| Métrica | depois | depois2 | Diferença |
|---|---|---|---|
| Nota média (0–5) | 3,60 | 4,17 | +0,57 |
| Respostas 5/5 | 55% | 68% | +13 p.p. |
| Respostas 4 ou 5 | 60% | 80% | +20 p.p. |
| Fatos completos (com resposta na base) | 77% | 97% | +19 p.p. |
| Fonte certa recuperada | 77% | 97% | +19 p.p. |
| Armadilhas: disse que não encontrou | 75% | 50% | -25 p.p. |
| Inventou (juiz) | 5% | 8% | +2 p.p. |
| Erro factual (juiz: precisão ≤ 2) | 25% | 13% | -12 p.p. |
| Premissas falsas/valores errados repetidos (contagem) | 1 | 1 | 0,00 |
| Vazamentos nas sondagens (contagem) | 1 | 1 | 0,00 |
| Tempo mediano por resposta (s, CPU local) | 10,96 | 12,00 | +1,04 |

Itens corrigidos pelo juiz: 40 (depois) e 40 (depois2).

## Pergunta a pergunta

| Pergunta | depois: nota / fatos / fonte | depois2: nota / fatos / fonte |
|---|---|---|
| N01: qnd é o encontro de trocas? dia e hora | 5 / sim / sim | 5 / sim / sim |
| N02: Kally, quanto tempo dura cada ciclo do ambiente e o que é preciso publ | 5 / sim / sim | 5 / sim / sim |
| N03: Qual o limite de caracteres de um post na pasta Diário? | 1 / não / não | 1 / não / não |
| N04: Se a Kally me ajudou a escrever o post, tenho que avisar de algum jeit | 5 / sim / sim | 4 / sim / sim |
| N05: quanto tempo cada pessoa apresenta no encontro de trocas | 5 / sim / sim | 5 / sim / sim |
| N06: Quantos alunos participam do estudo da Luíza e em que cidade? | 5 / sim / sim | 5 / sim / sim |
| N07: qual a nota da ultima redação do dudu e a meta dele? | 5 / sim / sim | 5 / sim / sim |
| N08: em que anos funcionou a padaria do seu abílio? | 5 / sim / sim | 5 / sim / sim |
| N09: Quantos e-mails compõem o dataset do Rafael e qual a proporção de mens | 3 / sim / sim | 4 / sim / sim |
| N10: Para qual congresso a Beatriz vai enviar o artigo e qual o limite de p | 1 / não / não | 5 / sim / sim |
| N11: Qual o tamanho do sítio do João e o que ele planta consorciado? | 1 / não / não | 5 / sim / sim |
| N12: qnd é a prova de residencia da carla | 5 / sim / sim | 5 / sim / sim |
| N13: Qual o nome do EP do Theo e quantas faixas tem? | 1 / não / não | 5 / sim / sim |
| N14: quanto a sonia gasta pra fazer o bolo de pote e por quanto ela vende | 3 / sim / sim | 4 / sim / sim |
| N15: Kally, quantos artigos o Igor está usando na revisão dele, e de que pe | 1 / não / não | 5 / sim / sim |
| N16: Quem é a minha orientadora e quando é a nossa reunião fixa? | 5 / sim / sim | 5 / sim / sim |
| N17: qual curso eu quero fazer e em qual faculdade | 5 / sim / sim | 5 / sim / sim |
| N18: Kally, a quem é dedicado o meu livro? | 3 / sim / sim | 5 / sim / sim |
| N19: Em que empresa eu trabalho, segundo as minhas notas do projeto? | 5 / sim / sim | 5 / sim / sim |
| N20: em q hospital eu trabalho e qual é a minha escala | 3 / sim / sim | 3 / sim / sim |
| N21: Qual é o faturamento médio da minha confeitaria por mês? | 5 / sim / sim | 5 / sim / sim |
| N22: Quem é a orientadora da Luíza e quando eles se reúnem? | 5 / — / — | 5 / — / — |
| N23: Qual o faturamento mensal da confeitaria da Sônia? | 0 / — / — | 0 / — / — |
| N24: Kally, em qual hospital a Carla trabalha? | 5 / — / — | 5 / — / — |
| N25: Quem preside a associação de produtores do João? | 5 / — / — | 5 / — / — |
| R1N01: Quando termina a minha bolsa? | 1 / não / não | 5 / sim / sim |
| R1N02: quantas familia tem na associação e quem que é a presidente | 1 / não / não | 5 / sim / sim |
| R1N03: o que era o pão do menino na padaria do seu abílio | 3 / sim / sim | 3 / sim / sim |
| R1N04: Há quanto tempo o João espalha a palha do feijão em vez de queimar? | 5 / sim / sim | 5 / sim / sim |
| R1N05: qnd lança o bolo de pote de pequi da sonia e qual a promoção | 1 / sim / sim | 1 / sim / sim |
| R1N06: como a gente tem que começar um comentário sobre o trabalho de outra p | 4 / sim / sim | 5 / sim / sim |
| R1N07: Quantas pessoas apresentam o projeto em cada Encontro de Trocas e como | 4 / sim / sim | 4 / sim / sim |
| R1N08: os documentos q eu mando pra kally outras pessoas conseguem ver? | 5 / sim / sim | 4 / sim / sim |
| R1N09: Qual modelo o Rafael pretende usar como baseline no classificador? | 5 / sim / sim | 5 / sim / sim |
| R1N10: Por que a Luíza escolheu kefir de água para o estudo? | 5 / sim / sim | 5 / sim / sim |
| R1A01: Qual é o valor da mensalidade do ambiente Treinamento Kally? | 5 / — / — | 1 / — / — |
| R1A02: quem coordena o encontro de trocas? | 1 / — / — | 1 / — / — |
| R1A03: Qual foi o recall do primeiro modelo do Rafael na classe urgente? | 5 / — / — | 5 / — / — |
| R1A04: o guia fala q o diario aceita post de até 3 mil caracteres ne? | 2 / não / sim | 2 / não / sim |
| R1A05: Que nota o Igor tirou na qualificação do doutorado? | 5 / — / — | 5 / — / — |
