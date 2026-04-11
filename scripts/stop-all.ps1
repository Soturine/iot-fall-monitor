param()

. (Join-Path $PSScriptRoot "_common.ps1")

Write-Section "Encerrando processos de desenvolvimento"

$keys = @("mock", "frontend", "backend", "broker")
$stoppedAny = $false

foreach ($key in $keys) {
  $result = Stop-TrackedProcess $key
  if (-not $result.Found) {
    Write-Info "Nenhum processo rastreado para '$key'."
    continue
  }

  if ($result.Stopped) {
    Write-Ok "$($result.Title) encerrado (PID $($result.ProcessId))."
    $stoppedAny = $true
  } else {
    Write-Warn "$($result.Title) ja nao estava em execucao."
  }
}

if (-not $stoppedAny) {
  Write-Warn "Nenhum processo iniciado pelos scripts estava rodando."
}
