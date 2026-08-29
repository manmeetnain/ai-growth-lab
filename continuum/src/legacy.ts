/**
 * Legacy (2025-11-25) `initialize` / `Mcp-Session-Id` handshake responder.
 *
 * Per CAPSTONE.md / RFC #2597: this path is left untouched — it is a thin session
 * registry wrapped around the SDK's own `StreamableHTTPServerTransport`, which already
 * implements the sessionful handshake end to end. Continuum's job here is only to let
 * *multiple* concurrent legacy sessions share one HTTP endpoint: create a fresh
 * server+transport pair on `initialize`, then route every later request to the transport
 * that matches its `Mcp-Session-Id` header.
 *
 * The stateless (2026-07-28) path is a separate module (added by the next checklist
 * item); the two are combined behind one `isLegacyRequest`-style router in the
 * `continuum()` wrapper (checklist item after that).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

/** Header the 2025-11-25 spec uses to carry the session id (case-insensitive over HTTP). */
export const MCP_SESSION_ID_HEADER = "mcp-session-id";

export interface LegacyHandshakeOptions {
  /**
   * Builds one fresh `McpServer` per session. Called once per `initialize` request.
   * A single `McpServer` can only ever be connected to one transport, so a factory
   * (not a shared instance) is required to serve concurrent legacy sessions — wire the
   * same tool/resource registrations in it every time, unchanged.
   */
  createServer: () => McpServer;
  /** Overridable for tests; defaults to `crypto.randomUUID`. */
  sessionIdGenerator?: () => string;
}

export interface LegacyHandshakeResponder {
  /** Handles one legacy HTTP request (GET/POST/DELETE) for the `/mcp` endpoint. */
  handleRequest(req: IncomingMessage, res: ServerResponse, parsedBody: unknown): Promise<void>;
  /** Whether `sessionId` is a live legacy session this responder issued. */
  hasSession(sessionId: string): boolean;
  /** Number of currently live legacy sessions. */
  readonly sessionCount: number;
  /** Closes every live session's transport (and its server). */
  close(): Promise<void>;
}

/**
 * True when a request belongs on the legacy path: it either carries a session id this
 * responder already issued, or it's an `initialize` call (the only legacy request a
 * fresh client sends with no session id yet). Exported standalone so the future
 * `continuum()` router can use the same check without re-deriving it.
 */
export function isLegacyHandshakeRequest(
  headers: IncomingMessage["headers"],
  body: unknown,
  hasSession: (sessionId: string) => boolean,
): boolean {
  const sessionId = headers[MCP_SESSION_ID_HEADER];
  if (typeof sessionId === "string" && hasSession(sessionId)) {
    return true;
  }
  return isInitializeRequest(body);
}

function sendJsonRpcError(res: ServerResponse, httpStatus: number, code: number, message: string): void {
  res.writeHead(httpStatus, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }));
}

export function createLegacyHandshakeResponder(options: LegacyHandshakeOptions): LegacyHandshakeResponder {
  const sessionIdGenerator = options.sessionIdGenerator ?? randomUUID;
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: McpServer }>();

  async function handleRequest(req: IncomingMessage, res: ServerResponse, parsedBody: unknown): Promise<void> {
    const sessionIdHeader = req.headers[MCP_SESSION_ID_HEADER];
    const sessionId = typeof sessionIdHeader === "string" ? sessionIdHeader : undefined;

    if (sessionId !== undefined) {
      const session = sessions.get(sessionId);
      if (!session) {
        sendJsonRpcError(res, 404, -32001, "Session not found");
        return;
      }
      await session.transport.handleRequest(req, res, parsedBody);
      return;
    }

    if (!isInitializeRequest(parsedBody)) {
      sendJsonRpcError(
        res,
        400,
        -32000,
        "Bad Request: no Mcp-Session-Id header and request is not an initialize call",
      );
      return;
    }

    const server = options.createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator,
      onsessioninitialized: (newSessionId) => {
        sessions.set(newSessionId, { transport, server });
      },
      onsessionclosed: (closedSessionId) => {
        sessions.delete(closedSessionId);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
      }
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, parsedBody);
  }

  async function close(): Promise<void> {
    const closing = Array.from(sessions.values(), ({ server }) => server.close());
    sessions.clear();
    await Promise.all(closing);
  }

  return {
    handleRequest,
    hasSession: (sessionId: string) => sessions.has(sessionId),
    get sessionCount() {
      return sessions.size;
    },
    close,
  };
}
