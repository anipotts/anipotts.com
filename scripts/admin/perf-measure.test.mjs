import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import {
  CELLS,
  HEIGHTS,
  browserDefaultsLaunch,
  buildPlan,
  createAnnouncementCounter,
  crossCheckProxy,
  intentSummary,
  markdown,
  navName,
  parseArgs,
  trackRequests,
} from "./perf-measure.mjs";

test("defaults add the 1024 width, an 80 ms press gap and Playwright defaults", () => {
  const options = parseArgs(["out.json"]);
  assert.deepEqual(options.widths, [390, 768, 1024, 1280]);
  assert.equal(HEIGHTS[1024], 900);
  assert.equal(options.pressGapMs, 80);
  assert.deepEqual(options.browserModes, ["playwright"]);
  assert.deepEqual(options.dwellsMs, [0]);
  assert.deepEqual(options.inputs, ["mouse"]);
  assert.equal(options.warmup, 0);
  assert.equal(options.interleave, false);
  assert.equal(options.proxy, false);
});

test("parses the browser, dwell, input, warm-up and proxy options", () => {
  const options = parseArgs([
    "out.json",
    "--browser-defaults",
    "--dwells",
    "0,4,15,60",
    "--inputs",
    "mouse,touch",
    "--warmup",
    "1",
    "--interleave",
    "--proxy",
    "--press-gap",
    "0",
    "--idle-ms",
    "5000",
  ]);
  assert.deepEqual(options.browserModes, ["browser-defaults"]);
  assert.deepEqual(options.dwellsMs, [0, 4000, 15000, 60000]);
  assert.deepEqual(options.inputs, ["mouse", "touch"]);
  assert.equal(options.warmup, 1);
  assert.equal(options.interleave, true);
  assert.equal(options.proxy, true);
  assert.equal(options.pressGapMs, 0);
  assert.equal(options.idleMs, 5000);
  assert.deepEqual(
    parseArgs(["o.json", "--browser-modes", "playwright,browser-defaults"])
      .browserModes,
    ["playwright", "browser-defaults"],
  );
  assert.throws(
    () => parseArgs(["o.json", "--browser-modes", "firefox"]),
    /browser-modes/,
  );
  assert.throws(() => parseArgs(["o.json", "--inputs", "pen"]), /inputs/);
  assert.throws(() => parseArgs(["o.json", "--dwells", "-1"]), /dwells/);
  assert.throws(
    () => parseArgs(["o.json", "--base", "https://admin.anipotts.com"]),
    /loopback/,
  );
});

test("browser defaults re-enable PaintHolding and the back-forward cache only", () => {
  const disable =
    "--disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,PaintHolding,Translate";
  const launch = browserDefaultsLaunch([
    "--disable-field-trial-config",
    "--disable-back-forward-cache",
    disable,
    "--enable-features=CDPScreenshotNewSurface",
  ]);
  assert.deepEqual(launch.ignoreDefaultArgs, [
    "--disable-back-forward-cache",
    disable,
  ]);
  assert.deepEqual(launch.args, [
    "--disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,Translate",
  ]);
  assert.throws(
    () => browserDefaultsLaunch(["--disable-field-trial-config"]),
    /PaintHolding/,
  );
});

test("the cell list carries the idle, intent, warm-cache and back cells", () => {
  const ids = CELLS.map((cell) => cell.id);
  for (const id of [
    "load:content",
    "switch:record",
    "idle:content",
    "idle:operations",
    "intent:hover",
    "intent:press-cancel",
    "intent:touch-scroll",
    "intent:drag-select",
    "intent:right-click",
    "warm:content",
    "back:content",
  ])
    assert.ok(ids.includes(id), id);
  const idle = CELLS.find((cell) => cell.id === "idle:content");
  assert.equal(idle.durationMs, 120000);
  assert.equal(
    CELLS.find((cell) => cell.id === "idle:operations").durationMs,
    125000,
  );
  const touch = CELLS.find((cell) => cell.id === "intent:touch-scroll");
  assert.deepEqual(touch.widths, [390]);
  assert.equal(touch.input, "touch");
});

