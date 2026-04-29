param(
  [switch]$UseDevBroker,
  [switch]$StartMock,
  [switch]$NoBrowser,
  [int]$DevBrokerPort = 1883,
  [string]$DevBrokerBindHost = "0.0.0.0",
  [string]$MockDeviceId = "esp32_demo_01"
)

. (Join-Path $PSScriptRoot "_common.ps1")

Write-Section "Subindo ambiente completo"

if (-not (Get-CommandPath "node") -or -not (Get-CommandPath "npm")) {
  Write-Fail "Node.js e npm precisam estar instalados antes do start-all."
  Write-Host "       Rode .\\scripts\\check-env.ps1 para ver o diagnostico completo." -ForegroundColor DarkGray
  exit 1
}

if (-not (Test-Path (Get-BackendEnvPath)) -or -not (Test-Path (Get-FrontendEnvPath))) {
  Write-Fail "backend/.env ou frontend/.env ainda nao existem."
  Write-Host "       Rode .\\scripts\\setup-dev.ps1 primeiro." -ForegroundColor DarkGray
  exit 1
}

if (-not (Test-Path (Join-Path (Get-BackendDir) "node_modules")) -or -not (Test-Path (Join-Path (Get-FrontendDir) "node_modules"))) {
  Write-Fail "As dependencias do backend ou do frontend ainda nao foram instaladas."
  Write-Host "       Rode .\\scripts\\setup-dev.ps1 primeiro." -ForegroundColor DarkGray
  exit 1
}

$brokerUrlOverride = ""
$brokerUrlInUse = ""
$mqtt = Get-MqttSettings
$localDevHost = Get-LocalDevHost
$npmCli = Get-CommandPath "npm.cmd"
if (-not $npmCli) {
  $npmCli = "npm.cmd"
}

if ($UseDevBroker) {
  $brokerUrlOverride = "mqtt://$localDevHost`:$DevBrokerPort"
  $brokerUrlInUse = $brokerUrlOverride

  if (Test-TcpEndpoint -HostName $localDevHost -Port $DevBrokerPort -TimeoutMs 800) {
    Write-Ok "Ja existe algo ouvindo em $brokerUrlInUse. Vou reutilizar esse broker local."
  } else {
    Write-Info "Iniciando broker MQTT local de desenvolvimento em $brokerUrlInUse..."
    $brokerResult = Start-TrackedWindowProcess `
      -Key "broker" `
      -Title "Queda Dev Broker" `
      -WorkingDirectory (Get-BackendDir) `
      -Command "& '$(Escape-SingleQuoted $npmCli)' run dev:broker" `
      -EnvironmentOverrides @{
        MQTT_PORT = "$DevBrokerPort"
        MQTT_BIND_HOST = $DevBrokerBindHost
        DEV_BROKER_PORT = "$DevBrokerPort"
      }

    if ($brokerResult.Reused) {
      Write-Ok "Broker de desenvolvimento ja estava rodando no processo $($brokerResult.ProcessId)."
    } else {
      Start-Sleep -Seconds 2
      if (Test-TcpEndpoint -HostName $localDevHost -Port $DevBrokerPort -TimeoutMs 1200) {
        Write-Ok "Broker local iniciado em $brokerUrlInUse."
      } else {
        Write-Fail "O broker de desenvolvimento foi iniciado em nova janela, mas nao respondeu em $brokerUrlInUse."
        Write-Host "       Verifique a janela 'Queda Dev Broker' para detalhes." -ForegroundColor DarkGray
        exit 1
      }
    }
  }
} elseif ($mqtt.IsLocal) {
  $brokerUrlInUse = $mqtt.BrokerUrl

  if (Test-TcpEndpoint -HostName $mqtt.Host -Port $mqtt.Port -TimeoutMs 800) {
    Write-Ok "Broker local ja disponivel em $brokerUrlInUse."
  } else {
    Write-Info "MQTT_BROKER_URL aponta para um broker local e nada esta ouvindo. Vou subir o broker dev automaticamente."
    $brokerResult = Start-TrackedWindowProcess `
      -Key "broker" `
      -Title "Queda Dev Broker" `
      -WorkingDirectory (Get-BackendDir) `
      -Command "& '$(Escape-SingleQuoted $npmCli)' run dev:broker" `
      -EnvironmentOverrides @{
        MQTT_PORT = "$($mqtt.Port)"
        MQTT_BIND_HOST = $DevBrokerBindHost
        DEV_BROKER_PORT = "$($mqtt.Port)"
      }

    if ($brokerResult.Reused) {
      Write-Ok "Broker de desenvolvimento ja estava rodando no processo $($brokerResult.ProcessId)."
    } else {
      Start-Sleep -Seconds 2
      if (Test-TcpEndpoint -HostName $mqtt.Host -Port $mqtt.Port -TimeoutMs 1200) {
        Write-Ok "Broker local iniciado em $brokerUrlInUse."
      } else {
        Write-Fail "O broker local nao respondeu em $brokerUrlInUse apos a inicializacao."
        Write-Host "       Verifique a janela 'Queda Dev Broker' para detalhes." -ForegroundColor DarkGray
        exit 1
      }
    }
  }
} else {
  $brokerUrlInUse = $mqtt.BrokerUrl
  if (Test-TcpEndpoint -HostName $mqtt.Host -Port $mqtt.Port -TimeoutMs 1500) {
    Write-Ok "Broker MQTT externo acessivel em $brokerUrlInUse."
  } else {
    Write-Warn "Nao foi possivel validar o broker externo em $brokerUrlInUse agora. O backend ainda sera iniciado, mas o mock publisher pode falhar."
  }
}

