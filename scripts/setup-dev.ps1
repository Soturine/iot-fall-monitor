param(
  [switch]$ForceInstall
)

. (Join-Path $PSScriptRoot "_common.ps1")

function Ensure-EnvFile {
  param(
    [string]$Label,
    [string]$TargetPath,
    [string]$ExamplePath
  )

  if (Test-Path $TargetPath) {
    Write-Ok "$Label ja existe em $TargetPath."
    return
  }

  if (-not (Test-Path $ExamplePath)) {
    Write-Fail "Nao foi possivel criar $Label porque $ExamplePath nao existe."
    throw "Arquivo de exemplo ausente."
  }

  Copy-Item $ExamplePath $TargetPath
  Write-Warn "$Label nao existia e foi criado a partir de $ExamplePath."
  Write-Host "       Revise este arquivo antes de iniciar o sistema." -ForegroundColor DarkGray
}

function Install-DependenciesIfNeeded {
  param(
    [string]$Label,
    [string]$WorkingDirectory
  )

  $nodeModulesPath = Join-Path $WorkingDirectory "node_modules"
  if ((Test-Path $nodeModulesPath) -and (-not $ForceInstall)) {
    Write-Ok "Dependencias do $Label ja estao instaladas."
    return
  }

  Write-Info "Instalando dependencias do $Label..."
  Push-Location $WorkingDirectory
  try {
    npm install
  } finally {
    Pop-Location
  }

  Write-Ok "Dependencias do $Label instaladas."
}

function Validate-EnvValue {
  param(
    [string]$FileLabel,
    [hashtable]$Values,
    [string]$Key,
    [string]$FriendlyName,
    [switch]$AllowPlaceholder
  )

  if (-not $Values.ContainsKey($Key)) {
    Write-Warn "$FileLabel ainda nao define $Key ($FriendlyName)."
    return
  }

  $value = [string]$Values[$Key]
  if ([string]::IsNullOrWhiteSpace($value)) {
    Write-Warn "$FileLabel tem $Key vazio. Edite o arquivo antes de seguir."
    return
  }

  if ((-not $AllowPlaceholder) -and (Test-PlaceholderValue $value)) {
    Write-Warn "$FileLabel ainda usa um valor placeholder em $Key. Ajuste esse campo manualmente."
    return
  }

  Write-Ok "${FileLabel}: $Key configurado."
}

Write-Section "Setup de desenvolvimento no Windows"

$nodePath = Get-CommandPath "node"
$npmPath = Get-CommandPath "npm"
if (-not $nodePath -or -not $npmPath) {
  Write-Fail "Node.js e npm precisam estar instalados antes do setup."
  Write-Host "       Instale o Node.js LTS e abra um novo terminal." -ForegroundColor DarkGray
  exit 1
}

$nodeVersion = Get-NodeVersionInfo
$minimumNodeMajor = Get-MinimumSupportedNodeMajor
if ($nodeVersion -and $nodeVersion.Major -lt $minimumNodeMajor) {
  Write-Warn "Node.js $($nodeVersion.Raw) detectado. O projeto esta estabilizado para Node $minimumNodeMajor+."
  Write-Host "       O setup vai continuar, mas builds do frontend e scripts locais podem falhar em versoes antigas." -ForegroundColor DarkGray
}

Ensure-EnvFile -Label "backend/.env" -TargetPath (Get-BackendEnvPath) -ExamplePath (Get-BackendEnvExamplePath)
Ensure-EnvFile -Label "frontend/.env" -TargetPath (Get-FrontendEnvPath) -ExamplePath (Get-FrontendEnvExamplePath)

Install-DependenciesIfNeeded -Label "backend" -WorkingDirectory (Get-BackendDir)
Install-DependenciesIfNeeded -Label "frontend" -WorkingDirectory (Get-FrontendDir)

Write-Section "Validacao dos .env"

$backendEnv = Get-BackendEnv
Validate-EnvValue -FileLabel "backend/.env" -Values $backendEnv -Key "PORT" -FriendlyName "porta da API"
Validate-EnvValue -FileLabel "backend/.env" -Values $backendEnv -Key "JWT_SECRET" -FriendlyName "segredo JWT"
Validate-EnvValue -FileLabel "backend/.env" -Values $backendEnv -Key "MYSQL_HOST" -FriendlyName "host do MySQL"
Validate-EnvValue -FileLabel "backend/.env" -Values $backendEnv -Key "MYSQL_PORT" -FriendlyName "porta do MySQL"
Validate-EnvValue -FileLabel "backend/.env" -Values $backendEnv -Key "MYSQL_USER" -FriendlyName "usuario do MySQL"
Validate-EnvValue -FileLabel "backend/.env" -Values $backendEnv -Key "MYSQL_DATABASE" -FriendlyName "nome do banco"
Validate-EnvValue -FileLabel "backend/.env" -Values $backendEnv -Key "MQTT_BROKER_URL" -FriendlyName "broker MQTT"
Validate-EnvValue -FileLabel "backend/.env" -Values $backendEnv -Key "MQTT_CLIENT_ID" -FriendlyName "client id do backend" -AllowPlaceholder
Validate-EnvValue -FileLabel "backend/.env" -Values $backendEnv -Key "MQTT_TOPIC_BASE" -FriendlyName "topico base MQTT" -AllowPlaceholder

$frontendEnv = Get-FrontendEnv
Validate-EnvValue -FileLabel "frontend/.env" -Values $frontendEnv -Key "VITE_API_URL" -FriendlyName "URL da API"
Validate-EnvValue -FileLabel "frontend/.env" -Values $frontendEnv -Key "VITE_SOCKET_URL" -FriendlyName "URL do Socket.IO"

Write-Section "Proximos passos"
Write-Host "1. Revise backend/.env e frontend/.env se algum valor placeholder ainda apareceu acima." -ForegroundColor White
Write-Host "2. Rode .\\scripts\\init-db.ps1 para criar/aplicar o banco." -ForegroundColor White
Write-Host "3. Rode .\\scripts\\start-all.ps1 para subir backend, frontend e o broker local quando necessario." -ForegroundColor White
Write-Host "4. Consulte [docs/quickstart-windows.md](../docs/quickstart-windows.md) para o passo a passo completo." -ForegroundColor White