test("the blocked plan keeps the committed baseline order", () => {
  const cells = CELLS.filter((cell) =>
    ["load:content", "switch:operations"].includes(cell.id),
  );
  const plan = buildPlan(
    cells,
    parseArgs(["o.json", "--runs", "2", "--widths", "390,1280"]),
  );
  assert.deepEqual(
    plan.map(
      (item) => `${item.cell.id} ${item.width} ${item.theme} ${item.run}`,
    ),
    [
      "load:content 390 light 1",
      "load:content 390 light 2",
      "load:content 390 dark 1",
      "load:content 390 dark 2",
      "load:content 1280 light 1",
      "load:content 1280 light 2",
      "load:content 1280 dark 1",
      "load:content 1280 dark 2",
      "switch:operations 390 light 1",
      "switch:operations 390 light 2",
      "switch:operations 390 dark 1",
      "switch:operations 390 dark 2",
      "switch:operations 1280 light 1",
      "switch:operations 1280 light 2",
      "switch:operations 1280 dark 1",
      "switch:operations 1280 dark 2",
    ],
  );
  assert.ok(plan.every((item) => item.mode === "playwright" && !item.warmup));
});

test("interleaving rotates groups, warm-ups come first, touch stays below 768", () => {
  const cells = CELLS.filter((cell) =>
    ["load:content", "switch:record", "intent:touch-scroll"].includes(cell.id),
  );
  const options = parseArgs([
    "o.json",
    "--runs",
    "2",
    "--widths",
    "390,768",
    "--themes",
    "light",
    "--inputs",
    "mouse,touch",
    "--dwells",
    "0,15",
    "--browser-modes",
    "playwright,browser-defaults",
    "--warmup",
    "1",
    "--interleave",
  ]);
  const plan = buildPlan(cells, options);
  const groups = [...new Set(plan.map((item) => item.group))];
  // load: 2 modes x (390 mouse, 390 touch, 768 mouse) = 6
  // switch: the same 6 x 2 dwells = 12
  // touch-scroll: 2 modes at its own width and input = 2
  assert.equal(groups.length, 20);
  assert.ok(
    plan
      .filter((item) => item.input === "touch")
      .every((item) => item.width < 768),
  );
  assert.ok(
    plan
      .filter((item) => item.cell.kind === "load")
      .every((item) => item.dwellMs === 0),
  );
  const warmups = plan.filter((item) => item.warmup);
  assert.equal(warmups.length, groups.length);
  assert.ok(plan.slice(0, groups.length).every((item) => item.warmup));
  const round1 = plan.slice(groups.length, groups.length * 2);
  const round2 = plan.slice(groups.length * 2);
  assert.equal(round1.length, groups.length);
  assert.equal(round2.length, groups.length);
  assert.notEqual(round1[0].group, round2[0].group, "rounds rotate");
  assert.deepEqual(
    [...new Set(round2.map((item) => item.group))].sort(),
    [...groups].sort(),
  );
});

test("announcements coalesce a clear and re-set inside one frame", () => {
  const counter = createAnnouncementCounter();
  const astryx = { id: "astryx-polite" };
  const button = { id: "button-status" };
  const texts = new Map([[astryx, "Opening draft"]]);
  const textOf = (region) => texts.get(region) ?? "";

  // Astryx announceMessage: clear, then the same text in the next frame.
  counter.mutated(astryx, "", { astryx: true });
  counter.mutated(astryx, "Opening draft", { astryx: true });
  counter.flush(10, textOf);
  assert.deepEqual(counter.count(0), { total: 1, astryx: 1, alert: 0 });

  // Repeating the identical message still speaks once more.
  counter.mutated(astryx, "", { astryx: true });
  counter.mutated(astryx, "Opening draft", { astryx: true });
  counter.flush(20, textOf);
  assert.deepEqual(counter.count(0), { total: 2, astryx: 2, alert: 0 });

  // The auto-clear alone speaks nothing.
  texts.set(astryx, "");
  counter.mutated(astryx, "", { astryx: true });
  counter.flush(30, textOf);
  assert.deepEqual(counter.count(0), { total: 2, astryx: 2, alert: 0 });

  // A region born with its text counts once; a re-render with the same
  // text and no clear does not.
  texts.set(button, "Loading editor");
  counter.mutated(button, "Loading editor", { astryx: false });
  counter.flush(40, textOf);
  counter.mutated(button, "Loading editor", { astryx: false });
  counter.flush(50, textOf);
  assert.deepEqual(counter.count(0), { total: 3, astryx: 2, alert: 0 });
  assert.deepEqual(counter.count(35), { total: 1, astryx: 0, alert: 0 });

  // Text parsed with the document is a starting value, not an announcement.
  const parsed = { id: "parsed-status" };
  texts.set(parsed, "Saved");
  counter.baseline(parsed, "Saved");
  counter.mutated(parsed, "Saved", { astryx: false });
  counter.flush(60, textOf);
  assert.deepEqual(counter.count(55), { total: 0, astryx: 0, alert: 0 });

  // An error banner is an assertive announcement.
  const banner = { id: "alert" };
  texts.set(banner, "Editor not configured");
  counter.mutated(banner, "Editor not configured", { alert: true });
  counter.flush(70, textOf);
  assert.deepEqual(counter.count(65), { total: 1, astryx: 0, alert: 1 });
});

