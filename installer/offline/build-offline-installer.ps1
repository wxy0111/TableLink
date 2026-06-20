param(
  [string]$ReleaseName = "TableLink-store-trial-2026-06-20",
  [string]$InstallerName = "TableLink-offline-store-trial-2026-06-20"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..\..")
$outDir = Join-Path $repoRoot "installer\out"
$workDir = Join-Path $env:TEMP "tablelink-offline-build"
$payloadDir = Join-Path $workDir "payload"
$releaseDir = Join-Path $repoRoot $ReleaseName
$nodeDir = Split-Path -Parent (Get-Command node.exe).Source
$npmCache = Join-Path $repoRoot ".npm-cache"
$payloadZip = Join-Path $workDir "offline-payload.zip"
$archive7z = Join-Path $workDir "offline-installer.7z"
$sfxConfig = Join-Path $workDir "sfx-config.txt"
$exePath = Join-Path $outDir "$InstallerName.exe"

if (-not (Test-Path $releaseDir)) {
  throw "Missing release package directory: $releaseDir"
}
if (-not (Test-Path $npmCache)) {
  throw "Missing npm offline cache: $npmCache"
}
if (-not (Get-Command 7z.exe -ErrorAction SilentlyContinue)) {
  throw "7z.exe was not found. Install 7-Zip or add it to PATH."
}

if (Test-Path $workDir) {
  Remove-Item $workDir -Recurse -Force
}
New-Item -ItemType Directory -Path $payloadDir | Out-Null
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

Write-Host "Copying TableLink release package..."
New-Item -ItemType Directory -Path (Join-Path $payloadDir "app") | Out-Null
robocopy $releaseDir (Join-Path $payloadDir "app\$ReleaseName") /E /XD node_modules .next dist /XF .env *.log | Out-Null
if ($LASTEXITCODE -gt 7) { throw "robocopy release package failed with $LASTEXITCODE" }

Write-Host "Copying portable Node.js from $nodeDir..."
robocopy $nodeDir (Join-Path $payloadDir "nodejs") /E /XD cache /XF install.json | Out-Null
if ($LASTEXITCODE -gt 7) { throw "robocopy node failed with $LASTEXITCODE" }

Write-Host "Copying npm offline cache..."
robocopy $npmCache (Join-Path $payloadDir "npm-cache") /E | Out-Null
if ($LASTEXITCODE -gt 7) { throw "robocopy npm cache failed with $LASTEXITCODE" }

$dockerInstaller = $env:DOCKER_DESKTOP_INSTALLER
if (-not $dockerInstaller) {
  $defaultDockerInstaller = Join-Path $scriptDir "third-party\Docker Desktop Installer.exe"
  if (Test-Path $defaultDockerInstaller) {
    $dockerInstaller = $defaultDockerInstaller
  }
}
if ($dockerInstaller -and (Test-Path $dockerInstaller)) {
  Write-Host "Including Docker Desktop installer..."
  New-Item -ItemType Directory -Path (Join-Path $payloadDir "third-party") -Force | Out-Null
  Copy-Item -LiteralPath $dockerInstaller -Destination (Join-Path $payloadDir "third-party\Docker Desktop Installer.exe") -Force
} else {
  Write-Host "Docker Desktop installer not included. The target PC must install Docker Desktop separately."
}

if (Get-Command docker.exe -ErrorAction SilentlyContinue) {
  docker image inspect postgres:17-alpine *> $null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Saving postgres:17-alpine Docker image..."
    New-Item -ItemType Directory -Path (Join-Path $payloadDir "docker-images") -Force | Out-Null
    docker save postgres:17-alpine -o (Join-Path $payloadDir "docker-images\postgres-17-alpine.tar")
  } else {
    Write-Host "postgres:17-alpine is not available locally; Docker will need internet or a preloaded image."
  }
}

Copy-Item (Join-Path $scriptDir "start-tablelink.cmd") (Join-Path $payloadDir "start-tablelink.cmd") -Force
Copy-Item (Join-Path $scriptDir "check-tablelink.cmd") (Join-Path $payloadDir "check-tablelink.cmd") -Force

Write-Host "Compressing offline payload..."
if (Test-Path $payloadZip) { Remove-Item $payloadZip -Force }
Compress-Archive -Path (Join-Path $payloadDir "*") -DestinationPath $payloadZip -CompressionLevel Optimal

Copy-Item (Join-Path $scriptDir "install-offline.cmd") (Join-Path $workDir "install-offline.cmd") -Force

Write-Host "Building 7-Zip self-extracting installer..."
$sevenZip = (Get-Command 7z.exe).Source
$sfxCandidates = @(
  (Join-Path $env:USERPROFILE "scoop\apps\7zip\current\7z.sfx"),
  (Join-Path (Split-Path -Parent $sevenZip) "7z.sfx"),
  "C:\Program Files\7-Zip\7z.sfx",
  "C:\Program Files (x86)\7-Zip\7z.sfx"
)
$sfxModule = $sfxCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $sfxModule) {
  throw "7z.sfx was not found. Install the full 7-Zip package with SFX support."
}

@"
;!@Install@!UTF-8!
Title="TableLink Offline Store Trial Installer"
RunProgram="install-offline.cmd"
;!@InstallEnd@!
"@ | Set-Content -LiteralPath $sfxConfig -Encoding UTF8

if (Test-Path $archive7z) { Remove-Item $archive7z -Force }
& $sevenZip a -t7z -mx=0 $archive7z $payloadZip (Join-Path $workDir "install-offline.cmd")
if ($LASTEXITCODE -ne 0) {
  throw "7z archive creation failed with exit code $LASTEXITCODE"
}

if (Test-Path $exePath) { Remove-Item $exePath -Force }
$output = [System.IO.File]::Open($exePath, [System.IO.FileMode]::CreateNew)
try {
  foreach ($part in @($sfxModule, $sfxConfig, $archive7z)) {
    $input = [System.IO.File]::OpenRead($part)
    try {
      $input.CopyTo($output)
    } finally {
      $input.Dispose()
    }
  }
} finally {
  $output.Dispose()
}

if (-not (Test-Path $exePath)) {
  throw "Installer was not created: $exePath"
}

$sizeMb = [Math]::Round((Get-Item $exePath).Length / 1MB, 2)
Write-Host "Created $exePath ($sizeMb MB)"
