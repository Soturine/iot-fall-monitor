param(
  [string]$BrokerUrl = ""
)

. (Join-Path $PSScriptRoot "_common.ps1")

Write-Section "Inicializando backend"

if (-not (Test-Path (Get-BackendEnvPath))) {
  Write-Fail "backend/.env nao foi encontrado."
  Write-Host "       Rode .\\scripts\\setup-dev.ps1 antes de iniciar o backend." -ForegroundColor DarkGray
  exit 1
}

if (-not (Test-Path (Join-Path (Get-BackendDir) "node_modules"))) {
  Write-Fail "As dependencias do backend ainda nao foram instaladas."
  Write-Host "       Rode .\\scripts\\setup-dev.ps1 antes de iniciar o backend." -ForegroundColor DarkGray
  exit 1
}

$healthUrl = "$(Get-BackendBaseUrl)/health"
$backendPort = Get-BackendPort
$npmCli = Get-CommandPath "npm.cmd"
if (-not $npmCli) {
  $npmCli = "npm.cmd"
}
if (-not (Test-LocalPortFree -Port $backendPort)) {
  if (Wait-HttpReady -Url $healthUrl -TimeoutSeconds 3) {
    Write-Ok "Backend ja esta respondendo em $healthUrl."
    exit 0
  }

  Write-Fail "A porta $backendPort esta ocupada, mas o endpoint $healthUrl nao respondeu."
  Write-Host "       Libere a porta ou rode .\\scripts\\stop-all.ps1 antes de tentar novamente." -ForegroundColor DarkGray
  exit 1
}

$environmentOverrides = @{}
if ($BrokerUrl) {
  $environmentOverrides["MQTT_BROKER_URL"] = $BrokerUrl
}

$result = Start-TrackedWindowProcess `
  -Key "backend" `
  -Title "Queda Backend" `
  -WorkingDirectory (Get-BackendDir) `
  -Command "& '$(Escape-SingleQuoted $npmCli)' run dev" `
  -EnvironmentOverrides $environmentOverrides

if ($result.Reused) {
  Write-Ok "Backend ja estava rodando no processo $($result.ProcessId)."
  exit 0
}

if (Wait-HttpReady -Url $healthUrl -TimeoutSeconds 25) {
  Write-Ok "Backend respondendo em $healthUrl."
  exit 0
}

Write-Fail "O backend foi iniciado em nova janela, mas nao respondeu em $healthUrl dentro do tempo esperado."
Write-Host "       Verifique a janela 'Queda Backend' para ver erros de MySQL, MQTT ou variaveis de ambiente." -ForegroundColor DarkGray
exit 1
