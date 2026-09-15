// Edge cases around the choreography, each reported as observed state:
// height-only resize mid-flight, animations that never finish, reduced
// motion, light theme focus, the exit to a non-writing page, a second
// navigation mid-flight and a hidden tab. Usage:
//   BASE=http://127.0.0.1:8860 OUT=/tmp/bench/checks node checks.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, devices, option, webkit } from "./common.mjs";

const BASE = option("BASE");
const OUT = option("OUT");
// CHECKS=name,prefix runs only the sessions whose names start with one of them.
const PICK = option("CHECKS", "").split(",").filter(Boolean);
const browser = await chromium.launch({ headless: true });
const report = {};
const state = (page) =>
  page.evaluate(() => {
    const active = document.activeElement;
    const body = document.querySelector(".article-body");
    return {
      url: location.pathname,
      flag: document.documentElement.dataset.writingTransition ?? null,
      overlays: document.querySelectorAll(
        ".writing-transition-surface,.writing-transition-word,.writing-transition-ghost,.writing-transition-slide",
      ).length,
      hidden: [...document.querySelectorAll("body *")].filter(
        (el) => el.style.visibility === "hidden",
      ).length,
      animations: document.getAnimations().length,
      h1Visible: document.querySelector("main h1")
        ? getComputedStyle(document.querySelector("main h1")).visibility
        : null,
      bodyOpacity: body ? getComputedStyle(body).opacity : null,
      focus: active
        ? `${active.tagName.toLowerCase()} ${active.getAttribute("href") || active.className || ""}`.trim()
        : null,
    };
  });
// Holds the next navigation's swap back while the outgoing copy is mounted.
// Delaying the response at the network layer instead crashes wrangler dev.
const delaySwap = (ms) =>
  document.addEventListener(
    "astro:before-preparation",
    (event) => {
      const load = event.loader;
      event.loader = async () => {
        await new Promise((resolve) => setTimeout(resolve, ms));
        await load();
      };
    },
    { once: true },
  );
async function session(name, options, run, engine = browser) {
  if (PICK.length && !PICK.some((prefix) => name.startsWith(prefix))) return;
  const context = await engine.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: "dark",
    ...options,
  });
  if (options.init) await context.addInitScript(options.init);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const theme = options.colorScheme || "dark";
  await page.goto(`${BASE}${options.start || "/writing"}?theme=${theme}`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(900);
  report[name] = { ...(await run(page, context)), errors };
  console.log(name, JSON.stringify(report[name]));
  await context.close();
}

