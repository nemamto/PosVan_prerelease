# PosVenInstaller.ps1
$ErrorActionPreference = 'Stop'

Write-Host "`n[INFO] Starting PosVen installation script..." -ForegroundColor Cyan

# === Paths and versions ===
$nodeVersion = "node-v20.16.0-x64.msi"
$nodeUrl = "https://nodejs.org/dist/v20.16.0/$nodeVersion"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$serverDir = Join-Path $scriptDir "service"
$clientDir = Join-Path $scriptDir "client"
$nodeInstallerPath = Join-Path $scriptDir $nodeVersion

# === Node.js ===
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[INFO] Node.js is not installed. Downloading..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstallerPath
    Start-Process msiexec.exe -ArgumentList "/i `"$nodeInstallerPath`" /qn /norestart" -Wait
    Remove-Item $nodeInstallerPath -Force
    Write-Host "[OK] Node.js has been installed." -ForegroundColor Green
} else {
    Write-Host "[OK] Node.js is already installed: $(node -v)" -ForegroundColor Green
}

# === npm ===
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm is not available - Node.js installation probably failed."
}

# === nodemon ===
if (-not (Get-Command nodemon -ErrorAction SilentlyContinue)) {
    Write-Host "[INFO] Installing nodemon..." -ForegroundColor Yellow
    npm install -g nodemon
    Write-Host "[OK] nodemon has been installed." -ForegroundColor Green
}

# === Install dependencies ===
if (Test-Path "$serverDir\package.json") {
    Write-Host "[INFO] Installing dependencies in 'service' folder..." -ForegroundColor Cyan
    Push-Location $serverDir
    npm install
    Pop-Location
} else {
    Write-Warning "WARNING: package.json not found in $serverDir"
}

# === Open client ===
Start-Process "http://localhost:666/cashier.html"

# === Start server in this window ===
Write-Host "`n[INFO] Starting server using nodemon (in this window)..." -ForegroundColor Green
cd $serverDir

try {
    nodemon server.js
} catch {
    Write-Host "`n[ERROR] Server crashed or exited with an error!" -ForegroundColor Red
}

Write-Host "`n[INFO] Script finished. Press Enter to exit..." -ForegroundColor Cyan
Read-Host