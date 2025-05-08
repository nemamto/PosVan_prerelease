# PosVenInstaller.ps1
$ErrorActionPreference = 'Stop'

Write-Host "[INFO] Spouštím instalační skript PosVen..." -ForegroundColor Cyan

# === Nastavení proměnných ===
$nodeVersion = "node-v20.16.0-x64.msi"
$nodeUrl = "https://nodejs.org/dist/v20.16.0/$nodeVersion"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$serverDir = Join-Path $scriptDir "service"
$clientDir = Join-Path $scriptDir "client"
$nodeInstallerPath = Join-Path $scriptDir $nodeVersion

# === Kontrola Node.js ===
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[INFO] Node.js není nainstalovaný. Stahuji..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstallerPath
    Start-Process msiexec.exe -ArgumentList "/i `"$nodeInstallerPath`" /qn /norestart" -Wait
    Remove-Item $nodeInstallerPath -Force
}

# === Kontrola npm ===
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm není dostupné. Instalace Node.js pravděpodobně selhala."
}

# === Kontrola nodemon ===
if (-not (Get-Command nodemon -ErrorAction SilentlyContinue)) {
    Write-Host "[INFO] Instalace nodemon..." -ForegroundColor Yellow
    npm install -g nodemon
}

# === Instalace závislostí ===
if (Test-Path "$serverDir\package.json") {
    Write-Host "[INFO] Instalace závislostí v service/..." -ForegroundColor Cyan
    Push-Location $serverDir
    npm install
    Pop-Location
} else {
    Write-Warning "package.json nenalezen v $serverDir"
}

# === Otevření klienta ===
$cashierPage = Join-Path $clientDir "cashier.html"
if (Test-Path $cashierPage) {
    Start-Process $cashierPage
} else {
    Write-Warning "cashier.html nenalezen v $clientDir"
}

# === Spuštění serveru ===
$serverScript = Join-Path $serverDir "server.js"
if (Test-Path $serverScript) {
    Write-Host "[INFO] Spouštím server pomocí nodemon..." -ForegroundColor Green
    Start-Process "cmd.exe" -ArgumentList "/k cd /d `"$serverDir`" && nodemon server.js"
} else {
    throw "server.js nenalezen ve složce service/"
}

Write-Host "[INFO] Instalace dokončena." -ForegroundColor Green
