---
title: quantercise
subtitle: quant interview practice with 400+ problems, instant grading, and sandboxed python.
description: Built from my own interview-prep workflow, Quantercise combines 400+ quant problems, instant grading, a browser-based Python editor, math rendering, progress tracking, and payments in one focused practice loop.
year: "2024"
category: product
role: Founder and Engineer
duration: Launched 2024
status: live
kind: project
public_state: featured
homepage_placement: making
catalog_group: past
homepage_order: 100
card_copy: quant interview practice with mental math and sandboxed Python execution.
detail_path: /projects/quantercise
identity:
  logo_src: /images/brand/quantercise-legacy-icon.png
  logo_alt: quantercise
sort_order: 100
link_live: https://quantercise.com
tags: [Next.js, TypeScript, Postgres, Drizzle, Stripe, Python]
technical:
  - title: Product Stack
    content: Next.js and React power the practice interface, Postgres and Drizzle hold the problem system, and isolated serverless execution grades Python submissions.
  - title: Problem Engine
    content: Problems support 5 answer types. Numeric with tolerance, exact string matching, single-choice MCQ, multi-choice MCQ, and Python coding challenges. Answer specifications are stored server-side only to prevent cheating. The grading system runs entirely on Lambda with isolated execution contexts.
  - title: Editor and Math Rendering
    content: Monaco Editor powers the Python coding experience with syntax highlighting and autocomplete. KaTeX handles mathematical notation rendering across all problems. Both integrate cleanly with the Next.js App Router through client components.
  - title: Gamification
    content: Points system awards 10/20/30 for easy/medium/hard problems with first-attempt bonuses. Daily streak tracking with 24-hour grace period. Leaderboards support daily, weekly, and all-time periods. User stats track progress by difficulty level.
---

Quantercise started as my own quant interview prep tool and turned into a full product: 400+ problems, real-time Python execution, math rendering, progress tracking, and payments.
