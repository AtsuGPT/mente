# Prova da Kally por rodada

As 71 perguntas de `eval/embeddings/perguntas.json` vão para a Kally de verdade, pela API do app, em duas condições:

- **com base:** com os 10 documentos da prova na base (7 institucionais e 3 pessoais);
- **sem base:** os mesmos documentos apagados. É o grupo de controle: a mesma Kally, sem a base.

A diferença entre as duas condições é o que a base acrescenta. Repetir a prova a cada rodada da simulação, sempre com as mesmas perguntas, gera a curva de progresso.

## Preparar

1. **Servidor de testes** com uma cópia do banco (ex.: `mente-dev.db`) e `KALLY_PIPELINE=admin` no `.env`. Sem o pipeline, a Kally não consulta a base de documentos.
2. **Ambiente vazio** criado para a prova (ex.: `prova`). Os posts de um ambiente real entram na memória da Kally e misturam a medição.
3. **Conta de administrador da plataforma.** Só ela pode enviar documentos institucionais, e não tem o limite de mensagens.
4. **Credencial do juiz.** A nota usa o Claude pela API: `ANTHROPIC_API_KEY` no ambiente ou `ant auth login`. Ela só é usada na etapa de corrigir.

## Rodar

```bash
# 1. Respostas (~1 h: 142 respostas de ~25 s; retoma se for interrompido)
node eval/prova/prova.mjs gerar --api http://localhost:3000/api/mobile --usuario admin --senha ... \
  --ambiente prova --saida eval/prova/resultados/rodada-0

# 2. Correção: mostra o custo estimado e só envia com --confirmar
node eval/prova/prova.mjs corrigir --saida eval/prova/resultados/rodada-0
node eval/prova/prova.mjs corrigir --saida eval/prova/resultados/rodada-0 --confirmar

# 3. Comparar rodadas (uma linha por rodada)
node eval/prova/prova.mjs comparar eval/prova/resultados/rodada-0 eval/prova/resultados/rodada-1
```

Opções de `gerar`:
- `--config qwen`: escolhe a configuração da Etapa 6 (precisa de `KALLY_EVAL=1`);
- `--sem-controle`: pula a condição sem base;
- `--manter-documentos`: não apaga os documentos no fim.

O juiz padrão é `claude-opus-5-5`; `--modelo` troca. Com o Opus, a estimativa é de ~US$ 6 por rodada (142 correções). O script mostra o valor antes de gastar.

## O que é medido

**Checagens automáticas** (`checagens.json`), sem custo:
- **fatos:** os termos do gabarito presentes na resposta (`fatos` em perguntas.json);
- **documento errado:** valores que só existem no regulamento revogado, como "30 dias" ou "terça" (`errado`);
- **fonte certa:** o documento-gabarito apareceu nas fontes da resposta;
- **admite não saber:** se a resposta diz que não encontrou a informação, nas perguntas sem resposta;
- **erros e respostas cortadas.**

**Juiz** (`notas.json`): nota inteira de 0 a 5 para aderência, utilidade, estrutura, precisão e geral, mais "inventou" e uma justificativa. As regras:
- o juiz recebe a pergunta, o gabarito, o documento de referência e a resposta, mas **não** sabe se ela é com ou sem base;
- a ordem das respostas é embaralhada;
- **um erro factual limita a nota a 2;**
- **estrutura vale quando é proporcional à pergunta:** formatação bonita não soma ponto.

**Relatório** (`relatorio.md` e `resumo.json`):
1. resultado geral por condição;
2. nota por tipo de pergunta;
3. **onde está o erro:** de busca (o documento certo não chegou ao modelo, então a correção vai para `eval/embeddings`) ou de geração (chegou e não foi usado: prompt, competência ou modelo);
4. perguntas sem resposta (admitiu ou inventou);
5. lista das notas 0 a 2 com o motivo.

## Limites desta versão

- **A fonte vem por documento, não por trecho:** é o que a API devolve. O acerto por trecho é medido em `eval/embeddings`.
- **Uma conta só.** Todas as perguntas são feitas pela conta de administrador, inclusive as sobre as notas da Ana e do Bruno, que entram como documentos pessoais dela. O teste de privacidade entre pessoas entra com as personas.
- **Calibre o juiz antes de confiar nas notas.** Corrija à mão uma amostra de ~20 respostas e compare com as notas dele. Se discordarem muito, ajuste a rubrica antes de usar a curva.
- **Respostas fora do Git.** O `respostas.json` fica fora do Git (`.gitignore`) porque pode citar posts do ambiente; o relatório e as notas podem ser versionados.
