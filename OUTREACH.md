# Outreach Templates

Rules for all of these: personalize the bracketed parts for real, keep it short, lead with the
demo/proof (link it), and ask for one small specific thing — never a vague "let's connect."

## 1. Cold message for beta / design-partner access

> Hi [name] — I built [tool name], an open-source toolkit that stress-tests AI agents for tool-
> use failures (wrong tool picks, hallucinated args, missed confirmations). Ran it against
> [specific public example relevant to their product] — here's what it caught: [link to
> writeup/video].
>
> Noticed [specific detail about their product/roadmap/recent post] — think there's a real fit
> for testing reliability on [their product]. Would you be open to a quick pilot? Happy to run it
> against your setup for free in exchange for feedback.

## 2. Webinar co-host pitch

> Hi [name] — I run [tool name] ([link]), an agent-reliability testing toolkit. I saw you host
> [their webinar series name] — I'd like to propose a session: a live case study running it
> against [their product], showing a real failure it catches and how the fix works. Concrete,
> demo-driven, ~20-25 min. Happy to send a short outline first if useful.

## 3. Conference / meetup CFP submission

> Title: [specific, concrete — "Why your agent fails 30% of the time and how to catch it before
> production" beats "Thoughts on AI agent reliability"]
>
> Abstract: Agents that work in demos routinely fail in production in predictable, categorizable
> ways — wrong tool selection, hallucinated arguments, silent irreversible actions. This talk
> walks through [tool name], an open-source harness that catches these before ship, with a live
> example against [specific real agent/MCP server]. Attendees leave with a concrete checklist and
> a runnable test suite they can apply to their own agents.
>
> Speaker bio: [1-2 sentences — lead with the tool + one concrete result, not a generic bio]

## 4. Freelance / consulting outreach

Use only once there's real proof (a public run, a case study, or a completed pilot) — this
template is weaker without that.

> Hi [name] — I noticed [specific signal that their agent has reliability gaps: a public
> complaint, a changelog mentioning a fix, a demo that visibly failed]. I built [tool name]
> ([link]) specifically for this class of problem — [one-line result from a real run]. Would a
> short paid audit of [their agent] be useful? I'd deliver a concrete failure report + fix
> recommendations, [timeframe], [price or "happy to quote once I see scope"].

## 5. Build-in-public content post (recurring, weekly-ish)

Keep these short and specific — a real detail beats a general update every time.

> Building [tool name] — [one specific thing that happened this week: a bug found, a scenario
> that broke an agent in a surprising way, a design decision and why]. [link if there's something
> to see]. [one-line takeaway or open question to invite replies].

## 6. Launch post ("Show HN" / community launch)

> [Tool name]: catches [specific failure class] in AI agents before you ship.
>
> [1-2 sentences: what it is, how it works, one concrete example of what it caught]
>
> [link to repo] — [link to demo video]. Feedback very welcome, especially on [one specific thing
> you're genuinely unsure about — invites real engagement, not just upvotes].

## General notes

- Every outreach message should link to something real (repo, video, writeup) — never send these
  before there's at least a working MVP and one recorded demo (see ROADMAP.md weeks 1-4).
- Track what you send and to whom in a simple log (a CSV or a note in this folder) so follow-ups
  don't get missed and you're not repeating the same pitch to the same person twice.
- Silence is the default response — follow up once after ~1 week, then move on. Don't over-invest
  in any single lead before the capstone has real traction.
