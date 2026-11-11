# Memória, conversas salvas e painel da Kally

## Arquitetura

1. **Conversa temporária por padrão.** Nada é gravado, como o app promete ("Temporária: nada fica guardado").
2. **Pedido maior → oferta de salvar.** Numa conversa temporária, uma resposta grande (competência, modo diferente
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
