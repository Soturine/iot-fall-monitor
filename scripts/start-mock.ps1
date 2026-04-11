param(
  [string]$DeviceId = "esp32_demo_01",
  [string]$BrokerUrl = ""
)

. (Join-Path $PSScriptRoot "_common.ps1")

Write-Section "Inicializando mock publisher"

if (-not (Test-Path (Join-Path (Get-BackendDir) "node_modules"))) {
  Write-Fail "As dependencias do backend ainda nao foram instaladas."
  Write-Host "       Rode .\\scripts\\setup-dev.ps1 antes de iniciar o mock publisher." -ForegroundColor DarkGray
  exit 1
}

$existing = Get-ProcessRecord "mock"
if ($existing -and (Test-ProcessAlive ([int]$existing.ProcessId))) {
  Write-Warn "Ja existe um mock publisher rodando no processo $($existing.ProcessId)."
  Write-Host "       Rode .\\scripts\\stop-all.ps1 se quiser reiniciar o mock." -ForegroundColor DarkGray
  exit 0
}

$npmCli = Get-CommandPath "npm.cmd"
if (-not $npmCli) {
  $npmCli = "npm.cmd"
}

$environmentOverrides = @{}
if ($BrokerUrl) {
  $environmentOverrides["MQTT_BROKER_URL"] = $BrokerUrl
}

$result = Start-TrackedWindowProcess `
  -Key "mock" `
  -Title "Queda Mock Publisher" `
  -WorkingDirectory (Get-BackendDir) `
  -Command "& '$(Escape-SingleQuoted $npmCli)' run mock:publisher -- $DeviceId" `
  -EnvironmentOverrides $environmentOverrides

if ($result.Reused) {
  Write-Ok "Mock publisher ja estava rodando no processo $($result.ProcessId)."
  exit 0
}

Write-Ok "Mock publisher iniciado para o deviceId $DeviceId."
Write-Host "       Acompanhe a janela 'Queda Mock Publisher' para ver as publicacoes MQTT em tempo real." -ForegroundColor DarkGray
