---
id: newsletter-draft-durable-agent-workflows-proof-loops
slug: durable-agent-workflows-proof-loops
status: draft
title: durable agent workflows are proof loops
subject: durable agent workflows are proof loops
summary: a note that connects durable workflows, admin proof, and the carousel set into one practical explanation.
dek: the carousel says learn durable workflows. the longer version is that durable work is mostly about knowing what happened after the agent stops typing.
audience: builders turning agent demos into systems that can pause, resume, and prove state
source_fixture: docs/newsletter-drafts/durable-agent-workflows-proof-loops.json
preview_fixture: apps/admin/src/pages/newsletter/[slug].astro
pipeline:
  lane: backfill
  stage: needs_source
  energy: medium
  next_action: attach the carousel review assets and choose one public proof screenshot before publishing
source_refs:
  - ref: apps/admin/src/pages/content/carousels.astro
    use: read-only carousel review surface for durable agent workflows
  - ref: apps/admin/src/data/static/carousels/durable_agent_workflows_v2.json
    use: source manifest for four carousel posts and twenty-four slides
  - ref: apps/admin/src/pages/proof.astro
    use: admin proof model and durable evidence surface
  - ref: docs/newsletter-content-structure.md
    use: draft issue shape and blocked live actions
spine:
  - state
  - idempotency
  - approval
  - trace
  - reconcile
hook:
  kind: opening
  body: durable workflows sound like infrastructure jargon until an agent gets interrupted halfway through real work. then the boring pieces become the whole product.
  source_refs:
    - apps/admin/src/data/static/carousels/durable_agent_workflows_v2.json
  thread_beat: the agent has to know where it stopped and what is safe to repeat.
sections:
  - kind: note
    heading: durability is not just retry
    body: retry is one piece. the larger problem is remembering intent, preserving state, avoiding duplicate side effects, and knowing when a human approval is still required. that is why idempotent tools and proof logs matter more than clever prompts.
    source_refs:
      - apps/admin/src/pages/proof.astro
    thread_beat: a retry without state is just a faster way to make the same mistake twice.
  - kind: receipt
    label: the carousel packet
    body: the current carousel set has four posts and twenty-four rendered slides. admin can inspect the crops, captions, freshness, and review state without posting or scheduling anything.
    source_refs:
      - apps/admin/src/pages/content/carousels.astro
      - apps/admin/src/data/static/carousels/durable_agent_workflows_v2.json
    thread_beat: the media can be reviewed as proof material before it becomes distribution.
  - kind: worklog
    heading: what the workflow needs
    body: a production agent workflow needs clear state before it needs more model calls. it needs checkpoints, replay-safe operations, approval gates, traces, and a reconciliation pass at the end.
    items:
      - persist the current operation before the tool call
      - make the tool safe to repeat or detect the duplicate
      - store proof close to the action
      - reconcile the final state before calling the work done
    source_refs:
      - docs/admin-v2-architecture.md
    thread_beat: the last step is not output. the last step is reconciling state.
  - kind: close
    body: "that is the practical version of durable workflows for me: pause, resume, prove, reconcile. if the system can do that, the agent can be trusted with more boring work."
close:
  kind: close
  body: pair this with the carousel assets after one visual proof is selected.
  cta: draft only. choose proof media before archive or send.
claims:
  - claim: the admin carousel route is read-only and does not post or schedule
    status: source_backed
    source_refs:
      - apps/admin/src/pages/content/carousels.astro
  - claim: the durable agent workflows carousel manifest contains four posts and twenty-four slides
    status: source_backed
    source_refs:
      - apps/admin/src/data/static/carousels/durable_agent_workflows_v2.json
  - claim: production workflow claims need one selected public proof artifact before publishing
    status: needs_proof
    source_refs:
      - docs/newsletter-drafts/durable-agent-workflows-proof-loops.json
x_thread_beats:
  - durable workflows sound abstract until the agent gets interrupted.
  - then state is the product.
  - retry is not enough.
  - the system has to remember intent, avoid duplicate side effects, and preserve proof.
  - the carousel is distribution material, but admin treats it as review material first.
  - pause, resume, prove, reconcile.
blocked_actions:
  - write production d1 issue
  - publish archive page
  - send test email
  - broadcast to subscribers
  - change DNS
  - change auth or Cloudflare Access
  - modify env or secrets
  - change workers or endpoints
  - add admin write path
preview_notes: backfill candidate tied to carousel support material. needs one proof screenshot or public visual before publish.
---
