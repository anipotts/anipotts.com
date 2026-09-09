# Editorial media

These primitives support writing and work detail pages without introducing a CMS
or another animation library. Their styles use the same paper, ink, accent, and
radius tokens as the reading layout.

Current published bodies come from `content/public/writing/*.md` and
`content/public/projects/*.md`. `apps/www/src/content.config.ts` loads Markdown;
there is no MDX integration. An `.md` body cannot import an Astro component.

## Authoring today

- In an Astro layout or curated article section, import the components below.
- In Markdown, native `<figure>`, `<img>`, `<figcaption>`, and `<video>` work.
  Import `editorial/editorial-media.css` from the wrapping Astro component to
  apply the corresponding classes to those HTML blocks. No runtime is needed
  for images or native video.
- For an inline interactive embed, place `EditorialEmbed` in the Astro template
  at an intentional section boundary. Converting the content pipeline to MDX
  would be separate work involving its loader, schemas, and preview path.
  Do not paste component imports into the existing `.md` files.

All examples below are **placeholder recipes**, not existing assets, published
claims, or approved copy. Replace their paths and text with reviewed material.

## Focused screenshots

```astro
---
import EditorialFigure from "../components/editorial/EditorialFigure.astro";
---

<EditorialFigure
  src="/images/work/example-sidebar.png"
  alt="Describe the visible controls and the state relevant to this section."
  width={1600}
  height={1000}
  aspectRatio={4 / 3}
  focusX={15}
  focusY={20}
  caption="Explain the specific decision illustrated here."
  sourceHref="/images/work/example-sidebar.png"
  sourceLabel="view full screenshot"
/>
```

Omitting `aspectRatio` preserves the whole image. Setting it crops with CSS;
`focusX` and `focusY` range from 0 to 100 percent. Keep the original asset intact.
A crop can only reveal detail already present in the source resolution. Prefer a
separately captured focused image when a desktop screenshot becomes illegible on
a phone. Include intrinsic dimensions to reserve space while loading.

For a plain Markdown body, leave a blank line before and after the HTML block:

```html
<figure class="editorial-media">
  <div class="editorial-media__stage">
    <img
      src="/images/work/example-sidebar.png"
      alt="Describe the visible controls."
      width="1600"
      height="1000"
      loading="lazy"
      decoding="async"
    />
  </div>
  <figcaption class="editorial-media__caption">
    <span>Explain the specific decision illustrated here.</span>
    <a href="/images/work/example-sidebar.png">view full screenshot</a>
  </figcaption>
</figure>
```

For references such as a Wikipedia article, use a source link with an explanatory
caption. A useful selected excerpt or authored diagram is often easier to read
than a full webpage iframe. Record the source URL and any applicable image
license with the asset. Do not treat a webpage screenshot as permission to
republish its contents.

## Recorded interaction

```astro
---
import EditorialVideo from "../components/editorial/EditorialVideo.astro";
---

<EditorialVideo
  src="/videos/work/example-composer.mp4"
  poster="/images/work/example-composer-poster.png"
  title="Composer interaction preview"
  caption="Describe what changes during this interaction and why it matters."
  width={1280}
  height={800}
  captions={{
    src: "/videos/work/example-composer.en.vtt",
    language: "en",
    label: "English",
  }}
  transcriptHref="/writing/example-transcript"
/>
```

Playback uses native controls, inline playback, and no autoplay or preload.
Provide captions for spoken audio and a text description of important visual
changes. For a silent UI recording, caption the state transition rather than
adding an empty subtitle track. Prefer a short MP4 or WebM with controls over an
endlessly looping GIF. Native `<video controls playsinline preload="none">`
also works in Markdown.

## Deliberately loaded embeds

```astro
---
import EditorialEmbed from "../components/editorial/EditorialEmbed.astro";
---

<EditorialEmbed
  kind="youtube"
  videoId="REPLACE_ID1"
  title="Replace with the actual video title"
  caption="Explain why this part of the video belongs in the article."
/>

<EditorialEmbed
  kind="demo"
  src="/demos/example-composer.html"
  title="Composer demo with sample content"
  caption="Describe the interaction the reader can try."
  aspectRatio={4 / 3}
/>
```