function fakePage() {
  const page = new EventEmitter();
  const frame = {};
  page.mainFrame = () => frame;
  page.url = () => "http://127.0.0.1:8871/content/writing/x";
  const makeRequest = (path, type, navigation = false) => {
    let failure = null;
    return {
      url: () => `http://127.0.0.1:8871${path}`,
      method: () => "GET",
      resourceType: () => type,
      isNavigationRequest: () => navigation,
      frame: () => frame,
      failure: () => failure,
      fail(errorText) {
        failure = { errorText };
      },
    };
  };
  return { page, makeRequest };
}

test("an unread non-2xx body no longer holds the settle for 15 s", () => {
  const { page, makeRequest } = fakePage();
  const tracker = trackRequests(page);
  const record = makeRequest("/api/editorial/record", "fetch");
  page.emit("request", record);
  assert.equal(tracker.inflight, 1);
  page.emit("response", {
    url: () => record.url(),
    status: () => 503,
    request: () => record,
  });
  assert.equal(tracker.inflight, 0, "503 headers release the request");
  assert.equal(tracker.openBodies, 1);
  assert.equal(tracker.quietFor(0), true);
  record.fail("net::ERR_ABORTED");
  page.emit("requestfailed", record);
  assert.equal(tracker.openBodies, 0);
  const [entry] = tracker.records;
  assert.equal(entry.pathClass, "record-read");
  assert.equal(entry.status, 503);
  assert.equal(entry.failed, true);
  assert.equal(typeof entry.responseAt, "number");

  const ok = makeRequest("/api/admin/observability", "fetch");
  page.emit("request", ok);
  page.emit("response", {
    url: () => ok.url(),
    status: () => 200,
    request: () => ok,
  });
  assert.equal(tracker.inflight, 1, "a 2xx body is still awaited");
  page.emit("requestfinished", ok);
  assert.equal(tracker.inflight, 0);

  const document = makeRequest("/content", "document", true);
  page.emit("request", document);
  assert.equal(tracker.documents, 1);
  assert.equal(tracker.pendingDocument, true);
  assert.equal(tracker.total, 3);
});

test("intent summaries count started, cancelled, completed and late reads", () => {
  const records = [
    {
      pathClass: "record-read",
      startedAt: 100,
      responseAt: null,
      endAt: 400,
      failed: true,
    },
    {
      pathClass: "record-read",
      startedAt: 200,
      responseAt: 250,
      endAt: 300,
      failed: false,
    },
    {
      pathClass: "record-read",
      startedAt: 3000,
      responseAt: null,
      endAt: null,
      failed: false,
    },
    {
      pathClass: "asset",
      resourceType: "script",
      startedAt: 150,
      responseAt: 160,
      endAt: 170,
      failed: false,
    },
    {
      pathClass: "document",
      startedAt: 180,
      responseAt: 190,
      endAt: 200,
      failed: false,
    },
  ];
  assert.deepEqual(
    intentSummary(records, { gestureEndAt: 1000, windowMs: 1500 }),
    {
      recordReadsStarted: 3,
      recordReadsCancelledWithinWindow: 1,
      recordReadsAbortedBeforeResponse: 1,
      recordReadsCompleted: 1,
      recordReadsActiveAfterWindow: 1,
      scripts: 1,
      documents: 1,
      requests: 5,
    },
  );
});

