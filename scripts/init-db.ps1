param()

. (Join-Path $PSScriptRoot "_common.ps1")

Write-Section "Inicializacao do banco de dados"

$backendEnvPath = Get-BackendEnvPath
if (-not (Test-Path $backendEnvPath)) {
  Write-Fail "backend/.env nao foi encontrado."
  Write-Host "       Rode .\\scripts\\setup-dev.ps1 primeiro para criar o arquivo de ambiente." -ForegroundColor DarkGray
  exit 1
}

$backendEnv = Get-BackendEnv
$schemaPath = Join-Path (Get-ProjectRoot) "database\schema.sql"
$seedPath = Join-Path (Get-ProjectRoot) "database\seed.sql"
$nodePath = Get-CommandPath "node"
$mysqlCli = Get-CommandPath "mysql"
$databaseName = if ($backendEnv.ContainsKey("MYSQL_DATABASE")) { $backendEnv["MYSQL_DATABASE"] } else { "queda_monitor" }

if ($nodePath -and (Test-Path (Join-Path (Get-BackendDir) "node_modules\mysql2"))) {
  Write-Info "Tentando aplicar schema e seed via mysql2 do backend..."
  Push-Location (Get-BackendDir)
  try {
    node scripts/initDb.js
    if ($LASTEXITCODE -eq 0) {
      Write-Ok "Banco inicializado com sucesso."
      Write-Host "       Banco alvo: $databaseName" -ForegroundColor DarkGray
      Write-Host "       Usuario demo seed: admin@queda.local / Admin@123" -ForegroundColor DarkGray
      exit 0
    }
  } finally {
    Pop-Location
  }

  Write-Warn "A inicializacao automatica via Node falhou. Vou tentar alternativas."
}

if ($mysqlCli -and ($databaseName -eq "queda_monitor")) {
  Write-Info "Tentando fallback com mysql CLI porque o banco padrao do projeto esta configurado."

  $mysqlHost = if ($backendEnv.ContainsKey("MYSQL_HOST")) { $backendEnv["MYSQL_HOST"] } else { Get-LocalDevHost }
  $mysqlPort = if ($backendEnv.ContainsKey("MYSQL_PORT")) { $backendEnv["MYSQL_PORT"] } else { "3306" }
  $mysqlUser = if ($backendEnv.ContainsKey("MYSQL_USER")) { $backendEnv["MYSQL_USER"] } else { "root" }
  $mysqlPassword = if ($backendEnv.ContainsKey("MYSQL_PASSWORD")) { $backendEnv["MYSQL_PASSWORD"] } else { "" }

  $mysqlArgs = @("--host=$mysqlHost", "--port=$mysqlPort", "--user=$mysqlUser")
  if ($mysqlPassword) {
    $mysqlArgs += "--password=$mysqlPassword"
  }

  try {
    Get-Content -Raw $schemaPath | & $mysqlCli @mysqlArgs
    Get-Content -Raw $seedPath | & $mysqlCli @mysqlArgs
    Write-Ok "Schema e seed aplicados via mysql CLI."
    exit 0
  } catch {
    Write-Warn "O fallback via mysql CLI tambem falhou: $($_.Exception.Message)"
  }
}

Write-Fail "Nao foi possivel automatizar a inicializacao do banco neste ambiente."
Write-Host "Provaveis causas:" -ForegroundColor White
Write-Host "1. O MySQL nao esta rodando ou nao esta acessivel com as credenciais de backend/.env." -ForegroundColor White
Write-Host "2. backend/node_modules ainda nao foi instalado, entao o helper via mysql2 nao pode rodar." -ForegroundColor White
Write-Host "3. mysql.exe nao esta no PATH e o fallback via CLI nao ficou disponivel." -ForegroundColor White

Write-Section "Tutorial rapido com MySQL Workbench"
Write-Host "1. Abra o MySQL Workbench e conecte-se ao mesmo servidor definido em backend/.env." -ForegroundColor White
Write-Host "2. Execute o arquivo $schemaPath." -ForegroundColor White
Write-Host "3. Execute o arquivo $seedPath." -ForegroundColor White
Write-Host "4. Se voce usa outro nome de banco em backend/.env, confirme se o SQL esta apontando para o mesmo database." -ForegroundColor White
Write-Host "5. Depois rode .\\scripts\\smoke-test.ps1 para validar login e rotas basicas." -ForegroundColor White

exit 1
