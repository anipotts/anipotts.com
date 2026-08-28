---
title: paragon global investments
subtitle: next.js and supabase portal for an nyu quant fund.
description: Built a Next.js and TypeScript research portal backed by Supabase for Paragon Global Investments, NYU's quant fund. Organized internal research so members could read and share fund material from mobile.
year: "2025"
category: quant
role: Chief Tech Officer
duration: "2025–present"
status: live
kind: experience
public_state: featured
homepage_placement: experience
catalog_group: past
homepage_order: 90
card_copy: research platform for an intercollegiate quant fund.
detail_path: /projects/pgi-research-platform
preview_media:
  kind: image
  src: /images/work/paragon-portal-directory.png
  alt: Paragon Global Investments member directory showing its intercollegiate research community.
  caption: member directory
story:
  - title: start with the actual job
    paragraphs:
      - >-
        PGI had more than 300 student members across its chapters, plus research,
        educational resources, and people information living in too many places.
      - >-
        I wanted one portal that made the club feel like one organization instead
        of a collection of docs and spreadsheets.
  - title: pick the shortest useful stack
    paragraphs:
      - >-
        I built the first useful version in a couple of days with Next.js,
        Supabase, and Vercel. It is the kind of setup people now reach for when
        they want to vibe code something quickly, but used carefully it is also
        a real application stack: typed UI, authentication, relational data,
        file storage, and straightforward deploys.
      - >-
        The goal was to get members from sign-in to people, research, and
        resources with as little friction as possible.
    media:
      kind: image
      src: /images/work/paragon-portal-resources.png
      alt: Paragon member resource library with educational material organized for the club.
      caption: member resources
  - title: make the admin work easy too
    paragraphs:
      - >-
        A member portal only stays useful if someone can maintain it. Admins
        could add resources, manage what members saw, and keep the portal current
        without opening the codebase.
      - >-
        That separation let the website move quickly while the club stayed in
        control of its information.
    media:
      kind: image
      src: /images/work/paragon-portal-content-admin.png
      alt: Paragon portal content manager used by club administrators.
      caption: content manager
  - title: learn from the real loop
    paragraphs:
      - >-
        The interesting part was how little stack was required once the product
        loop was clear. Next.js handled the interface and server routes. Supabase
        handled identity and data. Vercel handled the release path.
      - >-
        The stack still needed product judgment: the schema, permissions, admin
        controls, and the actions a member needed on the first screen.
    media:
      kind: image
      src: /images/work/paragon-portal-analytics.png
      alt: Paragon portal analytics showing how members used the site.
      caption: portal analytics
identity:
  logo_src: /images/brand/paragon-favicon.png
  logo_alt: paragon global investments
sort_order: 95
link_live: https://paragoninvestments.org
tags: [Next.js, TypeScript, Supabase, Vercel, TailwindCSS, Research]
---
