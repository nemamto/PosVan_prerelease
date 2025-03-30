@echo off
setlocal

goto MAIN  REM Skip function definitions and jump to main code

REM ======================================================
REM Function to display an error message and exit the script
REM ======================================================
:ShowError
echo.
if "%~1"=="" (
    echo [ERROR] An unknown error occurred! No message provided.
) else (
    echo [ERROR] Error: %~1
)
echo [DEBUG] Exit code: %errorlevel%
pause
exit /b

REM ======================================================
REM Main script code
REM ======================================================
:MAIN
cls
echo Starting installation...

setlocal

REM --- Set variables for Node.js installer ---
set "NODE_VERSION=node-v20.16.0-x64.msi"
set "NODE_URL=https://nodejs.org/dist/v20.16.0/%NODE_VERSION%"
@echo off
setlocal EnableDelayedExpansion
pushd %~dp0

REM --- Download and install Node.js (this part is assumed working) ---
echo [DEBUG] Downloading Node.js installer...
powershell -Command "Start-BitsTransfer -Source %NODE_URL% -Destination %NODE_VERSION%"
if not exist "%NODE_VERSION%" (
    echo [DEBUG] The file %NODE_VERSION% was not found after download.
    call :ShowError "Failed to download Node.js installer."
)
echo Installing Node.js...
start "" /b msiexec /i "%NODE_VERSION%" /qn /l*v "install.log" /norestart

REM --- Wait until install.log is created ---
:WAIT_FOR_LOG
if not exist "install.log" (
    echo [DEBUG] Waiting for install.log to be created...
    timeout /t 2 >nul
    goto WAIT_FOR_LOG
)

echo [DEBUG] Tailing installation log (updates every 5 seconds)...
set "oldSize=0"
:TAIL_LOG
REM Get the current file size (third token in dir output)
for /f "tokens=3" %%I in ('dir /-C /A:-D "install.log" ^| find "install.log"') do set "newSize=%%I"

REM If the file size has changed, clear and print the log; otherwise, print a waiting message.
if not "!newSize!"=="!oldSize!" (
    cls
    type "install.log"
    set "oldSize=!newSize!"
) else (
    echo [DEBUG] No new log output..
	call goto INSTALL_DONE
)

timeout /t 5 >nul

REM Check if msiexec.exe is still running
tasklist /FI "IMAGENAME eq msiexec.exe" | find /I "msiexec.exe" >nul
if %errorlevel%==0 goto TAIL_LOG

echo [DEBUG] Installation process has finished.

:INSTALL_DONE
echo [DEBUG] Verifying npm version...

REM --- Verify npm version ---
echo [DEBUG] Verifying npm version...
call npm -v
if "%errorlevel%" neq "0" (
    echo [ERROR] npm -v command failed! Please check Node.js installation.
    call :ShowError "npm is not functioning correctly."
)
echo [DEBUG] npm -v exit code: %errorlevel%

REM --- Install nodemon globally ---
echo [DEBUG] Installing nodemon...
call npm install -g nodemon
if "%errorlevel%" neq "0" (
    echo [WARNING] nodemon installation failed. Possible causes:
    echo " - Insufficient permissions (try running CMD as admin)"
    echo " - Internet connectivity issues"
    echo " - Corrupted npm cache (try npm cache clean --force)"
    echo " - npm is not installed correctly"
    call :ShowError "nodemon installation failed."
)
echo [DEBUG] npm install nodemon exit code: %errorlevel%
timeout /t 5 >nul

REM --- Check if nodemon is available in PATH ---
echo [DEBUG] Checking nodemon availability...
where nodemon
if "%errorlevel%" neq "0" (
    echo [ERROR] nodemon is not in PATH. Try restarting CMD.
    call :ShowError "nodemon was not installed correctly."
)

REM --- Check and install project dependencies ---
if exist package.json (
    echo [DEBUG] Found package.json, installing project dependencies...
    call npm install
    if "%errorlevel%" neq "0" (
         call :ShowError "Project dependencies installation failed."
    )
) else (
    echo [DEBUG] No package.json found, skipping project dependencies installation.
)

REM --- Open cashier.html if it exists ---
if exist cashier.html (
    echo [DEBUG] Opening cashier.html...
    start "" cashier.html
) else (
    echo [DEBUG] cashier.html not found.
)

REM --- Launch the server using nodemon ---
:START_SERVER
echo Launching server with nodemon...
if not exist server.js (
    call :ShowError "server.js not found. Please ensure it exists."
)
nodemon server.js
if "%errorlevel%" neq "0" (
    call :ShowError "An error occurred while launching the server."
)

REM --- Prompt to restart the server or exit ---
:RESTART_PROMPT
echo.
echo The server has stopped or an error occurred.
choice /M "Do you want to restart the server?"
if errorlevel 2 goto END
if errorlevel 1 goto START_SERVER

:END
echo Exiting script.
pause
exit /b