// m50: a phone toolbar collapsing changes only the height.
await session(
  "height-resize-mid-open",
  { ...devices["iPhone 13"] },
  async (page) => {
    await page.tap("a.writing-card");
    await page.waitForFunction(
      () => document.documentElement.dataset.writingTransition,
    );
    await page.setViewportSize({ width: 390, height: 780 });
    await page.waitForTimeout(60);
    const during = await state(page);
    await page.waitForTimeout(1200);
    return { during, after: await state(page) };
  },
);
// A width change does abort, and the page still ends clean.
await session("width-resize-mid-open", {}, async (page) => {
  await page.click("a.writing-card");
  await page.waitForFunction(
    () => document.documentElement.dataset.writingTransition,
  );
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.waitForTimeout(60);
  return {
    during: await state(page),
    after: (await page.waitForTimeout(900), await state(page)),
  };
});
// m93: animations that never finish still hand the page back.
await session("stalled-animations", {}, async (page) => {
  await page.evaluate(() =>
    document.addEventListener(
      "astro:after-swap",
      () =>
        setTimeout(() => document.getAnimations().forEach((a) => a.pause()), 0),
      { once: true },
    ),
  );
  await page.click("a.writing-card");
  await page.waitForTimeout(300);
  const during = await state(page);
  await page.waitForTimeout(1200);
  return { during, after: await state(page) };
});
// Reduced motion and light theme: instant swap, same focus targets.
for (const [name, options] of [
  ["reduced-motion", { reducedMotion: "reduce" }],
  ["light-theme", { colorScheme: "light" }],
]) {
  await session(name, options, async (page) => {
    await page.click("a.writing-card");
    await page.waitForTimeout(80);
    const open = await state(page);
    await page.waitForTimeout(500);
    await page.click(".back");
    await page.waitForTimeout(500);
    return { open, close: await state(page) };
  });
}
// Article to a non-writing page keeps the exit path.
await session("exit-to-work", {}, async (page) => {
  await page.click("a.writing-card");
  await page.waitForTimeout(1000);
  await page.click('a.nav-link[href="/work"]');
  await page.waitForTimeout(120);
  const during = await state(page);
  await page.waitForTimeout(1000);
  return { during, after: await state(page) };
});
// A second navigation mid-flight: history back 150 ms into the open.
await session("back-mid-open", {}, async (page) => {
  await page.click("a.writing-card");
  await page.waitForTimeout(150);
  await page.goBack();
  await page.waitForTimeout(1200);
  return { after: await state(page) };
});
// Tab hidden mid-flight and shown again two seconds later.
await session("hidden-tab-mid-open", {}, async (page) => {
  await page.click("a.writing-card");
  await page.waitForTimeout(100);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  await cdp.send("Page.setWebLifecycleState", { state: "frozen" });
  await new Promise((r) => setTimeout(r, 2000));
  await cdp.send("Page.setWebLifecycleState", { state: "active" });
  await page.waitForTimeout(800);
  return { after: await state(page) };
});
// Focus the visitor moves during the motion stays where they put it.
await session("tab-mid-open", {}, async (page) => {
  await page.focus("main a.writing-card");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => location.pathname !== "/writing");
  await page.waitForTimeout(90);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const moved = await state(page);
  await page.waitForTimeout(1200);
  const after = await state(page);
  return { moved: moved.focus, after, kept: moved.focus === after.focus };
});
await session("theme-toggle-mid-open", {}, async (page) => {
  await page.click("main a.writing-card");
  await page.waitForFunction(() => location.pathname !== "/writing");
  await page.waitForTimeout(90);
  await page.focus("#theme-toggle");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
  const after = await state(page);
  return {
    after,
    kept:
      after.focus === "button theme-toggle" || /theme-toggle/.test(after.focus),
  };
});
// Reduced motion switched on mid-open still lands focus on the h1.
await session("reduced-motion-change-mid-open", {}, async (page) => {
  await page.click("main a.writing-card");
  await page.waitForFunction(
    () => document.documentElement.dataset.writingTransition,
  );
  await page.waitForTimeout(60);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(1000);
  const after = await state(page);
  return { after, h1: after.focus === "h1 title" };
});
// The viewport width changes while the destination loads: no motion runs
// on geometry read from the old layout.
await session("width-before-swap", {}, async (page) => {
  await page.evaluate(delaySwap, 400);
  await page.evaluate(() => {
    window.__flags = [];
    new MutationObserver(() =>
      window.__flags.push(document.documentElement.dataset.writingTransition),
    ).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-writing-transition"],
    });
  });
  await page.click("main a.writing-card");
  await page.waitForTimeout(100);
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.waitForTimeout(1500);
  const after = await state(page);
  const flags = await page.evaluate(() => window.__flags);
  return { after, flags, motionRan: flags.some(Boolean) };
});
// Back link from an article loaded directly: the card is brought into view
// and focused.
await session(
  "offscreen-return-focus",
  {
    ...devices["iPhone 13"],
    start: "/writing/stop-ending-your-day-with-fix-the-bug",
  },
  async (page) => {
    await page.tap(".back");
    await page.waitForTimeout(1400);
    const after = await state(page);
    const card = await page.evaluate(() => {
      const r = document.activeElement.getBoundingClientRect();
      return {
        top: r.top,
        bottom: r.bottom,
        innerHeight,
        onScreen: r.bottom > 0 && r.top < innerHeight,
      };
    });
    return { after, card };
  },
);
// The open from the more-writing list while scrolled: the persisted nav
// arrives with the page instead of standing over the old copy.
await session("scrolled-article-to-article", {}, async (page) => {
  await page.click("main a.writing-card");
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const el = document.querySelector(".more-writing a.writing-card");
    scrollBy(0, el.getBoundingClientRect().top - innerHeight / 3);
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    window.__nav = [];
    const tick = () => {
      if (document.documentElement.dataset.writingTransition) {
        const nav = document.querySelector("header.nav");
        let o = 1;
        for (let n = nav; n && n.nodeType === 1; n = n.parentElement)
          o *= Number(getComputedStyle(n).opacity);
        const frame = document.querySelector(".writing-transition-ghost");
        const scope =
          frame?.firstElementChild?.shadowRoot || frame?.firstElementChild;
        window.__nav.push({
          top: nav.getBoundingClientRect().top,
          opacity: +o.toFixed(2),
          ghostFooter: !!scope?.querySelector("footer.foot"),
        });
      }
      if (window.__nav.length < 40) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.click(".more-writing a.writing-card");
  await page.waitForTimeout(1200);
  const frames = await page.evaluate(() => window.__nav);
  const early = frames.slice(0, 5);
  return {
    after: await state(page),
    early,
    navCoversCopy: early.some((f) => f.opacity > 0.3),
  };
});
// Engines without adoptedStyleSheets: the light-DOM copy resolves the same
// text styles as the live page it stands in for.
const PROPS = ["fontFamily", "fontSize", "lineHeight", "color"];
const lightDom = () => {
  delete ShadowRoot.prototype.adoptedStyleSheets;
  delete Document.prototype.adoptedStyleSheets;
};
const ghostStyles = async (engine, prefix = "") => {
  for (const [name, init] of [
    ["ghost-styles-native", undefined],
    ["ghost-styles-light-dom", lightDom],
  ])
    await session(
      `${prefix}${name}`,
      { init },
      async (page) => {
        const read = (selectors, props, inGhost) => {
          const frame = document.querySelector(".writing-transition-ghost");
          const host = frame?.firstElementChild;
          const root = inGhost ? host?.shadowRoot || host : document;
          return Object.fromEntries(
            selectors.map((s) => {
              const el = root?.querySelector(s);
              if (!el) return [s, null];
              const cs = getComputedStyle(el);
              // Text styles and the box, to the pixel.
              const r = el.getBoundingClientRect();
              const box = [r.left, r.top, r.width].map(Math.round).join(",");
              return [s, [...props.map((p) => cs[p]), box].join(" | ")];
            }),
          );
        };
        const diff = (live, ghost) =>
          Object.keys(live).filter((k) => live[k] !== ghost[k]);
        const listing = [
          "main .page-hero__summary",
          "main a.writing-card .title",
          "main a.writing-card .sub",
        ];
        const liveListing = await page.evaluate(
          ([s, p, fn]) => eval(`(${fn})`)(s, p, false),
          [listing, PROPS, read.toString()],
        );
        await page.evaluate(delaySwap, 500);
        await page.click("main a.writing-card");
        await page.waitForSelector(".writing-transition-ghost", {
          state: "attached",
        });
        const openGhost = await page.evaluate(
          ([s, p, fn]) => eval(`(${fn})`)(s, p, true),
          [listing, PROPS, read.toString()],
        );
        await page.waitForTimeout(1500);
        const article = [
          "[data-writing-article] .article-body p",
          "[data-writing-article] > header .back",
        ];
        const liveArticle = await page.evaluate(
          ([s, p, fn]) => eval(`(${fn})`)(s, p, false),
          [article, PROPS, read.toString()],
        );
        await page.evaluate(delaySwap, 500);
        await page.click(".back");
        await page.waitForSelector(".writing-transition-ghost", {
          state: "attached",
        });
        const closeGhost = await page.evaluate(
          ([s, p, fn]) => eval(`(${fn})`)(s, p, true),
          [article, PROPS, read.toString()],
        );
        await page.waitForTimeout(1200);
        return {
          after: await state(page),
          openDiff: diff(liveListing, openGhost),
          closeDiff: diff(liveArticle, closeGhost),
          liveListing,
          openGhost,
          liveArticle,
          closeGhost,
        };
      },
      engine,
    );
};
await ghostStyles(browser);
// g06: a second tap while the article opens must not land on the invisible
// incoming page. Off-site requests are blocked and recorded.
for (const delay of [150, 300])
  await session(
    `second-tap-mid-open-${delay}`,
    { ...devices["iPhone 13"] },
    async (page, context) => {
      const offsite = [];
      await context.route(
        (url) => !url.href.startsWith(BASE),
        (route) => {
          offsite.push(route.request().url());
          return route.abort();
        },
      );
      const point = await page.evaluate(() => {
        const cards = document.querySelectorAll("main a.writing-card");
        const r = (cards[1] || cards[0]).getBoundingClientRect();
        const y = r.top + r.height / 2;
        return {
          x: r.left + r.width / 2,
          y: y < innerHeight ? y : innerHeight * 0.7,
        };
      });
      const first = await page.evaluate(
        () => document.querySelector("main a.writing-card").pathname,
      );
      await page.tap("main a.writing-card");
      await page.waitForTimeout(delay);
      const hit = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        const main = document.querySelector("main");
        return {
          url: location.pathname,
          target: el
            ? `${el.tagName.toLowerCase()} ${el.className || ""}`.trim()
            : null,
          insideMain: !!main?.contains(el),
          mainInert: !!main?.inert,
          mainOpacity: main ? getComputedStyle(main).opacity : null,
        };
      }, point);
      await page.touchscreen.tap(point.x, point.y);
      await page.waitForTimeout(1500);
      const after = await state(page);
      return {
        hit,
        after,
        offsite,
        landedOnFirst: after.url === first,
        // The second tap must not reach the incoming page while it is hidden.
        pass:
          after.url === first &&
          !offsite.length &&
          after.overlays === 0 &&
          !(hit.insideMain && !hit.mainInert),
      };
    },
  );
