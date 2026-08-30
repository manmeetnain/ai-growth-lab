import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer, type Server as HttpServer } from "node:http";
import { McpServer as LegacyMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError, LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { createLegacyHandshakeResponder, MCP_SESSION_ID_HEADER } from "./legacy.js";
import {
  LEGACY_SAFE_ERROR_CODE,
  toLegacyCompatibleError,
  wrapForLegacyErrors,
} from "./errors.js";
import {
  MissingRequiredClientCapabilityError,
  UnsupportedProtocolVersionError,
  ResourceNotFoundError,
  ProtocolErrorCode,
} from "@modelcontextprotocol/server";

test("toLegacyCompatibleError: an existing McpError passes through unchanged", () => {
  const original = new McpError(ErrorCode.InvalidParams, "bad params", { foo: "bar" });
  const converted = toLegacyCompatibleError(original);
  assert.equal(converted, original);
});

test("toLegacyCompatibleError: a modern-only code (MissingRequiredClientCapability) is remapped to InvalidRequest", () => {
  const modernError = new MissingRequiredClientCapabilityError({ requiredCapabilities: { roots: {} } });
  const converted = toLegacyCompatibleError(modernError);
  assert.ok(converted instanceof McpError);
  assert.equal(converted.code, ErrorCode.InvalidRequest);
  assert.equal(converted.code, LEGACY_SAFE_ERROR_CODE.get(ProtocolErrorCode.MissingRequiredClientCapability));
  assert.equal((converted.data as any).continuumOriginalErrorCode, ProtocolErrorCode.MissingRequiredClientCapability);
  assert.deepEqual((converted.data as any).requiredCapabilities, { roots: {} });
});

test("toLegacyCompatibleError: a modern-only code (UnsupportedProtocolVersion) is remapped to InvalidRequest", () => {
  const modernError = new UnsupportedProtocolVersionError({ requested: "2099-01-01", supported: [LATEST_PROTOCOL_VERSION] });
  const converted = toLegacyCompatibleError(modernError);
  assert.equal(converted.code, ErrorCode.InvalidRequest);
  assert.equal((converted.data as any).continuumOriginalErrorCode, ProtocolErrorCode.UnsupportedProtocolVersion);
  assert.equal((converted.data as any).requested, "2099-01-01");
});

test("toLegacyCompatibleError: a modern error whose code is already legacy-legal (ResourceNotFoundError -> InvalidParams) passes through unchanged", () => {
  // ResourceNotFoundError's actual wire code is ProtocolErrorCode.InvalidParams (-32602),
  // which the legacy ErrorCode enum defines too — no remap needed.
  const modernError = new ResourceNotFoundError("file:///missing.txt");
  const converted = toLegacyCompatibleError(modernError);
  assert.equal(converted.code, ErrorCode.InvalidParams);
  assert.equal((converted.data as any).continuumOriginalErrorCode, undefined);
  assert.equal((converted.data as any).uri, "file:///missing.txt");
});

test("toLegacyCompatibleError: a plain Error with no .code falls back to InternalError", () => {
  const converted = toLegacyCompatibleError(new Error("boom"));
  assert.equal(converted.code, ErrorCode.InternalError);
  assert.ok(converted.message.includes("boom"));
});

test("toLegacyCompatibleError: a non-Error thrown value falls back to InternalError", () => {
  const converted = toLegacyCompatibleError("just a string");
  assert.equal(converted.code, ErrorCode.InternalError);
  assert.ok(converted.message.includes("just a string"));
});

test("wrapForLegacyErrors: normalizes a thrown modern error before it escapes the handler", async () => {
  const handler = wrapForLegacyErrors(async () => {
    throw new MissingRequiredClientCapabilityError({ requiredCapabilities: { sampling: {} } });
  });
  await assert.rejects(handler(), (error: unknown) => {
    assert.ok(error instanceof McpError);
    assert.equal(error.code, ErrorCode.InvalidRequest);
    return true;
  });
});

/**
 * End-to-end proof, not just a unit test of the pure function: registered
 * *resource* reads (unlike `tools/call`, which the legacy `McpServer`
 * always collapses to an in-band `isError` result with no code — see
 * `server/mcp.js`'s `createToolError`) propagate a thrown error straight
 * through the generic `shared/protocol.js` dispatch path this module's doc
 * comment describes, so this is where a dropped/remapped code is actually
 * observable over the wire.
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

async function startLegacyServerWithResource(readCallback: () => Promise<never>) {
  const server = new LegacyMcpServer({ name: "continuum-errors-e2e-server", version: "0.0.0" });
  server.registerResource(
    "always-fails",
    "test://always-fails",
    { description: "Always throws whatever readCallback throws" },
    readCallback,
  );

  const sessions = createLegacyHandshakeResponder({ createServer: () => server });
  const http: HttpServer = createServer(async (req, res) => {
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

async function callInitializedResourceRead(url: string, resourceUri: string): Promise<any> {
  const initRes = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "c", version: "0" } },
    }),
  });
  const sessionId = initRes.headers.get(MCP_SESSION_ID_HEADER)!;

  const readRes = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      [MCP_SESSION_ID_HEADER]: sessionId,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "resources/read", params: { uri: resourceUri } }),
  });
  return readJsonRpcResponse(readRes);
}

test("end-to-end (without the fix): an unwrapped resource handler throwing a modern-only error leaks that code as-is to a legacy client", async () => {
  // The legacy dispatcher's generic request path (unlike tools/call) duck
  // -types a thrown error's .code/.data and forwards them verbatim, exactly
  // like the modern dispatcher does — it does NOT collapse an unrecognized
  // code to InternalError. That is itself the gap: a 2025-11-25 client has
  // no idea what -32021 means, but nothing stops it from leaking through.
  const { url, http, sessions } = await startLegacyServerWithResource(async () => {
    throw new MissingRequiredClientCapabilityError({ requiredCapabilities: { sampling: {} } });
  });
  try {
    const body = await callInitializedResourceRead(url, "test://always-fails");
    assert.ok(body.error, "expected a top-level JSON-RPC error");
    assert.equal(body.error.code, ProtocolErrorCode.MissingRequiredClientCapability);
    assert.notEqual(
      body.error.code,
      ErrorCode.InvalidRequest,
      "a legacy client has no defined meaning for this modern-only code",
    );
  } finally {
    await sessions.close();
    http.close();
  }
});

test("end-to-end (with the fix): wrapForLegacyErrors makes the same handler reach the client as InvalidRequest with the original code preserved", async () => {
  const { url, http, sessions } = await startLegacyServerWithResource(
    wrapForLegacyErrors(async () => {
      throw new MissingRequiredClientCapabilityError({ requiredCapabilities: { sampling: {} } });
    }),
  );
  try {
    const body = await callInitializedResourceRead(url, "test://always-fails");
    assert.ok(body.error, "expected a top-level JSON-RPC error");
    assert.equal(body.error.code, ErrorCode.InvalidRequest);
    assert.equal(body.error.data.continuumOriginalErrorCode, ProtocolErrorCode.MissingRequiredClientCapability);
    assert.deepEqual(body.error.data.requiredCapabilities, { sampling: {} });
  } finally {
    await sessions.close();
    http.close();
  }
});
