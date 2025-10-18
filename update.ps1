# ====================================
# PosVan - Update Script
# ====================================
# Stahne aktualni verzi z Git remote a aktualizuje lokalni kopii

# Nastaveni kodovani pro spravne zobrazeni cestiny
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  PosVan - Aktualizace systemu" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Kontrola, zda jsme v Git repositari
if (-not (Test-Path ".git")) {
    Write-Host "[ERROR] Toto neni Git repositar!" -ForegroundColor Red
    Write-Host "Spustte skript z korenove slozky PosVan_prerelease" -ForegroundColor Yellow
    Read-Host "Stisknete Enter pro ukonceni"
    exit 1
}

# Zjistit aktualni branch
Write-Host "[INFO] Zjistuji aktualni branch..." -ForegroundColor Yellow
$currentBranch = git rev-parse --abbrev-ref HEAD
Write-Host "[OK] Aktualni branch: $currentBranch" -ForegroundColor Green
Write-Host ""

# Kontrola lokalnich zmen
Write-Host "[INFO] Kontroluji lokalni zmeny..." -ForegroundColor Yellow
$gitStatus = git status --porcelain

if ($gitStatus) {
    Write-Host "[VAROVANI] Mate neulozene zmeny:" -ForegroundColor Yellow
    Write-Host $gitStatus
    Write-Host ""
    $response = Read-Host "Chcete pokracovat? Zmeny nebudou ztraceny (Y/N)"
    if ($response -ne "Y" -and $response -ne "y") {
        Write-Host "[ZRUSENO] Aktualizace zrusena uzivatelem" -ForegroundColor Red
        Read-Host "Stisknete Enter pro ukonceni"
        exit 0
    }
}

# Fetch z remote
Write-Host ""
Write-Host "[INFO] Stahuji aktualni verzi z remote..." -ForegroundColor Yellow
git fetch origin

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Chyba pri stahovani z remote!" -ForegroundColor Red
    Read-Host "Stisknete Enter pro ukonceni"
    exit 1
}

Write-Host "[OK] Fetch dokoncen" -ForegroundColor Green
Write-Host ""

# Zjistit rozdily
Write-Host "[INFO] Zjistuji rozdily mezi lokalni a remote verzi..." -ForegroundColor Yellow
$localCommit = git rev-parse HEAD
$remoteCommit = git rev-parse "origin/$currentBranch"

if ($localCommit -eq $remoteCommit) {
    Write-Host "[OK] Vase verze je aktualni!" -ForegroundColor Green
    Write-Host ""
    Read-Host "Stisknete Enter pro ukonceni"
    exit 0
}

# Zobrazit pocet commitu
$behindCount = git rev-list HEAD..origin/$currentBranch --count
Write-Host "[INFO] Vase verze je $behindCount commit(u) pozadu" -ForegroundColor Yellow
Write-Host ""

# Zobrazit zmeny
Write-Host "Nove zmeny v remote:" -ForegroundColor Cyan
git log HEAD..origin/$currentBranch --oneline --pretty=format:"%C(yellow)%h%C(reset) - %s %C(green)(%cr)%C(reset)"
Write-Host ""
Write-Host ""

# Nabidnout pull
$response = Read-Host "Chcete stahnout a aplikovat tyto zmeny? (Y/N)"
if ($response -eq "Y" -or $response -eq "y") {
    Write-Host ""
    Write-Host "[INFO] Aplikuji zmeny..." -ForegroundColor Yellow
    
    git pull origin $currentBranch
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "[OK] Aktualizace dokoncena uspesne!" -ForegroundColor Green
        Write-Host ""
        
        # Kontrola, zda je potreba restartovat server
        if (Test-Path "service/package.json") {
            Write-Host "[INFO] Kontroluji Node.js zavislosti..." -ForegroundColor Yellow
            Set-Location service
            npm install
            Set-Location ..
            Write-Host "[OK] Zavislosti aktualizovany" -ForegroundColor Green
        }
    } else {
        Write-Host ""
        Write-Host "[ERROR] Chyba pri aplikaci zmen!" -ForegroundColor Red
        Write-Host "Mozna mate konflikty. Vyresite je rucne pomoci:" -ForegroundColor Yellow
        Write-Host "  git status" -ForegroundColor Cyan
        Write-Host "  git merge --abort  (pro zruseni)" -ForegroundColor Cyan
    }
} else {
    Write-Host ""
    Write-Host "[INFO] Zmeny nebyly aplikovany" -ForegroundColor Yellow
    Write-Host "Muzete je aplikovat pozdeji pomoci:" -ForegroundColor Cyan
    Write-Host "  git pull origin $currentBranch" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Read-Host "Stisknete Enter pro ukonceni"
