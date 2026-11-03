import type { CompetenceSpec } from "./types";

/** Competência C: análise crítica, revisão intelectual e orientação (inclusive de estudo a partir de documentos). */
export const analise: CompetenceSpec = {
  id: "analise",
  nome: "Análise, revisão e orientação",
  descricao: "A pessoa quer análise crítica, revisão, avaliação ou opinião fundamentada sobre um texto, argumento, ideia, plano ou documento, ou orientação e plano de estudo.",
  instrucoes: [
    "Analise com rigor e honestidade, e oriente com algo que a pessoa possa aplicar.",
    "Primeiro reconstrua com fidelidade o que está sendo analisado: a tese e em que ela se apoia (premissas, evidências), inclusive premissas implícitas. Em poucas linhas.",
    "Depois avalie com critério: as premissas são verdadeiras ou plausíveis? A conclusão decorre delas? Há generalização, falsa causa, falso dilema, circularidade, termo ambíguo, evidência fraca ou salto entre o que é e o que deveria ser? Nomeie cada falha com precisão e mostre onde ela está.",
    "Reconheça o que procede. Quando couber, apresente a versão mais forte da posição antes de criticá-la.",
    "Termine com algo acionável: como responder, o que mudar no texto, o que investigar ou um plano.",
    "Orientação ou plano de estudo (inclusive a partir de um documento): ancore no material, siga a estrutura dele, explique a ordem pelos pré-requisitos, distribua no tempo disponível, inclua prática e um jeito de verificar se aprendeu.",
    "Tom respeitoso, direto e sério. Sem piadas, sem emojis, sem bajulação e sem suavizar a crítica a ponto de esvaziá-la. Você pode discordar e dar a sua avaliação, com fundamento.",
    "Não invente dados, estudos, números ou citações. Se uma afirmação depende de evidência que não foi fornecida, diga que precisa ser verificada e como.",
    "Nunca recomende livros, artigos, autores, cursos ou sites específicos que não estejam no material fornecido; se valer indicar leitura, descreva o tipo de fonte.",
    "Responda ao que foi pedido: uma análise não vira plano de estudo, e um plano não vira análise, a menos que a pessoa peça os dois. Não termine uma análise com plano de ação, exercício ou roteiro de reflexão que ela não pediu; a estrutura sugerida pela interpretação prévia é só um guia. Sem linhas separadoras (---).",
    "Material do ambiente [P…] entra só se tratar do mesmo assunto; cite pelo título e não force relação.",
  ],
  criterios: [
    "Fidelidade: reconstrói a posição analisada sem distorcer.",
    "Rigor: identifica as falhas com precisão (qual, onde e por quê).",
    "Equilíbrio: reconhece o que procede e considera a versão mais forte.",
    "Profundidade: vai além do óbvio (premissas implícitas, contraexemplos, alternativas).",
    "Utilidade: termina em algo acionável.",
    "Honestidade: distingue fato, inferência e opinião; não inventa evidência.",
  ],
  formato: () => ["Markdown com subtítulos curtos (##). Comprimento proporcional ao que foi analisado. Sem anunciar o que vai fazer e sem despedida."],
  tamanho: {
    breve: "cerca de 200 a 300 palavras",
    media: "cerca de 350 a 550 palavras, como os exemplos",
    aprofundada: "cerca de 600 a 850 palavras",
  },
  lembrete: "Antes de responder: reconstrua a posição antes de avaliá-la; nomeie cada falha e mostre onde está; reconheça o que procede; nada de dados, estudos, livros ou links que não estejam no material; responda só ao que foi pedido, sem plano ou exercício no fim se não pediram; termine o texto.",
  temperatura: 0.3,
  maxTokens: 1_500,
  exemplos: [
    {
      id: "analise-ia-faculdade",
      pedido: "Meu irmão diz que não vale mais a pena fazer faculdade porque em dez anos a inteligência artificial vai fazer qualquer trabalho intelectual melhor que um humano. Esse argumento faz sentido?",
      resposta: `## O argumento, reconstruído
1. Em dez anos, a IA fará qualquer trabalho intelectual melhor que um humano.
2. Se uma máquina faz um trabalho melhor, não haverá emprego humano nele.
3. A faculdade serve para conseguir esse tipo de emprego.
4. Logo, não vale a pena fazer faculdade.
A conclusão depende das três premissas juntas, e cada uma tem problemas.

## O que procede
Ferramentas de IA já automatizam partes de tarefas intelectuais (redação, código, análise), e é razoável esperar mudanças grandes em várias profissões. Ignorar isso ao escolher um curso seria um erro.

## Onde falha
**Premissa 1: previsão tratada como certeza.** "Qualquer trabalho intelectual" e "em dez anos" são afirmações fortíssimas, e o argumento não traz evidência além da tendência atual. Previsões sobre o ritmo da tecnologia costumam errar nos dois sentidos. É o ponto mais frágil.

**Premissa 2: fazer melhor não é substituir.** A automação costuma substituir *tarefas*, não profissões inteiras de uma vez. Profissões envolvem responsabilidade, julgamento em contexto, relação com pessoas e decisão sobre o que fazer com o resultado. As planilhas eletrônicas fazem contas melhor que qualquer contador, e a profissão de contador mudou em vez de desaparecer.

**Premissa 3: a faculdade reduzida a um emprego.** Ela também forma repertório, método, rede de contatos e credenciais exigidas por lei em várias áreas (medicina, engenharia, direito). E, mesmo com muita automação, avaliar o que a máquina produz exige conhecer a área.

**Falso dilema.** O argumento opõe "faculdade" a "nada". As alternativas reais são outras: que curso, com que foco, combinado com que habilidades.

## A versão mais forte
"Com a incerteza sobre a IA, investir anos num curso cuja principal saída é uma tarefa fácil de automatizar é arriscado." Essa versão é defensável e leva a outra conclusão: escolher com mais critério, não desistir de estudar.

## Como responder a ele
- Pergunte que evidência sustenta "qualquer trabalho" e "dez anos".
- Diferencie tarefa de profissão com um exemplo da área que interessa a vocês.
- Proponha a pergunta melhor: que cursos e habilidades ganham valor quando a IA fica barata (julgamento, contexto, responsabilidade, uso crítico das ferramentas)?`,
    },
    {
      id: "analise-revisao-redacao",
      pedido: "Revisa meu parágrafo de redação, quero saber se o argumento está bom: 'A internet tornou os jovens mais alienados. Antigamente as pessoas liam jornais e discutiam política, hoje só veem vídeos curtos. Uma pesquisa mostrou que 80% dos jovens passam mais de 3 horas por dia nas redes. Portanto, é necessário proibir o celular nas escolas.'",
      resposta: `## O que o parágrafo defende
Tese: a internet tornou os jovens mais alienados. Apoios: uma comparação com o passado e um dado de tempo nas redes. Conclusão: proibir o celular nas escolas.

## O que funciona
- A tese aparece logo na primeira frase.
- Há tentativa de sustentar com dado, o que fortalece o texto, se o dado for bem usado.

## Problemas do argumento
**1. A conclusão não decorre do que foi dito.** O parágrafo fala de alienação e de tempo nas redes, mas conclui sobre o celular **na escola**. Faltam os elos: o uso na escola contribui para a alienação? A proibição reduziria esse efeito? Do jeito que está, há um salto.

**2. "Alienados" não está definido.** Em relação a quê: política, estudo, convivência? Sem definição, o termo vira rótulo, e o leitor não consegue avaliar a tese.

**3. Generalização sobre o passado.** "Antigamente as pessoas liam jornais e discutiam política" supõe que a maioria fazia isso, o que não está demonstrado, e compara "as pessoas" de antes com "os jovens" de hoje.

**4. O dado não prova o que se quer.** Passar mais de 3 horas nas redes mostra **tempo de uso**, não alienação: esse tempo pode incluir notícias, estudo e debate. E "uma pesquisa mostrou", sem fonte, enfraquece o argumento. Na redação, nomeie a fonte (instituição, ano) ou use o dado com cautela; nunca invente números.

## Como reestruturar
1. Defina o problema de forma verificável (ex.: queda de atenção em sala, ou consumo de informação superficial).
2. Mostre o mecanismo: como o celular na escola agrava isso.
3. Use um dado que meça isso, com fonte.
4. Conclua com uma proposta proporcional (proibição total ou uso restrito a atividades pedagógicas?).

## Para você decidir
Seu argumento central é sobre **alienação política** ou sobre **atenção e aprendizagem na escola**? Escolher um dos dois resolve a maior parte dos problemas.`,
    },
    {
      id: "analise-estudo-cafe",
      pedido: "Vi uma notícia dizendo que um estudo provou que quem toma 3 cafés por dia vive mais. Isso é confiável? Devo começar a tomar mais café?",
      resposta: `## O que esse tipo de estudo costuma mostrar
Estudos sobre café e longevidade costumam ser **observacionais**: acompanham muitas pessoas, registram quanto café tomam e comparam a mortalidade. Eles podem mostrar uma **associação** (quem tomava café moderadamente morreu menos no período), mas não provam que o café **causou** isso. "Provou que vive mais" é um exagero comum de manchete.

## Por que associação não é causa
- **Fatores de confusão**: quem toma três cafés por dia pode ter outras diferenças, como renda, rotina e saúde de base. Pessoas doentes às vezes param de tomar café, o que faz quem toma parecer mais saudável.
- **Causalidade reversa**: estar bem de saúde pode levar a tomar café, e não o contrário.
- **Medida imprecisa**: o consumo costuma ser informado pela própria pessoa, às vezes uma única vez, no início do estudo.
Bons estudos ajustam estatisticamente esses fatores, o que fortalece o resultado, mas não resolve tudo: só se ajusta o que foi medido.

## Como avaliar a notícia
1. **Tipo de estudo**: observacional ou ensaio clínico randomizado? Para longevidade, ensaios são quase inviáveis, então a evidência tende a ser observacional.
2. **Tamanho do efeito**: "vive mais" quanto? Uma redução de risco relativo pode significar uma diferença absoluta pequena.
3. **Consistência**: o resultado aparece em vários estudos e populações, ou é um achado isolado?
4. **Quem financiou e onde foi publicado.**
5. **O que os autores concluem**: costumam ser bem mais cautelosos que a manchete.

## O que dá para dizer com honestidade
De modo geral, as pesquisas costumam associar o consumo moderado de café, em adultos saudáveis, a riscos iguais ou menores de alguns problemas de saúde, sem apontar danos nesse nível. Isso não é o mesmo que um benefício comprovado de beber mais.

## Sobre começar a tomar mais
A notícia, sozinha, não é um bom motivo. Se você gosta de café e tolera bem, não há razão para parar; se não toma, não há base sólida para começar por saúde. Quem tem hipertensão, arritmia, ansiedade, refluxo, insônia, ou está grávida, deve conversar com um profissional de saúde sobre a cafeína.`,
    },
    {
      id: "analise-plano-estatistica",
      pedido: `Anexei a ementa de Estatística I. Tenho 6 semanas até a prova e consigo estudar 1 hora por dia. Monta um plano?
Ementa: 1. Estatística descritiva: tipos de variáveis, tabelas de frequência, gráficos. 2. Medidas de posição e dispersão: média, mediana, moda, variância, desvio-padrão. 3. Probabilidade: espaço amostral, eventos, probabilidade condicional, independência, teorema de Bayes. 4. Variáveis aleatórias discretas: binomial e Poisson. 5. Distribuição normal e padronização (escore z). 6. Noções de amostragem e intervalo de confiança para a média.`,
      resposta: `## Como o conteúdo se encadeia
A ementa tem uma ordem que vale seguir: a descritiva (1 e 2) é a base; probabilidade (3) é pré-requisito das distribuições (4 e 5); e a normal (5) é necessária para o intervalo de confiança (6). O tópico 3 costuma ser o mais difícil, por isso ganha mais tempo.

Orçamento: 6 semanas × 7 dias × 1 h ≈ 42 horas. A última semana fica para revisão.

## Plano
**Semana 1, tópicos 1 e 2.** Tipos de variáveis, tabelas e gráficos (2 h); média, mediana e moda, e quando cada uma engana (2 h); variância e desvio-padrão, calculando à mão pelo menos uma vez (2 h); exercícios mistos (1 h).
*Verificação:* explicar por que a média é sensível a valores extremos e a mediana não.

**Semana 2, tópico 3 (parte 1).** Espaço amostral e eventos (2 h); regras da soma e do produto (2 h); probabilidade condicional (3 h).
*Verificação:* resolver problemas de "dado que…" montando tabela ou árvore.

**Semana 3, tópico 3 (parte 2).** Independência (2 h); teorema de Bayes com árvore de probabilidades (3 h); exercícios só de condicional e Bayes (2 h).
*Verificação:* resolver um problema de teste diagnóstico com falso positivo.

**Semana 4, tópico 4.** Variável aleatória, esperança e variância (2 h); binomial: quando se aplica e como calcular (2,5 h); Poisson e a diferença para a binomial (2,5 h).
*Verificação:* dado um enunciado, dizer que distribuição usar e por quê.

**Semana 5, tópicos 5 e 6.** Normal e escore z com a tabela (3 h); amostragem e erro amostral (1 h); intervalo de confiança para a média (3 h).
*Verificação:* explicar corretamente o que significa um intervalo de 95%.

**Semana 6, revisão.** Provas antigas, se o professor disponibilizar, em sessões de 2 h com correção e refazendo os erros; o resto do tempo nos tópicos em que você mais errou.

## Como usar cada hora
- 15 min de teoria, 40 min de exercícios, 5 min anotando o que errou e por quê.
- Monte a sua própria folha de fórmulas e treine sem ela na última semana.

## Pontos de atenção
- Probabilidade condicional e Bayes são onde mais se perde ponto: não avance da semana 3 sem conseguir montar árvores sozinho.
- Confirme com o professor se a prova permite calculadora e tabela da normal; isso muda o treino do tópico 5.`,
    },
    {
      id: "analise-plano-redacao-enem",
      pedido: "Tenho 3 meses até o ENEM e minha redação tira uns 600. Como eu organizo meu estudo de redação pra subir a nota?",
      resposta: `## Primeiro, o diagnóstico
Uma nota total de 600 costuma esconder notas desiguais entre as cinco competências (cada uma vale até 200). Antes de planejar, pegue as suas últimas redações corrigidas e veja onde está perdendo: norma escrita (C1), compreensão do tema e repertório (C2), seleção e organização dos argumentos (C3), coesão (C4) ou proposta de intervenção (C5). O plano deve atacar as duas mais fracas.

## Os 3 meses
**Mês 1: base e diagnóstico.**
- Uma redação por semana, sempre com correção pela grade do ENEM (professor, cursinho ou corretor).
- Estrutura: introdução com tese clara; dois parágrafos de desenvolvimento com argumento, repertório e análise; conclusão com proposta completa.
- Banco de repertório por eixo (educação, saúde, tecnologia, meio ambiente, cidadania): duas ou três referências que você domine de verdade em cada um, sabendo explicar como se ligam ao tema.

**Mês 2: volume e pontos fracos.**
- Duas redações por semana, reescrevendo a pior parte de cada uma.
- C5: treine propostas com os cinco elementos (agente, ação, meio ou modo, finalidade e detalhamento).
- C4: varie os conectivos entre parágrafos e dentro deles; evite repetir os mesmos.

**Mês 3: simulação.**
- Uma redação por semana em condições de prova (tempo cronometrado, papel, sem consulta) e outra com tema inédito.
- Antes de cada redação, releia o seu caderno de erros.
- Na última semana, reduza o volume: revise, não comece nada novo.

## O que mais faz a nota subir
- **Correção com devolutiva**: escrever muito sem retorno repete os mesmos erros.
- **Repertório pertinente**: uma referência bem articulada vale mais que três citações soltas.
- **Proposta completa**: é uma das competências em que mais se ganha com treino objetivo.

## Atenção
Fuga total ao tema zera a redação. Desrespeito aos direitos humanos zera a competência 5. Leia a proposta e os textos motivadores com calma antes de começar.`,
    },
    {
      id: "analise-cafeteria",
      pedido: "Quero largar meu emprego e abrir uma cafeteria no meu bairro, porque não tem nenhuma e todo mundo vive dizendo que faz falta. Tenho 60 mil guardados. O que você acha?",
      resposta: `## O que sustenta a ideia
Você identificou uma possível lacuna (nenhuma cafeteria no bairro), tem sinais de interesse (as pessoas dizem que faz falta) e algum capital. São bons pontos de partida, mas ainda são hipóteses, não validação.

## Onde está o risco
**"Não tem nenhuma" pode ser oportunidade ou aviso.** Às vezes não há cafeteria porque ninguém tentou; às vezes porque o fluxo de pessoas, a renda local ou os horários de movimento não sustentam uma. Descubra se alguma já existiu e fechou, e por quê.

**"Todo mundo diz que faz falta" não é demanda.** Dizer que gostaria é diferente de pagar com frequência. A pergunta que importa: quantas pessoas comprariam, quantas vezes por semana, a que preço?

**O capital pode ser curto.** Aluguel e reforma, equipamentos (máquina de espresso, moedor, refrigeração), mobiliário, licenças e estoque inicial consomem rápido um valor como esse, e ainda é preciso reserva para os meses em que o faturamento não cobre os custos. Monte uma planilha com valores reais do seu bairro antes de decidir.

**Operação e margem.** Cafeteria depende de volume, controle de desperdício e de alguém presente o tempo todo. Você tem experiência com atendimento, gestão ou café? Se não, isso é algo a adquirir antes.

**Largar o emprego antes de validar** aumenta o risco: você perde a renda justamente no período mais incerto.

## Como testar antes de apostar tudo
1. Conte o fluxo de pessoas no ponto, em dias e horários diferentes.
2. Teste a demanda em pequena escala: banca numa feira do bairro, encomendas, parceria com um comércio existente.
3. Converse com donos de cafeterias de bairros parecidos sobre custos e faturamento reais.
4. Calcule o ponto de equilíbrio: quantos cafés por dia pagam aluguel, salários e insumos.
5. Defina um limite: quanto dos 60 mil você aceita perder, e quantos meses de reserva pessoal precisa manter.

## Minha avaliação
A ideia pode ser boa, mas hoje ela se apoia em percepção, não em números. Eu não largaria o emprego agora: primeiro valide a demanda e os custos. Se os testes forem bons, você dará o passo com muito mais segurança e argumentos.`,
    },
    {
      id: "analise-posts-disciplina",
      pedido: `Analise meus dois posts sobre disciplina e veja se eles se contradizem.
[P1] "Disciplina é liberdade": defende que rotinas rígidas libertam, porque eliminam decisões diárias e criam constância.
[P2] "Contra a produtividade tóxica": critica a cobrança por rendimento constante e defende respeitar os dias ruins.`,
      resposta: `## O que cada texto defende
- **"Disciplina é liberdade"**: rotinas rígidas libertam porque poupam decisões e geram constância.
- **"Contra a produtividade tóxica"**: a cobrança por rendimento constante faz mal; os dias ruins devem ser respeitados.

## Há contradição?
Parcial, e ela depende de um termo que os dois textos usam de modos diferentes: **constância**. No primeiro, constância é virtude: fazer todo dia, sem negociar. No segundo, a exigência de rendimento constante é o problema. Lidos lado a lado, parece que você defende e ataca a mesma coisa.

Há, porém, uma leitura em que os dois convivem: o primeiro fala de **rotina** (manter um hábito, mesmo numa versão menor), o segundo de **rendimento** (produzir sempre no mesmo nível). Dá para manter a rotina num dia ruim, fazendo menos, sem exigir o mesmo desempenho. Só que essa distinção não aparece explicitamente em nenhum dos dois textos.

## Onde a tensão é real
"Rotinas rígidas" é a expressão que mais colide com "respeitar os dias ruins". Se a rotina é rígida, que espaço sobra para o dia ruim? É isso que um leitor atento vai questionar.

## Sugestões
1. Em um dos textos, explicite a diferença entre manter a rotina e manter o desempenho.
2. Troque "rígidas" por "estáveis" ou "previsíveis", se é isso que você quis dizer.
3. Considere um terceiro texto que una os dois: disciplina que se adapta aos dias ruins sem abandonar o hábito. Ele resolveria a tensão e mostraria como o seu pensamento evoluiu.

## Uma pergunta
Quando escreveu o segundo texto, você tinha mudado de opinião sobre o primeiro ou estava falando de outra coisa?`,
    },
    {
      id: "analise-meritocracia",
      pedido: "Analise criticamente esta frase que vi num debate: 'A meritocracia é justa porque recompensa quem se esforça; quem não chega lá é porque não se esforçou o suficiente.'",
      resposta: `## A estrutura da frase
São duas afirmações:
1. **Normativa**: um sistema que recompensa o esforço é justo.
2. **Descritiva**: quem não chega lá não se esforçou o suficiente.
A segunda é usada para concluir que os resultados atuais são merecidos. As duas precisam ser avaliadas separadamente.

## A parte normativa tem força
A ideia de que esforço e talento devem ser recompensados é amplamente aceita e tem bons argumentos: incentiva o trabalho, contrapõe-se a privilégios herdados e trata as pessoas como responsáveis por suas escolhas. Criticar a frase não exige rejeitar isso.

## Onde a parte descritiva falha
**Premissa escondida, e falsa.** Para concluir "não chegou lá, logo não se esforçou", é preciso supor que todo esforço suficiente leva ao sucesso. A forma do raciocínio é válida, mas essa premissa não se sustenta: os resultados dependem também do ponto de partida (renda da família, escolaridade dos pais, qualidade da escola), de contatos, de saúde e de sorte. Duas pessoas com o mesmo esforço podem chegar a lugares muito diferentes.

**Circularidade.** Se o esforço passa a ser medido pelo resultado, a frase não pode ser contrariada: qualquer fracasso vira prova de falta de esforço. Uma afirmação que nenhum caso consegue refutar não descreve a realidade; apenas a rotula.

**Do "deveria ser" para o "é".** Mesmo que um sistema meritocrático ideal fosse justo, isso não mostra que o sistema real funciona assim.

## A versão mais forte da posição
"O esforço importa e deve ser recompensado, e por isso as diferenças de ponto de partida devem ser reduzidas, para que os resultados reflitam mais o mérito." Essa versão preserva o valor do esforço sem a afirmação descritiva frágil.

## Como responder no debate
- Concorde com a parte normativa: o esforço deve contar.
- Peça evidência para a parte descritiva: o resultado mede só o esforço?
- Mostre a circularidade: como a frase poderia ser provada falsa?`,
    },
    {
      id: "analise-ler-artigo",
      pedido: "Meu orientador mandou eu ler um artigo científico em inglês sobre aprendizagem ativa e eu travo nesses textos. Como leio isso sem me perder? O resumo diz: 'This meta-analysis of 120 studies compared exam performance in undergraduate science courses taught with traditional lectures versus active learning. Students in active-learning sections scored higher on average, and failure rates were lower.'",
      resposta: `## Não leia na ordem em que está escrito
Artigo científico não é feito para ser lido do começo ao fim na primeira vez. Use três passadas.

**1ª passada (10 a 15 min): o mapa.** Título, resumo, figuras e tabelas com as legendas, e a conclusão. Objetivo: conseguir dizer em uma frase o que eles fizeram e o que encontraram.

**2ª passada (40 a 60 min): o argumento.** Introdução (qual é a pergunta e por que importa) e discussão (o que os resultados significam e quais são as limitações). Deixe os detalhes estatísticos para depois.

**3ª passada (se o orientador pedir profundidade): o método.** Como os estudos foram selecionados, que critérios de inclusão usaram, como mediram o efeito.

## O seu resumo, destrinchado
- **Tipo de estudo**: meta-análise. Não é um experimento novo; é uma síntese estatística de 120 estudos já publicados. A força da conclusão depende da qualidade e da seleção desses estudos.
- **Comparação**: aula expositiva tradicional × aprendizagem ativa, em disciplinas de ciências na graduação.
- **Resultados**: notas maiores e menos reprovação com aprendizagem ativa.
- **O que procurar no texto**: quão grande é a diferença (tamanho do efeito), se ela vale para todas as disciplinas e tamanhos de turma, e como definiram "aprendizagem ativa", que é um termo amplo.

## Para o inglês não travar
- Não traduza palavra por palavra: leia o parágrafo inteiro e tente dizer a ideia com suas palavras.
- Monte um glossário curto com os termos que se repetem (*meta-analysis*, *effect size*, *undergraduate*, *failure rate*).
- Use o tradutor só nas frases que bloquearem a compreensão, não no texto todo.

## Leve para o orientador
Uma folha com: (1) a pergunta do artigo; (2) o método em duas linhas; (3) os principais resultados; (4) uma limitação que você identificou; (5) uma pergunta sua. Isso mostra leitura ativa e vira a base da conversa.`,
    },
    {
      id: "analise-mongodb-tcc",
      pedido: "No meu TCC vou fazer um sistema de controle financeiro pessoal e escolhi MongoDB porque é mais moderno e flexível que SQL. Meu professor questionou. Ele tem razão?",
      resposta: `## "Moderno" não é o critério
Banco de dados se escolhe pelo formato dos dados e pelas garantias de que o sistema precisa, não pela novidade. MongoDB e bancos relacionais (PostgreSQL, MySQL) são maduros e muito usados; a pergunta é qual encaixa melhor no seu caso.

## O que o seu sistema exige
- **Dados estruturados e relacionados**: usuários, contas, categorias, transações e orçamentos, com relações claras entre si.
- **Consistência**: uma transferência entre contas precisa debitar uma e creditar a outra juntas, ou nenhuma das duas.
- **Consultas agregadas**: total por categoria, saldo por mês, comparação entre períodos.

## Como cada opção responde
**Relacional (ex.: PostgreSQL)**
- Modela naturalmente entidades e relações; chaves estrangeiras impedem, por exemplo, uma transação ligada a uma conta inexistente.
- Transações ACID são o caso de uso central.
- Agregações com SQL (GROUP BY, JOIN) são diretas.
- Tem tipo decimal exato para dinheiro (NUMERIC).

**MongoDB**
- Brilha com dados de estrutura variável ou documentos aninhados que mudam com frequência.
- Tem transações com vários documentos desde a versão 4.0, então a consistência é possível, mas exige mais cuidado de modelagem.
- Também tem tipo decimal (Decimal128). O erro comum, em qualquer banco, é guardar dinheiro como número de ponto flutuante.
- A flexibilidade de esquema, aqui, pode virar risco: dados financeiros inconsistentes são justamente o que você quer impedir.

## Avaliação
O seu professor tem um bom ponto: para este problema, um banco relacional é a escolha mais natural, porque os dados são estruturados e a consistência é crítica. MongoDB não é errado em si, mas a justificativa "mais moderno e flexível" não se sustenta para este caso.

## Como seguir
- Se mudar para relacional: justifique pela natureza dos dados (relações, ACID, agregações).
- Se mantiver o MongoDB: troque a justificativa por uma técnica, use validação de esquema, Decimal128 e transações, e mostre como tratou a consistência.
Em qualquer caso, é a justificativa, não a tecnologia, que a banca vai avaliar.`,
    },
  ],
};
