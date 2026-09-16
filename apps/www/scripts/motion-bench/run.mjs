// Full bench: interleaved rounds of the baseline and candidate builds on both
// profiles, then the table, contact sheets, collision probe and edge checks
// for the candidate. Usage (both builds served locally, see README):
//   BASE_URL=http://127.0.0.1:8861 PR_URL=http://127.0.0.1:8860 OUT=/tmp/bench pnpm bench:motion
import { spawnSync } from "node:child_process";
import { loadavg } from "node:os";
import { fileURLToPath } from "node:url";
import { option } from "./common.mjs";

const OUT = option("OUT");
const builds = { base: option("BASE_URL"), pr: option("PR_URL") };
const rounds = Number(option("ROUNDS", "2"));
const only = option("ONLY", "record,table,sheets,probe,checks").split(",");
const here = fileURLToPath(new URL(".", import.meta.url));
// Other work on the machine skews the numbers, so wait for it to be quiet
// before each recorded run. LOAD_MAX=0 skips the wait.
const loadMax = Number(option("LOAD_MAX", "6"));
const loadWaitMs = Number(option("LOAD_WAIT_MS", "900000"));
const quiet = async () => {
  if (!loadMax) return loadavg()[0];
  const deadline = Date.now() + loadWaitMs;
  let load = loadavg()[0];
  while (load >= loadMax && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20000));
    load = loadavg()[0];
  }
  if (load >= loadMax)
    console.log(`### still loaded at ${load.toFixed(2)}, recording anyway`);
  return load;
};
const node = (script, env) => {
  const result = spawnSync(process.execPath, [`${here}${script}`], {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) throw new Error(`${script} exited ${result.status}`);
};
if (only.includes("record"))
  for (let round = 1; round <= rounds; round++)
    for (const profile of ["desktop-1280", "mobile-390-4x"])
      for (const [build, base] of Object.entries(builds)) {
        await quiet();
        console.log(
          `### r${round} ${profile} ${build} load ${loadavg()
            .map((l) => l.toFixed(2))
            .join(" ")}`,
        );
        node("record.mjs", {
          BASE: base,
          OUT: `${OUT}/r${round}/${build}/${profile}`,
          PROFILE: profile,
        });
      }
if (only.includes("table")) node("table.mjs", { OUT, CANDIDATE: "pr" });
if (only.includes("sheets"))
  for (const build of Object.keys(builds))
    node("sheet.mjs", {
      RUN: `${OUT}/r${rounds}/${build}`,
      OUT: `${OUT}/sheets`,
      LABEL: build,
    });
if (only.includes("probe"))
  node("probe.mjs", { BASE: builds.pr, OUT: `${OUT}/probe` });
if (only.includes("checks"))
  node("checks.mjs", { BASE: builds.pr, OUT: `${OUT}/checks` });
