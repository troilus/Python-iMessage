"""
Python iMessage Application
Communicates with Photon iMessage SDK via Node.js sidecar
"""

import os
import json
import asyncio
import logging
from typing import Optional
from datetime import datetime

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
SIDECAR_URL = os.getenv("SIDECAR_URL", "http://localhost:8765")

# FastAPI app
app = FastAPI(
    title="iMessage App",
    description="Python application for sending and receiving iMessages via Photon",
    version="1.0.0",
)

# In-memory message store (use SQLite for persistence in production)
message_store: list[dict] = []


# Pydantic models
class SendMessageRequest(BaseModel):
    recipient: Optional[str] = None
    chatGuid: Optional[str] = None
    text: str


class ReplyMessageRequest(BaseModel):
    chatGuid: str
    messageGuid: str
    text: str


class CreateChatRequest(BaseModel):
    addresses: list[str]
    message: Optional[str] = None


class SendAttachmentRequest(BaseModel):
    recipient: Optional[str] = None
    chatGuid: Optional[str] = None
    fileName: str
    fileData: str  # Base64 encoded


class MarkReadRequest(BaseModel):
    chatGuid: str


class TypingRequest(BaseModel):
    chatGuid: str
    isTyping: bool = True


# Helper function to call sidecar
async def call_sidecar(method: str, path: str, data: dict = None) -> dict:
    """Call the Node.js sidecar API"""
    async with httpx.AsyncClient() as client:
        url = f"{SIDECAR_URL}{path}"
        try:
            if method == "GET":
                response = await client.get(url, params=data)
            elif method == "POST":
                response = await client.post(url, json=data)
            else:
                raise ValueError(f"Unsupported method: {method}")

            response.raise_for_status()
            return response.json()
        except httpx.ConnectError:
            raise HTTPException(
                status_code=503,
                detail="Cannot connect to sidecar. Make sure it's running.",
            )
        except httpx.HTTPStatusError as e:
            raise HTTPException(
                status_code=e.response.status_code,
                detail=e.response.json().get("error", "Sidecar error"),
            )


# Routes
@app.get("/")
async def root():
    """Health check"""
    return {"status": "ok", "service": "imessage-app", "timestamp": datetime.now().isoformat()}


@app.get("/health")
async def health():
    """Health check including sidecar connection"""
    try:
        sidecar_health = await call_sidecar("GET", "/health")
        return {"status": "ok", "sidecar": sidecar_health}
    except HTTPException:
        return {"status": "degraded", "sidecar": "disconnected"}


@app.post("/send")
async def send_message(request: SendMessageRequest):
    """Send an iMessage to a recipient"""
    data = {"text": request.text}

    if request.chatGuid:
        data["chatGuid"] = request.chatGuid
    elif request.recipient:
        data["recipient"] = request.recipient
    else:
        raise HTTPException(status_code=400, detail="Either recipient or chatGuid is required")

    result = await call_sidecar("POST", "/send", data)

    # Store sent message
    message_store.append({
        "guid": result.get("messageGuid"),
        "chatGuid": result.get("chatGuid"),
        "text": request.text,
        "direction": "outbound",
        "timestamp": datetime.now().isoformat(),
    })

    return result


@app.post("/reply")
async def reply_message(request: ReplyMessageRequest):
    """Reply to a specific message"""
    result = await call_sidecar("POST", "/reply", {
        "chatGuid": request.chatGuid,
        "messageGuid": request.messageGuid,
        "text": request.text,
    })

    # Store sent message
    message_store.append({
        "guid": result.get("messageGuid"),
        "chatGuid": request.chatGuid,
        "text": request.text,
        "direction": "outbound",
        "replyTo": request.messageGuid,
        "timestamp": datetime.now().isoformat(),
    })

    return result


@app.post("/create-chat")
async def create_chat(request: CreateChatRequest):
    """Create a new chat with one or more recipients"""
    data = {"addresses": request.addresses}
    if request.message:
        data["message"] = request.message

    return await call_sidecar("POST", "/create-chat", data)


@app.post("/send-attachment")
async def send_attachment(request: SendAttachmentRequest):
    """Send an attachment (file/image) via iMessage"""
    data = {
        "fileName": request.fileName,
        "fileData": request.fileData,
    }

    if request.chatGuid:
        data["chatGuid"] = request.chatGuid
    elif request.recipient:
        data["recipient"] = request.recipient
    else:
        raise HTTPException(status_code=400, detail="Either recipient or chatGuid is required")

    return await call_sidecar("POST", "/send-attachment", data)


@app.post("/mark-read")
async def mark_read(request: MarkReadRequest):
    """Mark a chat as read"""
    return await call_sidecar("POST", "/mark-read", {"chatGuid": request.chatGuid})


@app.post("/typing")
async def set_typing(request: TypingRequest):
    """Set typing indicator for a chat"""
    return await call_sidecar("POST", "/typing", {
        "chatGuid": request.chatGuid,
        "isTyping": request.isTyping,
    })


@app.get("/messages")
async def list_messages(pageSize: int = 25):
    """List recent messages across all chats"""
    return await call_sidecar("GET", "/messages", {"pageSize": pageSize})


@app.get("/messages/chat/{chat_guid}")
async def list_chat_messages(chat_guid: str, pageSize: int = 25):
    """List messages in a specific chat"""
    return await call_sidecar("GET", "/messages/chat", {
        "chatGuid": chat_guid,
        "pageSize": pageSize,
    })


@app.get("/messages/store")
async def get_stored_messages():
    """Get messages stored in memory"""
    return {"messages": message_store}


@app.post("/webhook")
async def webhook_receiver(request: Request):
    """Receive incoming messages from sidecar (called by webhook or SSE listener)"""
    body = await request.json()

    if body.get("type") == "message.received":
        message = body.get("message", {})
        chat_guid = body.get("chatGuid")

        # Store received message
        stored_message = {
            "guid": message.get("guid"),
            "chatGuid": chat_guid,
            "text": message.get("content", {}).get("text"),
            "direction": "inbound",
            "timestamp": body.get("timestamp"),
            "sender": message.get("sender"),
        }
        message_store.append(stored_message)

        logger.info(f"Received message in chat {chat_guid}: {message.get('content', {}).get('text')}")

        # Auto-reply example (uncomment to enable)
        # await call_sidecar("POST", "/send", {
        #     "chatGuid": chat_guid,
        #     "text": f"Echo: {message.get('content', {}).get('text')}",
        # })

    return {"status": "ok"}


@app.get("/events")
async def event_stream():
    """SSE endpoint that proxies events from the sidecar"""
    async def event_generator():
        async with httpx.AsyncClient() as client:
            async with client.stream("GET", f"{SIDECAR_URL}/events") as response:
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        yield f"{line}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


# Startup event
@app.on_event("startup")
async def startup_event():
    """Check sidecar connection on startup"""
    try:
        await call_sidecar("GET", "/health")
        logger.info("Connected to sidecar successfully")
    except HTTPException:
        logger.warning("Cannot connect to sidecar on startup. Make sure sidecar is running.")


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PYTHON_PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