test("the proxy cross-check separates cache hits, speculation and unexplained requests", () => {
  const page = [
    { method: "GET", url: "http://127.0.0.1:8871/content" },
    { method: "GET", url: "http://127.0.0.1:8871/_astro/a.js" },
    { method: "GET", url: "http://127.0.0.1:8871/_astro/a.js" },
    { method: "GET", url: "http://127.0.0.1:8871/_astro/b.css" },
  ];
  const snapshot = {
    total: 5,
    entries: [
      {
        method: "GET",
        url: "http://127.0.0.1:8871/content",
        pathClass: "document",
        purpose: "none",
      },
      {
        method: "GET",
        url: "http://127.0.0.1:8871/_astro/a.js",
        pathClass: "asset",
        purpose: "none",
      },
      {
        method: "GET",
        url: "http://127.0.0.1:8871/_astro/a.js",
        pathClass: "asset",
        purpose: "none",
      },
      {
        method: "GET",
        url: "http://127.0.0.1:8871/content/writing/x",
        pathClass: "document",
        purpose: "prerender",
      },
      {
        method: "GET",
        url: "http://127.0.0.1:8871/favicon.ico",
        pathClass: "other",
        purpose: "none",
      },
    ],
  };
  assert.deepEqual(crossCheckProxy(page, snapshot), {
    proxyTotal: 5,
    pageTotal: 4,
    matched: 3,
    notAtProxy: 1,
    speculative: 1,
    speculativeByClass: { document: 1 },
    unexplained: 1,
    unexplainedByClass: { other: 1 },
    external: 0,
    proxyDocuments: 1,
  });
  assert.equal(
    crossCheckProxy([], { total: 3, refused: 3, entries: [] }).external,
    3,
  );
  assert.equal(
    crossCheckProxy([], { total: 3, refused: 3, entries: [] }).unexplained,
    0,
  );
});

test("markdown reports browser mode, layout shift total and both announcement counts", () => {
  const stat = (median) => ({ median, p90: median, n: 1 });
  const report = {
    base: "http://127.0.0.1:8871",
    browsers: { playwright: "chromium 1", "browser-defaults": "chromium 1" },
    generatedAt: "2026-09-14T00:00:00.000Z",
    options: {
      runs: 1,
      cpuThrottle: 1,
      pressGapMs: 80,
      warmup: 1,
      interleave: true,
      proxy: true,
      browserModes: ["browser-defaults"],
    },
    cells: [
      {
        id: "switch:record",
        kind: "switch",
        label: "Library record round trip",
        mode: "browser-defaults",
        input: "mouse",
        dwellMs: 0,
        width: 1024,
        theme: "light",
        ok: 1,
        runs: [{ steps: [{ documentRequest: true }] }],
        steps: [
          {
            label: "Library to record",
            summary: {
              firstChangeMs: stat(70),
              settledMs: stat(300),
              clsExcludingInput: stat(0),
              layoutShiftTotal: stat(0.0002),
              requests: stat(61),
              "loading.maxAnnouncements": stat(2),
              "announcements.total": stat(2),
              "announcements.astryx": stat(0),
              "proxy.proxyDocuments": stat(1),
            },
          },
        ],
      },
    ],
    problems: [],
  };
  const text = markdown(report);
  assert.match(text, /browser-defaults/);
  assert.match(text, /layout shift total/);
  assert.match(text, /status regions \(old\)/);
  assert.match(text, /announcements \(new\)/);
  assert.match(text, /proxy documents/);
  assert.match(text, /\| 1024 \|/);
});

test("navigation labels match with or without a trailing item count", () => {
  assert.match("Writing", navName("Writing"));
  assert.match("Writing 6", navName("Writing"));
  assert.match("Writing 6 records", navName("Writing"));
  assert.match("Writing 1 record", navName("Writing"));
  assert.doesNotMatch("Writing drafts", navName("Writing"));
  assert.doesNotMatch("Overview 23", navName("Writing"));
});
