/**
 * Verification probe (CAPSTONE.md item 2): a *simulated client*, not a unit test, that
 * exercises a Continuum-wrapped server exactly the way a real MCP client would — over the
 * wire, against a URL — so a maintainer (or the future `mcp-continuum` CLI) can point it at
 * their own running server and get a pass/fail report instead of having to trust the
 * library on faith. This module covers the first checklist step: a simulated **legacy**
 * (2025-11-25) client completing a full `initialize` -> `notifications/initialized` ->
 * `tools/call` round trip. The matching modern-client probe is the next checklist item.
 *
 * Deliberately framework-agnostic: it only needs a URL to POST JSON-RPC at, so it works
 * whether the target is `createLegacyHandshakeResponder` alone or a full `continuum()`
 * wrapper (the fastmcp-style servers CAPSTONE.md's worked examples will target expose the
 * same wire behavior either way).
 */
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";

/** Header the 2025-11-25 spec uses to carry the session id (case-insensitive over HTTP). */
const MCP_SESSION_ID_HEADER = "mcp-session-id";

export interface LegacyProbeOptions {
  /** URL of the already-running MCP endpoint to probe, e.g. `"http://localhost:3000/mcp"`. */
  url: string;
  /**
   * Name of a tool registered on the target server to invoke, proving a full round trip
   * (not just a handshake). The tool is called with no arguments unless `toolArguments` is set.
   */
  toolName: string;
  /** Arguments passed to `toolName`. Defaults to `{}`. */
  toolArguments?: Record<string, unknown>;
  /** Client identity sent in the `initialize` call. Defaults to a generic probe identity. */
  clientInfo?: { name: string; version: string };
  /** Overridable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

export interface LegacyProbeStep {
  /** Short name of the protocol step this row reports on. */
  name: "initialize" | "notifications/initialized" | "tools/call";
  ok: boolean;
  /** Human-readable detail — the failure reason when `ok` is false, or a short success note. */
  detail: string;
}

export interface LegacyProbeResult {
  /** True only if every step in `steps` succeeded. */
  ok: boolean;
  /** One row per protocol step attempted, in order; a later step is skipped after a failure. */
  steps: LegacyProbeStep[];
  /** Session id issued by the server's `initialize` response, once obtained. */
  sessionId?: string;
  /** Protocol version echoed back by the server's `initialize` response, once obtained. */
  protocolVersion?: string;
  /** The `tools/call` result payload, once obtained. */
  toolResult?: unknown;
}

/**
 * A single JSON-RPC response can arrive as a bare JSON body or as one `data:` line of a
 * `text/event-stream` body — the SDK's `StreamableHTTPServerTransport` defaults to the
 * latter (mirrors the same parsing already used in legacy.test.ts / continuum.test.ts).
 */
async function readJsonRpcResponse(res: Response): Promise<any> {
  const text = await res.text();
  if (res.headers.get("content-type")?.includes("text/event-stream")) {
    const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
    if (!dataLine) {
      throw new Error(`no "data:" line in SSE response body: ${text}`);
    }
    return JSON.parse(dataLine.slice("data: ".length));
  }
  return text.length > 0 ? JSON.parse(text) : undefined;
}

/**
 * Simulates a legacy (2025-11-25) MCP client end to end against a live server: sends
 * `initialize`, follows up with `notifications/initialized`, then calls `toolName` and
 * confirms it round-trips a real result — the same three-step exchange a production legacy
 * client performs, driven over real HTTP rather than in-process function calls.
 *
 * Never throws: every failure (network, HTTP status, JSON-RPC error, malformed body) is
 * captured as a failed step in the returned report, so a caller (the future probe CLI, or
 * a worked-example script) can render a pass/fail summary without a try/catch of its own.
 */
export async function runLegacyClientProbe(options: LegacyProbeOptions): Promise<LegacyProbeResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const clientInfo = options.clientInfo ?? { name: "mcp-continuum-legacy-probe", version: "0.1.0" };
  const steps: LegacyProbeStep[] = [];

  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };

  // Step 1: initialize — establishes the session and negotiates the protocol version.
  let sessionId: string | undefined;
  let protocolVersion: string | undefined;
  try {
    const res = await fetchImpl(options.url, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: LATEST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo,
        },
      }),
    });
    if (!res.ok) {
      steps.push({ name: "initialize", ok: false, detail: `HTTP ${res.status}` });
      return { ok: false, steps };
    }
    sessionId = res.headers.get(MCP_SESSION_ID_HEADER) ?? undefined;
    if (!sessionId) {
      steps.push({ name: "initialize", ok: false, detail: `no ${MCP_SESSION_ID_HEADER} response header` });
      return { ok: false, steps };
    }
    const body = await readJsonRpcResponse(res);
    if (body?.error) {
      steps.push({ name: "initialize", ok: false, detail: `JSON-RPC error: ${JSON.stringify(body.error)}` });
      return { ok: false, steps, sessionId };
    }
    protocolVersion = body?.result?.protocolVersion;
    steps.push({ name: "initialize", ok: true, detail: `session ${sessionId}, protocolVersion ${protocolVersion}` });
  } catch (error) {
    steps.push({ name: "initialize", ok: false, detail: (error as Error).message });
    return { ok: false, steps };
  }

  const sessionHeaders: Record<string, string> = { ...requestHeaders, [MCP_SESSION_ID_HEADER]: sessionId };

  // Step 2: notifications/initialized — completes the handshake per the legacy lifecycle.
  try {
    const res = await fetchImpl(options.url, {
      method: "POST",
      headers: sessionHeaders,
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    if (!res.ok) {
      steps.push({ name: "notifications/initialized", ok: false, detail: `HTTP ${res.status}` });
      return { ok: false, steps, sessionId, protocolVersion };
    }
    steps.push({ name: "notifications/initialized", ok: true, detail: "accepted" });
  } catch (error) {
    steps.push({ name: "notifications/initialized", ok: false, detail: (error as Error).message });
    return { ok: false, steps, sessionId, protocolVersion };
  }

  // Step 3: tools/call — proves a full round trip, not just a successful handshake.
  try {
    const res = await fetchImpl(options.url, {
      method: "POST",
      headers: sessionHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: options.toolName, arguments: options.toolArguments ?? {} },
      }),
    });
    if (!res.ok) {
      steps.push({ name: "tools/call", ok: false, detail: `HTTP ${res.status}` });
      return { ok: false, steps, sessionId, protocolVersion };
    }
    const body = await readJsonRpcResponse(res);
    if (body?.error) {
      steps.push({ name: "tools/call", ok: false, detail: `JSON-RPC error: ${JSON.stringify(body.error)}` });
      return { ok: false, steps, sessionId, protocolVersion };
    }
    // A tool that failed to run (e.g. an unknown tool name) still comes back as a JSON-RPC
    // *success* per the MCP spec — the failure is reported in-band via `result.isError`,
    // not the JSON-RPC `error` field checked above — so that has to be checked separately.
    if (body?.result?.isError) {
      steps.push({ name: "tools/call", ok: false, detail: `tool error: ${JSON.stringify(body.result)}` });
      return { ok: false, steps, sessionId, protocolVersion, toolResult: body.result };
    }
    steps.push({ name: "tools/call", ok: true, detail: `tool "${options.toolName}" returned a result` });
    return { ok: true, steps, sessionId, protocolVersion, toolResult: body?.result };
  } catch (error) {
    steps.push({ name: "tools/call", ok: false, detail: (error as Error).message });
    return { ok: false, steps, sessionId, protocolVersion };
  }
}
