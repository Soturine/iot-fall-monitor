param(
  [string]$Email = "admin@queda.local",
  [string]$Password = "Admin@123",
  [switch]$SkipMock
)

. (Join-Path $PSScriptRoot "_common.ps1")

$script:SmokeFailed = $false
$script:SmokeWarnings = $false

function Mark-Failure {
  param([string]$Message)

  Write-Fail $Message
  $script:SmokeFailed = $true
}

function Mark-Warning {
  param([string]$Message)

  Write-Warn $Message
  $script:SmokeWarnings = $true
}

Write-Section "Smoke test do sistema"

$backendBaseUrl = Get-BackendBaseUrl
$frontendUrl = Get-FrontendUrl
$healthUrl = "$backendBaseUrl/health"

if (Wait-HttpReady -Url $healthUrl -TimeoutSeconds 5) {
  Write-Ok "Backend respondeu em $healthUrl."
} else {
  Mark-Failure "Backend nao respondeu em $healthUrl. Rode .\\scripts\\start-all.ps1 antes do smoke test."
  exit 1
}

try {
  $frontendResponse = Invoke-WebRequest -Uri $frontendUrl -UseBasicParsing -TimeoutSec 5
  if ($frontendResponse.StatusCode -ge 200 -and $frontendResponse.StatusCode -lt 500) {
    Write-Ok "Frontend respondeu em $frontendUrl."
  } else {
    Mark-Failure "Frontend respondeu com status inesperado: $($frontendResponse.StatusCode)."
  }
} catch {
  Mark-Failure "Frontend nao respondeu em $frontendUrl. Verifique se o Vite esta rodando."
}

$loginPayload = @{ email = $Email; password = $Password } | ConvertTo-Json
$token = $null

