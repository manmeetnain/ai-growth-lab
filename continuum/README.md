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

Both responders share the same `createServer: () => McpServer`-per-unit options shape on
purpose, so the `continuum()` wrapper that routes between the two (the next checklist item —
see [`../ROADMAP.md`](../ROADMAP.md)) can hand one tool/resource registration function to
both instead of maintaining two divergent registration call sites.

## License

MIT — see [`LICENSE`](./LICENSE) (points to the root [`../LICENSE`](../LICENSE)).
