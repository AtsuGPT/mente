# Simulação da Kally com personas

Dez pessoas fictícias usam o Minha Mente de verdade, rodada a rodada, num ambiente isolado chamado **Treinamento Kally**. Elas publicam, conversam com a Kally, enviam documentos pessoais e publicam posts que a própria Kally escreveu. A cada rodada, uma prova fixa mede se a Kally melhora conforme a base cresce.

## O que fica isolado

- **Tudo acontece em dois ambientes novos:** "Treinamento Kally" e "Treinamento Kally (controle)", criados por uma conta de coordenação nova (`treinamento.kally`), que é a dona deles. As personas são contas novas e entram por convite.
- **Nenhum conteúdo real é lido ou alterado.** A conta de coordenação não é administradora da plataforma.
- **A base institucional não é usada**, porque vale para a plataforma inteira e apareceria para usuários reais. Os documentos institucionais entram como posts da coordenação na pasta **Guia**.
- **Contas, senhas e tokens** ficam em `eval/simulacao/.estado.json`, fora do Git.

## Arquivos

- `personas.json`: as 10 personas, cada uma com perfil, nível, estilo de escrita, objetivo, fatos plantados e um código de conferência (canário para o teste de privacidade). Os fatos registram a rodada em que entram e onde: post, documento pessoal ou conversa.
- `rodadas/rodada-NN.json`: o que cada persona faz na rodada. Cada interação traz os **critérios** de uma boa resposta, escritos antes de qualquer resposta.
- `prova.json`: 40 perguntas por rodada:
  - **25 de núcleo fixo**, repetidas em toda rodada;
  - **10 novas**, sobre o que entrou na rodada;
  - **5 armadilhas**: informação inexistente, premissa falsa ou fato que ainda não entrou.
- `documentos/`: o guia do ambiente e os documentos pessoais das personas.
- `rubrica.md`: a rubrica de 0 a 5 do juiz.
- `resultados/rodada-NN/`: `acoes.json`, `prova.json`, `checagens.json`, `para-corrigir.json`, `notas.json`, `relatorio.md` e `resumo.json`. A evolução de todas as rodadas fica em `resultados/historico.json`.

## Rodar

```bash
export NODE_USE_ENV_PROXY=1     # só em máquinas com proxy (como a da sessão na nuvem)
node eval/simulacao/simular.mjs preparar --api https://minhamente.space/api/mobile
node eval/simulacao/simular.mjs rodada 1        # ações das personas + prova + checagens
node eval/simulacao/simular.mjs exportar 1      # folha cega para o juiz
node eval/simulacao/simular.mjs importar 1 --arquivo notas-juiz.json
node eval/simulacao/simular.mjs progresso       # uma linha por rodada
```

O `preparar` leva ~30 minutos para 11 contas, porque o app aceita 5 cadastros a cada 15 minutos por IP. Uma rodada leva ~1 hora: cerca de 30 conversas das personas e 75 respostas da prova, com ~25 s cada no Ollama do servidor. Enquanto isso, quem estiver usando o app de verdade espera na mesma fila.

## Processo a cada rodada

Combinado com o dono do projeto (9 de novembro de 2026):

1. **Rodada:**
   - a Kally não muda durante a rodada;
   - ações das personas, prova com RAG e controle sem RAG;
   - checagens automáticas de fatos, fonte, canários e premissas.
2. **Correção e relatório:**
   - correção cega pela [rubrica](rubrica.md) v2;
   - diagnóstico de cada erro (busca, interpretação, geração, privacidade);
   - relatório com pontos fortes e fracos da rodada.
3. **Ajustes:**
   - cada causa é medida offline com o mesmo conteúdo antes de mexer;
   - uma mudança por vez, com A/B cego;
   - fica só o que passa do ruído (~0,1 na nota).
4. **Git:**
   - commit e push dos resultados e do relatório;
   - merge da versão nova na `main`.