try {
  $loginResponse = Invoke-RestMethod `
    -Method Post `
    -Uri "$backendBaseUrl/api/auth/login" `
    -ContentType "application/json" `
    -Body $loginPayload `
    -TimeoutSec 10

  if ($loginResponse.token) {
    $token = $loginResponse.token
    Write-Ok "Login funcionou para $Email."
  } else {
    Mark-Failure "O backend respondeu ao login, mas nao retornou token."
  }
} catch {
  $response = $_.Exception.Response
  $statusCode = if ($response) { [int]$response.StatusCode } else { 0 }
  if ($statusCode -eq 401) {
    Mark-Failure "Login falhou com 401. Provavel causa: seed nao aplicada, senha demo diferente da seed ou usuario demo nao existe."
    Write-Host "       Rode .\\scripts\\init-db.ps1 novamente ou crie um usuario novo pela tela 'Criar conta' e repita o smoke test." -ForegroundColor DarkGray
  } elseif ($statusCode -eq 500) {
    Mark-Failure "Login falhou com 500. Provavel causa: backend conectado a um banco antigo, anterior ao schema multi-tenant atual."
    Write-Host "       Rode .\\scripts\\init-db.ps1 para reaplicar database/schema.sql e database/seed.sql, depois repita o smoke test." -ForegroundColor DarkGray
  } else {
    Mark-Failure "Falha ao testar login: $($_.Exception.Message)"
  }
}

if (-not $token) {
  exit 1
}

$headers = @{ Authorization = "Bearer $token" }
$activeOrganizationId = $null

if ($loginResponse.user -and $loginResponse.user.activeOrganizationId) {
  $activeOrganizationId = [string]$loginResponse.user.activeOrganizationId
  $headers["X-Organization-Id"] = $activeOrganizationId
  Write-Ok "Contexto multi-tenant identificado para a organizacao ativa $activeOrganizationId."
} else {
  Mark-Warning "Login respondeu sem activeOrganizationId. Vou continuar com o contexto padrao devolvido pelo backend."
}

try {
  $dashboard = Invoke-RestMethod -Uri "$backendBaseUrl/api/dashboard/summary" -Headers $headers -TimeoutSec 10
  if ($dashboard.metrics) {
    Write-Ok "Dashboard respondeu com metricas."
  } else {
    Mark-Failure "Dashboard respondeu sem a estrutura esperada."
  }
} catch {
  Mark-Failure "Nao foi possivel consultar /api/dashboard/summary: $($_.Exception.Message)"
}

try {
  $organization = Invoke-RestMethod -Uri "$backendBaseUrl/api/organization" -Headers $headers -TimeoutSec 10
  if ($organization.organization) {
    Write-Ok "Endpoint de organizacao respondeu com tenant ativo."
  } else {
    Mark-Failure "Endpoint /api/organization respondeu sem a organizacao esperada."
  }
} catch {
  Mark-Failure "Nao foi possivel consultar /api/organization: $($_.Exception.Message)"
}

try {
  $patients = Invoke-RestMethod -Uri "$backendBaseUrl/api/patients" -Headers $headers -TimeoutSec 10
  if ($patients.items -ne $null) {
    Write-Ok "Endpoint de pacientes respondeu."
  } else {
    Mark-Failure "Endpoint /api/patients respondeu sem a lista esperada."
  }
} catch {
  Mark-Failure "Nao foi possivel consultar /api/patients: $($_.Exception.Message)"
}

try {
  $devices = Invoke-RestMethod -Uri "$backendBaseUrl/api/devices?limit=5" -Headers $headers -TimeoutSec 10
  if ($devices.items -ne $null) {
    Write-Ok "Endpoint de dispositivos respondeu."
  } else {
    Mark-Failure "Endpoint /api/devices respondeu sem a lista esperada."
  }
} catch {
  Mark-Failure "Nao foi possivel consultar /api/devices: $($_.Exception.Message)"
}

try {
  $alerts = Invoke-RestMethod -Uri "$backendBaseUrl/api/alerts?limit=5" -Headers $headers -TimeoutSec 10
  if ($alerts.items -ne $null) {
    Write-Ok "Endpoint de alertas respondeu."
  } else {
    Mark-Failure "Endpoint /api/alerts respondeu sem a lista esperada."
  }
} catch {
  Mark-Failure "Nao foi possivel consultar /api/alerts: $($_.Exception.Message)"
}

if (-not $SkipMock) {
  Write-Section "Teste de publicacao MQTT com mock publisher"

  $runtimeDir = New-RuntimeSessionDir -Prefix "smoke"
  $npmCli = Get-CommandPath "npm.cmd"
  if (-not $npmCli) {
    $npmCli = "npm.cmd"
  }
  $mockDeviceId = "smoke_$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
  $stdoutPath = Join-Path $runtimeDir "mock.stdout.log"
  $stderrPath = Join-Path $runtimeDir "mock.stderr.log"

  $mockCommand = "Set-Location '$(Escape-SingleQuoted (Get-BackendDir))'; & '$(Escape-SingleQuoted $npmCli)' run mock:publisher -- $mockDeviceId"
  $mockProcess = Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList @("-ExecutionPolicy", "Bypass", "-Command", $mockCommand) `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -PassThru

  Start-Sleep -Seconds 8

  if (Test-ProcessAlive $mockProcess.Id) {
    Stop-ProcessTree -ProcessId $mockProcess.Id
    try {
      Wait-Process -Id $mockProcess.Id -Timeout 5 -ErrorAction Stop
    } catch {
      Start-Sleep -Milliseconds 800
    }
  }

  $stdoutText = ""
  $stderrText = ""

  try {
    if (Test-Path $stdoutPath) {
      $stdoutText = Get-Content $stdoutPath -Raw -ErrorAction Stop
    }
  } catch {
    Mark-Warning "Nao foi possivel ler o log stdout do mock publisher nesta execucao. Vou validar a publicacao pelo backend."
  }

  try {
    if (Test-Path $stderrPath) {
      $stderrText = Get-Content $stderrPath -Raw -ErrorAction Stop
    }
  } catch {
    Mark-Warning "Nao foi possivel ler o log stderr do mock publisher nesta execucao. Vou validar a publicacao pelo backend."
  }

  if ($stderrText -match "MQTT error") {
    Mark-Warning "O mock publisher registrou erro MQTT no log temporario: $stderrText"
  } elseif ($stdoutText -match "Connected to") {
    Write-Ok "Mock publisher conseguiu conectar ao broker MQTT."
  } else {
    Mark-Warning "O mock publisher nao mostrou confirmacao de conexao no log temporario. Vou usar o backend como fonte final de validacao."
  }

  try {
    $search = [Uri]::EscapeDataString($mockDeviceId)
    $searchResponse = Invoke-RestMethod -Uri "$backendBaseUrl/api/devices?search=$search" -Headers $headers -TimeoutSec 10
    $match = @($searchResponse.items | Where-Object { $_.deviceIdentifier -eq $mockDeviceId })

    if ($match.Count -ge 1) {
      Write-Ok "O backend recebeu o mock publisher e auto-provisionou o deviceId $mockDeviceId."
    } else {
      Mark-Warning "O backend nao retornou o deviceId $mockDeviceId em /api/devices nesta execucao do smoke test."
    }
  } catch {
    Mark-Warning "Nao foi possivel validar o device do mock publisher no backend: $($_.Exception.Message)"
  }
}

Write-Section "Resumo"
if ($script:SmokeFailed) {
  Write-Fail "Smoke test terminou com falhas."
  exit 1
}

if ($script:SmokeWarnings) {
  Write-Warn "Smoke test principal concluido com sucesso, mas houve avisos em verificacoes auxiliares."
  exit 0
}

Write-Ok "Smoke test concluido com sucesso."
