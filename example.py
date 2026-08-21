"""
Example usage of the iMessage App
Demonstrates how to send and receive messages using the Python API
"""

import httpx
import json
import asyncio
import os

# Configuration
PYTHON_URL = os.getenv("PYTHON_URL", "http://localhost:8000")


async def send_text_message(recipient: str, text: str):
    """Send a text message to a recipient"""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{PYTHON_URL}/send",
            json={"recipient": recipient, "text": text},
        )
        response.raise_for_status()
        result = response.json()
        print(f"Message sent! GUID: {result['messageGuid']}")
        return result


async def send_reply(chat_guid: str, message_guid: str, text: str):
    """Reply to a specific message"""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{PYTHON_URL}/reply",
            json={
                "chatGuid": chat_guid,
                "messageGuid": message_guid,
                "text": text,
            },
        )
        response.raise_for_status()
        result = response.json()
        print(f"Reply sent! GUID: {result['messageGuid']}")
        return result


async def create_chat(recipients: list[str], initial_message: str = None):
    """Create a new chat with one or more recipients"""
    async with httpx.AsyncClient() as client:
        data = {"addresses": recipients}
        if initial_message:
            data["message"] = initial_message

        response = await client.post(f"{PYTHON_URL}/create-chat", json=data)
        response.raise_for_status()
        result = response.json()
        print(f"Chat created! GUID: {result['chat']['guid']}")
        return result


async def list_recent_messages(page_size: int = 10):
    """List recent messages"""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{PYTHON_URL}/messages",
            params={"pageSize": page_size},
        )
        response.raise_for_status()
        result = response.json()

        print(f"\nRecent messages ({len(result['messages'])} found):")
        for msg in result["messages"]:
            direction = "→" if msg.get("isFromMe") else "←"
            text = msg.get("content", {}).get("text", "[no text]")
            print(f"  {direction} {text}")

        return result


async def listen_for_messages():
    """Listen for incoming messages via SSE"""
    print("\nListening for incoming messages... (Press Ctrl+C to stop)")

    async with httpx.AsyncClient() as client:
        async with client.stream("GET", f"{PYTHON_URL}/events") as response:
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = json.loads(line[6:])
                    if data.get("type") == "message.received":
                        msg = data.get("message", {})
                        text = msg.get("content", {}).get("text", "[no text]")
                        chat_guid = data.get("chatGuid")
                        print(f"\n[New Message] Chat: {chat_guid}")
                        print(f"  Text: {text}")


async def main():
    """Main example function"""
    print("iMessage App Example")
    print("=" * 40)

    # Example 1: Send a text message
    print("\n1. Sending a text message...")
    result = await send_text_message(
        recipient="user@example.com",
        text="Hello from Python! 🐍",
    )

    # Example 2: Create a group chat
    print("\n2. Creating a group chat...")
    chat_result = await create_chat(
        recipients=["alice@example.com", "bob@example.com"],
        initial_message="Welcome to the group chat!",
    )

    # Example 3: List recent messages
    print("\n3. Listing recent messages...")
    await list_recent_messages(page_size=5)

    # Example 4: Listen for incoming messages (uncomment to use)
    # print("\n4. Listening for messages...")
    # await listen_for_messages()


if __name__ == "__main__":
    asyncio.run(main())
