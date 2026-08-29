# 90-Day Roadmap

Dates below are relative — start counting from whatever day you actually begin. Each week: one
build task, one content task, one outreach/network task. Don't skip content or outreach even in
"pure build" weeks — a single post/DM per week is enough to keep the flywheel turning.

## Days 1-14 — Build the MVP (Weeks 1-2)

- Week 1: Name it. Set up the repo (public, MIT/Apache-2.0 license, real README from day one —
  even a placeholder README with the vision sells the repo before code exists). Build the
  scenario format + runner skeleton against one agent target (pick Claude Agent SDK or a public
  MCP server — see CAPSTONE.md).
- Week 2: Write the first 15-20 scenarios. Get the report output working end-to-end on a real
  agent. Do not polish — get one full run producing a real report.
- Content: 2-3 build-in-public posts (X/LinkedIn) — "building an eval harness for agents because
  X problem," short and specific, not a launch yet.
- Outreach: none required yet — nothing to show. Start a short list in TARGETS.md of who you'll
  approach once there's a demo (this is prep, not outreach).

## Days 15-28 — First public run + launch (Weeks 3-4)

- Week 3: Run the tool against 1-2 well-known public agents/MCP servers. Record the 90-second
  demo video from CAPSTONE.md. Write it up as a short post: what broke, why, how the tool caught
  it.
- Week 4: Launch. Post the writeup + video (X, LinkedIn, relevant subreddit/Discord/Slack
  communities for agent builders, Hacker News "Show HN" if the tool is genuinely ready). Submit
  to at least one AI tool directory/newsletter.
- Outreach: send the first 5 messages from OUTREACH.md's "beta access" template to companies in
  TARGETS.md — lead with the demo video/writeup, not a request.
- Checkpoint: if the launch gets near-zero engagement (no stars, no replies, no DMs), that's
  signal — read it honestly before week 5, and consider adjusting the angle (not necessarily the
  whole idea) rather than ignoring it.

## Days 29-42 — Iterate on real feedback (Weeks 5-6)

- Week 5: Fix the top 2-3 things people actually asked for or complained about (real feedback >
  your own guesses). Add scenarios for a second agent framework/MCP target if there's demand for
  it specifically.
- Week 6: Start the CI-integration or hosted-dashboard v2 only if week 3-4 signal justifies it.
  Otherwise keep deepening the CLI/scenario library — more real, well-documented failure cases is
  higher leverage than a dashboard nobody asked for yet.
- Content: one deeper technical post — the methodology behind the scenarios (this is the post
  that gets you taken seriously by practitioners, distinct from the launch hype post).
- Outreach: follow up on week 4's 5 messages. Send 5 more. Start applying to 1-2 relevant
  webinar/meetup speaking slots (TARGETS.md) using the demo video as your pitch reel.

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
