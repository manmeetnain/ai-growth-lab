import assert from "node:assert/strict";
import { createServer, type Server as HttpServer } from "node:http";
import { test } from "node:test";
import { McpServer as LegacyMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import {
  McpServer as ModernMcpServer,
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";
import { continuum } from "./continuum.js";

/** The 2026-07-28 wire revision literal (not exported publicly by the SDK — see modern.ts). */
const MODERN_PROTOCOL_VERSION = "2026-07-28";

function makeLegacyServer(): LegacyMcpServer {
  const server = new LegacyMcpServer({ name: "continuum-e2e-legacy-server", version: "0.0.0" });
  server.registerTool(
    "ping",
    { description: "Replies with pong (legacy)" },
    async () => ({ content: [{ type: "text", text: "pong-legacy" }] }),
  );
  return server;
}

function makeModernServer(): ModernMcpServer {
  const server = new ModernMcpServer({ name: "continuum-e2e-modern-server", version: "0.0.0" });
  server.registerTool(
    "ping",
    { description: "Replies with pong (modern)" },
    async () => ({ content: [{ type: "text", text: "pong-modern" }] }),
  );
  return server;
}

async function startContinuumHttpServer(): Promise<{
  url: string;
  http: HttpServer;
  wrapper: ReturnType<typeof continuum>;
}> {
  const wrapper = continuum({ createLegacyServer: makeLegacyServer, createModernServer: makeModernServer });
  const http = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    const parsedBody = raw.length > 0 ? JSON.parse(raw) : undefined;
    await wrapper.handleRequest(req, res, parsedBody);
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected an AddressInfo from a TCP listener");
  }
  return { url: `http://127.0.0.1:${address.port}/mcp`, http, wrapper };
}

/**
 * The legacy transport defaults to SSE streaming, so a single JSON-RPC
 * response arrives as one `data:` line of a `text/event-stream` body rather
 * than a bare JSON body (mirrors legacy.test.ts). Read either shape.
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

function legacyInitializeBody() {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "continuum-e2e-legacy-client", version: "0.0.0" },
    },
  };
}

function modernEnvelope(): Record<string, unknown> {
  return {
    [PROTOCOL_VERSION_META_KEY]: MODERN_PROTOCOL_VERSION,
    [CLIENT_CAPABILITIES_META_KEY]: {},
    [CLIENT_INFO_META_KEY]: { name: "continuum-e2e-modern-client", version: "0.0.0" },
  };
}

async function postJsonRpc(
  url: string,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; headers: Headers; body: any }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...extraHeaders },
    body: JSON.stringify(body),
  });
  const parsed = await readJsonRpcResponse(res);
  return { status: res.status, headers: res.headers, body: parsed };
}

test("continuum: a legacy client completes the initialize handshake and a tool call round trip", async () => {
  const { url, http, wrapper } = await startContinuumHttpServer();
  try {
    const initRes = await postJsonRpc(url, legacyInitializeBody());
    assert.equal(initRes.status, 200);
    const sessionId = initRes.headers.get("mcp-session-id");
    assert.ok(sessionId, "expected the legacy path to issue a session id");
    assert.equal(wrapper.legacySessionCount, 1);

    const callRes = await postJsonRpc(
      url,
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "ping", arguments: {} } },
      { "mcp-session-id": sessionId! },
    );
    assert.equal(callRes.status, 200);
    assert.equal(callRes.body.result.content[0].text, "pong-legacy");
  } finally {
    await wrapper.close();
    http.close();
  }
});

test("continuum: a modern (2026-07-28) client completes a stateless tool call round trip with no handshake", async () => {
  const { url, http, wrapper } = await startContinuumHttpServer();
  try {
    const discoverRes = await postJsonRpc(
      url,
      { jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: modernEnvelope() } },
      { "Mcp-Method": "server/discover" },
    );
    assert.equal(discoverRes.status, 200);
    assert.equal(discoverRes.body.result.resultType, "complete");
    assert.ok(discoverRes.body.result.supportedVersions.includes(MODERN_PROTOCOL_VERSION));

    const callRes = await postJsonRpc(
      url,
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "ping", arguments: {}, _meta: modernEnvelope() } },
      { "Mcp-Method": "tools/call", "Mcp-Name": "ping" },
    );
    assert.equal(callRes.status, 200);
    assert.equal(callRes.body.result.content[0].text, "pong-modern");

    // The modern path never registers a legacy session.
    assert.equal(wrapper.legacySessionCount, 0);
  } finally {
    await wrapper.close();
    http.close();
  }
});

test("continuum: legacy and modern clients round-trip independently against the same wrapped endpoint", async () => {
  const { url, http, wrapper } = await startContinuumHttpServer();
  try {
    const initRes = await postJsonRpc(url, legacyInitializeBody());
    const sessionId = initRes.headers.get("mcp-session-id")!;

    const [legacyCall, modernCall] = await Promise.all([
      postJsonRpc(
        url,
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "ping", arguments: {} } },
        { "mcp-session-id": sessionId },
      ),
      postJsonRpc(
        url,
        { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "ping", arguments: {}, _meta: modernEnvelope() } },
        { "Mcp-Method": "tools/call", "Mcp-Name": "ping" },
      ),
    ]);

    assert.equal(legacyCall.body.result.content[0].text, "pong-legacy");
    assert.equal(modernCall.body.result.content[0].text, "pong-modern");
  } finally {
    await wrapper.close();
    http.close();
  }
});

test("continuum: an Mcp-Session-Id this instance never issued falls through to the modern path and is rejected there (not silently served)", async () => {
  // Per isLegacyHandshakeRequest's contract, a session id only counts as legacy
  // if `hasSession` recognizes it — a foreign/unknown id is not routed to the
  // legacy responder (which would need to have issued it), so it lands on the
  // modern path instead, which rejects it for lacking the modern envelope.
  const { url, http, wrapper } = await startContinuumHttpServer();
  try {
    const res = await postJsonRpc(
      url,
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "ping", arguments: {} } },
      { "mcp-session-id": "00000000-0000-0000-0000-000000000000", "Mcp-Method": "tools/call", "Mcp-Name": "ping" },
    );
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
    assert.equal(wrapper.legacySessionCount, 0);
  } finally {
    await wrapper.close();
    http.close();
  }
});

test("continuum: isLegacyRequest matches an initialize call and a known session id, and nothing else", async () => {
  const { url, http, wrapper } = await startContinuumHttpServer();
  try {
    const initRes = await postJsonRpc(url, legacyInitializeBody());
    const sessionId = initRes.headers.get("mcp-session-id")!;

    const fakeReq = (headers: Record<string, string>) => ({ headers }) as any;
    assert.equal(wrapper.isLegacyRequest(fakeReq({}), legacyInitializeBody()), true);
    assert.equal(wrapper.isLegacyRequest(fakeReq({ "mcp-session-id": sessionId }), {}), true);
    assert.equal(
      wrapper.isLegacyRequest(fakeReq({}), { jsonrpc: "2.0", id: 9, method: "tools/call", params: {} }),
      false,
    );
  } finally {
    await wrapper.close();
    http.close();
  }
});

test("continuum: close() tears down live legacy sessions and the modern responder", async () => {
  const { url, http, wrapper } = await startContinuumHttpServer();
  try {
    await postJsonRpc(url, legacyInitializeBody());
    assert.equal(wrapper.legacySessionCount, 1);
    await wrapper.close();
    assert.equal(wrapper.legacySessionCount, 0);
  } finally {
    http.close();
  }
});
