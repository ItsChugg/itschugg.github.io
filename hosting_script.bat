@echo off
setlocal enabledelayedexpansion
pushd Z:\

:: Kill existing server if PID file exists
if exist server.pid (
    for /f %%i in (server.pid) do (
        echo Attempting to kill previous Python server with PID %%i...
        taskkill /f /pid %%i >nul 2>&1
    )
    del server.pid
)

:: Start new server and save its PID
:: /min starts minimized, 2>&1 logs errors
start "" /min cmd /c "python -m http.server 8000 >nul 2>&1 & echo !PID! > server.pid"

:: Open browser
start http://localhost:8000/index.html

popd
endlocal


