# Mini publishers

A commit publisher for `ap-mini` that POSTs commits to the state worker
(`api.anipotts.com`). It is not installed: on 2026-09-22 ap-mini had no loaded
`com.anipotts.publisher.commits` job and the worker held 0 commits.

## Install on Mini

```bash
# 1. Pull the repo on Mini (one time)
ssh mini "cd ~/Code/projects && git clone https://github.com/anipotts/anipotts.com.git anipotts-com"

# 2. Generate a publish key (any random string)
KEY=$(openssl rand -hex 32)
ssh mini "mkdir -p ~/.anipotts && echo '$KEY' > ~/.anipotts/state-publish.key && chmod 600 ~/.anipotts/state-publish.key"

# 3. Set the matching wrangler secret on the state worker (run on MacBook)
echo -n "$KEY" | wrangler secret put STATE_PUBLISH_KEY --config workers/state/wrangler.toml

# 4. Symlink the plist into LaunchAgents on Mini
ssh mini 'ln -sf ~/Code/projects/anipotts-com/scripts/mini/com.anipotts.publisher.commits.plist ~/Library/LaunchAgents/com.anipotts.publisher.commits.plist'

# 5. Patch the launchd plist to source the key (one time)
# launchd plists do not interpolate from files, so wrap the script in a
# shell launcher OR add the key as an EnvironmentVariables entry. Easiest:
ssh mini 'launchctl setenv STATE_PUBLISH_KEY "'$KEY'"'

# 6. Bootstrap the agent
ssh mini 'launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.anipotts.publisher.commits.plist'
ssh mini 'launchctl kickstart -k gui/$(id -u)/com.anipotts.publisher.commits'

# 7. Watch logs
ssh mini 'tail -f ~/Library/Logs/anipotts/commit-publisher.*.log'
```

## How it works

- Every 5 minutes, `commit-publisher.ts` walks `~/Code/projects/**`
- For each git repo it finds, reads commits newer than the cursor
  (`~/.anipotts/commit-publisher.cursor.json`), capped at 50/repo/run
- POSTs to `https://api.anipotts.com/api/commits` with `Bearer
$STATE_PUBLISH_KEY`
- The state worker forwards to the `CodeStats` Durable Object, which
  broadcasts `commit.added` to open `/api/commits/ws` sockets. No admin view
  reads it.

## Verify end-to-end

After install, the held commit count rises within 5 minutes (or right away
after `kickstart -k`):

```bash
curl -s https://api.anipotts.com/api/commits | jq '.commits | length'
```

## Filter by author

If the Mini scans repos that include other peoples' commits (e.g. open
source forks), set `AUTHOR_FILTER=anipotts` or `AUTHOR_FILTER=ani.potts`
in the launchd plist `EnvironmentVariables` block to publish only your
own commits.
