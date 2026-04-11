param()

. (Join-Path $PSScriptRoot "_common.ps1")

$results = New-Object System.Collections.Generic.List[object]

function Add-Result {
  param(
    [string]$Name,
    [string]$Status,
    [string]$Details,
    [string]$Fix
  )

  $results.Add([pscustomobject]@{
      Name = $Name
      Status = $Status
      Details = $Details
      Fix = $Fix
    })
}

Write-Section "Check de ambiente do projeto Queda"

$nodePath = Get-CommandPath "node"
if ($nodePath) {
  $nodeVersion = Get-NodeVersionInfo
  $minimumNodeMajor = Get-MinimumSupportedNodeMajor
  if ($nodeVersion -and $nodeVersion.Major -ge $minimumNodeMajor) {
    Add-Result "Node.js" "OK" "Encontrado em $nodePath ($($nodeVersion.Raw))." "Nenhuma acao necessaria."
  } else {
    Add-Result "Node.js" "WARN" "Encontrado em $nodePath, mas a versao atual ($($nodeVersion.Raw)) pode ficar abaixo do minimo recomendado (Node $minimumNodeMajor+)." "Atualize para Node.js 20+ para reduzir falhas de build com Vite, lint e scripts locais."
  }
} else {
  Add-Result "Node.js" "FAIL" "Node.js nao foi encontrado no PATH." "Instale o Node.js LTS e abra um novo terminal antes de rodar os scripts."
}

$npmPath = Get-CommandPath "npm"
if ($npmPath) {
  Add-Result "npm" "OK" "Encontrado em $npmPath." "Nenhuma acao necessaria."
} else {
  Add-Result "npm" "FAIL" "npm nao foi encontrado no PATH." "Reinstale o Node.js com o npm habilitado ou abra um novo terminal apos a instalacao."
}

$platformIoPath = Get-PlatformIoCommand
if ($platformIoPath) {
  Add-Result "PlatformIO" "OK" "Disponivel em $platformIoPath." "Nenhuma acao necessaria."
} else {
  Add-Result "PlatformIO" "WARN" "PlatformIO nao foi encontrado no PATH nem em %USERPROFILE%\\.platformio." "Instale o PlatformIO Core ou use a extensao PlatformIO do VS Code antes de compilar o firmware."
}

$backendEnvPath = Get-BackendEnvPath
if (Test-Path $backendEnvPath) {
  Add-Result "backend/.env" "OK" "Arquivo encontrado em $backendEnvPath." "Nenhuma acao necessaria."
} else {
  Add-Result "backend/.env" "FAIL" "Arquivo backend/.env ainda nao existe." "Rode .\\scripts\\setup-dev.ps1 para copiar backend/.env.example e revisar as variaveis."
}

$frontendEnvPath = Get-FrontendEnvPath
if (Test-Path $frontendEnvPath) {
  Add-Result "frontend/.env" "OK" "Arquivo encontrado em $frontendEnvPath." "Nenhuma acao necessaria."
} else {
  Add-Result "frontend/.env" "FAIL" "Arquivo frontend/.env ainda nao existe." "Rode .\\scripts\\setup-dev.ps1 para copiar frontend/.env.example e revisar as variaveis."
}

$backendNodeModules = Join-Path (Get-BackendDir) "node_modules"
if (Test-Path $backendNodeModules) {
  Add-Result "Dependencias do backend" "OK" "backend/node_modules existe." "Nenhuma acao necessaria."
} else {
  Add-Result "Dependencias do backend" "WARN" "backend/node_modules ainda nao existe." "Rode .\\scripts\\setup-dev.ps1 para instalar as dependencias do backend."
}

$frontendNodeModules = Join-Path (Get-FrontendDir) "node_modules"
if (Test-Path $frontendNodeModules) {
  Add-Result "Dependencias do frontend" "OK" "frontend/node_modules existe." "Nenhuma acao necessaria."
} else {
  Add-Result "Dependencias do frontend" "WARN" "frontend/node_modules ainda nao existe." "Rode .\\scripts\\setup-dev.ps1 para instalar as dependencias do frontend."
}

$mysqlCli = Get-CommandPath "mysql"
if ($mysqlCli) {
  Add-Result "mysql CLI" "OK" "Cliente encontrado em $mysqlCli." "Nenhuma acao necessaria."
} else {
  Add-Result "mysql CLI" "WARN" "mysql.exe nao foi encontrado no PATH." "Isso nao bloqueia o init-db automatico via Node, mas o MySQL Workbench ou o mysql CLI ajudam no diagnostico manual."
}

$backendEnv = Get-BackendEnv -PreferExampleIfMissing
$mysqlHost = if ($backendEnv.ContainsKey("MYSQL_HOST")) { $backendEnv["MYSQL_HOST"] } else { Get-LocalDevHost }
$mysqlPort = 3306
if ($backendEnv.ContainsKey("MYSQL_PORT")) {
  [void][int]::TryParse($backendEnv["MYSQL_PORT"], [ref]$mysqlPort)
}

