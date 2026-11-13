# Memória, conversas salvas e painel da Kally

## Arquitetura

1. **Conversa temporária por padrão.** Nada é gravado, como o app promete ("Temporária: nada fica guardado").
2. **Pedido maior → oferta de salvar** (no Modo aprofundado, com esforço Aprofundado ou Máximo, a conversa é salva sozinha desde a primeira mensagem, sem perguntar). Numa conversa temporária, uma resposta grande (competência, modo diferente
   de conversa ou texto longo) termina com o cartão "Salvar esta conversa?". Só com o "Salvar" o app chama
   `POST /api/mobile/env/[env]/kally/salvar`, que grava as mensagens que ele tem; dali em diante a conversa
   continua salva.
3. **Memória só de conversa salva.** Depois de cada resposta numa conversa salva, a mensagem da pessoa passa por:
   - um filtro de palavras (`mightRemember`): só segue se parece contar algo dela (profissão, preferência,
     objetivo, "lembre que…"). Papo comum não custa nenhuma chamada;
   - uma chamada curta ao modelo (o 32B, se estiver no ar; senão o 8B) que devolve até 3 itens curtos;
   - a checagem de que o item veio da mensagem (`grounded`): metade das palavras precisa estar nela, e nenhum
     número que ela não escreveu. Medido em 11/11: sem isso, o 8B guardou "há 12 anos" vindo do exemplo do prompt;
   - o vetor do item (o mesmo embedder do RAG, na CPU). Item parecido com um já guardado (cosseno ≥ 0,86)
     atualiza o antigo. Limite de 200 itens por pessoa e ambiente.
   Se a extração terminar em até 6 s, a resposta mostra "Guardei na memória: …"; senão ela termina em segundo
   plano, sem segurar o fim da resposta. Ao salvar uma conversa temporária, as mensagens dela passam pelo mesmo
   caminho.
4. **Consulta.** A cada mensagem, o vetor dela é comparado com os itens da pessoa; entram no prompt só os de
   significado próximo (cosseno ≥ 0,42), no máximo 6 (3 no papo casual), logo depois das regras do sistema, para a
   local e a remota. Custa ~0,1 s e ~150 tokens.

Privacidade: tabela `KallyMemory`, por pessoa e por ambiente; só a dona lista e apaga. Senhas, documentos, dados
financeiros, endereço, telefone, saúde e religião não são guardados (a menos que a pessoa peça para lembrar).

| Variável | Padrão | O que faz |
|---|---|---|
| `KALLY_MEMORY` | ligado | `"0"` desliga (não guarda nem consulta) |

Rotas: `GET /api/mobile/env/[env]/kally/memoria` (lista), `DELETE …/memoria?id=…` (um item), `DELETE …/memoria`
(tudo), `POST …/kally/salvar` (salvar a conversa temporária).

## Painel da Kally (app)

Botão com o ícone do cérebro no topo da conversa → tela "Kally" (`/kally-painel`) com três abas:

- **Conversas:** as salvas neste ambiente; tocar abre a conversa (`/perguntar?conversa=…`); a lixeira apaga.
- **Memória:** cada item com o tipo, a data e quantas vezes foi usado; apagar um ou tudo.
- **Base pessoal:** a mesma tela da base de documentos (`/base`).

## Resposta na tela

- O texto entra numa fila e aparece letra a letra, na velocidade de chegada (média móvel), e esvazia a fila em
  ~1,2 s quando chega de uma vez (o post revisado). Não há mais saltos de bloco a cada 60 ms.
- "Pensando…" e as etapas aparecem na cor do tema (violet400), com as letras pulando uma de cada vez, em ciclo.
  Com "reduzir movimento" ligado, o texto fica parado.

## Modo aprofundado: modelo e esforço (para quem conversa)

No menu de modo, "Modo aprofundado" abre a tela de escolha do modelo e do esforço (salva no aparelho):

- **Modelo:** Automático (a Kally escolhe), Kally local · 8B ou Kally remota · 32B. A escolha vale para qualquer
  pessoa; os limites da GPU (vagas, gasto e ligações por dia) continuam valendo, e a remota desligada liga sozinha
  (o pedido espera por ela, com o andamento na tela).
- **Esforço** (`src/server/kally/deep.ts`):
  - Normal: uma resposta.
  - Aprofundado: planeja a resposta (JSON com a abertura e 3 a 4 partes) e escreve parte por parte; cada parte
    recebe o plano e o fim do que já foi escrito (~6.000 caracteres), para continuar sem repetir. A última fecha
    com próximos passos. 1 a 3 minutos na remota.
    **Teto de 5 minutos** com qualquer modelo e pedido (`budgetMs`, do plano à última parte; a espera da GPU ligar
    fica antes e não entra na conta). Cada parte recebe só os tokens que cabem no tempo que resta, pela velocidade
    medida. Quando depois dela não caberia outra, ela fecha a resposta (resume em poucas frases o que ficaria para
    as partes seguintes) e as demais ficam de fora. Se o tempo acabar no meio de uma parte, ela é cortada no último
    ponto inteiro (`wholeText`: parágrafo, frase ou item de lista completo; bloco de código aberto sai inteiro).
    Na Kally 1.5 (~8 tokens/s), isso costuma dar uma parte só, já de fechamento. O registro guarda `skipped`,
    `trimmed` e `ms`.
  - Máximo: 5 a 6 partes, com o raciocínio do 32B ligado em cada uma. 3 a 6 minutos na remota.
  Com esforço acima do normal e modelo Automático, o pedido vai para a remota. Na local, cada parte leva minutos; a
  tela avisa antes. Papo casual, posts (que têm revisão própria) e o modo ideia continuam com uma resposta só.
  Se o plano falhar, a resposta sai normal; se a remota falhar antes do primeiro texto, a local responde direto.