// g07: returns with the article header off screen. Per frame while the
// transition flag is set: the surface clip box, the old page copy and main
// opacity, and the travelling words.
const frameLog = () => {
  window.__log = [];
  const start = performance.now();
  const shown = (el) => {
    let o = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement)
      o *= Number(getComputedStyle(n).opacity);
    return o;
  };
  const tick = () => {
    const flag = document.documentElement.dataset.writingTransition;
    if (flag) {
      const surface = document.querySelector(".writing-transition-surface");
      const frame = document.querySelector(".writing-transition-ghost");
      const main = document.querySelector("main");
      const m = /inset\(([^)]*?)(?:\s+round[^)]*)?\)/.exec(
        surface ? getComputedStyle(surface).clipPath : "",
      );
      let clip = null;
      if (m) {
        const [t, r = t, b = t, l = r] = m[1]
          .trim()
          .split(/\s+/)
          .map(parseFloat);
        clip = [l, t, innerWidth - r, innerHeight - b].map(
          (v) => +v.toFixed(0),
        );
      }
      // Without a clip (an older build), the surface box itself.
      const box = surface?.getBoundingClientRect();
      window.__log.push({
        t: +(performance.now() - start).toFixed(0),
        flag,
        clip,
        surface:
          clip ??
          (box
            ? [box.left, box.top, box.right, box.bottom].map(
                (v) => +v.toFixed(0),
              )
            : null),
        ghost: frame ? +shown(frame.firstElementChild).toFixed(2) : 0,
        main: +shown(main).toFixed(2),
        words: [...document.querySelectorAll(".writing-transition-word")].map(
          (el) => {
            const r = el.getBoundingClientRect();
            return [
              el.dataset.layer,
              +r.top.toFixed(0),
              +r.bottom.toFixed(0),
              +shown(el).toFixed(2),
            ];
          },
        ),
      });
    }
    if (performance.now() - start < 3000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
const judgeReturn = (log, height) => {
  const first = log[0];
  const offscreen = (top, bottom) => bottom <= 0 || top >= height;
  return {
    path: first?.flag ?? null,
    frames: log.length,
    // The surface starts outside the viewport.
    surfaceOffscreenFrames: log.filter(
      (f) => f.surface && offscreen(f.surface[1], f.surface[3]),
    ).length,
    // Unclipped old page copy and the new listing both above 0.3.
    overprintFrames: log.filter((f) => !f.clip && f.ghost > 0.3 && f.main > 0.3)
      .length,
    // Words shown in the first frame that start off screen.
    offscreenOutWords: (first?.words ?? []).filter(
      ([, top, bottom, o]) => o > 0.02 && offscreen(top, bottom),
    ).length,
  };
};
const openFirst = async (page) => {
  await page.tap("main a.writing-card");
  await page.waitForTimeout(1400);
};
for (const [name, prepare, act] of [
  [
    "scrolled-return-back-1500",
    (page) => page.evaluate(() => scrollTo({ top: 1500, behavior: "instant" })),
    (page) => page.goBack(),
  ],
  [
    "scrolled-return-view-all",
    (page) =>
      page.evaluate(() =>
        document
          .querySelector(".more-heading a")
          .scrollIntoView({ block: "center", behavior: "instant" }),
      ),
    (page) => page.tap(".more-heading a"),
  ],
  [
    "partial-header-return-back",
    // The title scrolled just out of view while the header waves still show.
    (page) =>
      page.evaluate(() => {
        const h1 = document.querySelector("[data-writing-article] > header h1");
        scrollTo({
          top: h1.getBoundingClientRect().bottom + scrollY + 4,
          behavior: "instant",
        });
      }),
    (page) => page.goBack(),
  ],
])
  await session(name, { ...devices["iPhone 13"] }, async (page) => {
    await openFirst(page);
    await prepare(page);
    await page.waitForTimeout(500);
    const scroll = await page.evaluate(() => scrollY);
    await page.evaluate(frameLog);
    await act(page);
    await page.waitForTimeout(1600);
    const log = await page.evaluate(() => window.__log);
    const verdict = judgeReturn(log, 844);
    return {
      scroll,
      ...verdict,
      after: await state(page),
      pass:
        verdict.surfaceOffscreenFrames === 0 &&
        verdict.overprintFrames === 0 &&
        verdict.offscreenOutWords === 0,
      sample: log.slice(0, 3),
    };
  });
// g09 and g10: a tapped card acknowledges the tap while the article loads,
// in both themes, and clears when the navigation is abandoned; a repeat tap
// on the same card does not restart the navigation. Every navigation here
// is held 600 ms before it swaps.
const holdSwaps = () =>
  document.addEventListener("astro:before-preparation", (event) => {
    window.__preps = (window.__preps || 0) + 1;
    const load = event.loader;
    event.loader = async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await load();
    };
  });