5. **Servidor:**
   - no servidor, `powershell -ExecutionPolicy Bypass -File eval\simulacao\publicar-servidor.ps1`, depois reiniciar;
   - em seguida, uma pergunta de conferência em produção confirma a versão.
   - O passo 5 é feito pelo dono do projeto enquanto a pasta do servidor não estiver disponível para sessões na nuvem (Remote Control).

## O que é medido

- **Com RAG × sem RAG:** cada pergunta da prova é feita pela persona no ambiente principal e pela coordenação no ambiente de controle, que não tem posts nem documentos. Mesma Kally, mesmo servidor. A diferença de nota é o ganho atribuível à recuperação.
- **Checagens automáticas, sem juiz:**
  - fatos do gabarito presentes na resposta;
  - fonte esperada recuperada, comparando os títulos dos posts e os ids dos documentos e conversas;
  - premissas falsas repetidas;
  - armadilhas respondidas com "não encontrei";
  - vazamento de privacidade: termos proibidos e códigos de conferência de outra pessoa.
- **Diagnóstico por pergunta:**
  - acertou com a fonte;
  - erro de geração (a fonte veio, mas faltou o fato);
  - erro de busca ou interpretação (a fonte não veio);
  - conteúdo ausente (o post esperado não foi publicado, e isso não conta contra a Kally).
- **Juiz:** nota de 0 a 5 pela `rubrica.md`, às cegas (códigos sorteados, sem condição nem rodada), para as interações e para a prova. Na sessão do Claude, sem custo de API. Uma amostra deve ser revisada à mão.

## Limites

- **Sem as métricas do servidor** (`KALLY_EVAL=1`), a simulação não separa a falha de busca da falha de interpretação: a Kally pode ter classificado o pedido como estudo e pulado a memória de posts. A busca isolada é medida em `eval/embeddings`.
- **O servidor testado pode estar numa versão diferente do repositório.** O relatório registra o commit local e os parâmetros lidos do código.

## Ferramentas acrescentadas depois da rodada 1

| Arquivo | Para quê |
|---|---|
| `analisar-busca.mjs` | Aplica as regras de intenção às mensagens reais e reproduz a busca de posts do servidor com o qwen3-embedding, para medir uma mudança antes de aplicá-la |
| `revisar-rodadas.mjs` | Reescreve as rodadas geradas (3 a 5) no padrão das rodadas 1 e 2 e corrige fatos incoerentes das personas geradas; determinístico e idempotente |
| `semear-local.ts` + `simular.mjs replicar` | Copiam o conteúdo de uma rodada para uma instância local de teste e permitem comparar versões da Kally sobre o mesmo conteúdo |
| `comparar-ab.mjs` | Teste A/B: folha cega única com as duas versões misturadas, notas e relatório |
| `calibrar-juiz.mjs` | Consistência do juiz, concordância com as checagens objetivas e amostra estratificada para correção humana |
| `editar-post.mjs` | Edita um post da simulação como a própria autora (registrado em `resultados/manutencao.json`) |
| `gerar-rodadas.mjs` | Gera as personas 21 a 100 e os roteiros e provas das rodadas 3 a 5 (semente fixa; roda uma vez só) |
| `publicar-servidor.ps1` | Publica esta versão no servidor Windows e acrescenta ao `.env` as variáveis da simulação |

### Variáveis do servidor usadas pela simulação

- `KALLY_PIPELINE=on`: as personas são membros comuns, e sem o pipeline a Kally não consulta documentos.
- `KALLY_EVAL_AMBIENTES=treinamento-kally,treinamento-kally-controle`: métricas de recuperação só nesses ambientes, para separar falha de busca de falha de interpretação.
- `REGISTER_MAX_PER_WINDOW=200`: só enquanto as contas são criadas. Depois, rode `publicar-servidor.ps1 -FimDoCadastro`. O login continua com 5 tentativas a cada 15 minutos.
