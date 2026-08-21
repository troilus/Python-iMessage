@echo off
REM Startup script for iMessage App (Windows)

echo Starting iMessage App...

REM Check if .env file exists
if not exist .env (
    echo Error: .env file not found
    echo Copy .env.example to .env and fill in your Photon credentials
    pause
    exit /b 1
)

REM Load environment variables from .env
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
    set "%%a=%%b"
)

REM Start sidecar in background
echo Starting Node.js sidecar...
cd sidecar
call npm install
start /b node sidecar.mjs
cd ..

REM Wait for sidecar to start
timeout /t 3 /nobreak > nul

REM Start Python app
echo Starting Python app...
python main.py
