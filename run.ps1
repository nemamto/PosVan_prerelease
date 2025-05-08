# PosVenInstaller.ps1
$ErrorActionPreference = 'Stop'

Write-Host "`n[INFO] Spou�t�m instala?n� skript PosVen..." -ForegroundColor Cyan

# === Cesty a verze ===
$nodeVersion = "node-v20.16.0-x64.msi"
$nodeUrl = "https://nodejs.org/dist/v20.16.0/$nodeVersion"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$serverDir = Join-Path $scriptDir "service"
$clientDir = Join-Path $scriptDir "client"
$nodeInstallerPath = Join-Path $scriptDir $nodeVersion

# === Node.js ===
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[INFO] Node.js nen� nainstalovan�. Stahuji..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstallerPath
    Start-Process msiexec.exe -ArgumentList "/i `"$nodeInstallerPath`" /qn /norestart" -Wait
    Remove-Item $nodeInstallerPath -Force
    Write-Host "[OK] Node.js byl nainstalov�n." -ForegroundColor Green
} else {
    Write-Host "[OK] Node.js je ji� nainstalovan�: $(node -v)" -ForegroundColor Green
}

# === npm ===
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "? npm nen� dostupn� � instalace Node.js pravd?podobn? selhala."
}

# === nodemon ===
if (-not (Get-Command nodemon -ErrorAction SilentlyContinue)) {
    Write-Host "[INFO] Instalace nodemon..." -ForegroundColor Yellow
    npm install -g nodemon
    Write-Host "[OK] nodemon byl nainstalov�n." -ForegroundColor Green
}

# === Instalace z�vislost� ===
if (Test-Path "$serverDir\package.json") {
    Write-Host "[INFO] Instalace z�vislost� v slo�ce 'service'..." -ForegroundColor Cyan
    Push-Location $serverDir
    npm install
    Pop-Location
} else {
    Write-Warning "??  Nenalezen package.json v $serverDir"
}

# === Otev?en� klienta ===
Start-Process "http://localhost:666/cashier.html"

# === Spu�t?n� serveru v tomto okn? ===
Write-Host "`n[INFO] Spou�t�m server pomoc� nodemon (v tomto okn?)..." -ForegroundColor Green
cd $serverDir

try {
    nodemon server.js
} catch {
    Write-Host "`n[ERROR] Server spadl nebo se ukon?il s chybou!" -ForegroundColor Red
}

Write-Host "`n[INFO] Skript byl dokon?en. Stiskni Enter pro ukon?en�..." -ForegroundColor Cyan
Read-Host