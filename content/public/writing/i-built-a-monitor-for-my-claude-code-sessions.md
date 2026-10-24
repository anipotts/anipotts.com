---
slug: i-built-a-monitor-for-my-claude-code-sessions
title: i built a monitor for my claude code sessions
summary: a dashboard i built to see what my Claude Code sessions are doing across projects
tags: [claude-code, claudemon, observability, building]
status: draft
published_at: 2026-04-07
---

At any given time I've got several Claude Code sessions running across different projects. One is on a side project, another is doing a refactor I kicked off before dinner, and another has already slipped out of my attention. I wanted one clear view of all of them.

Claude Code gives each session its own terminal. Claudemon adds the missing dashboard: one live view of what every agent is doing.

So I started building something. I'm calling it Claudemon.

It monitors all your active Claude Code sessions from one place. Think Activity Monitor but for AI coding agents. From any browser, my phone, my iPad, whatever. I can see which sessions are active, what tools they're calling, token usage and cost in real time, and whether a session is stuck or actually making progress.

Still very much a work in progress. I'll be sharing screen recordings soon because some of the UI is stuff I haven't seen anyone else build for Claude Code and I think people will find it useful.

The real reason I started building it? I wanted to understand the internals of Claude Code. When you use CC every single day you start to notice patterns. Sessions that burn through tokens on file reads because they're searching for something they should already know. Sessions that get stuck in retry loops. Sessions that are weirdly efficient because the initial prompt happened to give perfect context.

Instrumentation made these patterns visible. CC logs rich session data locally, and the JSONL files in `~/.claude/projects/` are a goldmine. Claudemon turns that raw trail into an observability layer.

So I am.

Some things I've learned so far:

Sessions are surprisingly bursty. Nothing for 30 seconds, then 15 tool calls in 10 seconds. Once you see the rhythm you start writing better prompts because you can tell when CC is planning vs executing.

Cost correlates with context more than complexity. Expensive sessions often come from Claude re-reading files after a vague initial prompt. Vague instructions are literally more expensive. This connects to my specific todos thing from the last post.

The tool call distribution tells you everything. A healthy session has a few reads, a burst of writes, and a bash command to test. A struggling session repeats reads while writes stay flat. That pattern points back to the prompt.

Everyone writes about prompting and how to talk to AI. Observability deserves the same attention. Understanding what agents do after you let them loose is a production requirement. AI coding agents need the same visibility as any other active system.

More posts coming on specific things I've found in the data. And yeah, screen recordings incoming.
