# Checkpoint do benchmark Colibrì x Ollama

Atualizado em 2026-11-10 07:52. Último item: RAM liberada: 14B e 30B no Ollama (conversa enxuta e post) (código 0).

Ambiente de teste (fora do repositório): `C:\Users\satan\kally-bench\` — motores em `colibri\` (Vulkan/CPU) e `colibri-cuda\` (CUDA), modelos em `models\` (vínculos para os arquivos do Ollama), resultados brutos em `results\`, Python isolado em `venv\`.

## Continuar de onde parou

```powershell
cd C:\Users\satan\kally-bench\bench
..\venv\Scripts\python.exe -u run_queue.py
```

## Testar à mão a melhor configuração

```powershell
cd C:\Users\satan\kally-bench\bench
.\testar.ps1            # a melhor até agora (best.json); ou .\testar.ps1 colibri-30b-v28
```

Depois abra http://127.0.0.1:8010/ (painel e chat do Colibrì). Ctrl+C no terminal para parar.

## Melhor configuração encontrada até agora

```json
{
 "id": "colibri-30b-v28-cap32",
 "motivo": "melhor do Colibri no 30B-A3B ate agora (A aquecido: 4.6 tok/s, TTFT 37 s); a Kally de producao continua no ollama-4b"
}
```

## Feito (17)

- formato: conversa intermediária e respostas ricas nos dois 8B: `ollama-8biq4-g34,ollama-8b-g30-livre` cenários A3,A4,B2 × 3
- RAM liberada: cache maior do 30B no Colibrì (48 e 64): `colibri-30b-v28-cap48,colibri-30b-v28-cap64` cenários A × 2
- RAM liberada: 14B e 30B no Ollama (conversa enxuta e post): `ollama-14b-g20-livre,ollama-30b-g10-livre` cenários A2,C × 2
- latência: 8B conversa simples, normal e enxuta (meta 10 s): `ollama-8b-g30-livre` cenários A,A2 × 5
- custo das trocas: 8B -> 14B/30B -> 8B (Ollama): `swap_test.py --small ollama-8b-g30 --big ollama-14b-g20,ollama-30b-g10 --cycles 2` cenários - × -
- concorrência: 8B na placa + 30B na CPU (Colibrì): `concurrency_test.py --small ollama-8b-g30 --big colibri-30b-cpu-cap32` cenários - × -
- ajuste: 8B compacto IQ4_XS, camadas na placa: `ollama-8biq4-g32,ollama-8biq4-g34,ollama-8biq4-g37` cenários A3,E × 2
- completa: 8B compacto IQ4_XS, 34 camadas: `ollama-8biq4-g34` cenários A,A3,B,C,D,E,F × 3
- ajuste: memória da placa e cache em RAM do 30B (Colibrì): `colibri-30b-v28,colibri-30b-v28-cap16,colibri-30b-v28-cap32,colibri-30b-cpu-cap32` cenários A × 2
- ajuste: camadas do 8B na placa (Ollama): `ollama-8b-g26,ollama-8b-g30,ollama-8b-g34,ollama-8b-g30-c4k` cenários A,E × 1
- ajuste: 14B automático e camadas (Ollama): `ollama-14b,ollama-14b-g16,ollama-14b-g20,ollama-14b-g24` cenários A,E × 1
- ajuste: camadas do 30B na placa (Ollama), só conversa curta: `ollama-30b-g8,ollama-30b-g10` cenários A × 1
- completa: 8B no Ollama, 30 camadas na placa: `ollama-8b-g30` cenários A,B,C,D,E,F × 3
- completa: 4B no Colibrì, inteiro na placa: `colibri-4b-vram2.8` cenários A,B,C,D,E,F × 3
- completa: 14B no Ollama, 20 camadas na placa: `ollama-14b-g20` cenários A,B,C,D,E,F × 3
- completa: 30B-A3B no Colibrì (melhor ajuste), longos ×1: `colibri-30b-v28-cap32` cenários A,B,C,D,E,F × 3
- desempenho: 8B e 14B no Colibrì (curtos): `colibri-8b-cuda2.8,colibri-14b-cuda2.8` cenários A,F × 3

## Pendente (0)


Tabelas atualizadas: [tables.md](tables.md). Dados brutos: `requests.csv`.
