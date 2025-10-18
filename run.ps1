# PosVenInstaller.ps1
$ErrorActionPreference = 'Continue'

Write-Host "`n[INFO] Starting PosVen..." -ForegroundColor Cyan

# === Paths and versions ===
$nodeVersion = "node-v20.16.0-x64.msi"
$nodeUrl = "https://nodejs.org/dist/v20.16.0/$nodeVersion"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$serverDir = Join-Path $scriptDir "service"
$clientDir = Join-Path $scriptDir "client"
$nodeInstallerPath = Join-Path $scriptDir $nodeVersion

# === Check if something is running on port 666 and kill it ===
Write-Host "`n[INFO] Checking port 666..." -ForegroundColor Cyan

$portProcess = Get-NetTCPConnection -LocalPort 666 -ErrorAction SilentlyContinue | Select-Object -First 1

if ($portProcess) {
    $processId = $portProcess.OwningProcess
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    
    if ($process) {
        Write-Host "[WARNING] Found process on port 666: $($process.ProcessName) (PID: $processId)" -ForegroundColor Yellow
        Write-Host "[INFO] Killing process..." -ForegroundColor Yellow
        
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        
        Write-Host "[OK] Process killed successfully." -ForegroundColor Green
    }
} else {
    Write-Host "[OK] Port 666 is free." -ForegroundColor Green
}

# === Function to launch Chrome in kiosk mode ===
function Launch-ChromeKiosk {
    Write-Host "[INFO] Launching Chrome in kiosk mode..." -ForegroundColor Green
    
    # Najdeme Chrome
    $chromePaths = @(
        "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "${env:LocalAppData}\Google\Chrome\Application\chrome.exe"
    )
    
    $chromePath = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
    
    if ($chromePath) {
        $chromeArgs = @(
            "--kiosk",
            "http://localhost:666/cashier.html",
            "--touch-events=enabled",
            "--disable-pinch",
            "--overscroll-history-navigation=0"
        )
        Start-Process $chromePath -ArgumentList $chromeArgs
        Write-Host "[OK] Chrome launched in kiosk mode (touch optimized)." -ForegroundColor Green
        Write-Host "[TIP] Use Alt+F4 to close the kiosk window." -ForegroundColor Cyan
        return $true
    } else {
        Write-Warning "WARNING: Chrome not found. Opening in default browser..."
        Start-Process "http://localhost:666/cashier.html"
        return $false
    }
}

# === Install dependencies ===
Write-Host "`n[INFO] Checking and installing dependencies..." -ForegroundColor Cyan

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

# === Start server and Chrome in kiosk mode ===
Write-Host "`n[INFO] Starting server and Chrome..." -ForegroundColor Green

# Počkáme chvíli před spuštěním prohlížeče, aby server stihl naběhnout
$jobScript = {
        param($serverDir)
        Start-Sleep -Seconds 3
        
        # Najdeme Chrome
        $chromePaths = @(
            "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
            "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
            "${env:LocalAppData}\Google\Chrome\Application\chrome.exe"
        )
        
        $chromePath = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
        
        if ($chromePath) {
            $chromeArgs = @(
                "--kiosk",
                "http://localhost:666/cashier.html",
                "--touch-events=enabled",
                "--disable-pinch",
                "--overscroll-history-navigation=0"
            )
            Start-Process $chromePath -ArgumentList $chromeArgs
        } else {
            Start-Process "http://localhost:666/cashier.html"
        }
    }
    
    # Spustíme prohlížeč na pozadí (s 3s zpožděním)
Start-Job -ScriptBlock $jobScript -ArgumentList $serverDir | Out-Null

Write-Host "[INFO] Chrome will launch in 3 seconds..." -ForegroundColor Cyan
Write-Host "[INFO] Starting server using nodemon..." -ForegroundColor Green
cd $serverDir

try {
    nodemon server.js
} catch {
    Write-Host "`n[ERROR] Server crashed or exited with an error!" -ForegroundColor Red
}

Write-Host "`n[INFO] Script finished. Press Enter to exit..." -ForegroundColor Cyan
Read-Host