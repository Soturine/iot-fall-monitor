Set-StrictMode -Version Latest

$script:ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$script:BackendDir = Join-Path $script:ProjectRoot "backend"
$script:FrontendDir = Join-Path $script:ProjectRoot "frontend"
$script:ScriptsDir = Join-Path $script:ProjectRoot "scripts"
$script:RuntimeDir = Join-Path $script:ScriptsDir ".runtime"

function Get-ProjectRoot {
  return $script:ProjectRoot
}

function Get-BackendDir {
  return $script:BackendDir
}

function Get-FrontendDir {
  return $script:FrontendDir
}

function Get-ScriptsDir {
  return $script:ScriptsDir
}

function Get-RuntimeDir {
  return $script:RuntimeDir
}

function Ensure-RuntimeDir {
  if (-not (Test-Path $script:RuntimeDir)) {
    New-Item -ItemType Directory -Path $script:RuntimeDir | Out-Null
  }
}

function New-RuntimeSessionDir {
  param([string]$Prefix = "run")

  Ensure-RuntimeDir
  $safePrefix = if ($Prefix) { $Prefix } else { "run" }
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $suffix = "{0}-{1}" -f $PID, ([Guid]::NewGuid().ToString("N").Substring(0, 6))
  $directoryName = "$safePrefix-$stamp-$suffix"
  $directoryPath = Join-Path $script:RuntimeDir $directoryName
  New-Item -ItemType Directory -Path $directoryPath -Force | Out-Null
  return $directoryPath
}

function Write-Section {
  param([string]$Message)

  Write-Host ""
  Write-Host "== $Message ==" -ForegroundColor Cyan
}

