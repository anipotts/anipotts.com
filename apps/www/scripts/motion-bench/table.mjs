// Reads record.mjs output for every round and build and prints one row per
// run plus per-step ranges, then checks the candidate against the PR 2
// acceptance numbers. Usage: OUT=/tmp/bench CANDIDATE=pr node table.mjs
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { option, STEPS } from "./common.mjs";

const OUT = option("OUT");
const CANDIDATE = option("CANDIDATE", "pr");
const rows = [];
for (const round of readdirSync(OUT)
  .filter((d) => /^r\d+$/.test(d))
  .sort())
  for (const build of readdirSync(`${OUT}/${round}`))
    for (const profile of ["desktop-1280", "mobile-390-4x"]) {
      const file = `${OUT}/${round}/${build}/${profile}/summary.json`;
      if (!existsSync(file)) continue;
      for (const r of JSON.parse(readFileSync(file, "utf8"))[profile] || []) {
        if (!r.label) continue;
        const first = r.clickToFirstMotionMs;
        const settled = r.clickToSettledMs;
        const raf = r.rafRel;
        // The router's swap runs before-swap, after-swap and page-load in one
        // task; the frame interval that overlaps it is the frame that
        // presents first motion, so its length is time before motion. Every
        // later frame up to settled is during motion.
        const event = Object.fromEntries(r.events);
        const swapStart = event["astro:before-swap"];
        const swapEnd = event["astro:page-load"] ?? event["astro:after-swap"];
        const deltas = raf.slice(1).map((b, i) => {
          const a = raf[i];
          const atSwap =
            swapStart !== undefined
              ? a <= swapEnd && b >= swapStart
              : first !== null && b <= first + 1;
          const beforeMotion =
            atSwap ||
            (swapStart !== undefined
              ? b < swapStart
              : first !== null && b <= first + 1);
          return { a, b, d: +(b - a).toFixed(1), beforeMotion };
        });
        const during = deltas.filter((f) => !f.beforeMotion && f.a < settled);
        const motion = r.frameRel.filter(
          (t) => first !== null && t >= first && t <= settled,
        );
        const gaps = motion.slice(1).map((t, i) => t - motion[i]);
        const worst = deltas.reduce((m, f) => (f.d > m.d ? f : m), {
          d: 0,
          b: 0,
        });
        rows.push({
          round,
          build,
          profile,
          step: r.label,
          first,
          settled,
          worst: worst.d,
          worstBeforeMotion: !!worst.beforeMotion,
          over20: deltas.filter((f) => f.d > 20).length,
          over20During: during.filter((f) => f.d > 20).length,
          over17: deltas.filter((f) => f.d > 17.5).length,
          max20Late: deltas.filter((f) => f.d > 20 && !f.beforeMotion).length,
          maxGap: Math.max(0, ...gaps),
          gaps25: gaps.filter((g) => g > 25).length,
          long:
            r.longTasks
              .map((l) => `${Math.round(l.dur)}@${l.atMs}`)
              .join(",") || "-",
          longCount: r.longTasks.length,
          overlays: r.overlaysLeft,
        });
      }
    }
const order = (r) =>
  [
    r.profile,
    STEPS.indexOf(r.step),
    r.build === CANDIDATE ? 1 : 0,
    r.round,
  ].join("|");
rows.sort((a, b) => (order(a) < order(b) ? -1 : 1));
const pad = (v, n) => String(v).padStart(n);
const lines = [
  `${"profile".padEnd(14)}${"step".padEnd(22)}${"build".padEnd(6)}${"rnd".padEnd(4)}${pad("first", 6)}${pad("settl", 6)}${pad("worst", 7)}${pad(">20", 4)}${pad(">20mo", 6)}${pad("maxgap", 7)}${pad("g>25", 5)}  long`,
  ...rows.map(
    (r) =>
      `${r.profile.padEnd(14)}${r.step.padEnd(22)}${r.build.padEnd(6)}${r.round.padEnd(4)}${pad(r.first, 6)}${pad(r.settled, 6)}${pad(r.worst, 7)}${pad(r.over20, 4)}${pad(r.over20During, 6)}${pad(r.maxGap, 7)}${pad(r.gaps25, 5)}  ${r.long}${r.overlays ? ` OVERLAYS=${r.overlays}` : ""}`,
  ),
];
const range = (list, key) => {
  const v = list.map((r) => r[key]).filter((x) => x !== null);
  return v.length
    ? Math.min(...v) === Math.max(...v)
      ? `${Math.min(...v)}`
      : `${Math.min(...v)} to ${Math.max(...v)}`
    : "-";
};
const median = (v) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2
    ? s[(s.length - 1) / 2]
    : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
