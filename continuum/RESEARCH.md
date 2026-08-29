# Continuum — spec/RFC research and SDK decision

Output of build-pipeline checklist item 1 (ROADMAP.md): read the MCP 2026-07-28 spec diff and
Microsoft RFC #2597 closely enough to restate the dual-stack pattern from memory, and pick the
exact TS SDK/version to target. This file is that restatement + decision, kept here so later
pipeline runs (which start with no memory of this one) don't have to re-derive it.

## What changed in the 2026-07-28 spec (vs. 2025-11-25)

Source: MCP blog, "The 2026-07-28 Specification."

- **Sessions and the handshake are gone.** No more `initialize` / `notifications/initialized`
  exchange, no more `Mcp-Session-Id` header. Every request is now self-contained: protocol
  version, client identity, and client capabilities travel in that request's own `_meta`, so a
  server needs no shared session storage and a request can land on any instance behind a load
  balancer.
- **`server/discover`** is a new, *optional* RPC a client can call up front to learn server
  capabilities — it's a discovery convenience, not a replacement session negotiation.
- **Header-based routing:** requests now carry `Mcp-Method` and `Mcp-Name` HTTP headers, so
  gateways/rate limiters can route on headers without parsing the JSON body.
- **MRTR (multi round-trip requests):** a server can ask for user input mid-call by returning
  `resultType: "input_required"`; the client retries the original call with `inputResponses`
  filled in, instead of the server holding a bidirectional stream open.
- **Three primitives deprecated, not removed:** Roots, Sampling, Logging. Still functional — a
  dual-stack server has to keep tolerating them, not strip them.
- Legacy HTTP+SSE transport is also deprecated.
- **Grace period:** minimum 12 months from ship date before old clients/servers are cut off.

## The dual-stack pattern (Microsoft `agent-governance-toolkit` RFC #2597)

Source: github.com/microsoft/agent-governance-toolkit#2597 (status at time of reading: **open,
high priority, RFC phase, no PR yet, assignee Jack Batzner** — confirms CAPSTONE.md's framing that
nobody has shipped this yet).

The RFC proposes a **version-aware MCP compatibility layer** with two parallel flows living side
by side in the same server process:

1. **Legacy path (`2025-11-25`)** — left completely untouched: the existing session-based
   lifecycle, `initialize` → protocol-version validation → `notifications/initialized`, session
   state kept server-side for the life of the connection.
2. **Stateless path (`2026-07-28`)** — a *separate* handler entry point: no session negotiation,
   each request self-contained (protocol version + identity + capabilities in `_meta`), optionally
   preceded by a `server/discover` call.
3. A routing layer in front of both **identifies whether the peer is legacy or stateless**
   (`isLegacyRequest()`-style: presence of `Mcp-Session-Id` / an `initialize` call marks legacy;
   its absence plus new-spec `_meta`/headers marks stateless) and dispatches accordingly.
4. Both paths **normalize into the same internal request shape** the server's existing
   tool/resource handlers already consume — so the actual tool logic is written once and never
   touched. Only the transport/handshake layer branches.

This is exactly the shape CAPSTONE.md commits to, and it's corroborated independently by
`fastmcp` issue #300 (github.com/punkpeye/fastmcp#300), which hits the same wall migrating fastmcp
to the v2 SDK packages and lands on the same recommendation: *"keep the existing sessionful HTTP
path unchanged while adding a separate `createMcpHandler` entry... leveraging the SDK's legacy
compatibility shim so handlers written once can serve both protocol versions."* Two independent
sources converging on the same pattern is a strong signal Continuum should implement it exactly as
described rather than inventing something novel.

Edge cases both paths must handle at the wrapper level (not by touching server logic): the three
deprecated-but-functional primitives above, error codes that are remapped between spec versions,
and differing auth header conventions between the two generations.

## SDK decision

Checked npm (`registry.npmjs.org`) directly rather than guessing:

| Package | Latest | Role |
|---|---|---|
| `@modelcontextprotocol/sdk` | **1.30.0** | Monolithic, pre-split SDK. This is what real-world "legacy" servers are built on (fastmcp #300 confirms servers migrate *from* `@modelcontextprotocol/sdk@1.x`) — matches the population the 90.8%-not-ready registry scan is describing. |
| `@modelcontextprotocol/core` | **2.0.0** | New split package: shared Zod schemas for the 2026-07-28 spec (+ OAuth/OpenID). |
| `@modelcontextprotocol/server` | **2.0.0** | New split package: server primitives for the 2026-07-28 spec. Depends on `core@2.0.0`. |
| `@modelcontextprotocol/node` | **2.0.0** | New split package: Node HTTP middleware adapter for the new spec. |

**Decision: target `@modelcontextprotocol/sdk@1.30.0` for the legacy path, and
`@modelcontextprotocol/core@2.0.0` + `@modelcontextprotocol/server@2.0.0` (+ `@modelcontextprotocol/node@2.0.0`
where an HTTP adapter is needed) for the new stateless path**, inside one Continuum wrapper — not a
single unified SDK, because no single package currently speaks both generations at once. This
mirrors the fastmcp RFC's own recommended fix rather than inventing a different integration
strategy, per CAPSTONE.md's "build the thing the RFC already designed" framing.

Dependency note: `sdk@1.30.0` accepts `zod ^3.25 || ^4.0` as a peer; `core/server@2.0.0` require
`zod ^4.2.0`. Continuum should pin its own `zod` dependency to `^4.2.0` so both SDK generations
resolve against the same installed zod and npm doesn't end up dual-installing zod 3 and zod 4.

## Scope this sets up for the next checklist item

Scaffold `continuum/` (`package.json`, `tsconfig.json`, `src/`) with:
- `@modelcontextprotocol/sdk@^1.30.0` and `@modelcontextprotocol/core@^2.0.0` /
  `@modelcontextprotocol/server@^2.0.0` / `@modelcontextprotocol/node@^2.0.0` as dependencies,
- `zod@^4.2.0` pinned,
- TypeScript targeting Node's current LTS module resolution (`"module": "NodeNext"`), since both
  SDK generations ship ESM.