function Write-Ok {
  param([string]$Message)

  Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn {
  param([string]$Message)

  Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Fail {
  param([string]$Message)

  Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Write-Info {
  param([string]$Message)

  Write-Host "[INFO] $Message" -ForegroundColor Gray
}

function Get-CommandPath {
  param([string]$Name)

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($null -eq $command) {
    return $null
  }

  return $command.Source
}

function Get-NodeVersionInfo {
  $nodePath = Get-CommandPath "node"
  if (-not $nodePath) {
    return $null
  }

  try {
    $rawVersion = (& node -v).Trim()
    $normalized = $rawVersion.TrimStart("v")
    $version = [Version]$normalized
    return [pscustomobject]@{
      Raw = $rawVersion
      Version = $version
      Major = $version.Major
    }
  } catch {
    return [pscustomobject]@{
      Raw = "desconhecida"
      Version = $null
      Major = 0
    }
  }
}

function Get-MinimumSupportedNodeMajor {
  return 20
}

function Get-PlatformIoCommand {
  $command = Get-CommandPath "platformio"
  if ($command) {
    return $command
  }

  $fallback = Join-Path $env:USERPROFILE ".platformio\penv\Scripts\platformio.exe"
  if (Test-Path $fallback) {
    return $fallback
  }

  return $null
}

function Read-EnvFile {
  param([string]$Path)

  $values = @{}
  if (-not (Test-Path $Path)) {
    return $values
  }

  foreach ($line in Get-Content $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed) {
      continue
    }

    if ($trimmed.StartsWith("#")) {
      continue
    }

    $separatorIndex = $trimmed.IndexOf("=")
    if ($separatorIndex -lt 1) {
      continue
    }

    $key = $trimmed.Substring(0, $separatorIndex).Trim()
    $value = $trimmed.Substring($separatorIndex + 1).Trim()

    if (
      ($value.Length -ge 2) -and
      (($value.StartsWith('"') -and $value.EndsWith('"')) -or
       ($value.StartsWith("'") -and $value.EndsWith("'")))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    $values[$key] = $value
  }

  return $values
}

function Get-BackendEnvPath {
  return Join-Path $script:BackendDir ".env"
}

function Get-BackendEnvExamplePath {
  return Join-Path $script:BackendDir ".env.example"
}

function Get-FrontendEnvPath {
  return Join-Path $script:FrontendDir ".env"
}

function Get-FrontendEnvExamplePath {
  return Join-Path $script:FrontendDir ".env.example"
}

function Get-BackendEnv {
  param([switch]$PreferExampleIfMissing)

  $envPath = Get-BackendEnvPath
  if ((-not (Test-Path $envPath)) -and $PreferExampleIfMissing) {
    $envPath = Get-BackendEnvExamplePath
  }

  return Read-EnvFile $envPath
}

function Get-FrontendEnv {
  param([switch]$PreferExampleIfMissing)

  $envPath = Get-FrontendEnvPath
  if ((-not (Test-Path $envPath)) -and $PreferExampleIfMissing) {
    $envPath = Get-FrontendEnvExamplePath
  }

  return Read-EnvFile $envPath
}

function Get-BackendPort {
  $envValues = Get-BackendEnv -PreferExampleIfMissing
  $port = 4000
  if ($envValues.ContainsKey("PORT")) {
    [void][int]::TryParse($envValues["PORT"], [ref]$port)
  }

  return $port
}

function Get-LocalDevHost {
  return "localhost"
}

function Get-BackendBaseUrl {
  return "http://$(Get-LocalDevHost):$(Get-BackendPort)"
}

function Get-FrontendPort {
  return 5173
}

function Get-FrontendUrl {
  return "http://$(Get-LocalDevHost):$(Get-FrontendPort)"
}

function Get-MqttSettings {
  $envValues = Get-BackendEnv -PreferExampleIfMissing
  $brokerUrl = if ($envValues.ContainsKey("MQTT_BROKER_URL") -and $envValues["MQTT_BROKER_URL"]) {
    $envValues["MQTT_BROKER_URL"]
  } else {
    "mqtt://127.0.0.1:1883"
  }

  $brokerHost = Get-LocalDevHost
  $port = 1883
  $scheme = "mqtt"

  try {
    $uri = [Uri]$brokerUrl
    if ($uri.Host) {
      $brokerHost = $uri.Host
    }

    if ($uri.Port -gt 0) {
      $port = $uri.Port
    }

    if ($uri.Scheme) {
      $scheme = $uri.Scheme
    }
  } catch {
    if ($brokerUrl -match "^(?<scheme>[^:]+)://(?<host>[^:/]+)(:(?<port>\d+))?") {
      $scheme = $Matches["scheme"]
      $brokerHost = $Matches["host"]
      if ($Matches["port"]) {
        $port = [int]$Matches["port"]
      }
    }
  }

  $isLocal = @("127.0.0.1", "localhost", "::1").Contains($brokerHost.ToLowerInvariant())

  return [pscustomobject]@{
    BrokerUrl = $brokerUrl
    Host = $brokerHost
    Port = $port
    Scheme = $scheme
    IsLocal = $isLocal
  }
}

function Test-LocalPortFree {
  param([int]$Port)

  try {
    $activeListeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
    if (@($activeListeners | Where-Object { $_.Port -eq $Port }).Count -gt 0) {
      return $false
    }
  } catch {
    $listener = $null
    try {
      $listener = [System.Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
      $listener.Start()
      return $true
    } catch {
      return $false
    } finally {
      if ($listener) {
        $listener.Stop()
      }
    }
  }

  return $true
}

function Test-TcpEndpoint {
  param(
    [string]$HostName,
    [int]$Port,
    [int]$TimeoutMs = 1500
  )

  $testNetConnection = Get-Command "Test-NetConnection" -ErrorAction SilentlyContinue
  if ($testNetConnection) {
    try {
      if ([bool](Test-NetConnection `
            -ComputerName $HostName `
            -Port $Port `
            -InformationLevel Quiet `
            -WarningAction SilentlyContinue)) {
        return $true
      }
    } catch {
      # Se o cmdlet falhar, tento o fallback manual abaixo.
    }
  }

  $candidateHosts = New-Object System.Collections.Generic.List[string]
  if (-not [string]::IsNullOrWhiteSpace($HostName)) {
    $candidateHosts.Add($HostName)
  }

  try {
    foreach ($address in [System.Net.Dns]::GetHostAddresses($HostName)) {
      if ($address -and $address.IPAddressToString) {
        $candidateHosts.Add($address.IPAddressToString)
      }
    }
  } catch {
    # Se a resolucao falhar, ainda tento conectar usando o host original.
  }

  if ($HostName -and $HostName.Trim().ToLowerInvariant() -eq "localhost") {
    $candidateHosts.Add("::1")
    $candidateHosts.Add("127.0.0.1")
  }

  $seenHosts = @{}
  foreach ($candidateHost in $candidateHosts) {
    if ([string]::IsNullOrWhiteSpace($candidateHost)) {
      continue
    }

    $normalizedHost = $candidateHost.Trim().ToLowerInvariant()
    if ($seenHosts.ContainsKey($normalizedHost)) {
      continue
    }

    $seenHosts[$normalizedHost] = $true

    $client = New-Object System.Net.Sockets.TcpClient
    try {
      $asyncResult = $client.BeginConnect($candidateHost, $Port, $null, $null)
      if (-not $asyncResult.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
        continue
      }

      $client.EndConnect($asyncResult) | Out-Null
      return $true
    } catch {
      continue
    } finally {
      $client.Dispose()
    }
  }

  return $false
}

function Wait-HttpReady {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 30
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return $true
      }
    } catch {
      Start-Sleep -Milliseconds 800
      continue
    }

    Start-Sleep -Milliseconds 800
  }

  return $false
}

function Escape-SingleQuoted {
  param([string]$Value)

  return $Value.Replace("'", "''")
}

function Get-ProcessRecordPath {
  param([string]$Key)

  return Join-Path (Get-RuntimeDir) "$Key.json"
}

function Get-ProcessRecord {
  param([string]$Key)

  $recordPath = Get-ProcessRecordPath $Key
  if (-not (Test-Path $recordPath)) {
    return $null
  }

  return Get-Content $recordPath -Raw | ConvertFrom-Json
}

function Save-ProcessRecord {
  param(
    [string]$Key,
    [pscustomobject]$Record
  )

  Ensure-RuntimeDir
  $recordPath = Get-ProcessRecordPath $Key
  $Record | ConvertTo-Json -Depth 5 | Set-Content $recordPath
}

function Remove-ProcessRecord {
  param([string]$Key)

  $recordPath = Get-ProcessRecordPath $Key
  if (Test-Path $recordPath) {
    Remove-Item $recordPath -Force
  }
}

function Test-ProcessAlive {
  param([int]$ProcessId)

  return [bool](Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)
}

function Start-TrackedWindowProcess {
  param(
    [string]$Key,
    [string]$Title,
    [string]$WorkingDirectory,
    [string]$Command,
    [hashtable]$EnvironmentOverrides = @{}
  )

  $existingRecord = Get-ProcessRecord $Key
  if ($existingRecord -and (Test-ProcessAlive ([int]$existingRecord.ProcessId))) {
    return [pscustomobject]@{
      Started = $false
      Reused = $true
      ProcessId = [int]$existingRecord.ProcessId
      Title = $existingRecord.Title
    }
  }

  if ($existingRecord) {
    Remove-ProcessRecord $Key
  }

  $commandParts = @()
  foreach ($entry in $EnvironmentOverrides.GetEnumerator()) {
    $escapedValue = Escape-SingleQuoted ([string]$entry.Value)
    $commandParts += "`$env:$($entry.Key) = '$escapedValue'"
  }

  $commandParts += "Set-Location '$(Escape-SingleQuoted $WorkingDirectory)'"
  $commandParts += $Command

  $fullCommand = $commandParts -join "; "
  $process = Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $fullCommand) `
    -PassThru

  Save-ProcessRecord -Key $Key -Record ([pscustomobject]@{
      Key = $Key
      Title = $Title
      ProcessId = $process.Id
      WorkingDirectory = $WorkingDirectory
      Command = $Command
      StartedAt = (Get-Date).ToString("s")
    })

  return [pscustomobject]@{
    Started = $true
    Reused = $false
    ProcessId = $process.Id
    Title = $Title
  }
}

function Stop-TrackedProcess {
  param([string]$Key)

  $record = Get-ProcessRecord $Key
  if (-not $record) {
    return [pscustomobject]@{
      Found = $false
      Stopped = $false
      Title = $Key
    }
  }

  $processId = [int]$record.ProcessId
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if ($null -eq $process) {
    Remove-ProcessRecord $Key
    return [pscustomobject]@{
      Found = $true
      Stopped = $false
      Title = $record.Title
      ProcessId = $processId
    }
  }

  try {
    $process.CloseMainWindow() | Out-Null
    Start-Sleep -Milliseconds 800
  } catch {
    # Ignora e tenta finalizar abaixo.
  }

  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if ($process) {
    try {
      Stop-Process -Id $processId -ErrorAction Stop
      Start-Sleep -Milliseconds 500
    } catch {
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
  }

  Remove-ProcessRecord $Key
  return [pscustomobject]@{
    Found = $true
    Stopped = $true
    Title = $record.Title
    ProcessId = $processId
  }
}

function Get-DemoCredentials {
  return [pscustomobject]@{
    Email = "admin@queda.local"
    Password = "Admin@123"
  }
}

function Test-PlaceholderValue {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $true
  }

  $normalized = $Value.Trim().ToLowerInvariant()
  return @(
    "change-me",
    "your_wifi_ssid",
    "your_wifi_password",
    "your_mqtt_host",
    "your_mqtt_user",
    "your_mqtt_password"
  ).Contains($normalized)
}
