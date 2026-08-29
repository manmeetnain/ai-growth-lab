# Capstone: Agent Reliability & Evals Toolkit

(Working name — pick a real one at build time. Candidates: TrustHarness, AgentProbe, Recon.)

## The idea

An open-source toolkit that automatically stress-tests AI agents (anything built with tool-use /
MCP / function calling / multi-step planning) and reports where they break: wrong tool picked,
hallucinated arguments, infinite loops, silent failures, cost blowups, unsafe actions taken
without confirmation.

Input: point it at an agent (a LangChain/CrewAI/Claude-Agent-SDK/custom agent, or an MCP server).
Output: a report — pass/fail matrix across adversarial and edge-case scenarios, cost per task,
failure clustering ("this agent mis-selects tools when two have similar names"), and a
regression-test suite the team can drop into CI.

## Why this, specifically

- **It's the #1 unsolved pain point right now.** Every company shipping an agent in 2026 has the
  same conversation internally: "it works in the demo, we don't trust it in production." That
  gap is the whole market for evals/observability tooling (Braintrust, Langfuse, Arize, Galileo
  all exist because of it) — but most of that tooling is generic LLM evals, not agent-specific
  (multi-step, tool-use, stateful failure modes). That's the wedge.
- **It's the same tools this session already has access to** — MCP is the emerging integration
  layer, and there's live tooling in this environment for it (MCP registry search/connectors).
  Building against real MCP servers means you're testing against the actual ecosystem, not a toy.
- **It's inherently demoable.** "Watch this agent fail in a way you didn't expect, here's the
  report explaining exactly why" is a 90-second video that sells itself — much stronger content
  than "here's a library, read the docs."
- **It's a natural wedge into every target company in TARGETS.md.** Agent-framework startups,
  agent-hosting startups, and MCP-tooling startups all need this and would rather point users at
  (or partner with) an existing eval tool than build their own internal one from scratch.
- **It has an honest monetization path**: free OSS core (the CLI + test harness) -> paid hosted
  dashboard/CI integration for teams -> consulting ("come fix why our agent fails 30% of the
  time") is a completely natural, non-sleazy upsell because the free tool is what surfaces the
  problem in the first place.

Alternatives considered and why they're lower priority right now:
- **MCP connector marketplace** (build/sell individual MCP servers for niche SaaS tools) — good
  wedge too, but it's a portfolio of small things, which fights the "one flagship" strategy above.
  Worth doing later as *content* ("here's an MCP server I built to test my own toolkit against"),
  not as the capstone itself.
- **General-purpose agent framework** — the space is already crowded (LangChain, CrewAI,
  AutoGen, Claude Agent SDK) and a solo new framework has weak differentiation. Evals is a gap;
  frameworks are not.
- **Vertical AI agent for one industry** — could be higher $ per deal eventually, but requires
  picking and validating a vertical first, which is a much slower path to the 90-day goals.

## MVP scope (build in ~2-3 weeks, not longer)

Keep it brutally small. The MVP is a CLI + a scenario library, nothing more:

1. A YAML/JSON scenario format: given an agent endpoint (or an MCP server), define a task, an
   expected tool-call trace or expected outcome, and adversarial variants (ambiguous instructions,
   missing permissions, conflicting tools available).
2. A runner that executes the agent against each scenario and diffs actual vs. expected behavior.
3. ~15-20 starter scenarios covering common failure classes (wrong tool selection, argument
   hallucination, not asking for confirmation before an irreversible action, cost/latency
   blowups, infinite retry loops).
4. A plain-text/markdown report output (HTML dashboard is v2, not v1 — don't build it yet).
5. One real worked example: run it against a well-known open-source agent or a couple of public
   MCP servers, publish the findings publicly. This *is* the launch content.

Explicitly NOT in v1: hosted dashboard, CI/CD integrations, auth/multi-tenant anything, support
for every agent framework — pick one (Claude Agent SDK or raw MCP) and go deep, add others only
once someone asks.

## The demo

A 90-second screen recording: "I pointed this at [well-known public agent/MCP server], here's
what broke and why, here's the one-command way to catch it before you ship." That video is the
single most reusable asset across outreach, event CFPs, webinar pitches, and content — build the
tool with that video as the actual spec, not an afterthought.
