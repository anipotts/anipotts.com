import { unlockSyntheticBrowserRecovery } from "../support/browser-recovery-key";
import { test, type Browser } from "@e2e-dev/web";
import { expect, type TestFixtures } from "e2e";

type Fixtures = Pick<TestFixtures, "app" | "screen"> & { browser: Browser };

// e2e.admin.config.ts gives these synthetic drafts a disposable local DO/D1.
// Publication mutations are refused even on loopback; opening review may save
// a private candidate, but these tests never click Publish now or sign in.
async function syntheticArticle({ app, browser, screen }: Fixtures) {
  let publicationWrites = 0;
  await browser.route(
    /\/api\/editorial\/(?:publish|unpublish|retry-publication|cancel-publication)(?:\?|$)/,
    async (route) => {
      if (route.request.method === "GET") return route.continue();
      publicationWrites++;
      await route.fulfill({
        status: 409,
        json: { error: "synthetic_test_no_publication" },
      });
    },
  );
  await app.open("/content/new");
  await unlockSyntheticBrowserRecovery(browser);
  expect(
    await browser.evaluate(
      () =>
        location.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(location.hostname) &&
        Boolean(location.port),
    ),
  ).toBe(true);
  const title = `Synthetic record UI ${await browser.evaluate(() => crypto.randomUUID())}`;
  const field = screen.getByRole("textbox", { name: "Title", exact: true });
  await expect(field).toBeVisible({ timeout: 20_000 });
  await field.fill(title);
  await screen
    .getByRole("button", { name: "Create draft", exact: true })
    .click();
  await expect(
    screen.getByRole("textbox", { name: "Article body", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await screen
    .getByRole("textbox", { name: "Subtitle", exact: true })
    .fill("Synthetic record acceptance only.");
  return {
    title,
    path: new URL(await browser.url()).pathname,
    publicationWrites: () => publicationWrites,
  };
}

async function viewSource({ screen }: Fixtures, browser: Browser) {
  await screen
    .getByRole("button", { name: "More actions", exact: true })
    .click();
  const compact = await browser.evaluate(() => window.innerWidth <= 640);
  await screen
    .getByRole(compact ? "button" : "menuitem", {
      name: "View source",
      exact: true,
    })
    .click();
  const source = screen.getByRole("textbox", {
    name: "record source",
    exact: true,
  });
  await expect(source).toBeVisible();
  return source;
}

async function readSyntheticDraft(browser: Browser, path: string) {
  return browser.evaluate(async (recordPath) => {
    if (!["localhost", "127.0.0.1"].includes(location.hostname))
      throw new Error("Local record only");
    const id = /^\/content\/writing\/(synthetic-record-ui-[a-f0-9-]+)$/.exec(
      recordPath,
    )?.[1];
    if (!id) throw new Error("Expected the synthetic article identity");
    const response = await fetch(
      `/api/editorial/record?kind=writing&id=${encodeURIComponent(id)}`,
      { cache: "no-store" },
    );
    if (!response.ok)
      throw new Error(`Synthetic draft read failed: ${response.status}`);
    const value = (await response.json()) as {
      draft?: { source: string };
      publication?: unknown;
      base?: { publicationId?: string | null };
    };
    return {
      source: value.draft?.source ?? "",
      hasPublication: Boolean(value.publication),
      hasPublishedBase: Boolean(value.base?.publicationId),
    };
  }, path);
}

async function chooseType({ screen }: Fixtures, label: string) {
  await screen.getByRole("button", { name: "Link type", exact: true }).click();
  await screen.getByRole("menuitemradio", { name: label, exact: true }).click();
}

test(
  "article proof-link properties round trip through source and review without publication",
  { timeout: 120_000 },
  async (fixtures) => {
    const { app, browser, screen } = fixtures;
    const article = await syntheticArticle(fixtures);
    await screen
      .getByRole("button", { name: "Properties", exact: true })
      .click();
    const destination = screen.getByRole("textbox", {
      name: "Source or demo link",
      exact: true,
    });
    const label = screen.getByRole("textbox", {
      name: "Link label",
      exact: true,
    });
    await expect(destination).toHaveValue("");
    await expect(label).toHaveValue("");
    await destination.fill("/work/synthetic-demo");
    await label.fill("Open synthetic demo");
    await chooseType(fixtures, "Demo");
    await expect(destination).toHaveValue("/work/synthetic-demo");
    await expect(label).toHaveValue("Open synthetic demo");
    await app.screenshot("synthetic-article-proof-link-properties");
    await screen
      .getByRole("button", { name: "Close properties", exact: true })
      .click();
    const source = await viewSource(fixtures, browser);
    await expect(source).toContainText("artifact_url: /work/synthetic-demo");
    await expect(source).toContainText("artifact_label: Open synthetic demo");
    await expect(source).toContainText("artifact_type: demo");
    await screen
      .getByRole("button", { name: "Close source", exact: true })
      .click();

    // Publish opens the existing review. Activation is a separate control that
    // this test never presses, and the network guard would refuse its mutation.
    await screen.getByRole("button", { name: "Publish", exact: true }).click();
    const review = screen.getByRole("complementary", {
      name: "Review changes",
      exact: true,
    });
    await expect(review).toBeVisible();
    await expect(
      review.getByRole("region", { name: "Source or demo link", exact: true }),
    ).toContainText("/work/synthetic-demo", { timeout: 20_000 });
    await expect(
      review.getByRole("region", { name: "Link label", exact: true }),
    ).toContainText("Open synthetic demo");
    await expect(
      review.getByRole("region", { name: "Link type", exact: true }),
    ).toContainText("demo");
    await app.screenshot("synthetic-article-proof-link-review");
    await screen
      .getByRole("button", { name: "Close review changes", exact: true })
      .click();
    await screen
      .getByRole("button", { name: "Properties", exact: true })
      .click();
    await destination.fill("");
    await label.fill("");
    await chooseType(fixtures, "Not specified");
    await screen
      .getByRole("button", { name: "Close properties", exact: true })
      .click();
    await viewSource(fixtures, browser);
    await expect
      .poll(
        async () => (await readSyntheticDraft(browser, article.path)).source,
        { timeout: 20_000 },
      )
      .not.toMatch(/^artifact_(?:url|label|type):/m);
    const saved = await readSyntheticDraft(browser, article.path);
    expect(saved.hasPublication).toBe(false);
    expect(saved.hasPublishedBase).toBe(false);
    expect(article.publicationWrites()).toBe(0);
  },
);

/** Track real DOM and native performance observations across a cold document.
 * Safari may not expose LayoutShift entries; null records that limitation.
 * Timings include intentionally held API reads and have no invented budget. */
async function observeLoading(browser: Browser) {
  await browser.addInitScript(() => {
    const state = {
      owner: null as Element | null,
      peak: 0,
      replacements: 0,
      cls: 0,
      clsSupported: false,
    };
    Reflect.set(window, "__syntheticRecordUi", state);
    const inspect = () => {
      const regions = document.querySelectorAll(
        '[role="status"][aria-label="Loading editor"]',
      );
      state.peak = Math.max(state.peak, regions.length);
      const current = regions[0];
      if (!current) return;
      if (state.owner && current !== state.owner) state.replacements++;
      state.owner = current;
    };
    new MutationObserver(inspect).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["role", "aria-label"],
    });
    inspect();
    if (
      typeof PerformanceObserver !== "undefined" &&
      PerformanceObserver.supportedEntryTypes.includes("layout-shift")
    ) {
      state.clsSupported = true;
      new PerformanceObserver((entries) => {
        for (const item of entries.getEntries()) {
          const shift = item as PerformanceEntry & {
            value: number;
            hadRecentInput: boolean;
          };
          if (!shift.hadRecentInput) state.cls += shift.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    }
  });
}

async function loadingEvidence(browser: Browser) {
  return browser.evaluate(() => {
    const state = Reflect.get(window, "__syntheticRecordUi") as {
      peak: number;
      replacements: number;
      owner: Element | null;
      cls: number;
      clsSupported: boolean;
    };
    const navigation = performance.getEntriesByType("navigation")[0] as
      PerformanceNavigationTiming | undefined;
    return {
      peakLoadingOwners: state.peak,
      ownerReplacements: state.replacements,
      ownerConnected: Boolean(state.owner?.isConnected),
      sampledAtMs: performance.now(),
      cls: state.clsSupported ? state.cls : null,
      navigation: navigation
        ? {
            duration: navigation.duration,
            domContentLoadedMs: navigation.domContentLoadedEventEnd,
            loadMs: navigation.loadEventEnd,
            type: navigation.type,
          }
        : null,
    };
  });
}

test(
  "one loading owner survives a delayed record read, failure and retry, then clears on auth lock",
  { timeout: 120_000 },
  async (fixtures) => {
    const { app, browser, screen } = fixtures;
    const article = await syntheticArticle(fixtures);
    // Flush the synthetic subtitle through the ordinary guarded save before a
    // full document navigation, preserving the application's leave lifecycle.
    await viewSource(fixtures, browser);
    await expect
      .poll(
        async () => (await readSyntheticDraft(browser, article.path)).source,
        { timeout: 20_000 },
      )
      .toContain("Synthetic record acceptance only.");
    await screen
      .getByRole("button", { name: "Close source", exact: true })
      .click();
    await observeLoading(browser);
    let releaseFailure!: () => void;
    let releaseReady!: () => void;
    const failureGate = new Promise<void>((resolve) => {
      releaseFailure = resolve;
    });
    const readyGate = new Promise<void>((resolve) => {
      releaseReady = resolve;
    });
    let reads = 0;
    let deny = false;
    const recordRoute = /\/api\/editorial\/record\?/;
    await browser.route(recordRoute, async (route) => {
      if (route.request.method !== "GET") return route.continue();
      if (deny)
        return route.fulfill({
          status: 401,
          json: { error: "owner_required" },
        });
      reads++;
      if (reads === 1) {
        await failureGate;
        return route.fulfill({
          status: 503,
          json: { error: "synthetic_unavailable" },
        });
      }
      if (reads === 2) await readyGate;
      await route.continue();
    });
    try {
      await browser.reload();
      await unlockSyntheticBrowserRecovery(browser);
      await expect.poll(() => reads).toBe(1);
      const loading = screen.getByRole("status", {
        name: "Loading editor",
        exact: true,
      });
      await expect(loading).toHaveCount(1);
      const first = await loadingEvidence(browser);
      expect(first.peakLoadingOwners).toBe(1);
      expect(first.ownerReplacements).toBe(0);
      releaseFailure();
      await expect(
        screen.getByText("Couldn’t load this draft.", { exact: true }),
      ).toBeVisible();
      await expect(loading).toHaveCount(0);
      await app.screenshot("synthetic-record-read-failure");
      await screen
        .getByRole("button", { name: "Try again", exact: true })
        .click();
      await expect.poll(() => reads).toBe(2);
      await expect(loading).toHaveCount(1);
      const retry = await loadingEvidence(browser);
      expect(retry.peakLoadingOwners).toBe(1);
      expect(retry.ownerReplacements).toBe(0);
      releaseReady();
      await expect(
        screen.getByRole("textbox", { name: "Title", exact: true }),
      ).toHaveValue(article.title, { timeout: 20_000 });
      await expect(loading).toHaveCount(0);
      const cold = await loadingEvidence(browser);
      expect(cold.ownerConnected).toBe(true);
      expect(cold.ownerReplacements).toBe(0);
      console.info(
        "record-ui-performance",
        JSON.stringify({
          scenario: "cold-document-with-controlled-record-delay-and-retry",
          ...cold,
        }),
      );
      await browser.reload();
      await unlockSyntheticBrowserRecovery(browser);
      await expect(
        screen.getByRole("textbox", { name: "Title", exact: true }),
      ).toHaveValue(article.title, { timeout: 20_000 });
      await expect(loading).toHaveCount(0);
      console.info(
        "record-ui-performance",
        JSON.stringify({
          scenario: "warm-document-reload",
          ...(await loadingEvidence(browser)),
        }),
      );
      deny = true;
      await browser.reload();
      await unlockSyntheticBrowserRecovery(browser);
      await expect(
        screen.getByRole("heading", { name: "Session ended", exact: true }),
      ).toBeVisible({ timeout: 20_000 });
      await expect(loading).toHaveCount(0);
      await expect(
        screen.getByRole("textbox", { name: "Article body", exact: true }),
      ).toHaveCount(0);
      expect(article.publicationWrites()).toBe(0);
    } finally {
      releaseFailure();
      releaseReady();
    }
  },
);

test(
  "overflowing source and article text keep native scroll rules and keyboard progress",
  { timeout: 120_000 },
  async (fixtures) => {
    const { app, browser, screen } = fixtures;
    const article = await syntheticArticle(fixtures);
    const source = await viewSource(fixtures, browser);
    // Reference definitions intentionally use the existing Markdown-preserving
    // textarea rather than asking the visual editor to round-trip that syntax.
    const body =
      "[synthetic-reference]: https://example.test/reference\n\n" +
      Array.from(
        { length: 180 },
        (_, index) =>
          `Synthetic paragraph ${index + 1}. Keyboard scrolling must preserve this text.\n`,
      ).join("\n");
    const document = `---\ntitle: ${JSON.stringify(article.title)}\nsummary: Synthetic scroll acceptance only.\nstatus: draft\ncontent_type: article\ntags: []\n---\n${body}`;
    await source.fill(document);
    await expect
      .poll(() =>
        browser.evaluate(() => {
          const main = window.document.getElementById("astryx-app-shell-main");
          const root = window.document.scrollingElement;
          return Boolean(
            (main &&
              main.scrollHeight > main.clientHeight + 1 &&
              ["auto", "scroll"].includes(getComputedStyle(main).overflowY)) ||
            (root && root.scrollHeight > root.clientHeight + 1),
          );
        }),
      )
      .toBe(true);
    const viewport = await browser.evaluate(() => {
      const main = window.document.getElementById("astryx-app-shell-main");
      const root = window.document.scrollingElement as HTMLElement;
      const surface =
        main &&
        main.scrollHeight > main.clientHeight + 1 &&
        ["auto", "scroll"].includes(getComputedStyle(main).overflowY)
          ? main
          : root;
      surface.tabIndex = -1;
      surface.scrollTop = 0;
      surface.focus({ preventScroll: true });
      const css = getComputedStyle(surface);
      return {
        selector:
          surface === main
            ? "#astryx-app-shell-main"
            : surface.tagName.toLowerCase(),
        overflowing: surface.scrollHeight > surface.clientHeight + 1,
        scrollbarWidth: css.scrollbarWidth || null,
        webkitDisplay:
          getComputedStyle(surface, "::-webkit-scrollbar").display || null,
      };
    });
    expect(viewport.overflowing).toBe(true);
    expect(viewport.scrollbarWidth).not.toBe("none");
    expect(viewport.webkitDisplay).not.toBe("none");
    await browser.locator(viewport.selector).press("PageDown");
    await expect
      .poll(() =>
        browser.evaluate(
          (selector) => window.document.querySelector(selector)?.scrollTop ?? 0,
          viewport.selector,
        ),
      )
      .toBeGreaterThan(0);
    await app.screenshot("synthetic-source-keyboard-scroll");
    await screen
      .getByRole("button", { name: "Close source", exact: true })
      .click();
    const text = screen.getByRole("textbox", {
      name: "Article body",
      exact: true,
    });
    await expect(text).toHaveValue(body);
    const textarea = await browser.evaluate(() => {
      const target = Array.from(
        window.document.querySelectorAll("textarea"),
      ).find(
        (field) =>
          field.getAttribute("aria-label") === "Article body" ||
          Array.from(field.labels ?? []).some(
            (label) => label.textContent?.trim() === "Article body",
          ),
      );
      if (!target) throw new Error("Expected the native Markdown textarea");
      target.dataset.syntheticRecordScroll = "true";
      target.focus();
      target.setSelectionRange(0, 0);
      target.scrollTop = 0;
      return {
        overflowing: target.scrollHeight > target.clientHeight + 1,
        scrollbarWidth: getComputedStyle(target).scrollbarWidth || null,
        webkitDisplay:
          getComputedStyle(target, "::-webkit-scrollbar").display || null,
      };
    });
    expect(textarea.overflowing).toBe(true);
    expect(textarea.scrollbarWidth).not.toBe("none");
    expect(textarea.webkitDisplay).not.toBe("none");
    await text.press("PageDown");
    await expect
      .poll(() =>
        browser.evaluate(
          () =>
            window.document.querySelector<HTMLTextAreaElement>(
              'textarea[data-synthetic-record-scroll="true"]',
            )?.scrollTop ?? 0,
        ),
      )
      .toBeGreaterThan(0);
    await expect(text).toHaveValue(body);
    expect(article.publicationWrites()).toBe(0);
    // Overlay scrollbar pixels follow the OS preference; these assertions prove
    // real overflow, non-suppression in CSS, and keyboard movement only.
  },
);

/** Read the browser's actual CSS/media and field styles. A phone-sized viewport
 * is not proof of touch: the installed runner cannot emulate pointer media. */
async function migrationTypography(browser: Browser, labels: string[]) {
  return browser.evaluate((names) => {
    const fields = Array.from(
      document.querySelectorAll<HTMLElement>(
        'input, textarea, [contenteditable="true"][role="textbox"]',
      ),
    );
    return {
      width: innerWidth,
      coarse: matchMedia("(pointer: coarse)").matches,
      hover: matchMedia("(hover: hover)").matches,
      fields: names.map((label) => {
        const field = fields.find(
          (item) =>
            item.getAttribute("aria-label") === label ||
            Array.from((item as HTMLInputElement).labels ?? []).some(
              (node) => node.textContent?.trim() === label,
            ),
        );
        if (!field) throw new Error(`Expected synthetic ${label} field`);
        const style = getComputedStyle(field);
        return {
          label,
          fontSize: Number.parseFloat(style.fontSize),
          fontFamily: style.fontFamily,
          sdk: Boolean(field.closest('[data-admin-ui="openai"]')),
        };
      }),
    };
  }, labels);
}

async function assertMigrationTypography(
  browser: Browser,
  labels: string[],
  sdk: boolean,
) {
  const evidence = await migrationTypography(browser, labels);
  for (const field of evidence.fields) {
    expect(field.sdk).toBe(sdk);
    expect(field.fontFamily).toContain("Instrument Sans");
    expect(field.fontSize).toBeGreaterThan(0);
    if (evidence.coarse) expect(field.fontSize).toBeGreaterThanOrEqual(16);
  }
  console.info("astryx-family-native-typography", JSON.stringify(evidence));
  // These assertions do not claim that a fine-pointer phone viewport exercised
  // the coarse adaptation, or that a computed family proves a font downloaded.
}

async function panelRelationships(browser: Browser) {
  return browser.evaluate(() => {
    const panel = document.querySelector(".record-panel-host");
    if (!panel) throw new Error("Expected the actual record panel");
    return Array.from(
      panel.querySelectorAll(
        "[aria-controls],[aria-describedby],[aria-labelledby]",
      ),
    ).flatMap((element) =>
      ["aria-controls", "aria-describedby", "aria-labelledby"].flatMap(
        (attribute) => {
          const value = element.getAttribute(attribute);
          if (value === null) return [];
          const ids = value.split(/\s+/).filter(Boolean);
          if (ids.length === 0) return [`${attribute}=empty`];
          return ids
            .filter((id) => !document.getElementById(id))
            .map((id) => `${attribute}=${id}`);
        },
      ),
    );
  });
}

/** Measure the app's own inset, rather than hashing upstream StyleX classes.
 * A second default BottomSheet inset would move the anchor by spacing-4. */
async function assertOwnedSheetInset(browser: Browser, actionSheet = false) {
  const geometry = await browser.evaluate((actions) => {
    if (innerWidth > 640) return null;
    const panel = document.querySelector<HTMLElement>(
      actions ? ".editor-action-sheet" : ".record-panel-sheet",
    );
    const anchor = panel?.querySelector<HTMLElement>(
      actions ? ".editor-action-sheet-item" : "h2",
    );
    if (!panel || !anchor)
      throw new Error("Expected the actual compact sheet content");
    let stack = anchor.parentElement;
    while (
      stack &&
      stack !== panel &&
      Number.parseFloat(getComputedStyle(stack).paddingInlineStart) === 0
    )
      stack = stack.parentElement;
    if (!stack || stack === panel)
      throw new Error("Expected the application's padded stack");
    return {
      inset:
        anchor.getBoundingClientRect().left -
        panel.getBoundingClientRect().left -
        Number.parseFloat(getComputedStyle(panel).borderLeftWidth),
      ownedPadding: Number.parseFloat(
        getComputedStyle(stack).paddingInlineStart,
      ),
    };
  }, actionSheet);
  if (!geometry) return;
  expect(geometry.ownedPadding).toBeGreaterThan(0);
  expect(Math.abs(geometry.inset - geometry.ownedPadding)).toBeLessThanOrEqual(
    2,
  );
}

async function titleGeometry(browser: Browser) {
  return browser.evaluate(() => {
    const field = Array.from(document.querySelectorAll("textarea")).find(
      (item) =>
        item.getAttribute("aria-label") === "Title" ||
        Array.from(item.labels ?? []).some(
          (label) => label.textContent?.trim() === "Title",
        ),
    );
    if (!field) throw new Error("Expected the actual autosize title textarea");
    return {
      height: field.clientHeight,
      scrollHeight: field.scrollHeight,
      rows: field.rows,
    };
  });
}

test(
  "Astryx migration preserves Writing typography, autosize, tooltip Escape and SDK selectors in sheets",
  { timeout: 120_000 },
  async (fixtures) => {
    const { app, browser, screen } = fixtures;
    const article = await syntheticArticle(fixtures);
    await assertMigrationTypography(browser, ["Title", "Subtitle"], true);
    const title = screen.getByRole("textbox", { name: "Title", exact: true });
    await title.fill("Short synthetic title");
    const short = await titleGeometry(browser);
    const longTitle =
      "Synthetic acceptance title that wraps across the writing surface. "
        .repeat(2)
        .trim();
    await title.fill(longTitle);
    await expect
      .poll(async () => (await titleGeometry(browser)).height)
      .toBeGreaterThan(short.height);
    const long = await titleGeometry(browser);
    expect(long.rows).toBe(1);
    expect(long.scrollHeight - long.height).toBeLessThanOrEqual(2);
    await title.fill("Short synthetic title");
    await expect
      .poll(async () => (await titleGeometry(browser)).height)
      .toBeLessThan(long.height);

    // This control deliberately uses Core's useTooltip over the SDK button.
    // Native hover opens it; Escape must cancel any pending focus show without
    // taking focus away or reopening after the authored 300ms hover delay.
    const properties = screen.getByRole("button", {
      name: "Properties",
      exact: true,
    });
    await properties.hover();
    const tooltip = browser.locator('[role="tooltip"][popover]:popover-open');
    await expect(tooltip).toContainText("Properties");
    await properties.focus();
    await browser.keyboard.press("Escape");
    await expect(tooltip).toHaveCount(0);
    await expect(properties).toBeFocused();
    const stayedClosed = await browser.evaluate(async () => {
      let reopened = false;
      const sample = () => {
        if (document.querySelector('[role="tooltip"][popover]:popover-open'))
          reopened = true;
      };
      const timer = setInterval(sample, 16);
      try {
        await new Promise<void>((resolve) => setTimeout(resolve, 500));
        sample();
        return !reopened;
      } finally {
        clearInterval(timer);
      }
    });
    expect(stayedClosed).toBe(true);
    await expect(properties).toBeFocused();

    if (await browser.evaluate(() => innerWidth <= 640)) {
      await screen
        .getByRole("button", { name: "More actions", exact: true })
        .click();
      await expect(
        screen.getByRole("dialog", { name: "More actions", exact: true }),
      ).toBeVisible();
      await assertOwnedSheetInset(browser, true);
      await browser.keyboard.press("Escape");
      await expect(
        screen.getByRole("button", { name: "More actions", exact: true }),
      ).toBeFocused();
    }
    await properties.click();
    await expect(
      screen.getByRole("textbox", { name: "Source or demo link", exact: true }),
    ).toBeVisible();
    await assertMigrationTypography(
      browser,
      ["Source or demo link", "Link label"],
      true,
    );
    await assertOwnedSheetInset(browser);
    expect(await panelRelationships(browser)).toEqual([]);
    const selector = screen.getByRole("button", {
      name: "Link type",
      exact: true,
    });
    await selector.click();
    await expect(
      screen.getByRole("menuitemradio", { name: "Demo", exact: true }),
    ).toBeVisible();
    expect(await panelRelationships(browser)).toEqual([]);
    await browser.keyboard.press("Escape");
    await expect(selector).toBeFocused();
    await expect(
      screen.getByRole("textbox", { name: "Source or demo link", exact: true }),
    ).toBeVisible();
    expect(await panelRelationships(browser)).toEqual([]);
    await chooseType(fixtures, "Demo");
    await app.screenshot("astryx-family-writing-properties");
    await screen
      .getByRole("button", { name: "Close properties", exact: true })
      .click();
    expect(article.publicationWrites()).toBe(0);
  },
);

test(
  "Astryx migration preserves native Core fields and nested selector focus and relationships",
  { timeout: 120_000 },
  async ({ app, browser, screen }) => {
    let publicationWrites = 0;
    await browser.route(
      /\/api\/editorial\/(?:publish|unpublish|retry-publication|cancel-publication)(?:\?|$)/,
      async (route) => {
        if (route.request.method === "GET") return route.continue();
        publicationWrites++;
        await route.fulfill({
          status: 409,
          json: { error: "synthetic_test_no_publication" },
        });
      },
    );
    await app.open("/content/new-project");
    await unlockSyntheticBrowserRecovery(browser);
    const title = `Synthetic Astryx project ${await browser.evaluate(() => crypto.randomUUID())}`;
    await screen
      .getByRole("textbox", { name: "Title", exact: true })
      .fill(title);
    await screen
      .getByRole("button", { name: "Edit address", exact: true })
      .click();
    await assertMigrationTypography(
      browser,
      ["Title", "Project address"],
      false,
    );
    await screen
      .getByRole("button", { name: "Create draft", exact: true })
      .click();
    await expect
      .poll(async () => new URL(await browser.url()).pathname)
      .toMatch(/^\/content\/projects\/synthetic-astryx-project-[a-f0-9-]+$/);
    await screen
      .getByRole("button", { name: "Properties", exact: true })
      .click();
    await expect(
      screen.getByRole("textbox", { name: "Year", exact: true }),
    ).toBeVisible();
    await assertMigrationTypography(
      browser,
      ["Year", "Role", "Duration"],
      false,
    );
    await assertOwnedSheetInset(browser);
    expect(await panelRelationships(browser)).toEqual([]);
    const selector = screen.getByRole("combobox", {
      name: "Category",
      exact: true,
    });
    await expect(selector).toHaveAttribute("aria-expanded", "false");
    await selector.click();
    await expect(
      screen.getByRole("option", { name: "Product", exact: true }),
    ).toBeVisible();
    await expect(selector).toHaveAttribute("aria-expanded", "true");
    await expect(selector).toHaveAttribute("aria-controls");
    expect(await panelRelationships(browser)).toEqual([]);
    await screen.getByRole("option", { name: "Product", exact: true }).click();
    await expect(selector).toContainText("Product");
    await expect(selector).toBeFocused();
    await expect(
      screen.getByRole("textbox", { name: "Year", exact: true }),
    ).toBeVisible();
    expect(await panelRelationships(browser)).toEqual([]);
    await selector.click();
    await expect(
      screen.getByRole("option", { name: "Product", exact: true }),
    ).toBeVisible();
    await browser.keyboard.press("Escape");
    await expect(selector).toHaveAttribute("aria-expanded", "false");
    await expect(selector).toBeFocused();
    await expect(
      screen.getByRole("textbox", { name: "Year", exact: true }),
    ).toBeVisible();
    expect(await panelRelationships(browser)).toEqual([]);
    await app.screenshot("astryx-family-core-properties");
    await screen
      .getByRole("button", { name: "Close properties", exact: true })
      .click();
    expect(publicationWrites).toBe(0);
  },
);
