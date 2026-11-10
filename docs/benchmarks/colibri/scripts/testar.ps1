# Sobe uma configuração do plano para teste manual (um modelo por vez).
#   .\testar.ps1                 -> a melhor até agora (best.json)
#   .\testar.ps1 colibri-30b-v28 -> uma configuração específica do plan.json
# Colibrì: painel e chat em http://127.0.0.1:8010/ ; API OpenAI em http://127.0.0.1:8010/v1
# Ollama: use o modelo normalmente (ollama run <modelo>), com as opções impressas abaixo.
param([string]$Id = "")
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Id) { $Id = (Get-Content "$here\best.json" -Raw | ConvertFrom-Json).id }
$cfg = (Get-Content "$here\plan.json" -Raw | ConvertFrom-Json) | Where-Object { $_.id -eq $Id }
if (-not $cfg) { Write-Error "configuração '$Id' não está no plan.json"; exit 1 }
if (Get-Process qwen36 -ErrorAction SilentlyContinue) { Write-Error "já há um motor do Colibrì rodando; feche-o antes"; exit 1 }
if ($cfg.engine -eq "ollama") {
  "Ollama: modelo $($cfg.model), opções $($cfg.options | ConvertTo-Json -Compress)"
  "Exemplo: ollama run $($cfg.model)"
  exit 0
}
foreach ($p in $cfg.env.PSObject.Properties) { Set-Item "env:$($p.Name)" $p.Value }
Set-Location $cfg.colibri_dir
"Subindo $Id ($($cfg.model)); abra http://127.0.0.1:8010/ quando aparecer 'listening'."
py -3 coli serve --model $cfg.model_dir --port 8010 --ctx $cfg.ctx @($cfg.serve_args)
