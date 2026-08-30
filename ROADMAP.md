# 90-Day Roadmap

Dates below are relative — start counting from whatever day you actually begin. Each week: one
build task, one content task, one outreach/network task. Don't skip content or outreach even in
"pure build" weeks — a single post/DM per week is enough to keep the flywheel turning.

## Build pipeline checklist (source of truth for the automated pipeline)

The recurring build agent reads this list top to bottom, does the **first unchecked item only**,
checks it off, commits, and stops. Everything below "LAUNCH GATE" requires the human's explicit
go-ahead first — the agent should stop and report instead of doing those unprompted, even once
they're next in line.

- [x] Read the MCP 2026-07-28 spec diff and Microsoft RFC #2597 closely enough to restate the
      dual-stack pattern from memory; pick the exact TS SDK/version to target.
- [x] Scaffold `continuum/` in this repo: `package.json`, `tsconfig.json`, `src/`, MIT license
      reference, minimal README stub.
- [x] Implement the legacy `initialize`/`Mcp-Session-Id` handshake responder in the middleware.
- [x] Implement the new `server/discover`/stateless flow responder, normalized to the same
      internal request shape as the legacy path.
- [x] Wire both paths into a single `continuum()` wrapper function per the diff shown in the
      preview artifact (wraps an existing server, no rewrite of its handlers).
- [x] Build the verification probe: simulated legacy client completing a full tool-call round trip.
- [x] Extend the probe: simulated new-spec client completing the same round trip.
- [x] Get one real open-source MCP server (pick one, note which in the commit) fully passing both
      probe checks end to end.
- [x] Apply Continuum to 3-5 more real open-source MCP servers; note results in
      `continuum/COMPATIBILITY.md`.
- [x] Handle the remaining edge cases: the three deprecated primitives, remapped error codes, auth
      header differences between spec versions.
- [ ] Write `continuum/README.md` as the real migration guide, opening with the 90.8%-not-ready
      stat and the one-import before/after example.
- [ ] Write the 90-second demo script/shot list (numbers on screen, per CAPSTONE.md) — recording
      itself is on the human, not the agent.

**— LAUNCH GATE: everything below requires explicit human approval before it happens —**

- [ ] Comment on Microsoft RFC #2597 with the working solution.
- [ ] Comment on fastmcp issue #300 if relevant.
- [ ] Reach out to the `mcp-spec-check` author for cross-linking.
- [ ] Submit to registries (Glama, Smithery, PulseMCP, MCPfinder) and awesome-list PRs.
- [ ] Publish to npm.
- [ ] Post in MCP Discord communities and r/mcp.
- [ ] Show HN / X / LinkedIn / newsletter submissions.

## Days 0-3 — Prep

- Read the full MCP 2026-07-28 spec diff and the Microsoft RFC #2597 thread closely enough to
  restate the sanctioned dual-stack pattern from memory. Pick the exact TS SDK/version to target.
  Set up the repo (MIT license, README opening with the 90.8%-not-ready stat from day one).

## Days 4-14 — Build the MVP (Weeks 1-2)

- Week 1: Build the compatibility middleware core — answer both the legacy `initialize` handshake
  and the new `server/discover` flow, normalized into the shape the server's existing handlers
  already expect (see CAPSTONE.md for the exact approach).
- Week 2: Build the verification probe (simulated legacy + new-spec clients, full tool-call round
  trip against each). Get one real open-source MCP server fully passing both checks end to end.
- Content: 2-3 build-in-public posts — "fixing the MCP dual-stack migration gap Microsoft's own
  RFC flagged as unsolved," short and specific, not a launch yet.
- Outreach: none required yet — nothing to show. Re-read DISTRIBUTION.md's Tier 1 so the RFC
  comment is ready to write the moment there's something real to link.

## Days 15-28 — First public run + launch (Weeks 3-4)

- Week 3: Apply Continuum to 3-5 more real open-source MCP servers, publish before/after. Record
  the 90-second demo (numbers on screen, per CAPSTONE.md — no narration needed). Write the
  migration guide.
- Week 4: Launch per DISTRIBUTION.md, in order — comment on Microsoft RFC #2597 and the fastmcp
  migration issue with the working solution FIRST, then registries/awesome-lists/Discord/Reddit,
  then Show HN and X/LinkedIn.
- Checkpoint: if the launch gets near-zero engagement (no stars, no replies, no RFC response),
  that's signal — read it honestly before week 5, and consider adjusting the angle (not
  necessarily the whole idea) rather than ignoring it.

## Days 29-42 — Iterate on real feedback (Weeks 5-6)

- Week 5: Fix the top 2-3 things people actually asked for or complained about (real feedback >
  your own guesses). Start the Python SDK port only if there's real demand for it specifically.
- Week 6: Re-run the registry-wide readiness scan (per DISTRIBUTION.md's "ongoing" section) and
  post the updated percentage — the first recurring content hook.
- Content: one deeper technical post — the exact compatibility approach and what broke in
  real-world servers (this is the post that gets you taken seriously by practitioners, distinct
  from the launch hype post).
- Outreach: follow up on the RFC/registry conversations from week 4. Start applying to 1-2
  relevant webinar/meetup speaking slots (TARGETS.md) using the demo video as your pitch reel.

## Days 43-60 — Day-60 checkpoint (Weeks 7-8, + checkpoint)

- Build: whatever the strongest signal from weeks 5-6 points to — more likely a deeper feature
  than a new one.
- Outreach: convert any warm beta conversation into an actual pilot ("let me integrate this
  against your product for two weeks, free, in exchange for feedback + a case study/testimonial
  you can also use for your own marketing").
- **Day-60 checkpoint (from STRATEGY.md):** honestly assess — real usage? real conversations with
  target companies? any money on the table (even small)? If yes on at least two of three, keep
  going as-is. If no on all three, this is the point to seriously consider a pivot in angle
  (not necessarily domain) before sinking the final 30 days into the same approach.

## Days 61-90 — Monetize + compound (Weeks 9-13)

- Turn the strongest pilot/beta relationship into a paid engagement — even a small one
  (consulting day, paid pilot extension, a bounty for a specific integration).
- Submit a talk/demo proposal to at least one real event (TARGETS.md) using the by-now-mature
  demo + case study.
- Host or co-host one small webinar (even a 20-person one) with a target company — this is often
  easier to land than a big conference slot and builds a direct relationship.
- Write the "3 months in" retrospective post — what broke, what you learned, real numbers if you
  have them (stars, users, revenue). This is the single highest-credibility content type there is
  because it's honest and specific.

## Weekly cadence to hold throughout (not just in the weeks it's called out above)

- 1 build session logged (even a small one)
- 1 piece of content (a post, a thread, a repo update with a real changelog note)
- 1 outreach touch (a new message or a meaningful follow-up)

Missing a week occasionally is fine. Missing content or outreach for a whole month is how this
quietly stalls — protect the cadence over protecting any single week's build progress.
