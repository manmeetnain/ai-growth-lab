/**
 * Error-code bridging between the legacy (2025-11-25) and modern (2026-07-28)
 * error vocabularies — one of the "remaining edge cases" RESEARCH.md flags as
 * something both paths must handle at the wrapper level, not by touching
 * either SDK's own dispatcher.
 *
 * Grounded in the two installed SDK generations' actual source, not guessed:
 *
 * - The legacy `ErrorCode` enum (`@modelcontextprotocol/sdk/types.js`) only
 *   defines the five standard JSON-RPC codes (-32700..-32603), the MCP-wide
 *   `UrlElicitationRequired` (-32042), and two SDK-local codes it also reuses
 *   as generic HTTP-transport codes (`ConnectionClosed` -32000,
 *   `RequestTimeout` -32001 — see legacy.ts's own use of -32000/-32001, which
 *   matches the real `StreamableHTTPServerTransport` byte for byte).
 * - The modern `ProtocolErrorCode` enum (`@modelcontextprotocol/server`)
 *   reuses the same five standard codes and the same `UrlElicitationRequired`
 *   (-32042), plus a legacy-compat-only `ResourceNotFound` (-32002) that its
 *   own `ResourceNotFoundError` class never actually throws on the wire
 *   (that class throws `InvalidParams`/-32602 — already a legacy code — and
 *   `-32002` is only recognized on *input* for backwards compatibility with
 *   earlier SDK builds). The two codes with no legacy equivalent at all are
 *   `MissingRequiredClientCapability` (-32021) and `UnsupportedProtocolVersion`
 *   (-32022).
 * - Both dispatchers' *generic* request-handler path (a low-level
 *   `server.setRequestHandler(...)` registration, or a `registerResource`
 *   read callback, which isn't wrapped in any tool-specific try/catch) duck
 *   -type a thrown error the same way: legacy's `shared/protocol.js`
 *   `_onrequest` and modern's per-request handler both do
 *   `Number.isSafeInteger(error.code) ? error.code : InternalError` and
 *   forward `error.data` as-is. So a thrown error's code is *not* silently
 *   dropped by either side — it is forwarded byte for byte, whatever it is.
 *   (`registerTool`'s `tools/call` handler is a separate, tool-specific
 *   exception on the legacy side: it always collapses a thrown error to an
 *   in-band `CallToolResult{isError:true}` text message with no code at
 *   all, by design — that path has no code to bridge in the first place.)
 * - Which is exactly the actual gap: a legacy (2025-11-25) client has no
 *   idea what code -32021 or -32022 means, but the legacy dispatcher will
 *   happily forward either straight from shared tool/resource logic (per
 *   the RFC's "write handlers once, wire into both factories" pattern)
 *   without translating it into something a 2025-11-25 client can actually
 *   interpret.
 *
 * Continuum's fix is therefore one-directional: normalize a thrown error
 * into a real `McpError` before it reaches the legacy dispatcher, remapping
 * the two modern-only codes to the nearest legacy-legal standard JSON-RPC
 * code and preserving the original code under
 * `data.continuumOriginalErrorCode` so nothing is silently lost, only
 * downgraded to a code an existing legacy client already understands. The
 * modern dispatcher needs no equivalent treatment: every code this module
 * remaps is already one the modern `ProtocolErrorCode` vocabulary defines,
 * so a legacy `McpError` thrown by shared logic reaches a modern client
 * meaningfully as-is.
 */
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { ProtocolErrorCode } from "@modelcontextprotocol/server";

/**
 * The two `ProtocolErrorCode` members with no member in the legacy
 * `ErrorCode` enum, mapped to the nearest legacy-legal standard JSON-RPC
 * code: both describe a request the server can't honor as sent — a missing
 * capability or an unsupported protocol version — which from a legacy
 * (2025-11-25) client's point of view is exactly what `InvalidRequest`
 * (-32600) already means.
 */
export const LEGACY_SAFE_ERROR_CODE: ReadonlyMap<number, number> = new Map([
  [ProtocolErrorCode.MissingRequiredClientCapability, ErrorCode.InvalidRequest],
  [ProtocolErrorCode.UnsupportedProtocolVersion, ErrorCode.InvalidRequest],
]);

const LEGACY_KNOWN_CODES: ReadonlySet<number> = new Set(
  Object.values(ErrorCode).filter((value): value is number => typeof value === "number"),
);

/**
 * Converts any thrown value into an `McpError` the legacy dispatcher will
 * pass through unchanged:
 *
 * - Already an `McpError` → returned as-is; the legacy dispatcher already
 *   handles it correctly on its own.
 * - Any other error-like value with a numeric `.code` (a modern
 *   `ProtocolError`, an `SdkError`, or any object shaped that way) whose
 *   code the legacy `ErrorCode` enum also defines → wrapped in a genuine
 *   `McpError` with that same code/message/data, unchanged.
 * - The same, but with a code the legacy vocabulary has no member for →
 *   remapped via `LEGACY_SAFE_ERROR_CODE` (falling back to `InternalError`
 *   for any future code this table doesn't yet cover), with the original
 *   code preserved under `data.continuumOriginalErrorCode`.
 * - A plain `Error`/unknown value with no numeric `.code` at all →
 *   `McpError(InternalError, message)`, matching the fallback the legacy
 *   dispatcher already applies on its own (made explicit and reusable here,
 *   not new behavior).
 */
export function toLegacyCompatibleError(error: unknown): McpError {
  if (error instanceof McpError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const rawCode = (error as { code?: unknown } | null)?.code;
  const rawData = (error as { data?: unknown } | null)?.data;

  if (typeof rawCode !== "number" || !Number.isSafeInteger(rawCode)) {
    return new McpError(ErrorCode.InternalError, message);
  }

  if (LEGACY_KNOWN_CODES.has(rawCode)) {
    return new McpError(rawCode, message, rawData);
  }

  const legacyCode = LEGACY_SAFE_ERROR_CODE.get(rawCode) ?? ErrorCode.InternalError;
  const data =
    rawData !== undefined && typeof rawData === "object" && rawData !== null
      ? { ...rawData, continuumOriginalErrorCode: rawCode }
      : { continuumOriginalErrorCode: rawCode };
  return new McpError(legacyCode, message, data);
}

/**
 * Wraps a tool/resource/prompt handler so any error it throws is normalized
 * via {@link toLegacyCompatibleError} before the legacy `McpServer`'s own
 * dispatcher sees it.
 *
 * Intended for the shared registration function a Continuum-wrapped
 * server's caller writes once and calls from both the legacy and modern
 * `createServer` factories (see continuum.ts's doc comment on that pattern):
 * wrap only the copy registered on the *legacy* factory. The modern
 * factory's copy needs no wrapping — the modern dispatcher already forwards
 * a thrown error's code/data as-is (see this module's doc comment) — so
 * wrapping both would be harmless but redundant.
 */
export function wrapForLegacyErrors<Args extends unknown[], Result>(
  handler: (...args: Args) => Result | Promise<Result>,
): (...args: Args) => Promise<Result> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      throw toLegacyCompatibleError(error);
    }
  };
}
