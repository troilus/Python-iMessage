import "dotenv/config";
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.SIDECAR_PORT || "8765", 10);

const projectId = process.env.SPECTRUM_PROJECT_ID;
const projectSecret = process.env.SPECTRUM_PROJECT_SECRET;

if (!projectId || !projectSecret) {
  console.error("Missing SPECTRUM_PROJECT_ID or SPECTRUM_PROJECT_SECRET");
  process.exit(1);
}

const app = await Spectrum({
  projectId,
  projectSecret,
  providers: [imessage.config()],
});

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

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

const sseClients = new Set();
const recentMessages = [];

function broadcast(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { status: "ok", timestamp: new Date().toISOString() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }

    if (req.method === "POST" && url.pathname === "/send") {
      const { recipient, text, chatGuid } = await parseBody(req);
      if (!text) {
        sendJson(res, 400, { error: "text is required" });
        return;
      }

      const im = imessage(app);
      let space;

      if (chatGuid) {
        space = await im.space.get(chatGuid);
      } else if (recipient) {
        const user = await im.user(recipient);
        space = await im.space.create(user);
      } else {
        sendJson(res, 400, { error: "recipient or chatGuid is required" });
        return;
      }

      const msg = await space.send(text);
      const msgData = {
        type: "message.sent",
        chatGuid: space.id,
        message: {
          guid: msg?.id,
          content: { text },
          recipient,
          isFromMe: true,
        },
        timestamp: new Date().toISOString(),
      };
      recentMessages.push(msgData);
      if (recentMessages.length > 100) recentMessages.shift();
      sendJson(res, 200, {
        messageGuid: msg?.id,
        chatGuid: space.id,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/reply") {
      const { chatGuid, messageGuid, text } = await parseBody(req);
      if (!chatGuid || !text) {
        sendJson(res, 400, { error: "chatGuid and text are required" });
        return;
      }

      const im = imessage(app);
      const space = await im.space.get(chatGuid);
      const msg = await space.send(text);
      sendJson(res, 200, { messageGuid: msg?.id });
      return;
    }

    if (req.method === "POST" && url.pathname === "/create-chat") {
      const { addresses, message } = await parseBody(req);
      if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
        sendJson(res, 400, { error: "addresses must be a non-empty array" });
        return;
      }

      const im = imessage(app);
      const users = await Promise.all(addresses.map((addr) => im.user(addr)));
      const space = await im.space.create(users);

      if (message) {
        await space.send(message);
      }

      sendJson(res, 200, { chat: { guid: space.id } });
      return;
    }

    if (req.method === "POST" && url.pathname === "/typing") {
      const { chatGuid, isTyping } = await parseBody(req);
      if (!chatGuid) {
        sendJson(res, 400, { error: "chatGuid is required" });
        return;
      }

      const im = imessage(app);
      const space = await im.space.get(chatGuid);

      if (isTyping !== false) {
        await space.startTyping();
      } else {
        await space.stopTyping();
      }

      sendJson(res, 200, { status: "ok" });
      return;
    }

    if (req.method === "POST" && url.pathname === "/send-attachment") {
      const { recipient, fileName, fileData, chatGuid } = await parseBody(req);
      if (!fileName || !fileData) {
        sendJson(res, 400, { error: "fileName and fileData (base64) are required" });
        return;
      }

      const im = imessage(app);
      let space;

      if (chatGuid) {
        space = await im.space.get(chatGuid);
      } else if (recipient) {
        const user = await im.user(recipient);
        space = await im.space.create(user);
      } else {
        sendJson(res, 400, { error: "recipient or chatGuid is required" });
        return;
      }

      const data = Buffer.from(fileData, "base64");
      const msg = await space.send({
        type: "attachment",
        fileName,
        data,
      });

      sendJson(res, 200, {
        messageGuid: msg?.id,
        chatGuid: space.id,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/messages") {
      sendJson(res, 200, { messages: recentMessages });
      return;
    }

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const filePath = path.join(__dirname, "index.html");
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(content);
      } else {
        sendJson(res, 404, { error: "index.html not found" });
      }
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    console.error("Request error:", error);
    sendJson(res, 500, { error: error.message || "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Spectrum iMessage app listening on http://localhost:${PORT}`);
});

for await (const [space, message] of app.messages) {
  if (message.content.type === "text") {
    const msgData = {
      type: "message.received",
      chatGuid: space.id,
      message: {
        guid: message.id,
        content: { text: message.content.text },
        sender: message.sender?.id,
        isFromMe: message.direction === "outbound",
      },
      timestamp: message.timestamp,
    };
    recentMessages.push(msgData);
    if (recentMessages.length > 100) recentMessages.shift();
    broadcast(msgData);
  }
}

process.on("SIGINT", async () => {
  console.log("Shutting down...");
  server.close();
  await app.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down...");
  server.close();
  await app.stop();
  process.exit(0);
});
