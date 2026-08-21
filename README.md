# Spectrum iMessage App

A Node.js application for sending and receiving iMessages using the Spectrum SDK.

## Prerequisites

1. **Node.js** >= 18.17
2. **Spectrum Account** with project credentials (Project ID + Secret)

## Quick Start

### 1. Clone and setup

```bash
cd imessages
cp .env.example .env
```

### 2. Configure credentials

Edit `.env` with your Spectrum credentials:

```bash
SPECTRUM_PROJECT_ID=your-project-id
SPECTRUM_PROJECT_SECRET=your-project-secret
```

### 3. Install and run

**Windows:**
```bash
start.bat
```

**Unix/macOS:**
```bash
chmod +x start.sh
./start.sh
```

**Manual:**
```bash
cd sidecar
npm install
node sidecar.mjs
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/send` | Send a message |
| `POST` | `/reply` | Reply to a message |
| `POST` | `/create-chat` | Create a new chat |
| `POST` | `/send-attachment` | Send an attachment |
| `POST` | `/typing` | Set typing indicator |
| `GET` | `/events` | SSE stream of incoming messages |

## Usage Examples

### Send a text message

```bash
curl -X POST http://localhost:8765/send \
  -H "Content-Type: application/json" \
  -d '{"recipient": "+15551234567", "text": "Hello from Spectrum!"}'
```

### Create a group chat

```bash
curl -X POST http://localhost:8765/create-chat \
  -H "Content-Type: application/json" \
  -d '{"addresses": ["+15551111111", "+15552222222"], "message": "Welcome!"}'
```

### Reply to a message

```bash
curl -X POST http://localhost:8765/reply \
  -H "Content-Type: application/json" \
  -d '{"chatGuid": "any;-;+15551234567", "text": "This is a reply"}'
```

### Listen for incoming messages

```bash
curl -N http://localhost:8765/events
```

## File Structure

```
imessages/
├── sidecar/
│   ├── package.json          # Node.js dependencies
│   └── sidecar.mjs           # Spectrum iMessage app
├── .env.example              # Environment variables template
├── .env                      # Your environment variables (git ignored)
├── start.bat                 # Windows startup script
├── start.sh                  # Unix/macOS startup script
└── README.md                 # This file
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SPECTRUM_PROJECT_ID` | Spectrum project ID | Required |
| `SPECTRUM_PROJECT_SECRET` | Spectrum project secret | Required |
| `SIDECAR_PORT` | HTTP server port | `8765` |

## Free Plan Limits

- 5,000 messages per server per day
- 50 new conversations per line per day
- Shared phone number pool (no dedicated numbers)
- No group creation support

## Troubleshooting

### "Missing SPECTRUM_PROJECT_ID"

Set your Spectrum credentials in `.env`:
```bash
SPECTRUM_PROJECT_ID=your-project-id
SPECTRUM_PROJECT_SECRET=your-project-secret
```

### Port conflicts

Change port in `.env`:
```bash
SIDECAR_PORT=8766
```

## License

MIT
