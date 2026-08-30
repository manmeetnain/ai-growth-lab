import assert from "node:assert/strict";
import { createServer, type Server as HttpServer } from "node:http";
import { test } from "node:test";
import { authenticateBearerRequest, type AuthInfo, type AuthVerifier } from "./auth.js";

function makeVerifier(overrides: Partial<AuthInfo> = {}): AuthVerifier {
  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      if (token !== "valid-token") {
        throw new Error("unknown token");
      }
      return {
        token,
        clientId: "test-client",
        scopes: ["mcp"],
        expiresAt: Date.now() / 1000 + 3600,
        ...overrides,
      };
    },
  };
}

async function startAuthGateHttpServer(
  verifier: AuthVerifier,
  requiredScopes?: string[],
  resourceMetadataUrl?: string,
): Promise<{ url: string; http: HttpServer }> {
  const http = createServer(async (req, res) => {
    const authInfo = await authenticateBearerRequest(req, res, { verifier, requiredScopes, resourceMetadataUrl });
    if (!authInfo) {
      return; // authenticateBearerRequest already wrote the challenge response.
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ authInfo }));
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const address = http.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected an AddressInfo from a TCP listener");
  }
  return { url: `http://127.0.0.1:${address.port}/mcp`, http };
}

test("authenticateBearerRequest: a valid Bearer token authenticates and reaches the wrapped handler", async () => {
  const { url, http } = await startAuthGateHttpServer(makeVerifier());
  try {
    const res = await fetch(url, { headers: { Authorization: "Bearer valid-token" } });
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.authInfo.clientId, "test-client");
  } finally {
    http.close();
  }
});

test("authenticateBearerRequest: a missing Authorization header is rejected 401 with an invalid_token challenge", async () => {
  const { url, http } = await startAuthGateHttpServer(makeVerifier());
  try {
    const res = await fetch(url);
    assert.equal(res.status, 401);
    const challenge = res.headers.get("www-authenticate");
    assert.ok(challenge?.includes('error="invalid_token"'));
    const body = (await res.json()) as any;
    assert.equal(body.error, "invalid_token");
  } finally {
    http.close();
  }
});

test("authenticateBearerRequest: a malformed Authorization header (not 'Bearer <token>') is rejected 401", async () => {
  const { url, http } = await startAuthGateHttpServer(makeVerifier());
  try {
    const res = await fetch(url, { headers: { Authorization: "Basic dXNlcjpwYXNz" } });
    assert.equal(res.status, 401);
    const challenge = res.headers.get("www-authenticate");
    assert.ok(challenge?.includes('error="invalid_token"'));
  } finally {
    http.close();
  }
});

test("authenticateBearerRequest: a token the verifier rejects is answered 500 server_error, not a raw throw", async () => {
  const { url, http } = await startAuthGateHttpServer(makeVerifier());
  try {
    const res = await fetch(url, { headers: { Authorization: "Bearer not-a-real-token" } });
    assert.equal(res.status, 500);
    const body = (await res.json()) as any;
    assert.equal(body.error, "server_error");
  } finally {
    http.close();
  }
});

test("authenticateBearerRequest: a token missing a required scope is rejected 403 with an insufficient_scope challenge naming the required scopes", async () => {
  const { url, http } = await startAuthGateHttpServer(makeVerifier({ scopes: ["other"] }), ["mcp"]);
  try {
    const res = await fetch(url, { headers: { Authorization: "Bearer valid-token" } });
    assert.equal(res.status, 403);
    const challenge = res.headers.get("www-authenticate");
    assert.ok(challenge?.includes('error="insufficient_scope"'));
    assert.ok(challenge?.includes('scope="mcp"'));
  } finally {
    http.close();
  }
});

test("authenticateBearerRequest: an expired token is rejected 401 invalid_token", async () => {
  const { url, http } = await startAuthGateHttpServer(makeVerifier({ expiresAt: Date.now() / 1000 - 60 }));
  try {
    const res = await fetch(url, { headers: { Authorization: "Bearer valid-token" } });
    assert.equal(res.status, 401);
    const body = (await res.json()) as any;
    assert.ok(body.error_description.includes("expired"));
  } finally {
    http.close();
  }
});

test("authenticateBearerRequest: a token with no expiresAt is rejected 401 invalid_token", async () => {
  const { url, http } = await startAuthGateHttpServer(makeVerifier({ expiresAt: undefined }));
  try {
    const res = await fetch(url, { headers: { Authorization: "Bearer valid-token" } });
    assert.equal(res.status, 401);
    const body = (await res.json()) as any;
    assert.ok(body.error_description.includes("no expiration"));
  } finally {
    http.close();
  }
});

test("authenticateBearerRequest: the WWW-Authenticate challenge includes resource_metadata when configured", async () => {
  const { url, http } = await startAuthGateHttpServer(
    makeVerifier(),
    undefined,
    "https://example.com/.well-known/oauth-protected-resource",
  );
  try {
    const res = await fetch(url); // no Authorization header at all
    assert.equal(res.status, 401);
    const challenge = res.headers.get("www-authenticate");
    assert.ok(challenge?.includes("resource_metadata=\"https://example.com/.well-known/oauth-protected-resource\""));
  } finally {
    http.close();
  }
});
