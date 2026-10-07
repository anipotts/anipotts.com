import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const script = fileURLToPath(
  new URL("./check-changed-scope.mjs", import.meta.url),
);
const publicChecks = [
  ["format:check"],
  ["test:public-boundary"],
  ["test:public-routes"],
  ["test:public-copy"],
  ...["build", "lint", "typecheck", "test"].map((command) => [
    "turbo",
    command,
    "--filter=@anipotts/www...",
  ]),
];

function fixture(exercise) {
  const cwd = mkdtempSync(join(tmpdir(), "site-changed-scope-"));
  const calls = join(cwd, ".test-ignored/calls.jsonl");
  const git = (...args) => execFileSync("git", args, { cwd, stdio: "pipe" });
  const write = (path, contents) => {
    const absolute = join(cwd, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents);
  };
  try {
    git("init", "-b", "main");
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.invalid");
    git("config", "commit.gpgsign", "false");
    write(".gitignore", ".test-ignored/\n");
    write("apps/www/src/pages/index.astro", "before\n");
    write("docs/example.md", "before\n");
    write(
      "drizzle/migrations/manifest.json",
      JSON.stringify({
        historical: [],
        migrations: [],
        bootstrap: {
          baseline_through: "0000_fixture.sql",
          schema_fingerprint: `sha256:${"0".repeat(64)}`,
        },
      }),
    );
    git("add", ".gitignore", "apps", "docs", "drizzle");
    git("commit", "-m", "synthetic baseline");
    git("branch", "baseline");
    write(
      ".test-ignored/bin/pnpm",
      "#!/usr/bin/env node\n" +
        'const fs = require("node:fs");\n' +
        'fs.appendFileSync(process.env.SCOPE_TEST_CALLS, JSON.stringify(process.argv.slice(2)) + "\\n");\n' +
        'process.exit(Number(process.env.SCOPE_TEST_EXIT || "0"));\n',
    );
    chmodSync(join(cwd, ".test-ignored/bin/pnpm"), 0o755);
    const run = (args = [], exit = "0") => {
      if (existsSync(calls)) rmSync(calls);
      const result = spawnSync(process.execPath, [script, ...args], {
        cwd,
        encoding: "utf8",
        env: {
          ...process.env,
          CHANGED_SCOPE_BASE: "baseline",
          SCOPE_TEST_CALLS: calls,
          SCOPE_TEST_EXIT: exit,
          PATH: `${join(cwd, ".test-ignored/bin")}:${dirname(process.execPath)}:${process.env.PATH}`,
        },
      });
      assert.equal(result.error, undefined);
      const commands = existsSync(calls)
        ? readFileSync(calls, "utf8").trim().split("\n").map(JSON.parse)
        : [];
      return { ...result, commands };
    };
    exercise({ cwd, git, write, run });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("default scope checks unstaged edits instead of reporting clean", () => {
  fixture(({ write, run }) => {
    write("apps/www/src/pages/index.astro", "unstaged\n");
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.commands, publicChecks);
    assert.match(result.stdout, /including working tree/);
    assert.doesNotMatch(result.stdout, /clean against/);
  });
});

test("default scope checks staged edits even when the worktree reverses them", () => {
  fixture(({ git, write, run }) => {
    write("apps/www/src/pages/index.astro", "staged\n");
    git("add", "apps/www/src/pages/index.astro");
    write("apps/www/src/pages/index.astro", "before\n");
    assert.deepEqual(run().commands, publicChecks);
  });
});

test("default scope checks untracked public files", () => {
  fixture(({ write, run }) => {
    write("apps/www/src/pages/new.astro", "new\n");
    assert.deepEqual(run().commands, publicChecks);
  });
});

test("default scope retains checks for unstaged deletion and renamed paths", () => {
  fixture(({ cwd, run }) => {
    renameSync(
      join(cwd, "apps/www/src/pages/index.astro"),
      join(cwd, "docs/renamed.astro"),
    );
    assert.deepEqual(run().commands, publicChecks);
  });
});

test("default scope checks dirty shared tooling with full validation", () => {
  fixture(({ write, run }) => {
    write("scripts/local-helper.mjs", "export {};\n");
    assert.deepEqual(run().commands, [["validate"]]);
  });
});

test("default scope retains committed changes and CI can request commits only", () => {
  fixture(({ git, write, run }) => {
    write("apps/www/src/pages/index.astro", "committed\n");
    git("add", "apps/www/src/pages/index.astro");
    git("commit", "-m", "synthetic public change");
    write("scripts/local-helper.mjs", "export {};\n");
    assert.deepEqual(run().commands, [["validate"]]);
    const committed = run(["--commits-only"]);
    assert.equal(committed.status, 0, committed.stderr);
    assert.deepEqual(committed.commands, publicChecks);
    assert.match(committed.stdout, /commits only/);
  });
});

test("explicit committed scope never claims to include local edits", () => {
  fixture(({ write, run }) => {
    write("apps/www/src/pages/index.astro", "unstaged\n");
    const result = run(["--commits-only"]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.commands, []);
    assert.match(result.stdout, /clean against baseline \(commits only\)/);
  });
});

test("working-tree flag remains compatible and invalid modes fail", () => {
  fixture(({ write, run }) => {
    write("apps/www/src/pages/index.astro", "unstaged\n");
    assert.deepEqual(run(["--working-tree"]).commands, publicChecks);
    for (const args of [
      ["--commits-only", "--working-tree"],
      ["--unsupported"],
    ]) {
      const result = run(args);
      assert.notEqual(result.status, 0);
      assert.deepEqual(result.commands, []);
    }
  });
});

test("clean and ignored-only scopes perform no checks", () => {
  fixture(({ write, run }) => {
    write(".test-ignored/local.log", "ignored\n");
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.commands, []);
    assert.match(
      result.stdout,
      /clean against baseline including working tree/,
    );
  });
});

