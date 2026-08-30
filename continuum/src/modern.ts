/**
 * Stateless (2026-07-28) `server/discover` / per-request-envelope responder.
 *
 * Per CAPSTONE.md / RFC #2597: this is the *separate* stateless handler entry
 * point that lives alongside the legacy path (`src/legacy.ts`), which stays
 * completely untouched. There is no handshake and no session state here —
 * every request carries its own protocol version, client identity, and
 * client capabilities in that request's own `_meta` envelope (see
 * RESEARCH.md) — so `@modelcontextprotocol/server`'s `createMcpHandler`
 * already implements the full 2026-07-28 dispatch (including the optional
 * `server/discover` capability probe) from a per-request server factory.
 * `legacy: 'reject'` is passed deliberately: this responder only ever serves
 * modern-envelope traffic, and rejects anything the legacy responder should
 * have handled instead — the routing decision between the two paths
 * (an `isLegacyRequest`-style check) is the next checklist item's
 * `continuum()` wrapper, not this module's job.
 *
 * `createServer` intentionally mirrors `LegacyHandshakeOptions.createServer`:
 * a single no-argument factory called once per serving unit. Keeping the two
 * options shapes identical is what lets the future `continuum()` wrapper
 * accept one tool/resource registration function and hand it to both
 * responders unchanged, instead of maintaining two divergent registration
 * call sites.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createMcpHandler, type McpServer, type Server } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";

export interface StatelessResponderOptions {
  /**
   * Builds a fresh `McpServer` (or low-level `Server`) for one stateless
   * request/response exchange. Called once per request — there is no
   * connection to keep alive between calls, unlike the legacy responder's
   * once-per-session factory.
   */
  createServer: () => McpServer | Server;
  /** Reporting-only hook for out-of-band errors; never alters the response. */
  onerror?: (error: Error) => void;
}

export interface StatelessResponder {
  /** Handles one stateless HTTP request (POST) for the `/mcp` endpoint. */
  handleRequest(req: IncomingMessage, res: ServerResponse, parsedBody?: unknown): Promise<void>;
  /** Tears down any in-flight exchanges. Holds nothing between requests otherwise. */
  close(): Promise<void>;
}

export function createStatelessResponder(options: StatelessResponderOptions): StatelessResponder {
  const handler = createMcpHandler(() => options.createServer(), {
    legacy: "reject",
    onerror: options.onerror,
  });

  return {
    handleRequest: toNodeHandler(handler),
    close: () => handler.close(),
  };
}