if (Test-TcpEndpoint -HostName $mysqlHost -Port $mysqlPort -TimeoutMs 1500) {
  Add-Result "MySQL" "OK" "Foi possivel abrir conexao TCP com $mysqlHost`:$mysqlPort." "Nenhuma acao necessaria."
} else {
  Add-Result "MySQL" "WARN" "Nao foi possivel alcancar $mysqlHost`:$mysqlPort no momento." "Confirme se o servidor MySQL esta ligado, se a porta esta correta em backend/.env e se o firewall local permite conexoes."
}

$backendPort = Get-BackendPort
if (Test-LocalPortFree -Port $backendPort) {
  Add-Result "Porta do backend" "OK" "A porta $backendPort esta livre para uso." "Nenhuma acao necessaria."
} else {
  Add-Result "Porta do backend" "WARN" "A porta $backendPort ja esta ocupada." "Se o backend ja estiver rodando, voce pode reutiliza-lo. Caso contrario, feche o processo que esta usando a porta ou rode .\\scripts\\stop-all.ps1."
}

$frontendPort = Get-FrontendPort
if (Test-LocalPortFree -Port $frontendPort) {
  Add-Result "Porta do frontend" "OK" "A porta $frontendPort esta livre para o Vite." "Nenhuma acao necessaria."
} else {
  Add-Result "Porta do frontend" "WARN" "A porta $frontendPort ja esta ocupada." "Se o frontend ja estiver rodando, voce pode reutiliza-lo. Caso contrario, libere a porta ou rode .\\scripts\\stop-all.ps1."
}

$mqtt = Get-MqttSettings
if ($mqtt.IsLocal) {
  if (Test-TcpEndpoint -HostName $mqtt.Host -Port $mqtt.Port -TimeoutMs 800) {
    Add-Result "Broker MQTT" "OK" "Existe algo ouvindo em $($mqtt.Host):$($mqtt.Port)." "Nenhuma acao necessaria."
  } else {
    Add-Result "Broker MQTT" "WARN" "Nenhum broker local respondeu em $($mqtt.Host):$($mqtt.Port)." "Use .\\scripts\\start-all.ps1 para subir o broker dev automaticamente ou ajuste MQTT_BROKER_URL para um broker externo real."
  }
} else {
  if (Test-TcpEndpoint -HostName $mqtt.Host -Port $mqtt.Port -TimeoutMs 1500) {
    Add-Result "Broker MQTT" "OK" "O broker externo $($mqtt.Host):$($mqtt.Port) respondeu no teste TCP." "Nenhuma acao necessaria."
  } else {
    Add-Result "Broker MQTT" "WARN" "Nao foi possivel alcancar o broker externo $($mqtt.Host):$($mqtt.Port)." "Confirme MQTT_BROKER_URL, conectividade de rede e se o broker remoto aceita conexoes do seu ambiente."
  }
}

$schemaPath = Join-Path (Get-ProjectRoot) "database\schema.sql"
if (Test-Path $schemaPath) {
  Add-Result "database/schema.sql" "OK" "Arquivo encontrado." "Nenhuma acao necessaria."
} else {
  Add-Result "database/schema.sql" "FAIL" "Arquivo database/schema.sql nao foi encontrado." "Restaure o arquivo antes de rodar o init-db."
}

$seedPath = Join-Path (Get-ProjectRoot) "database\seed.sql"
if (Test-Path $seedPath) {
  Add-Result "database/seed.sql" "OK" "Arquivo encontrado." "Nenhuma acao necessaria."
} else {
  Add-Result "database/seed.sql" "FAIL" "Arquivo database/seed.sql nao foi encontrado." "Restaure o arquivo antes de rodar o init-db."
}

foreach ($result in $results) {
  switch ($result.Status) {
    "OK" { Write-Ok "$($result.Name): $($result.Details)" }
    "WARN" { Write-Warn "$($result.Name): $($result.Details)" }
    default { Write-Fail "$($result.Name): $($result.Details)" }
  }

  if ($result.Fix) {
    Write-Host "       Como corrigir: $($result.Fix)" -ForegroundColor DarkGray
  }
}

$failures = @($results | Where-Object { $_.Status -eq "FAIL" })
$warnings = @($results | Where-Object { $_.Status -eq "WARN" })

Write-Section "Resumo"
if ($failures.Count -eq 0) {
  Write-Ok "Nenhum bloqueio critico encontrado."
} else {
  Write-Fail "$($failures.Count) bloqueio(s) critico(s) encontrado(s)."
}

if ($warnings.Count -gt 0) {
  Write-Warn "$($warnings.Count) alerta(s) adicional(is) merecem revisao antes da demonstracao."
}

if ($failures.Count -gt 0) {
  exit 1
}
