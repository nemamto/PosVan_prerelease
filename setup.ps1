Write-Host "Kontrola prostredi pro spusteni projektu..." -ForegroundColor Cyan

function Test-Command {
    param ([string]$Command)
    return $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

# 1. Node.js
if (Test-Command "node") {
    $nodeVersion = node -v
    Write-Host "Node.js je nainstalovan. Verze: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "Node.js neni nainstalovan. Oteviram stranku ke stazeni..." -ForegroundColor Yellow
    Start-Process "https://nodejs.org/" -UseShellExecute $true
    Write-Host "Po instalaci spust znovu tento skript." -ForegroundColor Red
    pause
    exit 1
}

# 2. npm
if (Test-Command "npm") {
    $npmVersion = npm -v
    Write-Host "npm je nainstalovan. Verze: $npmVersion" -ForegroundColor Green
} else {
    Write-Host "npm neni dostupny. Zkontroluj instalaci Node.js." -ForegroundColor Red
    pause
    exit 1
}

# 3. package.json
Write-Host "Kontrola souboru package.json..." -ForegroundColor Cyan
if (Test-Path "package.json") {
    Write-Host "Soubor package.json nalezen. Instalace zavislosti..." -ForegroundColor Green
    try {
        npm install | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Zavislosti byly uspesne nainstalovany." -ForegroundColor Green
        } else {
            throw "Chyba pri spusteni npm install."
        }
    } catch {
        Write-Host "Chyba: $_" -ForegroundColor Red
        pause
        exit 1
    }
} else {
    Write-Host "Soubor package.json nebyl nalezen. Zkontroluj, zda jsi ve spravnem adresari." -ForegroundColor Red
    pause
    exit 1
}

# 4. server.js
Write-Host "Kontrola souboru server.js..." -ForegroundColor Cyan
if (Test-Path "server.js") {
    Write-Host "Soubor server.js nalezen. Spoustim server pres nodemon..." -ForegroundColor Green

    if (-not (Test-Command "nodemon")) {
        Write-Host "Nodemon neni nainstalovan. Instalace globalne..." -ForegroundColor Yellow
        npm install -g nodemon
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Nodemon se nepodarilo nainstalovat." -ForegroundColor Red
            pause
            exit 1
        }
    }

    Start-Process "cmd.exe" -ArgumentList "/k nodemon server.js" -NoNewWindow
    Write-Host "Server byl spusten. Pokladni rozhrani se otevre..." -ForegroundColor Green

    # 5. Otevreni cashier.html
    $cashierPath = Join-Path (Get-Location) "cashier.html"
    if (Test-Path $cashierPath) {
        Start-Process $cashierPath
        Write-Host "Soubor cashier.html otevren v prohlizeci." -ForegroundColor Cyan
    } else {
        Write-Host "Soubor cashier.html nebyl nalezen ve slozce projektu." -ForegroundColor Red
    }
} else {
    Write-Host "Soubor server.js nebyl nalezen." -ForegroundColor Red
    pause
    exit 1
}

Write-Host "Projekt je pripraven a spusten." -ForegroundColor Cyan
pause
