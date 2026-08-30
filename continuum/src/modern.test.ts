import assert from "node:assert/strict";
import { createServer, type Server as HttpServer } from "node:http";
import { test } from "node:test";
import {
  McpServer,
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";
import { createStatelessResponder } from "./modern.js";

/** The 2026-07-28 wire revision literal (not exported publicly by the SDK — see modern.ts). */
const MODERN_PROTOCOL_VERSION = "2026-07-28";

function makeTestServer(): McpServer {
  const server = new McpServer({ name: "continuum-modern-test-server", version: "0.0.0" });
  server.registerTool(
    "ping",
    { description: "Replies with pong" },
    async () => ({ content: [{ type: "text", text: "pong" }] }),
  );
  return server;
}

async function startResponderHttpServer(): Promise<{
  url: string;
  http: HttpServer;
  responder: ReturnType<typeof createStatelessResponder>;
}> {
  const responder = createStatelessResponder({ createServer: makeTestServer });
  const http = createServer(async (req, res) => {
    await responder.handleRequest(req, res);
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected an AddressInfo from a TCP listener");
  }
  return { url: `http://127.0.0.1:${address.port}/mcp`, http, responder };
}

/** Every 2026-07-28 request carries its own envelope — there is no shared handshake to reuse. */
function envelope(): Record<string, unknown> {
  return {
    [PROTOCOL_VERSION_META_KEY]: MODERN_PROTOCOL_VERSION,
    [CLIENT_CAPABILITIES_META_KEY]: {},
    [CLIENT_INFO_META_KEY]: { name: "continuum-test-client", version: "0.0.0" },
  };
}

/**
 * Per SEP-2243 (RESEARCH.md's "header-based routing"), every modern request
 * must carry an `Mcp-Method` header mirroring the body's `method`, and
 * `tools/call` additionally requires an `Mcp-Name` header mirroring
 * `params.name` — gateways/rate limiters can route on these without parsing
 * the JSON body. `extraHeaders` lets a test omit them to exercise rejection.
 */
async function postJsonRpc(
  url: string,
  body: { jsonrpc: "2.0"; id: number; method: string; params?: { name?: string; [key: string]: unknown } },
  extraHeaders: Record<string, string> = { "Mcp-Method": body.method, ...(body.params?.name ? { "Mcp-Name": body.params.name } : {}) },
): Promise<{ status: number; body: any }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text.length > 0 ? JSON.parse(text) : undefined };
}

test("stateless responder: server/discover completes without any prior handshake", async () => {
  const { url, http, responder } = await startResponderHttpServer();
  try {
    const { status, body } = await postJsonRpc(url, {
      jsonrpc: "2.0",
      id: 1,
      method: "server/discover",
      params: { _meta: envelope() },
    });
    assert.equal(status, 200);
    assert.equal(body.result.resultType, "complete");
    assert.ok(Array.isArray(body.result.supportedVersions));
    assert.ok(body.result.supportedVersions.includes(MODERN_PROTOCOL_VERSION));
  } finally {
    await responder.close();
    http.close();
  }
});

test("stateless responder: a tool call round-trips in a single stateless request, envelope only", async () => {
  const { url, http, responder } = await startResponderHttpServer();
  try {
    const { status, body } = await postJsonRpc(url, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "ping", arguments: {}, _meta: envelope() },
    });
    assert.equal(status, 200);
    assert.equal(body.result.resultType, "complete");
    assert.equal(body.result.content[0].text, "pong");
  } finally {
    await responder.close();
    http.close();
  }
});

test("stateless responder: two concurrent stateless calls stay independent (no shared session state)", async () => {
  const { url, http, responder } = await startResponderHttpServer();
  try {
    const [resA, resB] = await Promise.all([
      postJsonRpc(url, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "ping", arguments: {}, _meta: envelope() },
      }),
      postJsonRpc(url, {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "ping", arguments: {}, _meta: envelope() },
      }),
    ]);
    assert.equal(resA.status, 200);
    assert.equal(resB.status, 200);
    assert.equal(resA.body.result.content[0].text, "pong");
    assert.equal(resB.body.result.content[0].text, "pong");
  } finally {
    await responder.close();
    http.close();
  }
});

test("stateless responder: a claim-less (legacy-shaped) request is rejected, not silently served", async () => {
  const { url, http, responder } = await startResponderHttpServer();
  try {
    const { status, body } = await postJsonRpc(url, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "ping", arguments: {} },
    });
    assert.equal(status, 400);
    assert.ok(body.error, "expected a JSON-RPC error for a request missing the modern envelope");
  } finally {
    await responder.close();
    http.close();
  }
});
