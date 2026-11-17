# Baterias de ponta a ponta (Kally Intelligence, 17/11/2026)

Rodam contra sites de teste com a Kally de verdade (gastam créditos da API; a de 17/11 inteira custou cerca de US$ 0,08).

- `bateria-respostas.mjs`: os mesmos 20 pedidos ao site antigo (porta 3211) e ao novo (3210). `SO=depois` roda só o novo; ids na linha de comando rodam só esses casos. A análise (vícios de estilo, tempos, modelo, tokens) é `tests/bench-respostas-analise.ts`.
- `memoria.mjs`: memória de aprendizagem de ponta a ponta (explicação, quizzes, domínio, cartão de progresso, isolamento entre contas).
- `artefatos.mjs`: artefatos antes/depois com a checagem visual nova e fotos a 390 px.

`BENCH_DIR` aponta para a pasta com `senha.txt` (senha da conta de teste `bench.kally`, criada só numa cópia do banco) e onde os resultados são gravados. Nunca rode contra o banco real.
