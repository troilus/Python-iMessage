#!/bin/bash
# Startup script for Spectrum iMessage App

set -e

echo "Starting Spectrum iMessage App..."

if [ ! -f .env ]; then
    echo "Error: .env file not found"
    echo "Copy .env.example to .env and fill in your Spectrum credentials"
    exit 1
fi

cd sidecar
npm install
node sidecar.mjs
