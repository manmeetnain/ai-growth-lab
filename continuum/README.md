# Continuum (`mcp-continuum`)

**A registry-wide scan of 7,850 MCP servers right after the 2026-07-28 spec shipped found 90.8%
not ready — and exactly 1 passing every check.** ([`mcp-spec-check`](https://github.com/Roee-Tsur/mcp-spec-check))

The 2026-07-28 spec removed the `initialize`/`Mcp-Session-Id` handshake entirely and replaced it
with a stateless `server/discover` flow. Old (`2025-11-25`) and new (`2026-07-28`) clients can't
talk to the same naively-migrated server — you either keep serving your existing users or adopt
the new spec, not both, until now. There's a 12-month grace period, but during it a server has to
answer both, or it breaks someone.

Continuum is a dual-stack compatibility middleware: it wraps a server you already have so it
answers **both** specs at once, without touching your tool/resource logic — plus a verification
probe that proves it, using a simulated client of each generation against your real server.

## One import, before/after

**Before** — a typical `@modelcontextprotocol/sdk@1.x` server, listening only for the legacy
handshake. A `2026-07-28` client sends a self-contained request with no `initialize` call first;
this server has no code path for that and the connection fails.

```ts
import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

function registerHandlers(server: McpServer) {
  server.registerTool("get-sum", { /* ... */ }, async (args) => { /* ... */ });
  return server;
}

const server = registerHandlers(new McpServer({ name: "my-server", version: "1.0.0" }));
const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => crypto.randomUUID() });
await server.connect(transport);

http.createServer((req, res) => transport.handleRequest(req, res)).listen(3000);
```

**After** — same `registerHandlers`, unchanged, called once per SDK generation. One
`continuum()` wrapper replaces the raw transport wiring; both spec generations now complete a
real round trip against the same endpoint.

```ts
import http from "node:http";
import { continuum } from "mcp-continuum";
import { McpServer as LegacyMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpServer as ModernMcpServer } from "@modelcontextprotocol/server";

function registerHandlers(server: LegacyMcpServer | ModernMcpServer) {
  server.registerTool("get-sum", { /* ... */ }, async (args) => { /* ... */ });
  return server;
}

const wrapper = continuum({
  // One factory per SDK generation — see "Why two factories?" below.
  createLegacyServer: () => registerHandlers(new LegacyMcpServer({ name: "my-server", version: "1.0.0" })),
  createModernServer: () => registerHandlers(new ModernMcpServer({ name: "my-server", version: "1.0.0" })),
});

http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  const parsedBody = raw.length > 0 ? JSON.parse(raw) : undefined;
  await wrapper.handleRequest(req, res, parsedBody);
}).listen(3000);
```

Nothing about `registerHandlers` changed. The only new code is the wrapper and the second
factory — your actual tool logic is written once and never duplicated.

## Verify it works

Don't take the wrapping on faith — point the probe at your own running server. Each probe drives
a real simulated client over HTTP against a URL: `runLegacyClientProbe` does
`initialize` → `notifications/initialized` → `tools/call` the way a real `2025-11-25` client
would; `runModernClientProbe` does the equivalent stateless `2026-07-28` round trip. Both return
a step-by-step pass/fail report instead of a boolean, so a failure tells you exactly which leg of
the handshake broke.

```ts
import { runLegacyClientProbe, runModernClientProbe } from "mcp-continuum";

const [legacy, modern] = await Promise.all([
  runLegacyClientProbe({ url: "http://localhost:3000/mcp", toolName: "get-sum", toolArguments: { a: 12, b: 30 } }),
  runModernClientProbe({ url: "http://localhost:3000/mcp", toolName: "get-sum", toolArguments: { a: 12, b: 30 } }),
]);

console.log(legacy.ok, modern.ok); // true true — same server, same tool, both specs
```

Credit where due: `mcp-spec-check` (linked above) is the tool that surfaced this problem
registry-wide, and remains the right tool for scanning *many* servers read-only. Continuum's
probe is narrower and complementary — it proves *your* server, wrapped, round-trips real tool
calls on both specs, not just that it answers the handshake correctly.

## Install

Not yet published to npm. Once cloned:

```bash
cd continuum
npm install
npm run build
```

## Development

```bash
npm test   # builds, then runs the test suite (node --test) against dist/
```

## How the wrapping works

`continuum()` implements the dual-stack pattern from Microsoft's `agent-governance-toolkit` RFC
#2597 (open at time of writing, no reference implementation) exactly as specified there, rather
than inventing a different shape — see [`RESEARCH.md`](./RESEARCH.md) for the full spec/RFC
research this build is grounded in:

- `createLegacyHandshakeResponder` (`src/legacy.ts`) — the legacy `2025-11-25`
  `initialize`/`Mcp-Session-Id` handshake path, multiplexing concurrent sessions over one HTTP
  endpoint on top of the SDK's own `StreamableHTTPServerTransport`, left otherwise untouched.
- `createStatelessResponder` (`src/modern.ts`) — the new `2026-07-28` stateless path: every
  request carries its own protocol version, client identity, and capabilities in that request's
  own `_meta` envelope (no handshake, no session state), built on
  `@modelcontextprotocol/server`'s `createMcpHandler` in `legacy: 'reject'` mode so this
  responder only ever serves modern-envelope traffic.
- `continuum()` (`src/continuum.ts`) — wires both of the above behind one HTTP endpoint. Routes
  each request with an `isLegacyRequest()`-style check (does it carry a session id this instance
  already issued, or is it an `initialize` call? → legacy; otherwise → modern) and never touches
  either responder's own logic to do it.

**Why two factories?** Both SDK generations' `McpServer` classes expose the same
`registerTool(name, config, handler)` surface, so `registerHandlers` above is written once and
called from inside both factories — the actual tool/resource logic is never duplicated, only the
two-line server construction is. A single shared factory isn't possible at the type level: the
legacy and modern `McpServer` are distinct classes from different SDK packages with no common
base type (documented in `src/continuum.ts`).

## Edge cases handled

See each file's doc comment for the full, SDK-grounded reasoning:

- **Remapped error codes** (`src/errors.ts`): `toLegacyCompatibleError`/`wrapForLegacyErrors`
  normalize a modern-only error code (`MissingRequiredClientCapability`,
  `UnsupportedProtocolVersion`) thrown from shared tool/resource logic into the nearest
  legacy-legal JSON-RPC code before it reaches a `2025-11-25` client, preserving the original
  code under `data.continuumOriginalErrorCode`.
- **Auth header differences** (`src/auth.ts`): `authenticateBearerRequest` is one raw-`node:http`
  Bearer-token gate — both spec generations already agree on the same
  `Authorization`/`WWW-Authenticate` wire convention, so `continuum()`'s optional `auth` option
  applies it once, ahead of the legacy/modern routing decision, instead of two divergent
  per-generation auth paths.
- **Deprecated primitives** (Roots, Sampling, Logging): both SDK generations already keep these
  working without any Continuum involvement; `logging/setLevel` is verified round-tripping
  through the legacy path in `continuum.test.ts`.

## Proven against real servers

Continuum has been applied to four real, published `@modelcontextprotocol/server-*` packages
(`server-everything`, `server-sequential-thinking`, `server-filesystem`, `server-memory`), each
with both probes passing a full tool-call round trip end to end — including a case where a
simulated legacy client writes state and a simulated modern client reads it back through the
same wrapped server. Full results, per-server details, and what each one establishes:
[`COMPATIBILITY.md`](./COMPATIBILITY.md).

## Status

Not yet published to npm. See [`../CAPSTONE.md`](../CAPSTONE.md) for the full design and
motivation, and follow [`../ROADMAP.md`](../ROADMAP.md)'s "Build pipeline checklist" for current
build status.

## License

MIT — see [`LICENSE`](./LICENSE) (points to the root [`../LICENSE`](../LICENSE)).
