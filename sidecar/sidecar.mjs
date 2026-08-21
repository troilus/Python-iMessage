import { createClient } from "@photon-ai/advanced-imessage";
import http from "node:http";
import { randomUUID } from "node:crypto";

// Configuration
const PORT = parseInt(process.env.SIDECAR_PORT || "8765", 10);
const SERVER_ADDRESS = process.env.PHOTON_SERVER_ADDRESS;
const SERVER_TOKEN = process.env.PHOTON_SERVER_TOKEN;

if (!SERVER_ADDRESS || !SERVER_TOKEN) {
  console.error("Missing PHOTON_SERVER_ADDRESS or PHOTON_SERVER_TOKEN");
  process.exit(1);
}

// Create Photon client
const im = createClient({
  address: SERVER_ADDRESS,
  token: SERVER_TOKEN,
});

// Store for connected SSE clients
const sseClients = new Set();

// Broadcast message to all connected SSE clients
function broadcast(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

// Start listening for incoming messages
async function startEventListener() {
  try {
    for await (const event of im.messages.subscribeEvents()) {
      if (event.type === "message.received") {
        broadcast({
          type: "message.received",
          chatGuid: event.chatGuid,
          message: event.message,
          timestamp: event.occurredAt,
        });
      }
    }
  } catch (error) {
    console.error("Event stream error:", error);
    // Reconnect after delay
    setTimeout(startEventListener, 5000);
  }
}

// Parse JSON body from request
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

// Send JSON response
function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    // Health check
    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { status: "ok", timestamp: new Date().toISOString() });
      return;
    }

    // SSE stream for incoming messages
    if (req.method === "GET" && url.pathname === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      // Send initial connection event
      res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

      sseClients.add(res);

      req.on("close", () => {
        sseClients.delete(res);
      });

      return;
    }

    // Create chat
    if (req.method === "POST" && url.pathname === "/create-chat") {
      const body = await parseBody(req);
      const { addresses, message } = body;

      if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
        sendJson(res, 400, { error: "addresses must be a non-empty array" });
        return;
      }

      const result = await im.chats.create(addresses, { message });
      sendJson(res, 200, { chat: result.chat });
      return;
    }

    // Send text message
    if (req.method === "POST" && url.pathname === "/send") {
      const body = await parseBody(req);
      const { recipient, text, chatGuid } = body;

      if (!text) {
        sendJson(res, 400, { error: "text is required" });
        return;
      }

      let targetChatGuid = chatGuid;

      // If no chatGuid provided, create/get chat from recipient
      if (!targetChatGuid) {
        if (!recipient) {
          sendJson(res, 400, { error: "recipient or chatGuid is required" });
          return;
        }
        const { chat } = await im.chats.create([recipient]);
        targetChatGuid = chat.guid;
      }

      const sent = await im.messages.sendText(targetChatGuid, text);
      sendJson(res, 200, {
        messageGuid: sent.guid,
        chatGuid: targetChatGuid,
      });
      return;
    }

    // Send attachment message
    if (req.method === "POST" && url.pathname === "/send-attachment") {
      const body = await parseBody(req);
      const { recipient, fileName, fileData, chatGuid } = body;

      if (!fileName || !fileData) {
        sendJson(res, 400, { error: "fileName and fileData (base64) are required" });
        return;
      }

      let targetChatGuid = chatGuid;

      if (!targetChatGuid) {
        if (!recipient) {
          sendJson(res, 400, { error: "recipient or chatGuid is required" });
          return;
        }
        const { chat } = await im.chats.create([recipient]);
        targetChatGuid = chat.guid;
      }

      // Decode base64 data
      const data = Buffer.from(fileData, "base64");

      // Upload attachment
      const uploaded = await im.attachments.upload({ fileName, data });

      // Send attachment message
      const sent = await im.messages.sendAttachment(targetChatGuid, uploaded.attachment.guid);
      sendJson(res, 200, {
        messageGuid: sent.guid,
        chatGuid: targetChatGuid,
        attachmentGuid: uploaded.attachment.guid,
      });
      return;
    }

    // Reply to a message
    if (req.method === "POST" && url.pathname === "/reply") {
      const body = await parseBody(req);
      const { chatGuid, messageGuid, text } = body;

      if (!chatGuid || !messageGuid || !text) {
        sendJson(res, 400, { error: "chatGuid, messageGuid, and text are required" });
        return;
      }

      const sent = await im.messages.sendText(chatGuid, text, { replyTo: messageGuid });
      sendJson(res, 200, { messageGuid: sent.guid });
      return;
    }

    // Mark chat as read
    if (req.method === "POST" && url.pathname === "/mark-read") {
      const body = await parseBody(req);
      const { chatGuid } = body;

      if (!chatGuid) {
        sendJson(res, 400, { error: "chatGuid is required" });
        return;
      }

      await im.chats.markRead(chatGuid);
      sendJson(res, 200, { status: "ok" });
      return;
    }

    // Set typing indicator
    if (req.method === "POST" && url.pathname === "/typing") {
      const body = await parseBody(req);
      const { chatGuid, isTyping } = body;

      if (!chatGuid) {
        sendJson(res, 400, { error: "chatGuid is required" });
        return;
      }

      await im.chats.setTyping(chatGuid, isTyping !== false);
      sendJson(res, 200, { status: "ok" });
      return;
    }

    // List recent messages
    if (req.method === "GET" && url.pathname === "/messages") {
      const pageSize = parseInt(url.searchParams.get("pageSize") || "25", 10);
      const result = await im.messages.listRecent({ pageSize });
      sendJson(res, 200, { messages: result.messages });
      return;
    }

    // List messages in a chat
    if (req.method === "GET" && url.pathname === "/messages/chat") {
      const chatGuid = url.searchParams.get("chatGuid");
      const pageSize = parseInt(url.searchParams.get("pageSize") || "25", 10);

      if (!chatGuid) {
        sendJson(res, 400, { error: "chatGuid query parameter is required" });
        return;
      }

      const result = await im.messages.listInChat(chatGuid, { pageSize });
      sendJson(res, 200, { messages: result.messages });
      return;
    }

    // 404 for unknown routes
    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    console.error("Request error:", error);
    sendJson(res, 500, { error: error.message || "Internal server error" });
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`Sidecar listening on http://localhost:${PORT}`);
  console.log(`Connecting to Photon server: ${SERVER_ADDRESS}`);

  // Start event listener
  startEventListener();
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down...");
  server.close();
  await im.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down...");
  server.close();
  await im.close();
  process.exit(0);
});
