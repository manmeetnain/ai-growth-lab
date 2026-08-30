/**
 * Shared Bearer-token auth gate for Continuum's raw `node:http` handlers —
 * RESEARCH.md's "auth header differences between spec versions" edge case.
 *
 * Grounded in both installed SDK generations' actual source, not guessed:
 *
 * - The wire convention is identical between the two spec generations. Both
 *   read an `Authorization: Bearer <token>` request header and, on failure,
 *   answer with a `WWW-Authenticate: Bearer error="...",
 *   error_description="...", scope="...", resource_metadata="..."` header,
 *   a matching HTTP status (401 `invalid_token`, 403 `insufficient_scope`,
 *   500 `server_error`, 400 anything else), and a JSON
 *   `{ error, error_description }` body — see
 *   `@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js`
 *   (legacy) and `@modelcontextprotocol/server`'s `verifyBearerToken` /
 *   `bearerAuthChallengeResponse` (modern): same header names, same
 *   challenge shape, same status codes.
 * - What actually differs is each generation's *calling convention*, not the
 *   wire format: the legacy `requireBearerAuth` is Express middleware
 *   (`(req, res, next)` over an Express request/response with `req.auth`,
 *   `res.status().json()`), and the modern `requireBearerAuth` is
 *   fetch-standard (`(request: Request) => Promise<AuthInfo | Response>`).
 *   Neither matches the raw `node:http` `IncomingMessage`/`ServerResponse`
 *   pair Continuum's `handleRequest` actually receives — and since auth has
 *   to apply uniformly *before* the legacy/modern routing decision, not
 *   divergently per path, reusing either SDK's own helper as-is isn't an
 *   option even if the runtime shapes matched.
 * - Both generations' `AuthInfo` shape (`token`, `clientId`, `scopes`,
 *   `expiresAt`, ...) is structurally identical, so one `verifyAccessToken`
 *   implementation already serves both.
 *
 * This module is that raw-`node:http` gate, speaking the one wire
 * convention both SDKs already agree on, so `continuum()` can apply it once
 * ahead of `isLegacyRequest` instead of maintaining two divergent auth code
 * paths for the two generations.
 */
import type { IncomingMessage, ServerResponse } from "node:http";

/** Structurally identical to both SDK generations' own `AuthInfo` type. */
export interface AuthInfo {
  token: string;
  clientId: string;
  scopes: string[];
  expiresAt?: number;
  extra?: Record<string, unknown>;
}

export interface AuthVerifier {
  /** Resolves the verified `AuthInfo` for `token`, or rejects/throws if it's invalid. */
  verifyAccessToken(token: string): Promise<AuthInfo>;
}

export interface BearerAuthOptions {
  verifier: AuthVerifier;
  /** Every scope here must be present on the token, or the request is rejected as `insufficient_scope`. */
  requiredScopes?: string[];
  /** Advertised in the `WWW-Authenticate` challenge per RFC 9728, so a rejected client can discover the Authorization Server. */
  resourceMetadataUrl?: string;
}

type OAuthErrorCode = "invalid_token" | "insufficient_scope" | "server_error" | "invalid_request";

class BearerAuthError extends Error {
  constructor(
    public readonly errorCode: OAuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BearerAuthError";
  }
}

function buildWwwAuthenticateHeader(
  errorCode: string,
  description: string,
  requiredScopes: string[],
  resourceMetadataUrl?: string,
): string {
  let header = `Bearer error="${errorCode}", error_description="${description}"`;
  if (requiredScopes.length > 0) {
    header += `, scope="${requiredScopes.join(" ")}"`;
  }
  if (resourceMetadataUrl) {
    header += `, resource_metadata="${resourceMetadataUrl}"`;
  }
  return header;
}

function statusForErrorCode(code: OAuthErrorCode): number {
  switch (code) {
    case "invalid_token":
      return 401;
    case "insufficient_scope":
      return 403;
    case "server_error":
      return 500;
    default:
      return 400;
  }
}

function sendChallenge(res: ServerResponse, error: BearerAuthError, options: BearerAuthOptions): void {
  const status = statusForErrorCode(error.errorCode);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (error.errorCode === "invalid_token" || error.errorCode === "insufficient_scope") {
    headers["WWW-Authenticate"] = buildWwwAuthenticateHeader(
      error.errorCode,
      error.message,
      options.requiredScopes ?? [],
      options.resourceMetadataUrl,
    );
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify({ error: error.errorCode, error_description: error.message }));
}

/**
 * Verifies the `Authorization` header of one raw `node:http` request against
 * `options`. On success, resolves the verified `AuthInfo` and writes
 * nothing to `res`. On failure, writes the matching WWW-Authenticate
 * challenge/status/body directly to `res` and resolves `undefined` — the
 * caller must stop and not run its own `handleRequest` whenever this
 * resolves `undefined` (mirroring `next()` not being called in the Express
 * version this is modeled on).
 */
export async function authenticateBearerRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: BearerAuthOptions,
): Promise<AuthInfo | undefined> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new BearerAuthError("invalid_token", "Missing Authorization header");
    }
    const [type, token] = authHeader.split(" ");
    if (type?.toLowerCase() !== "bearer" || !token) {
      throw new BearerAuthError("invalid_token", "Invalid Authorization header format, expected 'Bearer TOKEN'");
    }

    const authInfo = await options.verifier.verifyAccessToken(token);

    const requiredScopes = options.requiredScopes ?? [];
    if (requiredScopes.length > 0 && !requiredScopes.every((scope) => authInfo.scopes.includes(scope))) {
      throw new BearerAuthError("insufficient_scope", "Insufficient scope");
    }

    if (typeof authInfo.expiresAt !== "number" || Number.isNaN(authInfo.expiresAt)) {
      throw new BearerAuthError("invalid_token", "Token has no expiration time");
    }
    if (authInfo.expiresAt < Date.now() / 1000) {
      throw new BearerAuthError("invalid_token", "Token has expired");
    }

    return authInfo;
  } catch (error) {
    if (error instanceof BearerAuthError) {
      sendChallenge(res, error, options);
      return undefined;
    }
    sendChallenge(res, new BearerAuthError("server_error", "Internal Server Error"), options);
    return undefined;
  }
}
