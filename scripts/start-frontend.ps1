param()

. (Join-Path $PSScriptRoot "_common.ps1")

Write-Section "Inicializando frontend"

if (-not (Test-Path (Get-FrontendEnvPath))) {
  Write-Fail "frontend/.env nao foi encontrado."
  Write-Host "       Rode .\\scripts\\setup-dev.ps1 antes de iniciar o frontend." -ForegroundColor DarkGray
  exit 1
}

if (-not (Test-Path (Join-Path (Get-FrontendDir) "node_modules"))) {
  Write-Fail "As dependencias do frontend ainda nao foram instaladas."
  Write-Host "       Rode .\\scripts\\setup-dev.ps1 antes de iniciar o frontend." -ForegroundColor DarkGray
  exit 1
}

$frontendUrl = Get-FrontendUrl
$frontendPort = Get-FrontendPort
$localDevHost = Get-LocalDevHost
$npmCli = Get-CommandPath "npm.cmd"
if (-not $npmCli) {
  $npmCli = "npm.cmd"
}
if (-not (Test-LocalPortFree -Port $frontendPort)) {
  if (Wait-HttpReady -Url $frontendUrl -TimeoutSeconds 3) {
    Write-Ok "Frontend ja esta respondendo em $frontendUrl."
    exit 0
  }

  Write-Fail "A porta $frontendPort esta ocupada, mas o frontend nao respondeu em $frontendUrl."
  Write-Host "       Libere a porta ou rode .\\scripts\\stop-all.ps1 antes de tentar novamente." -ForegroundColor DarkGray
  exit 1
}

$result = Start-TrackedWindowProcess `
  -Key "frontend" `
  -Title "Queda Frontend" `
  -WorkingDirectory (Get-FrontendDir) `
  -Command "& '$(Escape-SingleQuoted $npmCli)' run dev -- --host $localDevHost --strictPort --port $frontendPort"

if ($result.Reused) {
  Write-Ok "Frontend ja estava rodando no processo $($result.ProcessId)."
  exit 0
}

if (Wait-HttpReady -Url $frontendUrl -TimeoutSeconds 25) {
  Write-Ok "Frontend respondendo em $frontendUrl."
  exit 0
}

Write-Fail "O frontend foi iniciado em nova janela, mas nao respondeu em $frontendUrl dentro do tempo esperado."
Write-Host "       Verifique a janela 'Queda Frontend' para erros de Vite, TypeScript ou porta ocupada." -ForegroundColor DarkGray
exit 1
