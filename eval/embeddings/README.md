# Avaliação da busca por significado (embeddings)

Fase 0 do plano de simulação com agentes: antes de gerar conteúdo com 100 personas, medir se a busca da base de documentos da Kally acha o trecho certo e se o corte de semelhança está no lugar certo. Não usa o servidor nem o banco; fala direto com o Ollama.

## Rodar

Com o Ollama ligado e o modelo de embeddings da Kally baixado (`ollama pull qwen3-embedding:0.6b`):

```bash
npx tsx eval/embeddings/medir.mjs
npx tsx eval/embeddings/medir.mjs --tamanhos 500,700,900,1100 --url http://localhost:11434
npx tsx eval/embeddings/medir.mjs --modelo nomic-embed-text   # comparar outro modelo
npx tsx eval/embeddings/medir.mjs --falso                     # sem Ollama: só testa o script
```

A primeira rodada calcula os vetores na CPU (alguns segundos); as seguintes usam o cache em `.cache/eval-embeddings/`. O relatório vai para `resultados/<data>-<modelo>.md` (e `.json`).

## O que tem aqui

- `corpus/`: documentos fictícios com fatos plantados, que nenhum modelo conhece do treino. Alguns foram feitos para confundir a busca: o regulamento de 2024 (revogado, com números diferentes do vigente) e a política de dados do Coletivo, parecida com o resumo da LGPD. Os três documentos de `eval/kally/documentos` também entram.
- `perguntas.json`: 56 perguntas com resposta (o gabarito é um trecho literal do documento, então vale para qualquer tamanho de trecho) e 15 sem resposta (8 sobre fatos ausentes de assuntos que estão na base e 7 fora do assunto). As perguntas foram escritas em estilos diferentes: diretas, paráfrases, vagas, com erros de digitação e com distratores.
- `medir.mjs`: divide os documentos com a mesma função do servidor (`src/server/kally/chunks.ts`) e reproduz a pontuação de `searchDocuments` (`src/server/kally/documents.ts`).

## Como ler o relatório

1. **Tamanho do trecho:** recall@1, recall@4 e MRR para cada tamanho. "Recall@4 com o corte atual" é o que a busca de produção entregaria ao modelo. Se a resposta não está nesses 4 trechos, a Kally não tem como acertar.
2. **Por tipo de pergunta:** mostra se a busca falha mais com perguntas vagas ou escritas com erros.
3. **Cossenos:** a separação entre o gabarito e o ruído. Quanto mais distantes, mais fácil escolher um corte.
4. **Corte:** a troca entre deixar o gabarito passar e trazer trechos errados, ou trazer algo para perguntas sem resposta.
5. **Peso das palavras em comum:** se vale dar mais peso às palavras na ordenação.
6. **Valores sugeridos:** floor, corte e span calculados pelos dados. Use como direção: com 70 perguntas, cada uma pesa muito.
7. **Erros de 1º lugar:** pergunta por pergunta, de onde veio o trecho que ganhou do gabarito.

## Limites

- **O corpus ainda é pequeno:** ~14 mil caracteres, de 16 a 35 trechos conforme o tamanho. Com isso, o efeito do tamanho do trecho aparece pouco. Ele cresce na simulação com as personas, e a prova continua a mesma.
- **Só a base de documentos é medida.** A memória de posts e conversas (`src/server/kally-memory.ts`, onde atua o `weight` do perfil) precisa do banco e entra na próxima etapa.
- **Perfis copiados.** O perfil de cada modelo foi copiado de `EMBED_PROFILES` (`src/server/ai.ts`). Se mudar lá, atualize aqui.
