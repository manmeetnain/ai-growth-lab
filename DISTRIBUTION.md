# Distribution Plan — Continuum

How this specific capstone gets in front of the people who'd actually use it, in the order that
gives each later step more to point to. Don't skip to Tier 3 before Tier 1 exists — the whole plan
depends on Tier 1 giving you something real to cite everywhere else.

## Before any of this: the launch-ready bar

Nothing below happens until these exist — posting early with nothing to show burns the one shot
most of these channels give you:

- Public repo, MIT license, README that opens with the 90.8%-not-ready stat and a 3-line
  before/after code example, not a wall of text.
- The verification probe actually passing both legacy and new-spec checks on at least one real
  open-source server.
- The 90-second demo recording.
- Installable with one command (`npx continuum-mcp` or equivalent) — match the ecosystem's
  existing convention (`mcp-spec-check` is already `npx`-run; don't make people `git clone`).

## Tier 1 — go straight to the open problem (do this first, in this order)

1. **Comment on the Microsoft RFC directly**: [agent-governance-toolkit#2597](https://github.com/microsoft/agent-governance-toolkit/issues/2597)
   is the actual open ask this project answers. A comment with a working repo link and a short
   summary of the approach is worth more than every other channel combined — it's not cold
   outreach, it's answering the exact question that was asked, in public, with code.
2. **Comment on the [fastmcp migration issue #300](https://github.com/punkpeye/fastmcp/issues/300)**
   if Continuum's approach is relevant to fastmcp users specifically — same logic, second-highest
   leverage thread.
3. **Reach out to the `mcp-spec-check` author** (Roee-Tsur on GitHub) — their tool diagnoses, yours
   fixes; propose cross-linking READMEs or a joint post ("scan with mcp-spec-check, fix with
   Continuum"). This is a peer, not a gatekeeper — genuinely easy first real connection in the
   space, not a pitch.

## Tier 2 — ecosystem discovery (where MCP developers already look for tools)

4. **Submit to the registries**: Glama, Smithery, PulseMCP, MCPfinder. These explicitly don't do
   compatibility/security vetting themselves (confirmed via their own docs) — when reaching out
   past just listing it, the pitch is "want a migration-readiness badge for servers listed here?"
5. **PR into the awesome-lists**: `wong2/awesome-mcp-servers`, `appcypher/awesome-mcp-servers`,
   `tolkonepiu/best-of-mcp-servers` (accepts PRs or issues against `projects.yaml`), and similar —
   these are actively maintained and low-friction to get merged into.
6. **Publish to npm** as an `npx`-runnable package — this is the actual distribution mechanism
   this ecosystem already uses, more than a GitHub star count.
7. **Post in the MCP Discord communities**: the official MCP Contributor Discord has an
   `#typescript-sdk-dev` channel where this is exactly on-topic; the general MCP Community Discord
   and **r/mcp on Reddit** are both large, active, and the right audience — post the demo + the
   stat, not a generic "check out my project."

## Tier 3 — broad visibility (once Tier 1-2 give you something to cite)

8. **Show HN**: "Show HN: Continuum — make your MCP server speak both the old and new spec with
   one import" — lead with the 90.8% stat, link the demo.
9. **X/LinkedIn**: quote/reply into the original spec-announcement threads from MCP spec
   maintainers and relevant framework maintainers (fastmcp, official SDK) with the demo video
   attached — riding an existing conversation beats starting a new one.
10. **Newsletter/aggregator submissions**: dev.to cross-post of the migration guide, TLDR AI,
    Console.dev — these want exactly this kind of concrete, dated, practitioner-useful writeup.

## Ongoing — turn the launch into a recurring hook, not a one-shot

- **Re-run the registry-wide readiness scan monthly** and post the updated percentage
  ("60 days post-deadline: still X% not ready — here's what's still breaking"). This is genuinely
  evergreen content for the length of the 12-month grace period, and each update is a fresh,
  legitimate reason to post again in every channel above without repeating yourself.
- Track every registry/company conversation started in Tier 2 in a simple log — this is where the
  startup-access and paid-consulting leads from STRATEGY.md actually originate, not from the
  broad-visibility tier.
