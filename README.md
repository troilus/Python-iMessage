# Python iMessage Application

A Python application for sending and receiving iMessages using the Photon iMessage SDK via a Node.js sidecar.

## Architecture

```
┌─────────────────────┐     HTTP (localhost)     ┌─────────────────────┐
│                     │ ◄──────────────────────► │                     │
│   Python FastAPI    │                          │   Node.js Sidecar   │
│   (main.py)         │                          │   (sidecar.mjs)     │
│                     │                          │                     │
└─────────────────────┘                          └─────────────────────┘
                                                        │ gRPC
                                                        ▼
                                                 ┌─────────────────────┐
                                                 │  Photon Server      │
                                                 │  (your credentials) │
                                                 └─────────────────────┘
```

## Prerequisites

1. **Node.js** >= 18.17
2. **Python** >= 3.10
3. **Photon Account** with server credentials (address + token)

## Quick Start

### 1. Clone and setup

```bash
# Clone or download this project
cd imessages

# Copy environment template
cp .env.example .env
```

### 2. Configure credentials

Edit `.env` with your Photon credentials:

```bash
PHOTON_SERVER_ADDRESS=your-server-host:443
PHOTON_SERVER_TOKEN=your-bearer-token
```

### 3. Install dependencies

```bash
# Install Node.js dependencies
cd sidecar
npm install
cd ..

# Install Python dependencies
pip install -r requirements.txt
```

### 4. Start the application

**Windows:**
```bash
start.bat
```

**Unix/macOS:**
```bash
chmod +x start.sh
./start.sh
```

**Manual startup (two terminals):**

Terminal 1 - Start sidecar:
```bash
cd sidecar
node sidecar.mjs
```

Terminal 2 - Start Python app:
```bash
python main.py
```

## API Reference

### Python App (port 8000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check |
| `GET` | `/health` | Health check with sidecar status |
| `POST` | `/send` | Send a message |
| `POST` | `/reply` | Reply to a message |
| `POST` | `/create-chat` | Create a new chat |
| `POST` | `/send-attachment` | Send an attachment |
| `POST` | `/mark-read` | Mark a chat as read |
| `POST` | `/typing` | Set typing indicator |
| `GET` | `/messages` | List recent messages |
| `GET` | `/messages/chat/{chat_guid}` | List messages in a chat |
| `GET` | `/events` | SSE stream of incoming messages |

### Node.js Sidecar (port 8765)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/send` | Send a message |
| `POST` | `/create-chat` | Create a chat |
| `GET` | `/events` | SSE stream of incoming messages |

## Usage Examples

### Send a text message

```bash
curl -X POST http://localhost:8000/send \
  -H "Content-Type: application/json" \
  -d '{"recipient": "user@example.com", "text": "Hello from Python!"}'
```

### Create a group chat

```bash
curl -X POST http://localhost:8000/create-chat \
  -H "Content-Type: application/json" \
  -d '{"addresses": ["alice@example.com", "bob@example.com"], "message": "Welcome!"}'
```

### Reply to a message

```bash
curl -X POST http://localhost:8000/reply \
  -H "Content-Type: application/json" \
  -d '{"chatGuid": "any;-;user@example.com", "messageGuid": "msg-guid", "text": "This is a reply"}'
```

### Listen for incoming messages

```bash
curl -N http://localhost:8000/events
```

### Python example

```python
import httpx
import asyncio

async def send_message():
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:8000/send",
            json={
                "recipient": "user@example.com",
                "text": "Hello from Python!"
            },
        )
        result = response.json()
        print(f"Message sent: {result['messageGuid']}")

asyncio.run(send_message())
```

See `example.py` for more comprehensive examples.

## File Structure

```
imessages/
├── sidecar/
│   ├── package.json          # Node.js dependencies
│   └── sidecar.mjs           # Node.js HTTP server wrapping Photon SDK
├── main.py                   # Python FastAPI application
├── example.py                # Example usage of the Python API
├── requirements.txt          # Python dependencies
├── .env.example              # Environment variables template
├── .env                      # Your environment variables (git ignored)
├── start.bat                 # Windows startup script
├── start.sh                  # Unix/macOS startup script
└── README.md                 # This file
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PHOTON_SERVER_ADDRESS` | Photon server address (host:port) | Required |
| `PHOTON_SERVER_TOKEN` | Photon bearer token | Required |
| `SIDECAR_PORT` | Sidecar HTTP port | `8765` |
| `PYTHON_PORT` | Python app HTTP port | `8000` |

## Troubleshooting

### "Cannot connect to sidecar"

Make sure the sidecar is running:
```bash
cd sidecar
node sidecar.mjs
```

### "Missing PHOTON_SERVER_ADDRESS"

Set your Photon credentials in `.env`:
```bash
PHOTON_SERVER_ADDRESS=your-server-host:443
PHOTON_SERVER_TOKEN=your-bearer-token
```

### Port conflicts

Change ports in `.env`:
```bash
SIDECAR_PORT=8766
PYTHON_PORT=8001
```

## Development

### Run in development mode

```bash
# Sidecar with auto-restart
cd sidecar
npx nodemon sidecar.mjs

# Python with auto-reload
uvicorn main:app --reload --port 8000
```

### Run tests

```bash
python example.py
```

## License

MIT
