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

## License

MIT — see [`LICENSE`](./LICENSE) (points to the root [`../LICENSE`](../LICENSE)).