Replace `REPLACE_ID1` with the selected video's real 11-character ID before using
the example. The component rejects invalid IDs. The iframe lives in an inert
`template` until the reader selects the load button. There is no remote
thumbnail or third-party request from this component before that action. The
close button removes the iframe and returns focus to the load button. A regular
link remains available when JavaScript is disabled or embedding is blocked.

YouTube uses `youtube-nocookie.com`, native controls, no autoplay, and a
cross-origin sandbox with the permissions needed by its player. Its referrer
policy sends only the site origin to the player. This is deferred loading, not
a claim that YouTube performs no processing after the reader loads it.

For a remote demo, use an HTTPS source and supply its exact approved origin:

```astro
<EditorialEmbed
  kind="demo"
  src="https://demo.example.org/composer"
  allowedOrigin="https://demo.example.org"
  title="Composer demo with sample content"
  caption="Describe the interaction the reader can try."
/>
```

`example.org` is a placeholder. The author must select and inspect the actual
source. Local demo paths must begin with `/demos/`. Demo iframes permit scripts
but omit `allow-same-origin`, top navigation, forms, popups, and downloads.
Keep this restriction even for same-origin demos. Opening the fallback link
separately leaves the iframe sandbox, so only publish reviewed demonstration
files that are also safe to visit directly.

A sandbox does **not** make arbitrary application code read-only or disable its
network requests. Prepare demos as self-contained static files with sample data,
no credentials, and no production API connections. A classic bundled script can
run in the opaque-origin sandbox; module scripts or fetches may need CORS and
should be avoided for this small demo use case. External sites may also prohibit
framing; the ordinary link is the fallback.

## Deployment policy before the first embed

The current `apps/www/src/middleware.ts` response policy uses `default-src
'self'` without a `frame-src` directive and sends `X-Frame-Options: DENY` on HTML.
The components do not change that policy. Before adding an actual embedded
source, check the headers of both the article and the embedded document:

- A YouTube player needs the parent page to allow
  `https://www.youtube-nocookie.com` in a narrowly scoped `frame-src` policy.
- A selected remote demo needs its exact origin allowed by the parent policy
  and must itself allow framing.
- A local `/demos/` document must have a route-specific framing policy that
  permits the site's article pages. Do not loosen the site's general anti-framing
  policy just to support a demo. Check the opaque sandbox origin during this
  verification.
- Keep local video and caption assets as the default. A remote video also needs
  an intentional `media-src` policy change.

These policy changes and real provider playback are pending until a specific
source is selected. The components' typecheck and URL checks alone do not prove
that a provider will allow an embed. The source link works as an ordinary
navigation while that integration is prepared.

## Preparing PGI and Chat material

These are preparation plans based on Ani's requested coverage, not statements
that the current projects implement every behavior:

- PGI: collect a focused crop of the role-aware navigation and a short resource
  editing flow. Use fictional officers, resources, and documents. Show the
  relevant state before and after a change. Keep system diagrams and data models
  grounded in the actual repository once inspected.
- Chat: select the composer recording Ani identifies, then frame the interaction
  closely enough to understand its states on mobile. An isolated sample composer
  can follow once the source and the intended interactions are agreed.
- Other projects: use the smallest set of images that explains the actual work.
  A full screenshot can establish context; a focused figure can support a
  particular design decision. Do not add screenshots solely to lengthen a page.

Existing screenshots and recordings remain original source assets. New crops,
posters, recordings, and demo fixtures should be separately named and clearly
identified in the writing ledger. The article must distinguish original shipped
UI from a later illustrative reconstruction.

## Validation

For each authored use, verify mobile and desktop dimensions, light/dark contrast,
keyboard focus, descriptive alt text, native playback controls, caption accuracy,
and the visible fallback link. Confirm there are no iframe requests before
loading and that closing stops the embedded document. Inspect approved demos for
production URLs before publishing them.

Provider details were checked against primary documentation on 2026-09-08:
[YouTube embed parameters](https://developers.google.com/youtube/player_parameters),
[YouTube privacy-enhanced mode](https://support.google.com/youtube/answer/171780),
and [HTML iframe sandbox behavior](https://html.spec.whatwg.org/multipage/iframe-embed-object.html#attr-iframe-sandbox).
