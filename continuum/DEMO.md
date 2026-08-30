# Demo script — 90 seconds, numbers on screen, no narration

Per CAPSTONE.md's "The demo" section: the numbers do the persuading, not a voiceover. Every
number and line of output below is real, pulled from this repo's own README, COMPATIBILITY.md,
and a live `npm test` run — nothing here is illustrative or rounded up. Recording (screen capture,
cuts, captions, export) is a human task; this is the shot-by-shot list to record against.

Suggested format: silent screen capture, terminal + editor only, monospace on-screen captions
(no talking head, no music needed but a subtle track is fine), 1920x1080, terminal font size large
enough to read at 720p.

## Pre-recording setup (not part of the 90s, do once before hitting record)

- `cd continuum && npm install && npm run build` — do this before recording so Shot 3's `npm test`
  isn't waiting on a cold install.
- Have two terminal tabs ready: one for the "before" server (plain SDK, no Continuum), one for the
  wrapped server + probes.
- Have `continuum/README.md`'s before/after code block open in an editor, both halves visible or
  one scroll away.
- Zoom terminal font to something legible on a 720p export (14pt+).

## Shot list

**[0:00–0:08] Cold open — the stat, full screen, nothing else**

Full-screen text card (no terminal yet):

```
7,850 MCP servers scanned right after the 2026-07-28 spec shipped.

90.8% not ready.
Exactly 1 passing every check.
```

Source caption, small, bottom corner: `mcp-spec-check`. Hold 8 seconds — this number is the entire
hook, per CAPSTONE.md.

**[0:08–0:20] The break — a plain server failing the new spec**

Cut to terminal. Start the "before" server from `continuum/README.md`'s first code block (plain
`@modelcontextprotocol/sdk` server, legacy-only transport, no Continuum import) — no need to type
it live, have it saved as a scratch file and just run it:

```
$ node before-server.js
listening on :3000
```

Second pane: fire a stateless `2026-07-28`-style request at it (e.g. `runModernClientProbe`
against that same plain server, or a curl posting a `server/discover`-shaped body with no prior
`initialize`). Let the failure print on screen:

```
✗ server/discover — connection failed: no session, no initialize handshake
```

Caption overlay: `Old servers. New clients. No path between them.`

**[0:20–0:38] The fix — one import, side by side**

Cut to the editor with `continuum/README.md`'s before/after blocks. Scroll or split-screen so
"before" (raw `StreamableHTTPServerTransport`) sits next to "after" (`continuum({ createLegacyServer,
createModernServer })`). Highlight (cursor or box) exactly three things in the "after" block, in
order:

1. `import { continuum } from "mcp-continuum";`
2. `registerHandlers` — unchanged, called from both factories
3. `wrapper.handleRequest(req, res, parsedBody)` replacing the raw transport call

Caption overlay: `Same tool/resource logic. Not duplicated. Not rewritten.`

**[0:38–0:58] The proof — both probes, one server, real round trip**

Cut to terminal. Run the actual verification snippet from `continuum/README.md`'s "Verify it
works" section against the now-wrapped server:

```
$ node verify.js
true true
```

Then immediately cut to the full step-by-step report (not just the boolean) — run with
`console.log(JSON.stringify(legacy.steps))` or equivalent so the individual passing steps are
visible on screen, e.g.:

```
legacy:  initialize ✓ → notifications/initialized ✓ → tools/call ✓
modern:  server/discover ✓ → tools/call ✓
```

Caption overlay: `Same wrapped server. Same tool. Both specs, real round trip.`

**[0:58–1:14] The receipts — real servers, not a toy example**

Cut to `continuum/COMPATIBILITY.md`'s table (scroll to show all 4 rows) for 3-4 seconds, then cut
to terminal and run the real test suite live:

```
$ npm test
...
# tests 55
# pass 55
# fail 0
```

Caption overlay, timed to the table: `4 real @modelcontextprotocol/server-* packages. Not a demo
server — server-everything, sequential-thinking, filesystem, memory.`

**[1:14–1:26] The hard proof — cross-spec state, not just wire compatibility**

Full-screen text card, the memory worked-example claim from COMPATIBILITY.md, verbatim:

```
A simulated 2025-11-25 client creates an entity.
A simulated 2026-07-28 client reads it back.

Same wrapped server. Same on-disk state. Both specs.
```

Optional: 2-3 seconds of the actual `memory.integration.test.ts` assertion on screen (the
`create_entities` call under `runLegacyClientProbe` followed by `read_graph` under
`runModernClientProbe` finding `"Continuum"`), for anyone who pauses the frame.

**[1:26–1:30] Close — the ask**

Full-screen text card:

```
mcp-continuum
One server. Both specs. Zero-downtime migration.

github.com/manmeetnain/ai-growth-lab/tree/main/continuum
```

## Numbers that must appear on screen (checklist for editing)

- [ ] 7,850 servers scanned / 90.8% not ready / 1 passing every check (cold open)
- [ ] `true true` — both probes passing (proof shot)
- [ ] `55 / 55` tests passing (receipts shot)
- [ ] `4` real MCP server packages named on screen (receipts shot)
- [ ] The exact package names: `server-everything`, `server-sequential-thinking`,
      `server-filesystem`, `server-memory`
- [ ] The cross-spec memory claim, verbatim, not paraphrased

## What NOT to include

- No narration/voiceover — CAPSTONE.md is explicit that the numbers should do the persuading.
- No mention of anything below ROADMAP.md's launch gate (RFC, registries, npm publish, socials) —
  this script only stages editing raw footage of what's already built and merged.
- No fabricated or rounded stats — every figure above traces to README.md, COMPATIBILITY.md, or a
  live `npm test` run; if a number in this file ever stops matching those sources, fix this file,
  not the other way around.
