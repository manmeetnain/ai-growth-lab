# Continuum (`mcp-continuum`)

Dual-stack compatibility middleware for MCP servers: answer both the legacy `2025-11-25`
`initialize`/`Mcp-Session-Id` handshake and the new `2026-07-28` stateless `server/discover` flow
at once, without rewriting the server's existing tool/resource handlers — plus a verification
probe that proves both a legacy-simulated client and a new-spec client can each complete a full
round trip against it.

Status: early scaffold, not yet published or functional. See [`../CAPSTONE.md`](../CAPSTONE.md)
for the full design and motivation, and [`RESEARCH.md`](./RESEARCH.md) for the spec/RFC research
and SDK version decisions this build targets. Follow [`../ROADMAP.md`](../ROADMAP.md)'s "Build
pipeline checklist" for current build status.

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

Implemented so far:
- `createLegacyHandshakeResponder` (`src/legacy.ts`) — the legacy `2025-11-25`
  `initialize`/`Mcp-Session-Id` handshake path, multiplexing concurrent sessions over one
  HTTP endpoint on top of the SDK's own `StreamableHTTPServerTransport`, left otherwise
  untouched per the RFC #2597 pattern.
- `createStatelessResponder` (`src/modern.ts`) — the new `2026-07-28` stateless path: every
  request carries its own protocol version, client identity, and capabilities in that
  request's own `_meta` envelope (no handshake, no session state), built on
  `@modelcontextprotocol/server`'s `createMcpHandler` in `legacy: 'reject'` mode so this
  responder only ever serves modern-envelope traffic.
- `continuum()` (`src/continuum.ts`) — wires both of the above behind one HTTP endpoint.
  Routes each request with an `isLegacyRequest()`-style check (does it carry a session id
  this instance already issued, or is it an `initialize` call? → legacy; otherwise →
  modern) and never touches either responder's own logic to do it.

  ```ts
  import { continuum } from "mcp-continuum";
  import { McpServer as LegacyMcpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
  import { McpServer as ModernMcpServer } from "@modelcontextprotocol/server";

  const wrapper = continuum({
    // One factory per SDK generation — see the note below on why there are two.
    createLegacyServer: () => registerHandlers(new LegacyMcpServer({ name: "my-server", version: "1.0.0" })),
    createModernServer: () => registerHandlers(new ModernMcpServer({ name: "my-server", version: "1.0.0" })),
  });

  http.createServer((req, res) => {
    // read/parse the body yourself, then:
    wrapper.handleRequest(req, res, parsedBody);
  });
  ```

  Both SDK generations' `McpServer` classes expose the same `registerTool(name, config,
  handler)` surface, so `registerHandlers` above is written once and called from inside
  both factories — the actual tool/resource logic is never duplicated, only the two-line
  server construction is. A single shared factory isn't possible at the type level: the
  legacy and modern `McpServer` are distinct classes from different SDK packages with no
  common base type (documented in `src/continuum.ts`).

## License

MIT — see [`LICENSE`](./LICENSE) (points to the root [`../LICENSE`](../LICENSE)).
