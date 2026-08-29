import assert from "node:assert/strict";
import { createServer, type Server as HttpServer } from "node:http";
import { test } from "node:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { createLegacyHandshakeResponder, isLegacyHandshakeRequest, MCP_SESSION_ID_HEADER } from "./legacy.js";

/**
 * The transport defaults to SSE streaming (per `enableJsonResponse`'s doc, "Default is
 * false"), so a single JSON-RPC response arrives as one `data:` line of an
 * `text/event-stream` body rather than a bare JSON body. Read either shape.
 */
async function readJsonRpcResponse(res: Response): Promise<any> {
  const text = await res.text();
  if (res.headers.get("content-type")?.includes("text/event-stream")) {
    const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
    if (!dataLine) throw new Error(`no "data:" line in SSE body: ${text}`);
    return JSON.parse(dataLine.slice("data: ".length));
  }
  return JSON.parse(text);
}

function makeTestServer(): McpServer {
  const server = new McpServer({ name: "continuum-legacy-test-server", version: "0.0.0" });
  server.registerTool(
    "ping",
    { description: "Replies with pong" },
    async () => ({ content: [{ type: "text", text: "pong" }] }),
  );
  return server;
}

async function startResponderHttpServer(): Promise<{ url: string; http: HttpServer; sessions: ReturnType<typeof createLegacyHandshakeResponder> }> {
  const sessions = createLegacyHandshakeResponder({ createServer: makeTestServer });
  const http = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    const parsedBody = raw.length > 0 ? JSON.parse(raw) : undefined;
    await sessions.handleRequest(req, res, parsedBody);
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected an AddressInfo from a TCP listener");
  }
  return { url: `http://127.0.0.1:${address.port}/mcp`, http, sessions };
}

function initializeRequestBody() {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "continuum-test-client", version: "0.0.0" },
    },
  };
}

test("legacy handshake: initialize issues a session id and completes the handshake", async () => {
  const { url, http, sessions } = await startResponderHttpServer();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify(initializeRequestBody()),
    });
    assert.equal(res.status, 200);
    const sessionId = res.headers.get(MCP_SESSION_ID_HEADER);
    assert.ok(sessionId, "expected an Mcp-Session-Id response header");
    const body = (await readJsonRpcResponse(res)) as { result: { protocolVersion: string } };
    assert.equal(body.result.protocolVersion, LATEST_PROTOCOL_VERSION);
    assert.equal(sessions.sessionCount, 1);
    assert.equal(sessions.hasSession(sessionId!), true);
  } finally {
    await sessions.close();
    http.close();
  }
});

test("legacy handshake: a tool call round-trips once a session exists", async () => {
  const { url, http, sessions } = await startResponderHttpServer();
  try {
    const initRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify(initializeRequestBody()),
    });
    const sessionId = initRes.headers.get(MCP_SESSION_ID_HEADER)!;

    const initializedNotification = {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    };
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        [MCP_SESSION_ID_HEADER]: sessionId,
      },
      body: JSON.stringify(initializedNotification),
    });

    const callRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        [MCP_SESSION_ID_HEADER]: sessionId,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "ping", arguments: {} } }),
    });
    assert.equal(callRes.status, 200);
    const callBody = (await readJsonRpcResponse(callRes)) as { result: { content: { text: string }[] } };
    assert.equal(callBody.result.content[0].text, "pong");
  } finally {
    await sessions.close();
    http.close();
  }
});

test("legacy handshake: two concurrent sessions stay isolated", async () => {
  const { url, http, sessions } = await startResponderHttpServer();
  try {
    const [resA, resB] = await Promise.all([
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify(initializeRequestBody()),
      }),
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify(initializeRequestBody()),
      }),
    ]);
    const sessionA = resA.headers.get(MCP_SESSION_ID_HEADER)!;
    const sessionB = resB.headers.get(MCP_SESSION_ID_HEADER)!;
    assert.notEqual(sessionA, sessionB);
    assert.equal(sessions.sessionCount, 2);
  } finally {
    await sessions.close();
    http.close();
  }
});

test("legacy handshake: unknown session id is rejected with 404", async () => {
  const { url, http, sessions } = await startResponderHttpServer();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        [MCP_SESSION_ID_HEADER]: "not-a-real-session",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "ping", arguments: {} } }),
    });
    assert.equal(res.status, 404);
  } finally {
    await sessions.close();
    http.close();
  }
});

test("legacy handshake: a non-initialize request with no session id is rejected with 400", async () => {
  const { url, http, sessions } = await startResponderHttpServer();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "ping", arguments: {} } }),
    });
    assert.equal(res.status, 400);
  } finally {
    await sessions.close();
    http.close();
  }
});

test("isLegacyHandshakeRequest: true for a known session id or an initialize call, false otherwise", () => {
  const hasSession = (id: string) => id === "known-session";

  assert.equal(isLegacyHandshakeRequest({ [MCP_SESSION_ID_HEADER]: "known-session" }, {}, hasSession), true);
  assert.equal(isLegacyHandshakeRequest({}, initializeRequestBody(), hasSession), true);
  assert.equal(isLegacyHandshakeRequest({ [MCP_SESSION_ID_HEADER]: "unknown-session" }, {}, hasSession), false);
  assert.equal(
    isLegacyHandshakeRequest({}, { jsonrpc: "2.0", method: "tools/call" }, hasSession),
    false,
  );
});
