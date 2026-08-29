# Capstone: Continuum — MCP Dual-Stack Compatibility Layer

(Working name: **Continuum**. Package name candidate: `mcp-continuum`. Tagline: "One server. Both
specs. Zero-downtime migration.")

Chosen 2026-08-29, replacing the earlier agent-evals-toolkit idea (kept below under
Alternatives — same folder, same strategy, different flagship).

## The idea

MCP shipped its largest breaking change ever on **2026-07-28**: protocol-level sessions removed,
the `initialize` handshake gone, new required headers, a shift to a stateless `server/discover`
flow, several error codes remapped, three primitives deprecated. Servers get a **12-month grace
period** to migrate, but old (`2025-11-25`) and new (`2026-07-28`) clients are not compatible with
each other — a server has to speak both during that window or it breaks someone.

Continuum is an open-source middleware library + CLI that a server maintainer drops into an
existing MCP server to make it answer **both** the legacy `initialize` handshake and the new
`server/discover` flow at once — without rewriting the server's actual tool/resource logic — plus
a verification probe that proves both a legacy-simulated client and a new-spec client can each
complete a full round trip against it.

## Why this, specifically (grounded, not guessed — see Sources)

- **It's dated, not evergreen — and that's the point.** A public registry scan run right after the
  spec shipped found 7,850 servers checked, **90.8% not ready**, exactly 1 passing every check
  ([mcp-spec-check](https://github.com/Roee-Tsur/mcp-spec-check)). That is a live, quantifiable,
  headline-ready problem happening *this month*, not a perpetual pain point with entrenched
  competitors already occupying it.
- **The exact gap is documented as open, not just hard.** Microsoft's own `agent-governance-toolkit`
  has a public RFC asking the community how to run a dual-stack MCP server during the transition
  window. I read the actual issue: status is *"no tool has been built yet; open RFC awaiting
  approval"* ([Issue #2597](https://github.com/microsoft/agent-governance-toolkit/issues/2597)).
  Existing tools only diagnose (`mcp-spec-check` is a read-only probe) or do mechanical renames (a
  codemod for `.tool()` → `registerTool`). Nobody has shipped the actual reusable compatibility
  layer the RFC is asking for.
- **The hard design work is already spec'd out for us**, which de-risks the build: the RFC
  describes the sanctioned pattern precisely — leave the existing sessionful path untouched, add a
  separate stateless handler entry point, route with an `isLegacyRequest()` check. Continuum is
  "build the thing the RFC already designed," not "invent a novel architecture."
- **Low competitive crowding vs. the evals/security space.** Agent evals (Braintrust, Langfuse,
  Arize, Galileo) and MCP security scanning (Snyk's `agent-scan`, Socket MCP, Cisco's
  `mcp-scanner`) already have funded, resourced players circling them. Nobody funded is working
  the migration-compatibility angle yet.
- **Real runway, not a flash.** The 12-month deprecation grace period means the addressable window
  runs through mid-2027, not just this quarter — long enough to build an audience around it.
- **Unusually concrete outreach hook.** The single highest-leverage move available for this
  capstone isn't a cold DM — it's commenting on a real, open, Microsoft-owned GitHub issue with a
  working solution to the exact thing it's asking for.

## MVP scope (build in ~3-4 weeks)

Target TypeScript first — the official SDK and the popular `fastmcp` framework are both TS, and
that's where the RFC and the migration discussion are happening.

1. **Compatibility middleware**: wraps an existing MCP server so it answers the legacy
   `initialize`/`Mcp-Session-Id` handshake *and* the new `server/discover`/stateless flow,
   normalizing both into the same internal request shape the server's existing tool/resource
   handlers already expect. No rewrite of the server's actual logic required.
2. **Verification probe**: spins up a simulated legacy client and a simulated new-spec client
   against the wrapped server, confirms both connect and complete a real tool-call round trip.
   Credit and link to `mcp-spec-check` rather than duplicating its registry-wide scanning function
   — this is a complementary tool, not a competing one.
3. **Edge-case hardening**: handle the three deprecated primitives, the remapped error codes, and
   auth header differences between spec versions.
4. **One real worked example**: apply Continuum to 3-5 popular open-source MCP servers, publish
   before/after — "this server failed X of the new-spec checks, here's the diff after adding one
   import." This *is* the launch content.
5. **Migration guide README** built around the 90.8%-not-ready stat as the hook.

Explicitly NOT in v1: Python SDK support (add only once TS proves out), a hosted dashboard,
support for hypothetical future spec versions — solve the one transition that exists right now.

## Timeline

- **Week 0 (2-3 days):** read the full spec diff and the RFC thread closely, pick the exact
  TS SDK/version to target, set up the repo (MIT license, README with the stat as the hook from
  day one).
- **Week 1:** build the compatibility middleware core.
- **Week 2:** build the verification probe; get one real open-source server fully passing both
  legacy and new-spec checks end to end.
- **Week 3:** apply it to 3-5 more real servers, fix what breaks, write the migration guide,
  record the demo.
- **Week 4:** launch (see DISTRIBUTION.md) — comment on the RFC with the working solution first,
  everything else follows from there.

**~4 weeks to a demo-ready, launched v1.** Weeks 5-8 (per ROADMAP.md) are real-feedback iteration,
a Python port if TS gets traction, and turning registry conversations into partnerships.

## The demo

Same discipline as before: build toward a 90-second recording, not as an afterthought. This one
practically writes itself — "here's a real MCP server, here's it failing the new-spec probe, here's
one import fixing it, here's the probe passing for both spec versions now." Numbers on screen
(90.8% registry-wide, this server specifically) do the persuading; no narration needed.

## Alternatives considered and why they're lower priority right now

- **MCP semantic security scanner** (hybrid embedding+LLM detection to beat the ~78%
  false-positive rate of existing YARA-based scanners like Cisco's `mcp-scanner`) — real gap,
  academically validated (CASCADE, MCP-Guard get under 7% false positives), but Snyk, Socket, and
  Cisco are already funded and building here. Harder for a solo builder to win outright; worth
  revisiting as a Continuum feature later (a "trust score" on top of the compat layer) rather than
  the flagship itself.
- **Self-healing API connectors for agents** (schema-drift auto-repair) — addresses the #1 cited
  enterprise blocker (46%, per Anthropic/Material's 2026 survey of 500 tech leaders on integration
  challenges), but it's an enterprise-sales-cycle problem — slower to get traction solo than a
  developer-tool with a `npx`-install motion.
- **Agent Reliability & Evals Toolkit** (the original capstone pick, see git history of this file)
  — still a real gap, but the evals/observability space is already crowded with funded
  incumbents, and it isn't tied to a dated, current event the way the MCP migration gap is. Kept
  as a strong second option, not discarded.

## Sources

- [The 2026-07-28 Specification — MCP Blog](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- [mcp-spec-check — registry readiness scan](https://github.com/Roee-Tsur/mcp-spec-check)
- [Microsoft agent-governance-toolkit RFC #2597 — dual-stack migration](https://github.com/microsoft/agent-governance-toolkit/issues/2597)
- [fastmcp migration issue #300](https://github.com/punkpeye/fastmcp/issues/300)
- [MCP security statistics 2026 (SSRF/auth gaps in the registry)](https://www.practical-devsecops.com/mcp-security-statistics-2026-report/)
- [CASCADE — false-positive rates in MCP prompt-injection detection](https://arxiv.org/html/2604.17125v1)
- [Anthropic/Material 2026 State of AI Agents survey, via Arcade](https://www.arcade.dev/blog/5-takeaways-2026-state-of-ai-agents-claude/)
