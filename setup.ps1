Write-Host "`n[INFO] Kontrola prostředí..." -ForegroundColor Cyan

function Test-Command {
    param ([string]$Command)
    return $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

# 1. Kontrola winget
if (-not (Test-Command "winget")) {
    Write-Host "[CHYBA] winget není k dispozici. Musíš jej ručně nainstalovat z Microsoft Store (App Installer)." -ForegroundColor Red
    exit 1
}

# 2. Instalace Node.js pokud není
if (-not (Test-Command "node")) {
    Write-Host "[INFO] Node.js není nainstalován. Instalace přes winget..." -ForegroundColor Yellow
    winget install -e --id OpenJS.NodeJS.LTS -h
    if (-not (Test-Command "node")) {
        Write-Host "[CHYBA] Node.js se nepodařilo nainstalovat." -ForegroundColor Red
        exit 1
    }
} else {
    $nodeVersion = node -v
    Write-Host "[OK] Node.js je nainstalován. Verze: $nodeVersion" -ForegroundColor Green
}

# 3. Kontrola npm
if (-not (Test-Command "npm")) {
    Write-Host "[CHYBA] npm není dostupný. Instalace Node.js mohla selhat." -ForegroundColor Red
    exit 1
}

# 4. Instalace nodemon globálně, pokud není
if (-not (Test-Command "nodemon")) {
    Write-Host "[INFO] Nodemon není nainstalován. Instalace globálně..." -ForegroundColor Yellow
    npm install -g nodemon
    if (-not (Test-Command "nodemon")) {
        Write-Host "[CHYBA] Nodemon se nepodařilo nainstalovat." -ForegroundColor Red
        exit 1
    }
}

# 5. Instalace závislostí z package.json
if (-not (Test-Path "package.json")) {
    Write-Host "[CHYBA] Soubor package.json nenalezen. Zkontroluj pracovní složku." -ForegroundColor Red
    exit 1
}
Write-Host "[INFO] Instalace závislostí z package.json..." -ForegroundColor Cyan
npm install | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[CHYBA] Instalace závislostí selhala." -ForegroundColor Red
    exit 1
}

# 6. Spuštění serveru přes nodemon
if (-not (Test-Path "server.js")) {
    Write-Host "[CHYBA] Soubor server.js nebyl nalezen." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Spouštím server pomocí nodemon..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "nodemon server.js"

# 7. Otevření cashier.html
$cashierPath = Join-Path (Get-Location) "cashier.html"
if (Test-Path $cashierPath) {
    Start-Process $cashierPath
    Write-Host "[OK] Soubor cashier.html otevřen v prohlížeči." -ForegroundColor Cyan
} else {
    Write-Host "[VAROVÁNÍ] Soubor cashier.html nebyl nalezen." -ForegroundColor Yellow
}

Write-Host "`n[HOTOVO] Projekt je připraven a spuštěn." -ForegroundColor Green
