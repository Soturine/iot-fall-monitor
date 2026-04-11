param(
  [string]$Url = ""
)

. (Join-Path $PSScriptRoot "_common.ps1")

$targetUrl = if ($Url) { $Url } else { Get-FrontendUrl }

Write-Section "Abrindo o site"
Write-Info "Abrindo $targetUrl no navegador padrao..."

try {
  Start-Process $targetUrl | Out-Null
  Write-Ok "Navegador aberto."
} catch {
  Write-Fail "Nao foi possivel abrir o navegador automaticamente: $($_.Exception.Message)"
  Write-Host "       Abra manualmente $targetUrl." -ForegroundColor DarkGray
  exit 1
}
