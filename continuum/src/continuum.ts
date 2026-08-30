/**
 * The `continuum()` wrapper: routes one HTTP endpoint between the legacy
 * (`src/legacy.ts`) and stateless (`src/modern.ts`) responders per the RFC
 * #2597 dual-stack pattern — an `isLegacyRequest`-style check decides which
 * path handles a given request, and neither path is touched to make this
 * work (see RESEARCH.md).
 *
 * Ambiguity note (not resolved by CAPSTONE.md, decided here): the legacy and
 * modern responders are each built on a different SDK generation
 * (`@modelcontextprotocol/sdk@1.x`'s `McpServer` vs.
 * `@modelcontextprotocol/server@2.x`'s `McpServer`/`Server`). These are
 * distinct classes with no shared base type, so — unlike the identical
 * `createServer: () => McpServer` *shape* the two responder option types
 * already share — a single factory function cannot literally satisfy both
 * at the type level. `continuum()` therefore takes one factory per
 * generation (`createLegacyServer` / `createModernServer`). Both SDK
 * generations' `McpServer` classes expose the same `registerTool(name,
 * config, handler)` surface (confirmed in legacy.test.ts / modern.test.ts),
 * so in practice a caller writes one registration function and calls it
 * from inside each factory — no tool/resource logic is duplicated, only the
 * two-line server construction is.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createLegacyHandshakeResponder,
  isLegacyHandshakeRequest,
  type LegacyHandshakeOptions,
} from "./legacy.js";
import { createStatelessResponder, type StatelessResponderOptions } from "./modern.js";
import { authenticateBearerRequest, type BearerAuthOptions } from "./auth.js";

export interface ContinuumOptions {
  /** Builds a fresh legacy-generation (`@modelcontextprotocol/sdk@1.x`) `McpServer` per session. */
  createLegacyServer: LegacyHandshakeOptions["createServer"];
  /** Builds a fresh modern-generation (`@modelcontextprotocol/server@2.x`) `McpServer`/`Server` per request. */
  createModernServer: StatelessResponderOptions["createServer"];
  /** Forwarded to the legacy responder. Overridable for tests; defaults to `crypto.randomUUID`. */
  sessionIdGenerator?: LegacyHandshakeOptions["sessionIdGenerator"];
  /** Forwarded to the modern responder as a reporting-only hook for out-of-band errors. */
  onerror?: StatelessResponderOptions["onerror"];
  /**
   * Optional Bearer-token gate applied to every request *before* the
   * legacy/modern routing decision (see auth.ts) — both spec generations
   * agree on the same `Authorization`/`WWW-Authenticate` wire convention, so
   * one gate covers both paths uniformly instead of two divergent ones.
   * Omit to leave the endpoint unauthenticated.
   */
  auth?: BearerAuthOptions;
}

export interface Continuum {
  /**
   * Handles one HTTP request for the shared `/mcp` endpoint, routing it to
   * the legacy or modern responder. `parsedBody` must be the request's
   * already-parsed JSON-RPC body (or `undefined` for a bodyless GET/DELETE)
   * — the routing decision itself needs to inspect it.
   */
  handleRequest(req: IncomingMessage, res: ServerResponse, parsedBody: unknown): Promise<void>;
  /** The same `isLegacyRequest()`-style check `handleRequest` routes on, exposed for callers/tests. */
  isLegacyRequest(req: IncomingMessage, parsedBody: unknown): boolean;
  /** Number of currently live legacy sessions (always 0 on the modern path, which holds none). */
  readonly legacySessionCount: number;
  /** Closes both the legacy responder's live sessions and the modern responder. */
  close(): Promise<void>;
}

export function continuum(options: ContinuumOptions): Continuum {
  const legacy = createLegacyHandshakeResponder({
    createServer: options.createLegacyServer,
    sessionIdGenerator: options.sessionIdGenerator,
  });
  const modern = createStatelessResponder({
    createServer: options.createModernServer,
    onerror: options.onerror,
  });

  function isLegacyRequest(req: IncomingMessage, parsedBody: unknown): boolean {
    return isLegacyHandshakeRequest(req.headers, parsedBody, legacy.hasSession);
  }

  async function handleRequest(req: IncomingMessage, res: ServerResponse, parsedBody: unknown): Promise<void> {
    if (options.auth) {
      const authInfo = await authenticateBearerRequest(req, res, options.auth);
      if (!authInfo) {
        return; // authenticateBearerRequest already wrote the WWW-Authenticate challenge.
      }
    }
    if (isLegacyRequest(req, parsedBody)) {
      await legacy.handleRequest(req, res, parsedBody);
    } else {
      await modern.handleRequest(req, res, parsedBody);
    }
  }

  async function close(): Promise<void> {
    await Promise.all([legacy.close(), modern.close()]);
  }

  return {
    handleRequest,
    isLegacyRequest,
    get legacySessionCount() {
      return legacy.sessionCount;
    },
    close,
  };
}