## Personalidade

`src/server/kally/personality.ts`: o texto de linguagem, comunicação e personalidade do dono do projeto (11/11).
A remota recebe o texto inteiro, no fim do prompt; a local, uma versão condensada dos mesmos sete pontos (prompt
longo deixa o 8B mais lento nesta placa). O estilo da remota passou a responder pergunta simples de forma direta,
sem seções, e deixa "Próximos passos" só para respostas que explicam algo.

## Resposta que continua sem a pessoa

Numa conversa **salva**, a resposta continua sendo escrita no servidor mesmo que a pessoa saia do app ou do site
(a conexão cai; `src/server/kally/running.ts`). A resposta inteira é gravada no fim, e a memória e a revisão do
post seguem normalmente. Quem reabre a conversa recebe `generating: true` no GET dela, e o app mostra "A Kally
ainda está escrevendo esta resposta…" e confere a cada 4 s até ela aparecer. Se a conexão cair com a tela aberta,
o app mostra o mesmo aviso em vez do erro. Na conversa temporária, sair continua parando a resposta (nada seria
guardado). Um reinício do servidor interrompe o que estava em andamento.

### Sem sair do assunto

Cada parte é escrita inteira, conferida e só então aparece (`onTopic` em `deep.ts`), por duas checagens que não
dependem do modelo: as palavras de conteúdo do pedido presentes na parte e o significado próximo (o embedder do RAG,
na CPU). Fora do assunto, a parte é refeita uma vez com a ordem de tratar só do pedido; se continuar fora, não
entra na resposta (o log registra). Medido com o caso real de 11/11: a parte sobre a inflação passou (5 de 5
palavras, cosseno 0,92) e a parte sobre elasticidade-preço foi barrada (0 palavras, 0,35). As partes não levam os
exemplos de referência (a causa do desvio) e repetem o pedido. Entre as partes, o app mostra a etapa em andamento
abaixo do texto.

## Andamento da resposta (etapas)

O servidor manda cada etapa com uma chave (`{ status, step }`): a mesma chave atualiza a linha (a contagem de
palavras do rascunho, a espera da Kally 32); uma chave nova fecha a etapa em andamento e acrescenta outra. O app
acumula as etapas (`mobile/src/lib/progress-steps.ts`) e mostra a lista: concluídas com a marca de feito e o tempo
que levaram, a atual com as letras pulando, um ponto pulsando e o tempo correndo, e o total no topo, em m:ss,
segundo a segundo. O relógio é um componente isolado, alinhado à virada do segundo e calculado pelo relógio do
aparelho (não atrasa nem acumula erro em segundo plano); só ele redesenha a cada segundo. Pronta a resposta, a
lista vira "Feito em 3:12 · 6 etapas", que se expande ao tocar. As etapas citam o que é deste pedido: os títulos
do plano no modo em partes, os sites das fontes, os termos pesquisados do post.

## Fórmulas e formatação

O app e o editor não desenham LaTeX. As regras pedem fórmulas em texto com símbolos (ŷ = β₀ + β₁·x, x², √x, Σ) e
nada de HTML; o que escapar é convertido por `latexToText` (`mobile/src/lib/math-text.ts`, com cópia em
`src/server/kally/math-text.ts`): $…$, $$…$$, \(…\), \[…\], blocos ```math, comandos soltos (\cdot, \beta…) e
<br>, <sup>, <b>. Converte na tela enquanto o texto chega, no rascunho antes de publicar ou abrir no editor e no
texto salvo. Não toca em código nem em valores como "R$ 5.000".

## Modo desenvolvedor: só o modelo (13/11/2026)

O modo dev (só o administrador da plataforma) deixou de mexer no prompt: personalidade, instruções e linguagem
saíram. Agora ele só escolhe o modelo que responde (`src/server/kally-dev.ts`): `120b` (Kally 32, GPT-OSS 120B pela
API), `20b` (Kally 1.5, GPT-OSS 20B pela API) ou `qwen` (o Qwen 8B do PC). No app: *Modo ▾ → Modo desenvolvedor*, ou
`/dev 120b`, `/dev 20b`, `/dev qwen`, `/dev off`.

- O modelo escolhido vale para tudo: conversa, /post, revisão, Aprofundado e Máximo, sem o roteador trocar de modelo e
  ignorando a escolha "Kally 1.5/32" da tela de resposta.
- Sem queda para outro modelo: se o escolhido não puder responder (fora do ar, teto de gasto), a resposta é um erro com
  o motivo (`AiOptions.light`: "only" e "never" em `src/server/ai.ts`).
- Chamadas auxiliares (essencial do pedido, filtro de fontes, revisão do post) continuam com os modelos de sempre.
- Testado no site de teste (porta 3200, banco de teste novo): 120B, 20B e Qwen forçados, inclusive /post e Aprofundado
  com o 20B; com o teto estourado, 120B e 20B dão erro e, sem o dev, a Kally desce até o Qwen.
