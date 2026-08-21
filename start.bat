@echo off
REM Startup script for Spectrum iMessage App

echo Starting Spectrum iMessage App...

if not exist .env (
    echo Error: .env file not found
    echo Copy .env.example to .env and fill in your Spectrum credentials
    pause
    exit /b 1
)

cd sidecar
call npm install
node sidecar.mjs