const affordance = () => {
  const card = document.querySelector("main a.writing-card");
  return card
    ? {
        pending: card.hasAttribute("data-writing-pending"),
        color: getComputedStyle(card.querySelector(".affordance")).color,
      }
    : null;
};
for (const theme of ["dark", "light"]) {
  await session(
    `pending-tap-${theme}`,
    { ...devices["iPhone 13"], colorScheme: theme },
    async (page) => {
      await page.evaluate(holdSwaps);
      const rest = await page.evaluate(affordance);
      await page.tap("main a.writing-card");
      await page.waitForTimeout(250);
      const loading = await page.evaluate(affordance);
      await page.waitForTimeout(1200);
      return {
        rest,
        loading,
        after: await state(page),
        pass: !rest.pending && loading.pending && loading.color !== rest.color,
      };
    },
  );
  await session(
    `pending-abort-${theme}`,
    { colorScheme: theme },
    async (page) => {
      await page.evaluate(holdSwaps);
      await page.click("main a.writing-card");
      await page.waitForTimeout(150);
      const loading = await page.evaluate(affordance);
      // A second navigation abandons the first before it swaps.
      await page.evaluate(() =>
        document.querySelector('a.nav-link[href="/work"]').click(),
      );
      await page.waitForTimeout(100);
      const abandoned = await page.evaluate(affordance);
      await page.waitForTimeout(1200);
      return {
        loading,
        abandoned,
        after: await state(page),
        pass: loading.pending && !abandoned?.pending,
      };
    },
  );
}
await session(
  "double-tap-same-card",
  { ...devices["iPhone 13"] },
  async (page) => {
    await page.evaluate(holdSwaps);
    const failed = [];
    page.on("requestfailed", (r) => failed.push(new URL(r.url()).pathname));
    await page.tap("main a.writing-card");
    await page.waitForTimeout(120);
    await page.tap("main a.writing-card");
    await page.waitForTimeout(1500);
    const preps = await page.evaluate(() => window.__preps);
    const after = await state(page);
    return { preps, failed, after, pass: preps === 1 && !failed.length };
  },
);
await browser.close();
// WebKit: a tap or click navigation lands focus without a focus ring, in
// both themes; keyboard navigation keeps it.
let wk;
try {
  wk = await webkit.launch({ headless: true });
} catch (error) {
  report["webkit-focus-ring"] = { skipped: String(error).split("\n")[0] };
}
if (wk) {
  // WebKit is the engine that lacked adoptedStyleSheets before 16.4.
  await ghostStyles(wk, "webkit-");
  for (const theme of ["light", "dark"])
    await session(
      `webkit-focus-ring-${theme}`,
      { colorScheme: theme },
      async (page) => {
        const ring = () =>
          page.evaluate(() => {
            const a = document.activeElement;
            const cs = getComputedStyle(a);
            return {
              active: `${a.tagName.toLowerCase()} ${a.getAttribute("href") || a.className}`,
              outline:
                cs.outlineStyle === "none"
                  ? "none"
                  : `${cs.outlineStyle} ${cs.outlineWidth}`,
            };
          });
        await page.click("main a.writing-card");
        await page.waitForTimeout(1400);
        const open = await ring();
        await page.click(".back");
        await page.waitForTimeout(1200);
        const close = await ring();
        // Keyboard navigation keeps a visible ring on the returned card.
        await page.keyboard.press("Enter");
        await page.waitForTimeout(1400);
        await page.focus("[data-writing-article] .back");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(1200);
        const keyboardClose = await ring();
        return {
          open,
          close,
          keyboardClose,
          pass:
            open.outline === "none" &&
            close.outline === "none" &&
            keyboardClose.outline !== "none",
        };
      },
      wk,
    );
  await wk.close();
}
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/checks.json`, JSON.stringify(report, null, 1));