test("dirty documentation performs formatting without application checks", () => {
  fixture(({ write, run }) => {
    write("docs/example.md", "edited\n");
    assert.deepEqual(run().commands, [["format:check"]]);
  });
});

for (const path of [
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "docs/platform-architecture.md",
  "docs/design/admin-workspace/quiet-precision-delivery.md",
]) {
  test(`dirty guidance input ${path} selects validation with guidance invariants`, () => {
    fixture(({ write, run }) => {
      write(path, "edited guidance\n");
      const result = run();
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(result.commands, [["validate"]]);
    });
  });
}

test("committed guidance changes select invariants in both scope modes", () => {
  fixture(({ git, write, run }) => {
    write("CLAUDE.md", "committed guidance\n");
    git("add", "CLAUDE.md");
    git("commit", "-m", "synthetic guidance change");
    for (const args of [[], ["--commits-only"]]) {
      const result = run(args);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(result.commands, [["validate"]]);
    }
  });
});

test("failed validation of dirty work propagates a failure", () => {
  fixture(({ write, run }) => {
    write("apps/www/src/pages/index.astro", "unstaged\n");
    const result = run([], "3");
    assert.notEqual(result.status, 0);
    assert.deepEqual(result.commands, [["format:check"]]);
  });
});

test("committed unclassified paths fail before any check in both scope modes", () => {
  fixture(({ git, write, run }) => {
    write("notes.txt", "committed\n");
    git("add", "notes.txt");
    git("commit", "-m", "synthetic unclassified path");
    for (const args of [[], ["--commits-only"]]) {
      const result = run(args);
      assert.equal(result.status, 1, args.join(" "));
      assert.deepEqual(result.commands, []);
      assert.match(result.stderr, /match no release rule:\n {2}notes\.txt\n/);
      assert.match(result.stderr, /scripts\/ci\/release-policy\.mjs/);
    }
  });
});

test("staged unclassified paths fail before any check", () => {
  fixture(({ git, write, run }) => {
    write("apps/www/src/pages/index.astro", "unstaged\n");
    write("notes.txt", "staged\n");
    git("add", "notes.txt");
    const result = run();
    assert.equal(result.status, 1);
    assert.deepEqual(result.commands, []);
    assert.match(result.stderr, / {2}notes\.txt\n/);
  });
});

test("unstaged edits to tracked unclassified paths fail", () => {
  fixture(({ git, write, run }) => {
    write("notes.txt", "tracked\n");
    git("add", "notes.txt");
    git("commit", "-m", "synthetic tracked path");
    git("branch", "-f", "baseline");
    write("notes.txt", "edited\n");
    const result = run();
    assert.equal(result.status, 1);
    assert.deepEqual(result.commands, []);
    assert.match(result.stderr, / {2}notes\.txt\n/);
    const committed = run(["--commits-only"]);
    assert.equal(committed.status, 0, committed.stderr);
    assert.match(committed.stdout, /clean against baseline \(commits only\)/);
  });
});

test("a staged delete still fails when the same path is untracked again", () => {
  fixture(({ git, write, run }) => {
    write("notes.txt", "tracked\n");
    git("add", "notes.txt");
    git("commit", "-m", "synthetic tracked path");
    git("branch", "-f", "baseline");
    git("rm", "--cached", "--quiet", "notes.txt");
    const result = run();
    assert.equal(result.status, 1);
    assert.deepEqual(result.commands, []);
    assert.match(result.stderr, / {2}notes\.txt\n/);
  });
});

test("untracked unclassified files warn and keep the selected checks", () => {
  fixture(({ write, run }) => {
    write("apps/www/src/pages/index.astro", "unstaged\n");
    write("notes.txt", "scratch\n");
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.commands, publicChecks);
    assert.match(
      result.stderr,
      /warning: untracked path is unclassified; ci only sees committed files: notes\.txt/,
    );
    assert.doesNotMatch(result.stderr, /match no release rule/);
  });
});

test("an untracked nested agent worktree only warns", () => {
  fixture(({ git, write, run }) => {
    git("init", "--quiet", ".codex-workspaces/agent");
    write(".codex-workspaces/agent/notes.txt", "agent\n");
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.commands, [["format:check"]]);
    assert.match(
      result.stderr,
      /unclassified; ci only sees committed files: \.codex-workspaces\/agent\//,
    );
  });
});

for (const [path, commands] of [
  ["tsconfig.json", [["validate"]]],
  [".prettierrc", [["validate"]]],
  [".npmrc", [["validate"]]],
  [".github/dependabot.yml", [["validate"]]],
  [".editorconfig", [["format:check"]]],
  [".vscode/settings.json", [["format:check"]]],
]) {
  test(`formerly unknown tooling path ${path} selects its checks`, () => {
    fixture(({ git, write, run }) => {
      write(path, "edited\n");
      // Force past a developer's global ignores, such as .vscode/.
      git("add", "--force", path);
      const result = run();
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(result.commands, commands);
      assert.doesNotMatch(result.stderr, /unclassified|no release rule/);
    });
  });
}
