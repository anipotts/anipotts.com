---
slug: saturdays-are-for-claude-code
title: saturdays are for claude code
summary: talking to business insider about Claude Code limits and how i plan my work around them
tags: [claude-code, press, workflow, building]
status: published
published_at: 2026-04-13
artifact_url: https://www.businessinsider.com/ai-usage-limits-causing-some-to-restructure-their-workday-2026-4
artifact_label: source
---

The original Business Insider piece is here: [Saturdays are for Claude: How AI limits are reshaping the workday](https://www.businessinsider.com/ai-usage-limits-causing-some-to-restructure-their-workday-2026-4).

A reporter from Business Insider reached out a couple weeks ago. He was writing about how usage limits on AI tools are changing the way people work. Somebody pointed him to me because I've been pretty vocal about how I use Claude Code.

He nailed the broad strokes. I do plan my work around session limits. I do save the hardest tasks for when I'm far from the cap. And yes, Saturdays are for Claude Code. That quote is real. I mean it when I say it to my friends.

The article covers several people in 1,200 words. My workflow goes deeper.

## The actual numbers

I track everything. Every session, every tool call, every dollar.

My median Claude Code session runs about 31 minutes wall clock. Claude is _actively working_ for about 15 of those minutes. I spend the rest reading diffs, making decisions, and approving tool calls. I am the bottleneck.

Active tool rate holds steady at about 3.3 calls per minute for any session over 10 minutes. Claude doesn't slow down in long sessions. I do. Wall-time tool rate drops 8.8x from short sessions to marathons. That's 100% human idle time.

Sessions under 30 minutes are the sweet spot. Past an hour, more than half hit context limits and need compaction. That's when you lose coherence. The usage cap forces a pause before session quality degrades further.

You can see the broader agent method on [my systems page](/systems).

## Why the limit is a feature

The article framed limits as a constraint. And for the other people interviewed, it clearly is. One guy described panic when his team hits the cap. I get that.

For me, the forced pause has become genuinely useful. When I hit the limit, I stop and review. Every review catches something: an over-abstracted file, a missing test, or a working approach aimed at the wrong problem.

The best sessions come from front-loaded context, tight scope, and a focused plan. You learn that pretty fast when sessions cost real money or cap your allowance.

## What I'm building with it

I've logged over 1,000 hours of Claude Code across 600+ sessions. Right now I'm running 5 Claude Code sessions across different projects in a given week. The admin dashboard for this site, a quantitative interview prep app, a Mac Mini monitoring system, and open source tooling for other Claude Code users.

The irony of getting interviewed about usage limits is that my entire workflow is designed to be maximally efficient with those limits. Specific prompts. Tight session scopes. [End-of-day todos written as agent instructions](/writing/stop-ending-your-day-with-fix-the-bug). Parallel agents in worktrees. These patterns produce better code.

The limits just made me figure that out faster.
