# Mini publishers

A commit publisher for `ap-mini` that POSTs commits to the state worker
(`api.anipotts.com`). It is not installed: on 2026-09-22 ap-mini had no loaded
`com.anipotts.publisher.commits` job and the worker held 0 commits.

## Installation status and authority

The commit publisher is not installed. Activating it would create an outbound
publisher and provision a credential, so it needs a reviewed owner decision and
a separate credential handoff. Before installation, confirm the target state
worker, enabled route, source scope, ap-mini job owner, log location, and
rollback. Use a supported value-silent secret broker or native secret field for
both the worker and ap-mini. Do not place a key in a shell command, argv,
launchd plist, source file, Git, or logs. Do not reuse the read key as the
publish key.

The launcher must read the publish credential through the approved protected
runtime path and pass it to the publisher without printing it. Test the job
with synthetic commits in an isolated environment before enabling the schedule
on ap-mini. This document does not authorize a live publisher or credential
change.

## How it works

- Every 5 minutes, `commit-publisher.ts` walks `~/Code/projects/**`
- For each git repo it finds, reads commits newer than the cursor
  (`~/.anipotts/commit-publisher.cursor.json`), capped at 50/repo/run
- POSTs to `https://api.anipotts.com/api/commits` with `Bearer
$STATE_PUBLISH_KEY`
- The state worker forwards to the `CodeStats` Durable Object, which
  broadcasts `commit.added` to open `/api/commits/ws` sockets. No admin view
  reads it.

## Verification after installation

After an approved installation and the private-read release, inspect the public
`/health` summary for a bounded commits count and receipt state. Compare it with
the job's own synthetic delivery receipt. An authorized private commit read
requires the separate `STATE_READ_KEY` through an approved server-side broker.
Do not put either credential in a browser, URL, shell command, or transcript. A quiet
repository may produce no new commit in five minutes, so elapsed time alone is
not a failed delivery test.

## Filter by author

If the Mini scans repos that include other peoples' commits (e.g. open
source forks), set `AUTHOR_FILTER=anipotts` or `AUTHOR_FILTER=ani.potts`
in the launchd plist `EnvironmentVariables` block to publish only your
own commits.
