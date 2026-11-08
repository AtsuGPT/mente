# Publica no servidor (Windows) a versão da Kally corrigida na simulação e prepara a rodada 2.
#
#   powershell -ExecutionPolicy Bypass -File eval\simulacao\publicar-servidor.ps1
#   (rode na pasta do repositório; o servidor precisa ser reiniciado no fim)
#
# O que faz:
#   1. atualiza o código para a branch claude/charming-carson-nodxs5;
#   2. acrescenta ao .env, se faltarem, as variáveis da simulação (não mostra nem altera segredos):
#      REGISTER_MAX_PER_WINDOW=200   cadastros por IP na janela de 15 min (temporário, só para criar as contas)
#      KALLY_EVAL_AMBIENTES=...      métricas de recuperação só nos dois ambientes da simulação
#   3. instala as dependências e compila (o schema do banco não mudou: não há migração).
# Depois da rodada 2, rode com -FimDoCadastro para tirar o REGISTER_MAX_PER_WINDOW.
param([switch]$FimDoCadastro)
$ErrorActionPreference = "Stop"
$branch = "claude/charming-carson-nodxs5"

if (-not (Test-Path ".env")) { throw "Não achei o .env nesta pasta. Rode na pasta do repositório do Minha Mente." }

function Set-EnvVar([string]$name, [string]$value) {
  $lines = Get-Content ".env"
  if ($lines | Where-Object { $_ -match "^\s*$name\s*=" }) { Write-Host "  $name já existe no .env (mantido)"; return }
  Add-Content ".env" "$name=`"$value`""
  Write-Host "  $name acrescentado ao .env"
}

if ($FimDoCadastro) {
  (Get-Content ".env") | Where-Object { $_ -notmatch "^\s*REGISTER_MAX_PER_WINDOW\s*=" } | Set-Content ".env"
  Write-Host "REGISTER_MAX_PER_WINDOW removido. Reinicie o servidor."
  exit 0
}

Write-Host "1. Atualizando o código para $branch"
git fetch origin $branch
git checkout $branch
git pull --ff-only origin $branch

Write-Host "2. Variáveis da simulação no .env"
Set-EnvVar "REGISTER_MAX_PER_WINDOW" "200"
Set-EnvVar "KALLY_EVAL_AMBIENTES" "treinamento-kally,treinamento-kally-controle"
$pipeline = (Get-Content ".env" | Where-Object { $_ -match "^\s*KALLY_PIPELINE\s*=" })
if (-not $pipeline) { Write-Host "  Atenção: KALLY_PIPELINE não está no .env. As personas precisam de KALLY_PIPELINE=on (sem ele a Kally não consulta documentos)." }

Write-Host "3. Dependências e build"
npm install
npm run build

Write-Host ""
Write-Host "Pronto. Pare o servidor que está rodando (npm run start) e inicie de novo para a versão nova valer."
Write-Host "Os documentos já enviados mantêm os trechos antigos (1.100 caracteres) até serem reenviados; os novos usam 600."