lines.push("", "per step ranges across rounds (base | candidate)");
for (const profile of ["desktop-1280", "mobile-390-4x"])
  for (const step of STEPS) {
    const pick = (build) =>
      rows.filter(
        (r) => r.profile === profile && r.step === step && r.build === build,
      );
    const b = pick("base");
    const c = pick(CANDIDATE);
    lines.push(
      `${profile} ${step}: first ${range(b, "first")} | ${range(c, "first")}; worst ${range(b, "worst")} | ${range(c, "worst")}; >20 ${range(b, "over20")} | ${range(c, "over20")}; >20 in motion ${range(b, "over20During")} | ${range(c, "over20During")}; gaps>25 ${range(b, "gaps25")} | ${range(c, "gaps25")}; long ${range(b, "longCount")} | ${range(c, "longCount")}; settled ${range(b, "settled")} | ${range(c, "settled")}`,
    );
  }
const cand = (profile) =>
  rows.filter((r) => r.build === CANDIDATE && r.profile === profile);
const phone = cand("mobile-390-4x");
const desk = cand("desktop-1280");
const max = (list, key) => Math.max(...list.map((r) => r[key] ?? Infinity));
const sum = (list, key) => list.reduce((s, r) => s + r[key], 0);
const opens = (list) => list.filter((r) => r.step.startsWith("expand"));
const closes = (list) => list.filter((r) => r.step.startsWith("collapse"));
const acceptance = [
  [
    "phone first motion max",
    "<= 150 ms",
    max(phone, "first"),
    max(phone, "first") <= 150,
  ],
  [
    "phone first motion median",
    "<= 120 ms",
    median(phone.map((r) => r.first)),
    median(phone.map((r) => r.first)) <= 120,
  ],
  [
    "phone worst frame",
    "<= 67 ms",
    max(phone, "worst"),
    max(phone, "worst") <= 67.5,
  ],
  [
    "phone frames over 20 ms outside the swap frame",
    "0",
    sum(phone, "max20Late"),
    sum(phone, "max20Late") === 0,
  ],
  [
    "phone frames over 20 ms during motion",
    "0",
    sum(phone, "over20During"),
    sum(phone, "over20During") === 0,
  ],
  [
    "phone frames over 20 ms per step",
    "<= 2",
    max(phone, "over20"),
    max(phone, "over20") <= 2,
  ],
  [
    "phone presented gaps over 25 ms in motion",
    "0",
    sum(phone, "gaps25"),
    sum(phone, "gaps25") === 0,
  ],
  [
    "desktop first motion max",
    "<= 80 ms",
    max(desk, "first"),
    max(desk, "first") <= 80,
  ],
  [
    "desktop worst frame",
    "<= 33.4 ms",
    max(desk, "worst"),
    max(desk, "worst") <= 33.4,
  ],
  [
    "desktop frames over 17.5 ms per step",
    "<= 1",
    max(desk, "over17"),
    max(desk, "over17") <= 1,
  ],
  [
    "desktop presented gaps over 25 ms in motion",
    "0",
    sum(desk, "gaps25"),
    sum(desk, "gaps25") === 0,
  ],
  [
    "desktop long tasks",
    "0",
    sum(desk, "longCount"),
    sum(desk, "longCount") === 0,
  ],
  [
    "desktop close settled max",
    "<= 450 ms",
    max(closes(desk), "settled"),
    max(closes(desk), "settled") <= 450,
  ],
  [
    "desktop open settled max",
    "<= 740 ms",
    max(opens(desk), "settled"),
    max(opens(desk), "settled") <= 740,
  ],
  [
    "overlays left after any step",
    "0",
    sum([...phone, ...desk], "overlays"),
    sum([...phone, ...desk], "overlays") === 0,
  ],
];
lines.push("", `acceptance (${CANDIDATE})`);
for (const [name, target, measured, pass] of acceptance)
  lines.push(
    `${pass ? "PASS" : "FAIL"}  ${name}: ${measured} (target ${target})`,
  );
const text = lines.join("\n");
console.log(text);
writeFileSync(`${OUT}/table.txt`, text + "\n");
writeFileSync(
  `${OUT}/table.json`,
  JSON.stringify({ rows, acceptance }, null, 1),
);
