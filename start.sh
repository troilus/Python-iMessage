#!/bin/bash
# Startup script for iMessage App (Unix/macOS)

set -e

echo "Starting iMessage App..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Error: .env file not found"
    echo "Copy .env.example to .env and fill in your Photon credentials"
    exit 1
fi

# Load environment variables from .env
export $(grep -v '^#' .env | xargs)

# Start sidecar in background
echo "Starting Node.js sidecar..."
cd sidecar
npm install
node sidecar.mjs &
SIDECAR_PID=$!
cd ..

# Wait for sidecar to start
sleep 3

# Start Python app
echo "Starting Python app..."
python main.py

# Cleanup on exit
kill $SIDECAR_PID 2>/dev/null || true
