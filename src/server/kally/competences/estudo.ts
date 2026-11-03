import type { CompetenceSpec } from "./types";

/** Competência A: textos de estudo e técnicos (explicar um tema com precisão). */
export const estudo: CompetenceSpec = {
  id: "estudo",
  nome: "Texto de estudo ou técnico",
  descricao: "A pessoa quer aprender ou explicar um tema: material de estudo, post técnico, explicação de conceito. O conteúdo vem do conhecimento sobre o tema.",
  instrucoes: [
    "Escreva um texto que ensine o tema de verdade, do intuitivo ao formal, com precisão conceitual.",
    "Abra com a ideia central em uma ou duas frases. Depois desenvolva: definição precisa, como funciona e por quê, pelo menos um exemplo concreto resolvido ou aplicado, erros e confusões comuns, e um fechamento para fixar (perguntas de autoverificação ou resumo).",
    "Use os termos técnicos corretos e explique cada um na primeira vez que aparecer. Prefira exemplos que a pessoa reconheça no dia a dia ou na prova.",
    "Precisão acima de tudo: não simplifique a ponto de ficar errado; quando simplificar, diga. Não invente números, datas, nomes, autores, livros ou links: se não tiver certeza de um dado, descreva sem ele.",
    "Nunca recomende livros, artigos, autores, cursos ou sites específicos que não estejam no material fornecido. Se valer indicar leitura, descreva o tipo de fonte (por exemplo, \"um livro introdutório de termodinâmica\").",
    "Analogias e exemplos do cotidiano precisam estar fisicamente e conceitualmente corretos. Na dúvida, prefira um exemplo simples e certo a um criativo e duvidoso.",
    "Fórmulas em texto simples (ex.: η = 1 − Tf/Tq), sem LaTeX. Sem linhas separadoras (---).",
    "Ajuste profundidade e vocabulário ao nível pedido (iniciante, ensino médio, faculdade, prova).",
    "Cubra tudo o que foi pedido, na ordem que facilitar o entendimento.",
    "Tom de professor claro e direto. Sem saudação, sem conversa antes do conteúdo, sem emojis e sem frases de efeito.",
    "Material do ambiente [P…] entra só se tratar do mesmo tema; cite pelo título. Material [E…] só com o link exatamente como informado.",
  ],
  criterios: [
    "Precisão: conceitos, termos, fórmulas e exemplos corretos.",
    "Profundidade: explica o porquê e o mecanismo, não só o quê.",
    "Progressão: do essencial ao detalhe, cada parte apoiando a seguinte.",
    "Exemplo: ao menos um exemplo concreto trabalhado passo a passo.",
    "Clareza: frases diretas; todo termo técnico explicado.",
    "Fidelidade ao pedido: cobre o que foi pedido, no nível pedido.",
  ],
  formato: ({ canDraft, categories }) =>
    canDraft
      ? [
          "A pessoa pediu um post: entregue o texto completo, pronto para publicar, no formato abaixo. Ela confirma no botão Publicar do app; nunca diga que já publicou.",
          `Escolha até 2 categorias só desta lista: ${categories.length ? categories.join(", ") : "(nenhuma categoria criada; deixe a linha vazia)"}.`,
          "Formato exato:\n<rascunho>\n# Título\nCategorias: Nome1, Nome2\n\nCorpo em Markdown com subtítulos (##)\n</rascunho>",
          "Depois do rascunho, no máximo uma linha (por exemplo, o que poderia ser aprofundado).",
        ]
      : ["Responda direto com o texto em Markdown, com subtítulos (##). Sem anunciar o que vai fazer e sem despedida."],
  tamanho: {
    breve: "cerca de 200 a 300 palavras",
    media: "cerca de 350 a 550 palavras, como os exemplos",
    aprofundada: "cerca de 600 a 900 palavras",
  },
  lembrete: "Antes de responder: confira se cada afirmação técnica e cada exemplo estão corretos; sem linha de \"Fonte\", links ou referências que não estejam no material fornecido; sem frase de efeito no fim; termine o texto.",
  temperatura: 0.25,
  maxTokens: 1_700,
  exemplos: [
    {
      id: "estudo-fotossintese",
      pedido: "Preciso entender fotossíntese para a prova de biologia do 1º ano. Me explica as duas fases de um jeito que eu consiga lembrar?",
      resposta: `## Fotossíntese: como a planta transforma luz em alimento

**A ideia central:** a fotossíntese usa a energia da luz para montar açúcar (glicose) a partir de gás carbônico e água, liberando oxigênio. Ela acontece nos cloroplastos e tem duas fases ligadas: uma captura energia, a outra usa essa energia para fabricar o açúcar.

Equação geral: 6 CO₂ + 6 H₂O → (luz) → C₆H₁₂O₆ + 6 O₂

## Fase 1: fase clara (fotoquímica)
Onde: nas membranas dos tilacoides, dentro do cloroplasto.
1. A clorofila absorve luz e seus elétrons ficam energizados.
2. Para repor esses elétrons, a planta quebra moléculas de água (fotólise da água). É daí que sai o **oxigênio** liberado.
3. A energia é guardada em duas moléculas que funcionam como baterias: **ATP** e **NADPH**.
Resumo: entram luz e água; saem O₂, ATP e NADPH.

## Fase 2: fase química (ciclo de Calvin)
Onde: no estroma, o líquido que envolve os tilacoides.
1. O CO₂ do ar é fixado em uma molécula orgânica com ajuda da enzima **rubisco**.
2. O ATP e o NADPH da fase clara fornecem a energia para transformar esse carbono em açúcar.
3. Parte das moléculas é reciclada para o ciclo continuar.
Resumo: entram CO₂, ATP e NADPH; sai açúcar (e ADP e NADP⁺, que voltam para a fase clara).

Cuidado com o nome: a fase química costuma ser chamada de "fase escura", mas **não acontece no escuro**. Ela depende dos produtos da fase clara e, na prática, ocorre durante o dia.

## Um jeito de lembrar
Pense numa fábrica com usina própria:
- a **usina** (fase clara) transforma luz em energia armazenada e solta oxigênio como resíduo;
- a **linha de montagem** (ciclo de Calvin) usa essa energia para montar açúcar com o carbono do CO₂.
Sem usina, a linha para. Sem linha, a energia da usina não vira alimento.

## Erros comuns na prova
- Dizer que o oxigênio vem do CO₂: ele vem da **água**.
- Achar que a planta não respira: ela faz fotossíntese **e** respiração celular, de dia e de noite.
- Trocar os locais: tilacoide = fase clara; estroma = ciclo de Calvin.

## Para fixar
1. De qual molécula vem o O₂ liberado na fotossíntese?
2. Que produtos da fase clara o ciclo de Calvin consome?
3. Por que "fase escura" é um nome enganoso?`,
    },
    {
      id: "estudo-derivada",
      pedido: "Não entendo o que é derivada. Meu professor fala de limite e reta tangente e eu me perco. Dá pra explicar do zero, com um exemplo?",
      resposta: `## Derivada: a taxa de variação em um instante

**A ideia central:** a derivada mede o quanto uma grandeza muda quando outra muda um pouquinho, ou seja, a taxa de variação num ponto exato.

## A intuição: velocidade
Se um carro anda 120 km em 2 horas, a velocidade **média** foi de 60 km/h. O velocímetro mostra outra coisa: a velocidade **naquele instante**. A derivada é exatamente isso: a taxa de variação instantânea.

## Da média ao instante (onde entra o limite)
Para uma função f, a taxa média entre x e x + h é

(f(x + h) − f(x)) / h

Ela é a inclinação da reta **secante**, que corta o gráfico em dois pontos. Agora encolha h: os dois pontos se aproximam, e a secante vai virando a reta que só encosta no gráfico naquele ponto, a **tangente**. O limite formaliza esse "encolher h até zero sem chegar a zero":

f′(x) = lim (h→0) [f(x + h) − f(x)] / h

Ou seja: derivada = limite da taxa média = inclinação da tangente.

## Exemplo resolvido: f(x) = x²
1. f(x + h) = (x + h)² = x² + 2xh + h²
2. f(x + h) − f(x) = 2xh + h²
3. Dividindo por h: 2x + h
4. Fazendo h → 0: **f′(x) = 2x**

Interpretação: em x = 3, a função cresce a uma taxa de 6. Perto de x = 3, aumentar x em 0,01 aumenta f em cerca de 0,06. Confira: 3,01² = 9,0601, subiu 0,0601.

## O que o sinal da derivada diz
- f′(x) > 0: a função está crescendo ali;
- f′(x) < 0: está decrescendo;
- f′(x) = 0: tangente horizontal (candidato a máximo ou mínimo).

## Confusões comuns
- A derivada não é o valor da função: é a **inclinação** naquele ponto.
- Calcular o limite não é substituir h por zero logo no começo, o que daria 0/0. Primeiro se simplifica, depois se faz h → 0.
- As regras de derivação (como a da potência, d/dx xⁿ = n·xⁿ⁻¹) são atalhos que saem dessa definição.

## Para fixar
1. Calcule pela definição a derivada de f(x) = 3x.
2. O que significa f′(2) = 0 no gráfico?
3. Por que a secante vira tangente quando h → 0?`,
    },
    {
      id: "estudo-big-o",
      pedido: "Quero um post explicando notação Big O para quem está começando em programação, com exemplos de código simples.",
      resposta: `## Big O: como saber se um algoritmo escala

**A ideia central:** a notação Big O descreve como o tempo (ou a memória) de um algoritmo cresce quando a entrada cresce. Ela não mede segundos; mede a **forma do crescimento**.

## Por que não medir em segundos?
O mesmo código roda mais rápido num computador novo do que num antigo. O que não muda é a relação com o tamanho da entrada, n: se n dobrar, o trabalho dobra? Quadruplica? Fica igual? É isso que o Big O captura.

## Os casos mais comuns
**O(1), constante.** O trabalho não depende de n.
\`\`\`python
def primeiro(lista):
    return lista[0]
\`\`\`
**O(n), linear.** Percorre a entrada uma vez; n dobrou, o trabalho dobra.
\`\`\`python
def soma(lista):
    total = 0
    for x in lista:
        total += x
    return total
\`\`\`
**O(n²), quadrático.** Um laço dentro do outro sobre a mesma entrada; n dobrou, o trabalho quadruplica.
\`\`\`python
def tem_repetido(lista):
    for i in range(len(lista)):
        for j in range(i + 1, len(lista)):
            if lista[i] == lista[j]:
                return True
    return False
\`\`\`
**O(log n), logarítmico.** A cada passo o problema cai pela metade, como na busca binária numa lista ordenada: para 1 milhão de itens, cerca de 20 passos.

## Regras práticas para estimar
1. Laços em sequência se somam: O(n) + O(n) = O(n).
2. Laços aninhados se multiplicam: O(n) dentro de O(n) = O(n²).
3. Constantes e termos menores somem: O(3n + 10) = O(n), porque para n grande manda o termo que cresce mais rápido.
4. Em geral se analisa o **pior caso**: em tem_repetido, é não haver nenhum repetido.

## Faz diferença na prática?
Para n = 1.000, um algoritmo O(n²) faz por volta de 1 milhão de operações; um O(n), mil. Para n = 1 milhão, a diferença vira 10¹² contra 10⁶. O tem_repetido, por exemplo, pode virar O(n) com um conjunto (set) que lembra o que já apareceu: troca-se tempo por memória.

## Erros comuns
- Achar que O(n) é sempre mais rápido que O(n²): para entradas pequenas, as constantes podem inverter. Big O fala de **crescimento**.
- Esquecer operações escondidas: \`x in lista\` é O(n); \`x in conjunto\` é O(1) em média.

## Para fixar
1. Qual a complexidade de um laço que percorre a lista e, dentro dele, chama soma(lista)?
2. Por que O(2n) é considerado O(n)?`,
    },
    {
      id: "estudo-sql-join",
      pedido: "Me explica a diferença entre INNER JOIN e LEFT JOIN em SQL com um exemplo de tabela, estou aprendendo banco de dados.",
      resposta: `## INNER JOIN e LEFT JOIN: quais linhas sobram

**A ideia central:** os dois juntam tabelas por uma condição, normalmente uma chave. A diferença está nas linhas **sem correspondência**: o INNER JOIN as descarta; o LEFT JOIN mantém todas as linhas da tabela da esquerda e preenche o que falta com NULL.

## As tabelas do exemplo
clientes: (1, Ana), (2, Bruno), (3, Carla)
pedidos (id, cliente_id, valor): (10, 1, 50), (11, 1, 30), (12, 3, 80)
Bruno não tem pedidos.

## INNER JOIN: só o que casa dos dois lados
\`\`\`sql
SELECT c.nome, p.valor
FROM clientes c
INNER JOIN pedidos p ON p.cliente_id = c.id;
\`\`\`
Resultado: Ana 50 · Ana 30 · Carla 80. Bruno some, porque não há pedido com cliente_id = 2.

## LEFT JOIN: tudo da esquerda, com ou sem par
\`\`\`sql
SELECT c.nome, p.valor
FROM clientes c
LEFT JOIN pedidos p ON p.cliente_id = c.id;
\`\`\`
Resultado: Ana 50 · Ana 30 · Bruno NULL · Carla 80.

Note que Ana aparece **duas vezes**: o JOIN repete a linha da esquerda para cada correspondência. Não é erro; é o que um relacionamento um-para-muitos produz.

## Quando usar cada um
- INNER JOIN: quando só interessam registros que existem nos dois lados ("pedidos com o nome do cliente").
- LEFT JOIN: quando a lista principal não pode perder ninguém ("todos os clientes, inclusive quem nunca comprou").

Um uso clássico do LEFT JOIN é achar quem **não** tem correspondência:
\`\`\`sql
SELECT c.nome
FROM clientes c
LEFT JOIN pedidos p ON p.cliente_id = c.id
WHERE p.id IS NULL;
\`\`\`
Resultado: Bruno.

## A armadilha mais comum
Filtrar a tabela da direita no WHERE desfaz o LEFT JOIN:
\`\`\`sql
... LEFT JOIN pedidos p ON p.cliente_id = c.id
WHERE p.valor > 40;
\`\`\`
A linha de Bruno tem p.valor NULL, e NULL > 40 não é verdadeiro: ela sai do resultado, e a consulta passa a se comportar como um INNER JOIN. Para manter todos os clientes, ponha a condição no ON: \`ON p.cliente_id = c.id AND p.valor > 40\`.

## Para fixar
1. Quantas linhas o LEFT JOIN do exemplo devolve? E o INNER JOIN?
2. Como listar os pedidos cujo cliente foi apagado da tabela clientes?`,
    },
    {
      id: "estudo-revolucao-industrial",
      pedido: "Por que a Revolução Industrial começou na Inglaterra? Preciso de um texto de estudo para história, nível ensino médio.",
      resposta: `## Por que a Revolução Industrial começou na Inglaterra

**A ideia central:** não houve uma causa única. Na segunda metade do século XVIII, a Inglaterra reunia ao mesmo tempo capital acumulado, mão de obra disponível, recursos naturais, mercados e um ambiente político favorável. Foi essa combinação que tornou a mecanização lucrativa ali antes de outros lugares.

## 1. Capital acumulado
O comércio marítimo e colonial (incluindo o tráfico de pessoas escravizadas e a exploração das colônias) e a atividade bancária concentraram riqueza em mãos de comerciantes e proprietários dispostos a investir em máquinas e fábricas.

## 2. Mão de obra disponível
Os **cercamentos** (enclosures) transformaram terras de uso comum em propriedades privadas cercadas, voltadas à criação de ovelhas e à agricultura comercial. Muitos camponeses perderam o acesso à terra e migraram para as cidades, formando uma massa de trabalhadores assalariados. Ao mesmo tempo, a população crescia.

## 3. Recursos naturais
Havia **carvão** e **ferro** em abundância, muitas vezes próximos. O carvão alimentou as máquinas a vapor; o ferro, as máquinas e os trilhos. Rios navegáveis e uma costa extensa facilitavam o transporte.

## 4. Mercados
O império colonial e o comércio internacional forneciam matéria-prima, como o algodão, e compradores para os tecidos ingleses. Produzir mais e mais barato tinha para quem vender.

## 5. Ambiente político
Depois da Revolução Gloriosa (1688), o Parlamento limitou o poder do rei, e a burguesia ganhou peso nas decisões. Havia proteção à propriedade e incentivo ao lucro, inclusive por meio de patentes.

## 6. Tecnologia aplicada
A inovação começou no setor têxtil (lançadeira volante, máquinas de fiar) e ganhou força com a máquina a vapor aperfeiçoada por James Watt. Um argumento conhecido de historiadores econômicos: salários relativamente altos e carvão barato tornavam vantajoso **substituir trabalho por máquinas** na Inglaterra, o que não valia na mesma medida em outros países.

## Como organizar na prova
Uma boa resposta não lista fatores soltos: mostra que eles **se reforçam**. Os cercamentos liberaram trabalhadores; o capital comercial financiou as fábricas; o carvão permitiu o vapor; os mercados absorveram a produção.

## Erros comuns
- Atribuir tudo a uma invenção: a máquina a vapor foi acelerador do processo, não causa isolada.
- Esquecer o custo humano: jornadas longas, trabalho infantil e condições insalubres fazem parte da história.

## Para fixar
1. Que relação existe entre os cercamentos e o surgimento do operariado urbano?
2. Por que ter carvão e ferro próximos foi uma vantagem?`,
    },
    {
      id: "estudo-elasticidade",
      pedido: "O que é elasticidade-preço da demanda? Estou estudando microeconomia e não entendi como calcular nem pra que serve.",
      resposta: `## Elasticidade-preço da demanda

**A ideia central:** ela mede o quanto a quantidade demandada reage a uma mudança de preço, em termos percentuais. Responde à pergunta: "se o preço subir 10%, a quantidade comprada cai quanto?"

## A fórmula
Ep = (variação percentual da quantidade demandada) / (variação percentual do preço)

Como preço e quantidade costumam andar em sentidos opostos, o resultado tende a ser negativo; por isso se analisa o **valor absoluto**, |Ep|.

## Como interpretar
- |Ep| > 1, **elástica**: a quantidade reage mais que o preço. Ex.: uma marca específica de refrigerante, com muitos substitutos.
- |Ep| < 1, **inelástica**: a quantidade reage pouco. Ex.: sal, remédios essenciais, combustível no curto prazo.
- |Ep| = 1, **unitária**: variações na mesma proporção.

## Exemplo resolvido
O ingresso sobe de R$ 40 para R$ 44 (+10%), e a venda cai de 1.000 para 850 ingressos (−15%).
Ep = −15% / 10% = −1,5 → |Ep| = 1,5: demanda elástica.

(Aqui as variações foram calculadas sobre os valores iniciais. Livros mais rigorosos usam o **método do ponto médio**, que dá o mesmo resultado para subida e descida de preço: (−150/925) ÷ (4/42) ≈ −1,70.)

## Para que serve: a receita
Receita = preço × quantidade.
- Antes: 40 × 1.000 = R$ 40.000
- Depois: 44 × 850 = R$ 37.400

A receita **caiu**. Regra geral: com demanda elástica, aumentar o preço reduz a receita; com demanda inelástica, aumenta. Por isso empresas e governos (em impostos sobre cigarro e combustível, por exemplo) se importam com a elasticidade.

## O que torna uma demanda mais elástica
- substitutos próximos;
- peso do bem no orçamento;
- ser supérfluo em vez de necessidade;
- prazo: no longo prazo as pessoas se adaptam, e a demanda tende a ficar mais elástica.

## Erros comuns
- Confundir elasticidade com inclinação da curva: a inclinação depende das unidades; a elasticidade é percentual e muda ao longo de uma mesma curva linear.
- Esquecer o sinal: "elasticidade de 1,5" quer dizer o valor absoluto.

## Para fixar
1. Se o preço cai 20% e a quantidade sobe 5%, a demanda é elástica ou inelástica? O que acontece com a receita?
2. Por que a demanda por gasolina é mais inelástica numa semana do que em cinco anos?`,
    },
    {
      id: "estudo-mitose-meiose",
      pedido: "Qual a diferença entre mitose e meiose? Sempre confundo na hora da prova.",
      resposta: `## Mitose e meiose sem confusão

**A ideia central:** as duas são divisões celulares com objetivos diferentes. A **mitose** faz cópias: uma célula gera duas células idênticas a ela. A **meiose** forma células reprodutivas: uma célula gera quatro células com **metade** dos cromossomos e geneticamente diferentes entre si.

## Lado a lado
- Para quê: mitose → crescimento, reparo e reprodução assexuada; meiose → formar gametas (ou esporos).
- Divisões: mitose 1; meiose 2 (meiose I e meiose II).
- Células resultantes: mitose 2; meiose 4.
- Cromossomos: mitose mantém (2n → 2n); meiose reduz à metade (2n → n).
- Genética: mitose gera células iguais à original; meiose, células diferentes entre si.
- Em humanos: mitose em quase todo o corpo; meiose nos ovários e testículos.

## O passo que faz a diferença: meiose I
Na meiose I, os cromossomos **homólogos** (um veio da mãe, outro do pai) se emparelham e trocam pedaços: é o **crossing-over**. Depois os homólogos se separam, um para cada célula. É aqui que o número cai pela metade. A meiose II se parece com uma mitose: separa as cromátides-irmãs.

Na mitose, os homólogos **não** se emparelham: cada cromossomo se alinha sozinho e suas cromátides-irmãs se separam.

## Por que a meiose cria variedade
1. **Crossing-over**: mistura genes entre os homólogos.
2. **Segregação independente**: a orientação de cada par na divisão é aleatória. Com 23 pares, são 2²³ (mais de 8 milhões) combinações possíveis só por esse mecanismo.
Somando a fecundação, cada filho é uma combinação nova.

## Em números (humanos)
- Célula da pele (2n = 46) → mitose → 2 células com 46 cromossomos.
- Célula germinativa (2n = 46) → meiose → 4 células com 23 cromossomos. Na fecundação, 23 + 23 = 46.
(Na formação do óvulo, só uma das quatro células vira óvulo; as outras são os corpúsculos polares.)

## Para não confundir
**Mei**ose lembra **mei**o: reduz os cromossomos pela metade e precisa de duas divisões para gerar quatro células. Mitose: duas cópias idênticas.

## Erros comuns
- Achar que a meiose gera duas células: são quatro.
- Dizer que a mitose produz variação genética: as células-filhas são iguais (salvo mutações).
- Confundir cromátides-irmãs (cópias idênticas) com homólogos (um materno, um paterno).

## Para fixar
1. Em que divisão os homólogos se separam?
2. Uma espécie tem 2n = 8. Quantos cromossomos tem cada gameta? Quantas combinações a segregação independente permite?`,
    },
    {
      id: "estudo-lei-de-ohm",
      pedido: "Estou com dificuldade em circuitos: lei de Ohm e associação de resistores em série e paralelo. Pode explicar com um exercício resolvido?",
      resposta: `## Lei de Ohm e associação de resistores

**A ideia central:** a lei de Ohm relaciona tensão (U, em volts), corrente (i, em ampères) e resistência (R, em ohms): **U = R · i**. Associar resistores é combiná-los e encontrar uma resistência equivalente que produz o mesmo efeito no circuito.

## Lei de Ohm
- U: a diferença de potencial que empurra as cargas.
- i: quanta carga passa por segundo.
- R: o quanto o componente dificulta essa passagem.
Para uma mesma tensão, quanto maior a resistência, menor a corrente. Ex.: 12 V sobre 4 Ω → i = 12/4 = 3 A.

## Em série: um caminho só
Os resistores ficam um depois do outro.
- A **corrente é a mesma** em todos.
- As tensões se dividem e somam a tensão total.
- **Req = R1 + R2 + R3 + …** (a equivalente é maior que qualquer uma).

## Em paralelo: vários caminhos
Os resistores ficam lado a lado, ligados aos mesmos dois pontos.
- A **tensão é a mesma** em todos.
- A corrente se divide, e as correntes somam a total.
- **1/Req = 1/R1 + 1/R2 + …** (a equivalente é menor que a menor delas).
- Atalho para dois resistores: Req = (R1 · R2) / (R1 + R2).

## Exercício resolvido
Uma bateria de 12 V alimenta R1 = 2 Ω em série com um conjunto em paralelo de R2 = 6 Ω e R3 = 3 Ω. Ache a corrente total e a corrente em R2.
1. Paralelo: Rp = (6 · 3)/(6 + 3) = 18/9 = 2 Ω.
2. Série com R1: Req = 2 + 2 = 4 Ω.
3. Corrente total: i = U/Req = 12/4 = **3 A**, que passa inteira por R1.
4. Tensão em R1: U1 = 2 · 3 = 6 V. Sobram 12 − 6 = 6 V para o paralelo.
5. Corrente em R2: i2 = 6/6 = **1 A**. Em R3: i3 = 6/3 = 2 A. Confere: 1 + 2 = 3 A.

## Erros comuns
- Somar resistências em paralelo como se fosse série.
- Esquecer de inverter no fim: 1/Req = 1/2 → Req = 2 Ω, não 0,5 Ω.
- Achar que a corrente se gasta ao passar pelo resistor: em série ela é a mesma antes e depois; o que cai é a tensão.

## Para fixar
1. Dois resistores de 10 Ω em paralelo equivalem a quanto?
2. No exercício, qual resistor dissipa mais potência (P = U · i)?`,
    },
    {
      id: "estudo-crase",
      pedido: "Nunca sei quando usar crase. Dá pra explicar a regra de um jeito prático, com os casos que mais caem?",
      resposta: `## Crase: a regra que resolve quase tudo

**A ideia central:** crase é a fusão de dois "a": a **preposição a** (exigida por um verbo ou nome) com o **artigo a** (que acompanha uma palavra feminina) ou com o "a" inicial de aquele, aquela, aquilo. O acento grave (à) marca essa fusão. Se faltar um dos dois "a", não há crase.

## O teste da troca pelo masculino
Troque a palavra feminina por uma masculina equivalente:
- se aparecer **ao**, use crase;
- se aparecer só **o** ou **a**, não use.

Exemplos:
- Vou **à** escola → vou **ao** colégio: crase.
- Conheço **a** escola → conheço **o** colégio: sem crase (conhecer não pede preposição).
- Entreguei o livro **à** professora → **ao** professor: crase.

## Quando nunca há crase
- Antes de **palavra masculina**: andar a cavalo.
- Antes de **verbo**: começou a chover.
- Antes da maioria dos **pronomes** (ela, esta, você, alguém): falei a ela. Com "senhora" e "senhorita" pode haver: dirigiu-se à senhora.
- Entre **palavras repetidas**: cara a cara, gota a gota.
- Com "a" no singular antes de palavra no plural: fui a festas (é só a preposição; com artigo seria "às festas").

## Os casos que mais caem
- **Horas**: chegou às 8h; das 9h às 18h. Mas "desde as 8h", porque "desde" já é preposição.
- **À moda de**, mesmo subentendido: bife à milanesa, gol à Pelé.
- **Locuções femininas**: às vezes, à noite, à medida que, à procura de.
- **Lugares**, pelo teste "volto da / volto de": volto **da** Bahia → vou **à** Bahia; volto **de** Curitiba → vou **a** Curitiba.
- **Aquele, aquela, aquilo**: refiro-me **àquele** livro (a + aquele).

## Exemplo comentado
"Ele se referiu a esta questão e à anterior."
- "a esta": não existe artigo antes de "esta", então não há crase.
- "à anterior": referir-se **a** + **a** (questão) anterior, então há crase.

## Para fixar
Use ou não crase:
1. Assisti (a) peça ontem.
2. Ficou frente (a) frente com o problema.
3. Volto (a) Salvador amanhã.`,
    },
    {
      id: "estudo-imperativo-categorico",
      pedido: "Quero escrever um post de estudo sobre o imperativo categórico de Kant, explicando de forma acessível mas sem simplificar demais.",
      resposta: `## O imperativo categórico de Kant

**A ideia central:** para Kant, uma ação é moral não pelas consequências nem pelo prazer que traz, mas por ser feita **por dever**, seguindo uma regra que qualquer ser racional poderia querer para todos. O imperativo categórico é o teste dessa regra.

## Hipotético e categórico
Kant distingue dois tipos de ordem que a razão nos dá:
- **Imperativo hipotético**: vale *se* você quer algo. "Se quer passar na prova, estude." Quem não quer o fim não está obrigado.
- **Imperativo categórico**: vale incondicionalmente, para qualquer ser racional, seja qual for o desejo. "Não minta" não depende de "se você quiser…".
Para Kant, a moral só pode ser categórica; do contrário, seria apenas um conselho para conseguir coisas.

## A fórmula da lei universal
"Age apenas segundo a máxima pela qual possas ao mesmo tempo querer que ela se torne lei universal."
Uma **máxima** é a regra pessoal por trás de uma ação. O teste: imagine todos agindo por ela, sempre.

Exemplo clássico, a promessa falsa: "quando eu precisar de dinheiro, prometo devolver sabendo que não vou". Universalizada, ninguém mais acreditaria em promessas, e a própria prática de prometer desapareceria. A máxima se **autodestrói** ao ser universalizada; por isso é proibida.

## A fórmula da humanidade
"Age de tal maneira que uses a humanidade, tanto na tua pessoa como na de qualquer outro, sempre ao mesmo tempo como fim e nunca simplesmente como meio."
O ponto está no "simplesmente". Usamos pessoas como meio o tempo todo (o padeiro me vende pão), e isso não é errado. Errado é tratá-las *apenas* como instrumento, desrespeitando sua capacidade de decidir, como na promessa falsa, em que o outro é manipulado sem poder consentir.

## Por dever e conforme o dever
Um comerciante que não engana clientes só por medo de perder a clientela age **conforme** o dever, mas não **por** dever. Para Kant, a ação só tem valor moral quando o motivo é o respeito à lei moral, não o interesse.

## Críticas frequentes
- **Rigidez**: o próprio Kant sustentou que não se deve mentir nem a um assassino que procura um amigo escondido, conclusão que muitos consideram inaceitável.
- **Conflito de deveres**: o que fazer quando dois deveres se chocam?
- **Formalismo**: o teste diria o que é proibido, mas orientaria pouco sobre o que fazer em situações concretas.

## Para fixar
1. Por que "se quer ser respeitado, respeite os outros" não é um imperativo categórico?
2. Qual a diferença entre usar alguém como meio e usá-lo simplesmente como meio?`,
    },
  ],
};
