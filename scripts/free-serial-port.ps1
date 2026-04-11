param(
  [string]$Port = "COM4"
)

$escapedPort = [Regex]::Escape($Port)

Write-Host ""
Write-Host "== Liberando porta serial $Port ==" -ForegroundColor Cyan

$processes = Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -and (
    $_.CommandLine -match "device monitor" -or
    $_.CommandLine -match "esptool" -or
    $_.CommandLine -match "putty" -or
    $_.CommandLine -match "teraterm" -or
    $_.CommandLine -match "coolterm"
  ) -and $_.CommandLine -match $escapedPort
}

if (-not $processes) {
  Write-Host "[OK] Nenhum monitor serial ou esptool com $Port foi encontrado." -ForegroundColor Green
  Write-Host "     Se a porta ainda estiver ocupada, feche manualmente o monitor serial do VS Code ou qualquer terminal serial aberto." -ForegroundColor DarkGray
  exit 0
}

foreach ($process in $processes) {
  try {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
    Write-Host "[OK] Processo encerrado: PID $($process.ProcessId) $($process.Name)" -ForegroundColor Green
    Write-Host "     $($process.CommandLine)" -ForegroundColor DarkGray
  } catch {
    Write-Host "[FAIL] Nao foi possivel encerrar PID $($process.ProcessId) $($process.Name): $($_.Exception.Message)" -ForegroundColor Red
  }
}

Start-Sleep -Milliseconds 600

try {
  $serial = New-Object System.IO.Ports.SerialPort $Port,115200,'None',8,'One'
  $serial.Open()
  $serial.Close()
  Write-Host "[OK] A porta $Port respondeu a uma abertura simples apos a limpeza." -ForegroundColor Green
} catch {
  Write-Host "[WARN] A porta $Port ainda nao abriu apos a limpeza automatica: $($_.Exception.Message)" -ForegroundColor Yellow
  Write-Host "      Isso normalmente indica monitor serial do VS Code ainda aberto ou outra aplicacao segurando a COM." -ForegroundColor DarkGray
}
