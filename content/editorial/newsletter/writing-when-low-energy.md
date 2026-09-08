---
id: newsletter-draft-writing-when-low-energy
slug: writing-when-low-energy
status: draft
title: how i keep writing when i do not feel like writing
subject: how i keep writing when i do not feel like writing
summary: a low-energy content pipeline that starts from receipts, rough notes, and admin drafts instead of a blank page.
dek: the point is not to force a big essay every day. the point is to keep useful raw material moving until i have enough energy to make it sound like me.
audience: builders who want a content system that still works on low-energy days
source_fixture: docs/newsletter-drafts/writing-when-low-energy.json
preview_fixture: apps/admin/src/pages/newsletter/[slug].astro
pipeline:
  lane: evergreen
  stage: fallback_ready
  energy: low
  next_action: use this as the recurring fallback issue when no fresh essay is ready
source_refs:
  - ref: content/public/writing/stop-ending-your-day-with-fix-the-bug.md
    use: existing post about specific prompts and next-day continuity
  - ref: docs/newsletter-content-structure.md
    use: draft issue shape and low-risk preview model
  - ref: apps/admin/src/pages/content/edit/[pageKey].astro
    use: admin content editor that can hold drafts before publish
  - ref: apps/admin/src/pages/newsletter.astro
    use: newsletter queue where drafts can sit without sending
spine:
  - receipt
  - rough pass
  - voice pass
  - proof pass
  - publish later
hook:
  kind: opening
  body: some days i do not want to write. that should not break the system. the system should still collect receipts, keep drafts warm, and leave me one clear next action.
  source_refs:
    - content/public/writing/stop-ending-your-day-with-fix-the-bug.md
  thread_beat: low energy days need smaller writing tasks, not fake motivation.
sections:
  - kind: note
    heading: start from receipts
    body: the easiest writing source is work that already happened. commits, screenshots, admin proof, route checks, and rough handoff notes are all better than a blank page. the first pass should collect those receipts without trying to sound finished.
    source_refs:
      - apps/admin/src/pages/proof.astro
    thread_beat: collecting proof is a writing task when writing feels too heavy.
  - kind: worklog
    heading: split the job
    body: the pipeline should split writing into smaller jobs so i can do one of them on a bad day. collect source, outline the beats, make it sound like me, check claims, then decide where it goes.
    items:
      - "source pass: collect commits, pages, screenshots, and notes"
      - "rough pass: turn receipts into plain sentences"
      - "voice pass: remove generic phrasing and make it sound like me"
      - "proof pass: keep only claims with public evidence or mark them blocked"
      - "publish pass: choose blog, newsletter, or keep it in admin"
    source_refs:
      - docs/newsletter-content-structure.md
    thread_beat: the pipeline should let me make progress without doing the whole essay at once.
  - kind: receipt
    label: existing habit
    body: "the same pattern already works for coding: a specific next prompt beats a vague todo. writing can use the same trick. end the day with the next draft action, not a hope that tomorrow feels easier."
    source_refs:
      - content/public/writing/stop-ending-your-day-with-fix-the-bug.md
    thread_beat: a draft note is just an instruction for the next version of me.
  - kind: close
    body: "the fallback is simple: if i cannot write, i collect proof. if i cannot polish, i leave a specific next edit. if i cannot publish, i keep the draft visible in admin."
close:
  kind: close
  body: this can become the recurring content pipeline note and the operating rule for future newsletter drafts.
  cta: draft only. keep send and schedule blocked.
claims:
  - claim: the admin editor can hold draft state before a public publish decision
    status: source_backed
    source_refs:
      - apps/admin/src/pages/content/edit/[pageKey].astro
  - claim: the existing writing post argues for specific next-session prompts
    status: source_backed
    source_refs:
      - content/public/writing/stop-ending-your-day-with-fix-the-bug.md
  - claim: a recurring low-energy content pipeline should not send or schedule email automatically
    status: source_backed
    source_refs:
      - docs/newsletter-system.md
x_thread_beats:
  - some days i do not want to write. the system should survive that.
  - proof collection is still writing work.
  - a rough pass is allowed to sound rough.
  - the voice pass is where it becomes mine.
  - the proof pass keeps the draft honest.
  - if i cannot publish, i keep the draft visible in admin.
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
preview_notes: recurring fallback issue. useful when no fresh essay is ready and the system needs one concrete next writing action.
---
