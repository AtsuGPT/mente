import type { CompetenceSpec } from "./types";

/** Competência B: transformar os pensamentos da própria pessoa em um post elaborado. */
export const post: CompetenceSpec = {
  id: "post",
  nome: "Post a partir dos pensamentos da pessoa",
  descricao: "A pessoa expõe ideias, opiniões ou vivências próprias e quer transformá-las em um post. O conteúdo é dela; a Kally organiza, aprofunda e dá forma.",
  instrucoes: [
    "Transforme os pensamentos DELA em um post elaborado. Seu trabalho é organizar, aprofundar e dar forma; o conteúdo é dela.",
    "Fidelidade: use só as ideias, vivências e opiniões que ela expressou. Você pode desenvolver o que está implícito, ligar os pontos, escolher a ordem, usar os exemplos e detalhes que ela deu e propor um título. Não acrescente opiniões, fatos, detalhes, vivências ou conclusões que ela não deu.",
    "Voz: o rascunho é escrito na voz dela, em primeira pessoa e no registro dela (se ela escreve de forma simples, mantenha simples). Fora do rascunho, fale com ela usando \"você\" e nunca conte as vivências dela como se fossem suas.",
    "Quando escrever: se ela já trouxe matéria suficiente (uma ideia central e algum desenvolvimento, vivência ou exemplo), escreva o rascunho já nesta resposta. Se trouxe só um tema ou uma frase solta, não escreva ainda: faça UMA pergunta concreta que destrave o texto (um caso vivido, o motivo, o que ela quer que o leitor perceba).",
    "Elaborar não é encher: cada parágrafo precisa ter função (situar, desenvolver, mostrar, concluir). Prefira o concreto que ela contou a abstrações genéricas. Evite clichês, frases motivacionais e moral da história que ela não tirou.",
    "Antes de entregar, confira frase por frase: cada frase diz algo que ela disse, liga duas coisas que ela disse ou explicita o que está claramente implícito nelas? Se não, corte. Nunca invente fatos, detalhes, cenas, lembranças ou sentimentos: se não está na fala dela, não está no texto. Não feche com lição, chamada ao leitor ou reflexão que ela não fez.",
    "Se houver a lista de pontos da interpretação prévia, desenvolva esses pontos, na ordem que fizer sentido, sem acrescentar outros.",
    "Quando for perguntar em vez de escrever: UMA pergunta só, numa frase, sem lista de perguntas, sem condições e sem cobrança.",
    "Estrutura: título que capture a ideia dela; abertura que situe; desenvolvimento que aprofunde os pontos dela na ordem que fizer mais sentido; fechamento que retome a ideia central dela sem inventar conclusão nova.",
    "Não use o gênero gramatical da pessoa se ela não o revelou; prefira construções neutras.",
    "Pensamentos do ambiente [P…] podem ser sugeridos pelo título depois do rascunho; nunca entram no texto como se fossem dela.",
    "O post é público. Dos documentos pessoais [D…], use só o que ela pediu para entrar no texto; nunca copie para o rascunho códigos, identificadores, valores financeiros, endereços ou dados de outras pessoas que ela não mencionou na conversa.",
  ],
  criterios: [
    "Fidelidade: todas as ideias centrais dela estão no texto; nada de opinião, fato ou vivência inventada.",
    "Voz: soa como ela, em primeira pessoa, no registro dela.",
    "Desenvolvimento: as ideias foram aprofundadas e ligadas, não só reescritas ou listadas.",
    "Estrutura: começo, meio e fim claros; título que captura a ideia.",
    "Concretude: usa os exemplos e detalhes que ela deu.",
    "Conversa: fora do rascunho, breve, com no máximo uma pergunta.",
  ],
  formato: ({ canDraft, categories }) => [
    "Comece com UMA frase curta dizendo, com \"você\", o que entendeu que ela quer. Sem linhas separadoras (---).",
    canDraft
      ? "Rascunho no formato exato abaixo. Ela confirma no botão Publicar do app; nunca diga que já publicou.\n<rascunho>\n# Título\nCategorias: Nome1, Nome2\n\nCorpo em Markdown\n</rascunho>"
      : "Escreva o texto em Markdown, com o título em # (a pessoa não publica neste ambiente).",
    canDraft ? `Escolha até 2 categorias só desta lista: ${categories.length ? categories.join(", ") : "(nenhuma categoria criada; deixe a linha vazia)"}.` : "",
    "Depois do texto, em até três linhas: o que você preservou ou organizou, dois títulos alternativos e UMA pergunta ou sugestão para aprofundar.",
    "Se a matéria ainda não basta para um texto, responda só com a frase de entendimento e a pergunta.",
  ].filter(Boolean),
  tamanho: {
    breve: "rascunho de cerca de 150 a 250 palavras",
    media: "rascunho de cerca de 200 a 400 palavras, proporcional ao que ela contou",
    aprofundada: "rascunho de cerca de 400 a 700 palavras, sem inventar matéria para encher",
  },
  // Sem exemplos de frases proibidas: citá-las fazia o modelo usá-las.
  lembrete: "Antes de responder: (1) a frase de entendimento é curta e não acrescenta nada; (2) no rascunho, nenhum fato, detalhe, cena, lembrança, sentimento ou reflexão que a pessoa não contou, e nenhuma lição no fim; (3) se for perguntar em vez de escrever, uma única pergunta, numa frase.",
  temperatura: 0.3,
  maxTokens: 2_048,
  exemplos: [
    {
      id: "post-entre-dois-lugares",
      pedido: "Faz dois anos que saí de Garanhuns pra trabalhar em São Paulo. No começo eu achava que a saudade ia passar, mas ela mudou de forma. Não sinto falta só da minha mãe, sinto falta de ser conhecido na padaria, de alguém perguntar do meu pai na rua. Aqui eu sou só mais um. Ao mesmo tempo, foi aqui que eu aprendi a me virar sozinho e não me arrependo. Queria escrever sobre isso, essa coisa de pertencer a dois lugares e a nenhum.",
      resposta: `Entendi: você quer falar de uma saudade que deixou de ser só das pessoas e virou falta de pertencimento, sem negar o que a cidade nova te deu.

<rascunho>
# Entre dois lugares

Faz dois anos que saí de Garanhuns para trabalhar em São Paulo. Quando cheguei, achava que a saudade era uma coisa com prazo: doía no começo e depois passava. Não passou. Mudou de forma.

No início, a saudade tinha rosto. Era da minha mãe. Com o tempo, percebi que eu sentia falta de algo mais difícil de explicar: de ser conhecido. Na padaria de lá, ninguém precisava perguntar meu nome. Na rua, alguém sempre parava para saber do meu pai. Eu não era só um cliente ou alguém de passagem. Eu era de algum lugar.

Aqui, sou só mais um. E é estranho perceber o quanto aquele reconhecimento miúdo, de todo dia, me sustentava sem que eu notasse.

Ao mesmo tempo, seria injusto contar só o lado da falta. Foi em São Paulo que aprendi a me virar sozinho, a resolver o que antes alguém resolveria por mim. Não me arrependo de ter vindo.

Talvez seja isso que eu ainda estou aprendendo a nomear: pertencer a dois lugares e, ao mesmo tempo, a nenhum. Em Garanhuns estão as minhas raízes, mas a minha vida agora está aqui. Em São Paulo construí essa vida, mas ainda sou só mais um. A saudade, hoje, é isso: estar dividido.
</rascunho>

Mantive as suas imagens concretas (a padaria, a pergunta sobre o seu pai) e a ressalva de que não se arrepende. Títulos alternativos: "A saudade mudou de forma" · "Mais um na cidade grande". Teve algum momento em que essa divisão ficou mais clara, como uma visita a Garanhuns?`,
    },
    {
      id: "post-trabalho-remoto",
      pedido: "trabalho de casa há 3 anos. todo mundo fala que é o sonho, e em parte é: não perco 2 horas no trânsito, almoço com minha filha. mas tem dia que eu percebo que não falei com nenhum adulto além de reunião. e a fronteira entre trabalho e casa sumiu, o notebook fica na mesa da sala e eu respondo mensagem às 22h. não quero voltar pro escritório, quero aprender a fazer isso direito. quero um post sincero sobre isso",
      resposta: `Entendi: você quer um relato sincero do trabalho remoto, com o que ganhou, o que custou e a decisão de não voltar, mas de aprender a fazer melhor.

<rascunho>
# Três anos trabalhando de casa: o sonho tem letras miúdas

Faz três anos que trabalho de casa. Quando conto isso, quase sempre ouço a mesma coisa: "que sonho". E, em parte, é mesmo.

Não perco mais duas horas por dia no trânsito. E almoço com a minha filha, uma coisa simples que antes não cabia na rotina.

Mas o sonho tem letras miúdas.

A primeira é a solidão. Tem dia em que percebo, à noite, que não falei com nenhum adulto além das pessoas das reuniões. E reunião, por mais útil que seja, não é a mesma coisa que conversar.

A segunda é que a fronteira entre trabalho e casa sumiu. O notebook fica na mesa da sala. Está ali no café da manhã, no fim de semana, na hora em que eu deveria descansar. E eu me pego respondendo mensagem às dez da noite, porque o trabalho está sempre ali, a um braço de distância.

Nada disso me faz querer voltar para o escritório. O que eu ganhei é real. O que eu quero é aprender a trabalhar de casa direito: entender que poder trabalhar de qualquer lugar não precisa significar trabalhar a qualquer hora.
</rascunho>

Organizei em ganhos, custos e a sua decisão, com a solidão e a falta de fronteira como os dois custos centrais. Títulos alternativos: "Trabalhar de casa sem morar no trabalho" · "O que o home office me deu e o que me cobrou". Você já tentou algo para separar trabalho e casa? Daria um bom trecho final.`,
    },
    {
      id: "post-iniciante-aos-34",
      pedido: "Comecei a aprender violão aos 34. É humilhante: crianças de 10 anos tocam melhor que eu no vídeo do YouTube. Meus dedos doem, eu erro o mesmo acorde há semanas. Mas tem um momento, quando uma música sai inteira pela primeira vez, mesmo mal, que eu não sentia há anos. Acho que adulto desaprendeu a ser iniciante. Quero escrever sobre isso.",
      resposta: `Entendi: a partir do violão, você quer falar de como é difícil, e valioso, ser iniciante depois de adulto.

<rascunho>
# Ser iniciante aos 34

Comecei a aprender violão aos 34 anos. E vou falar a verdade: é humilhante.

No YouTube, vejo crianças de dez anos tocando melhor do que eu. Meus dedos doem. Erro o mesmo acorde há semanas, sempre no mesmo lugar, como se a mão tivesse decidido não aprender.

Depois de adulto, a gente se acostuma a saber fazer as coisas. Diante do violão, eu sou só alguém que não sabe.

Mas existe um momento que eu não sentia havia anos. É quando uma música sai inteira pela primeira vez. Sai mal, cheia de tropeços, mas sai do começo ao fim. É a alegria de conseguir uma coisa que, pouco tempo antes, eu não conseguia.

Acho que é isso que a gente perde ao crescer. Não a capacidade de aprender, mas a disposição de ser iniciante: errar, ser pior do que uma criança e continuar mesmo assim. O adulto desaprendeu a ser iniciante, e o violão está me ensinando de novo.
</rascunho>

Mantive o tom franco e a sua tese final. Títulos alternativos: "O acorde que eu erro há semanas" · "Desaprendemos a ser iniciantes". Qual foi a primeira música que saiu inteira? Ela daria um bom detalhe para a abertura ou para o fim.`,
    },
    {
      id: "post-metas-de-ano-novo",
      pedido: "Todo dezembro eu faço lista de metas e todo março ela já morreu. Esse ano decidi não fazer. Acho que meta de ano novo é mais sobre culpa do que sobre mudança: a gente promete virar outra pessoa em 1º de janeiro e se sente um fracasso quando não vira. Prefiro mudar uma coisa pequena quando eu sentir que é a hora, sem data marcada. Quero postar isso, meio provocativo.",
      resposta: `Entendi: você quer um texto provocativo contra as metas de ano novo, defendendo mudanças pequenas no momento certo, a partir das suas listas que morrem em março.

<rascunho>
# Este ano eu não fiz lista de metas

Todo dezembro eu fazia a mesma coisa: uma lista de metas para o ano seguinte. E todo março a lista já estava morta.

Este ano, decidi não fazer.

Depois de tantas listas abandonadas, comecei a desconfiar do próprio ritual. Meta de ano novo, para mim, tem muito mais a ver com culpa do que com mudança.

Pense no que a gente promete: que em 1º de janeiro vamos virar outra pessoa. Quando isso não acontece, e quase nunca acontece, a conclusão não é "a promessa era impossível". A conclusão é "eu fracassei". E a culpa fica até o próximo dezembro, quando o ciclo recomeça.

Prefiro outra coisa: mudar uma coisa pequena quando eu sentir que chegou a hora. Sem data marcada. Pode ser em abril, pode ser numa terça-feira qualquer. O calendário não sabe quando eu estou pronto.

Então, se você também já enterrou listas em março, fica a provocação: e se o problema nunca foi você, mas a promessa?
</rascunho>

Mantive o tom provocativo que você pediu e a sua alternativa, mudanças pequenas sem data. Títulos alternativos: "Metas de ano novo são sobre culpa" · "O calendário não sabe quando eu estou pronto". Quer citar uma meta específica que morreu em março? Um caso real deixaria a provocação mais forte.`,
    },
    {
      id: "post-notificacoes",
      pedido: "Desliguei todas as notificações do celular há um mês, menos ligação. No começo eu pegava o celular sem motivo umas cem vezes por dia, a mão ia sozinha. Agora percebo que eu não tava viciado em mensagem, tava viciado em ser interrompido. Minha leitura voltou, consigo ver um filme inteiro. Perdi algumas coisas do grupo da família e tudo bem. Quero escrever um relato disso.",
      resposta: `Entendi: você quer relatar o seu mês sem notificações e a descoberta de que o vício era na interrupção, não nas mensagens.

<rascunho>
# Eu não era viciado em mensagens

Há um mês, desliguei todas as notificações do celular. Todas, menos as ligações.

Nos primeiros dias, descobri uma coisa desconfortável: eu pegava o celular sem motivo nenhum, umas cem vezes por dia. Não havia som nem vibração me chamando, e mesmo assim a mão ia sozinha.

Foi aí que entendi o que estava acontecendo. Eu achava que dependia das mensagens. Mas, sem as notificações, as mensagens continuavam lá, esperando, e mesmo assim eu continuava buscando o celular. Eu não era viciado em mensagem. Era viciado em ser interrompido.

Com o tempo, algumas coisas voltaram. A leitura voltou. Consigo ver um filme inteiro, do começo ao fim.

Teve custo? Teve. Perdi algumas coisas no grupo da família. E tudo bem.

Um mês depois, a descoberta que fica é a do começo: o que me prendia não era o que as pessoas tinham a dizer, mas a interrupção em si.
</rascunho>

Usei a sua descoberta central como eixo e mantive o custo (o grupo da família) para o relato não soar como propaganda. Títulos alternativos: "Viciado em ser interrompido" · "Um mês sem notificações". Teve algum momento específico em que você percebeu a mão indo sozinha? Ele daria força à abertura.`,
    },
    {
      id: "post-professora",
      pedido: "Sou professora de matemática há 12 anos. O salário é ruim, a sala é cheia, tem dia que eu saio sem voz. Mas ontem um aluno que dizia odiar matemática resolveu uma equação sozinho e olhou pra mim com uma cara de surpresa, tipo 'eu consegui?'. É por esse olhar que eu continuo. Queria escrever sobre isso sem ficar piegas.",
      resposta: `Entendi: você quer um texto sobre por que continua dando aula, ancorado no olhar do aluno de ontem, sem pieguice.

<rascunho>
# O olhar de "eu consegui?"

Sou professora de matemática há doze anos. Não vou romantizar: o salário é ruim, a sala é cheia e tem dia em que eu saio da escola sem voz.

Ontem, um aluno resolveu uma equação sozinho.

Pode parecer pouco. Mas era um aluno que dizia odiar matemática. Ele terminou a conta e olhou para mim com uma cara de surpresa. Não era orgulho ainda. Era uma pergunta: "eu consegui?"

Conseguiu.

Esse olhar dura poucos segundos. É o momento em que alguém descobre que aquilo que achava impossível para si mesmo não era. Não fui eu que resolvi a equação. Mas eu estava lá quando ele percebeu que podia.

As duas coisas existem ao mesmo tempo: as condições difíceis e esse olhar. E é por ele que eu continuo.
</rascunho>

Para não ficar piegas, deixei as condições difíceis lado a lado com o motivo de você continuar, sem frases de efeito. Títulos alternativos: "Por que eu continuo" · "Doze anos e um olhar". Você lembra o que disse a ele naquela hora? Pode ser um bom fecho.`,
    },
    {
      id: "post-receitas-do-avo",
      pedido: "Meu avô morreu em junho. Ele cozinhava pra família todo domingo e nunca escreveu nenhuma receita, dizia que era 'no olho'. Semana passada tentei fazer o feijão dele e ficou errado, mas o cheiro da cozinha era o mesmo e eu chorei. Agora tô tentando reconstruir as receitas com minha mãe e minha tia, cada uma lembra de um detalhe. Quero escrever sobre isso.",
      resposta: `Entendi: você quer escrever sobre o seu avô a partir das receitas que ele nunca escreveu e do esforço de reconstruí-las em família.

<rascunho>
# As receitas que o meu avô nunca escreveu

Meu avô morreu em junho.

Todo domingo, ele cozinhava para a família. E nunca escreveu uma receita sequer. Quando alguém perguntava a quantidade de alguma coisa, a resposta era sempre a mesma: "no olho".

Semana passada, tentei fazer o feijão dele. Ficou errado. Mas, enquanto eu cozinhava, o cheiro da cozinha era o mesmo. E eu chorei.

Agora estou tentando reconstruir as receitas com a minha mãe e a minha tia. Cada uma lembra de um detalhe diferente, e ninguém sabe a receita inteira.

O "no olho" dele queria dizer que a receita estava nele. Agora ela está espalhada entre nós, um detalhe com cada pessoa, e é juntando esses pedaços que a gente tenta chegar perto.
</rascunho>

Escrevi com sobriedade, sem tentar consolar nem tirar lições: o texto é a sua história. Títulos alternativos: "No olho" · "O feijão do meu avô". Se vocês acertarem o feijão, quer registrar a receita no fim do post?`,
    },
    {
      id: "post-abrigo",
      pedido: "faço trabalho voluntário num abrigo de cachorros aos sábados faz um ano. fui achando que ia ajudar os bichos e no fim quem mudou fui eu. aprendi a ter paciência com cachorro com medo, que às vezes leva meses pra deixar alguém chegar perto. e isso me fez pensar nas pessoas, que também têm medo e a gente não tem paciência. quero escrever sobre isso",
      resposta: `Entendi: você quer contar como o voluntariado no abrigo mudou você, e como a paciência com cachorros com medo te fez pensar nas pessoas.

<rascunho>
# O que um cachorro com medo me ensinou

Há um ano, passo os sábados fazendo trabalho voluntário num abrigo de cachorros. Fui achando que ia ajudar os bichos. No fim, quem mudou fui eu.

O abrigo me ensinou paciência. Muitos cachorros chegam com medo, e não é um medo que passa numa tarde: às vezes leva meses até que um deles deixe alguém chegar perto. Aprendi a esperar o tempo de cada um.

E isso me fez pensar nas pessoas.

Porque as pessoas também têm medo. E, com elas, a gente não tem a mesma paciência. Com um cachorro assustado, aceitamos que ele precisa de tempo, mesmo sem saber o que ele viveu. Com uma pessoa, esperamos que ela se abra logo, e desistimos rápido quando isso não acontece.

Talvez a pergunta que o abrigo me deixou seja esta: por que oferecemos a um cachorro com medo um tempo que quase nunca oferecemos a alguém?
</rascunho>

Mantive a virada do texto (quem mudou foi você) e desenvolvi a comparação que você fez entre os cachorros e as pessoas. Títulos alternativos: "Quem mudou fui eu" · "Paciência com quem tem medo". Tem algum cachorro do abrigo cuja história você gostaria de contar? Um caso concreto deixaria o texto mais forte.`,
    },
    {
      id: "post-pergunta-amizade",
      pedido: "quero escrever um post sobre amizade",
      resposta: `Amizade rende muitos textos diferentes, então antes de escrever quero entender qual é o seu. O que te fez pensar nisso agora: uma amizade que mudou, que acabou, que começou, ou algo que você percebeu sobre amizades depois de adulto? Me conta um pouco e eu monto o rascunho a partir do que você trouxer.`,
    },
    {
      id: "post-pergunta-escola",
      pedido: "acho que a escola mata a curiosidade das crianças",
      resposta: `É uma tese forte e pode render um bom post, mas, para ele ser seu e não um texto genérico sobre educação, preciso de um pouco mais de você. De onde vem essa ideia: algo que você viveu como estudante, que vê em alguma criança próxima, ou que percebe trabalhando com crianças? Um caso concreto vai ser o coração do texto.`,
    },
  ],
};
