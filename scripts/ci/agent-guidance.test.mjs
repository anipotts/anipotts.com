import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const guide = readFileSync(
  new URL("../../CLAUDE.md", import.meta.url),
  "utf8",
).replace(/\s+/gu, " ");
const delivery = readFileSync(
  new URL(
    "../../docs/design/admin-workspace/quiet-precision-delivery.md",
    import.meta.url,
  ),
  "utf8",
).replace(/\s+/gu, " ");

test("project authority and its referenced contract do not restore retired gates", () => {
  for (const [name, contents] of [
    ["agent guide", guide],
    ["delivery contract", delivery],
  ]) {
    for (const [pattern, reason] of [
      [
        /while Codex (?:usage )?is paused/i,
        "a paused Codex ownership assumption",
      ],
      [
        /Every PR waits for Ani'?s explicit review/i,
        "blanket duplicate Ani review",
      ],
      [/(?:wait for|after) Ani'?s review/i, "blanket duplicate Ani review"],
      [
        /Do not enable auto-merge|Auto-merge stays disabled|No auto-merge/i,
        "an obsolete auto-merge ban",
      ],
    ]) {
      assert.doesNotMatch(contents, pattern, `${name} reinstates ${reason}`);
    }
  }
});

test("a release still needs current authority, one owner and exact protected checks", () => {
  for (const [pattern, message] of [
    [/current explicit (?:task )?authority/i, "current task authority"],
    [/one active integration owner/i, "one owner for shared integration"],
    [/live default-branch protection/i, "live protection recheck"],
    [/pull requests (?:are )?required/i, "pull request requirement"],
    [/required checks.*exact current head/i, "checks on the current head"],
    [/strict checking/i, "strict protection requirement"],
    [/no bypass/i, "bypass prohibition"],
    [/force-push and deletion blocked/i, "protected history"],
    [/native.*approval/i, "native effect controls"],
  ]) {
    assert.match(guide, pattern, `missing ${message}`);
  }
});

test("focused visual work and active user review have bounded verification", () => {
  for (const [pattern, message] of [
    [/changed behavior/i, "changed behavior scope"],
    [/proportional/i, "proportional verification"],
    [/Stop when.*demonstrated/i, "demonstrated stopping condition"],
    [/Ani.*(?:using|reviewing).*browser/i, "active user browser review"],
    [
      /uncommitted.*--commits-only|--commits-only.*uncommitted/i,
      "local versus committed scope",
    ],
  ]) {
    assert.match(guide, pattern, `missing ${message}`);
  }
});

for (const [path, heading] of [
  ["README.md", "## Checks and release"],
  ["docs/platform-architecture.md", "## Verification and releases"],
]) {
  test(`${path} documents the default local scope and explicit committed scope`, () => {
    const contents = readFileSync(
      new URL(`../../${path}`, import.meta.url),
      "utf8",
    );
    const section = contents.split(`${heading}\n`)[1]?.split(/\n## /u)[0];
    assert.ok(section, `${path} is missing its verification section`);
    const defaultCommand = section
      .split("\n")
      .find((line) =>
        /^pnpm check:changed\s*(?:#|$)|^- `(?:pnpm )?check:changed`/u.test(
          line,
        ),
      );
    assert.ok(defaultCommand, `${path} must explain the default command`);
    for (const kind of ["committed", "staged", "unstaged", "untracked"])
      assert.match(
        defaultCommand,
        new RegExp(`\\b${kind}\\b`, "u"),
        `${path} default scope omits ${kind}`,
      );
    assert.doesNotMatch(
      defaultCommand,
      /committed (?:PR )?diff|commits only/iu,
    );
    const committedCommand = section
      .split("\n")
      .find((line) => line.includes("--commits-only"));
    assert.ok(
      committedCommand,
      `${path} must document the committed-only option`,
    );
    assert.match(
      committedCommand,
      /committed (?:branch )?(?:diff|tree)|commits only/iu,
    );
    const normalized = section.replace(/\s+/gu, " ");
    assert.match(normalized, /ignored files (?:stay |are )?excluded/iu);
    assert.match(
      normalized,
      /`--working-tree`.*(?:alias|compatible).*default.*scope/iu,
    );
  });
}