$startBackendScript = Join-Path $PSScriptRoot "start-backend.ps1"
if ($brokerUrlOverride) {
  & $startBackendScript -BrokerUrl $brokerUrlOverride
} else {
  & $startBackendScript
}

if ($LASTEXITCODE -ne 0) {
  Write-Fail "O backend nao ficou pronto."
  exit 1
}

$startFrontendScript = Join-Path $PSScriptRoot "start-frontend.ps1"
& $startFrontendScript
if ($LASTEXITCODE -ne 0) {
  Write-Fail "O frontend nao ficou pronto."
  exit 1
}

if ($StartMock) {
  $startMockScript = Join-Path $PSScriptRoot "start-mock.ps1"
  if ($brokerUrlOverride) {
    & $startMockScript -DeviceId $MockDeviceId -BrokerUrl $brokerUrlOverride
  } else {
    & $startMockScript -DeviceId $MockDeviceId
  }
}

$frontendUrl = Get-FrontendUrl
$backendUrl = Get-BackendBaseUrl
$demo = Get-DemoCredentials

if (-not $NoBrowser) {
  & (Join-Path $PSScriptRoot "open-site.ps1") -Url $frontendUrl
}

Write-Section "Ambiente pronto"
Write-Host "Frontend: $frontendUrl" -ForegroundColor White
Write-Host "Backend:  $backendUrl" -ForegroundColor White
Write-Host "Broker:   $brokerUrlInUse" -ForegroundColor White

Write-Host "" 
Write-Host "Login e cadastro:" -ForegroundColor White
Write-Host "- Seed demo, se voce aplicou database/seed.sql: $($demo.Email) / $($demo.Password)" -ForegroundColor White
Write-Host "- Sem seed, use a aba 'Criar conta' no site. O primeiro usuario criado vira admin." -ForegroundColor White

if ($StartMock) {
  Write-Host "" 
  Write-Host "Mock publisher ativo para o deviceId $MockDeviceId." -ForegroundColor White
}

Write-Host "" 
Write-Host "Dica: quando terminar, rode .\\scripts\\stop-all.ps1." -ForegroundColor White
