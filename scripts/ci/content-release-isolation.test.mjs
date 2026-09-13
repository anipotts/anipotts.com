import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { validateContentReleaseIsolation } from "./content-release-isolation.mjs";
import { classifyRelease } from "./release-policy.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const clock = new Date("2026-09-13T12:00:00.000Z");
const script = fileURLToPath(
  new URL("./content-release-isolation.mjs", import.meta.url),
);
function fixture(t) {
  const bundleRoot = mkdtempSync(join(tmpdir(), "qp-isolation-proof-"));
  t.after(() => rmSync(bundleRoot, { recursive: true, force: true }));
  const runId = "qp-343-abcd1234";
  const resources = {
    databaseName: `${runId}-content`,
    databaseId: "11111111-1111-4111-8111-111111111111",
    mediaBucket: `${runId}-media`,
  };
  const files = {};
  function write(path, value) {
    const bytes = typeof value === "string" ? value : JSON.stringify(value);
    mkdirSync(dirname(join(bundleRoot, path)), { recursive: true });
    writeFileSync(join(bundleRoot, path), bytes);
    return { path, sha256: sha256(bytes) };
  }
  files.artifacts = ["admin", "www"].map((role) =>
    write(
      `artifacts/${role}/worker.mjs`,
      "export default { fetch() { return new Response('Synthetic fixture'); } };\n",
    ),
  );
  files.migrations = [
    write(
      "migrations/0001_fixture.sql",
      "CREATE TABLE synthetic_publication (id TEXT PRIMARY KEY);\n",
    ),
  ];
  files.fixture = write("fixtures/records.json", {
    schemaVersion: 1,
    runId,
    dataClass: "synthetic",
    records: [{ id: `${runId}-fixture-a`, source: "Synthetic test record" }],
  });
  const configs = {};
  for (const role of ["admin", "www"]) {
    configs[role] = {
      name: `${runId}-${role}`,
      main: `../artifacts/${role}/worker.mjs`,
      base_dir: `../artifacts/${role}`,
      no_bundle: true,
      find_additional_modules: true,
      account_id: "0f856093bdcd34a7da1bde5ee4385163",
      compatibility_date: "2026-05-01",
      compatibility_flags: ["nodejs_compat"],
      workers_dev: false,
      preview_urls: false,
      routes: [],
      vars: {
        RELEASE_TEST_RUN_ID: runId,
        RELEASE_TEST_DATA_CLASS: "synthetic",
        EDITORIAL_PUBLISH_ENABLED: "false",
      },
      d1_databases: [
        {
          binding: "CONTENT_DB",
          database_name: resources.databaseName,
          database_id: resources.databaseId,
          migrations_dir: "../migrations",
        },
      ],
      r2_buckets: [
        { binding: "CONTENT_MEDIA", bucket_name: resources.mediaBucket },
      ],
      ...(role === "admin"
        ? {
            durable_objects: {
              bindings: [
                { name: "EDITORIAL", class_name: "EditorialDraftStore" },
              ],
            },
            migrations: [
              {
                tag: "editorial-v1",
                new_sqlite_classes: ["EditorialDraftStore"],
              },
            ],
          }
        : {}),
    };
    files[`${role}Config`] = write(`configs/${role}.json`, configs[role]);
  }
  const manifest = {
    schemaVersion: 1,
    environment: "temporary-cloud-release-test",
    dataClass: "synthetic",
    runId,
    owner: "codex/qp-release-isolation",
    pr: 343,
    sourceSha: "a".repeat(40),
    createdAt: "2026-09-13T11:00:00.000Z",
    expiresAt: "2026-09-13T15:00:00.000Z",
    accountId: configs.admin.account_id,
    resources,
    files,
  };
  function freeze() {
    for (const role of ["admin", "www"])
      files[`${role}Config`] = write(`configs/${role}.json`, configs[role]);
    return write("manifest.json", manifest).sha256;
  }
  function run(extra = {}) {
    return validateContentReleaseIsolation({
      bundleRoot,
      manifestPath: "manifest.json",
      expectedManifestSha256: freeze(),
      now: clock,
      ...extra,
    });
  }
  return { bundleRoot, runId, manifest, configs, write, freeze, run };
}

test("configuration proof pins both Workers and preserves every live-evidence gate", (t) => {
  const f = fixture(t);
  const receipt = f.run();
  assert.equal(receipt.status, "configuration-only");
  for (const key of [
    "cloudRuntimeVerified",
    "providerOwnershipVerified",
    "artifactProvenanceVerified",
    "moduleClosureVerified",
    "syntheticContentVerified",
    "ownerApprovalVerified",
    "mutationAuthorized",
  ])
    assert.equal(receipt[key], false);
  assert.equal(receipt.assertedSourceSha, f.manifest.sourceSha);
  assert.deepEqual(f.run({ previousReceipt: receipt }), receipt);
  assert.ok(!JSON.stringify(receipt).includes(f.bundleRoot));
});

const configAttacks = [
  [
    "production Worker",
    (c) => {
      c.name = "anipotts-admin";
    },
  ],
  [
    "staging custom domain",
    (c) => {
      c.routes = [{ pattern: "staging.anipotts.com", custom_domain: true }];
    },
  ],
  [
    "inherited routes",
    (c) => {
      delete c.routes;
    },
  ],
  [
    "named environment",
    (c) => {
      c.env = { test: {} };
    },
  ],
  [
    "config inheritance",
    (c) => {
      c.extends = "../../apps/admin/wrangler.toml";
    },
  ],
  [
    "singular route",
    (c) => {
      c.route = "anipotts.com/*";
    },
  ],
  [
    "command relay",
    (c) => {
      c.durable_objects.bindings.push({
        name: "COMMAND_RELAY",
        class_name: "CommandRelay",
        script_name: "anipotts-state",
      });
    },
  ],
  [
    "external DO namespace",
    (c) => {
      c.durable_objects.bindings[0].script_name = "anipotts-admin";
    },
  ],
  [
    "destructive DO migration",
    (c) => {
      c.migrations[0].deleted_classes = ["EditorialDraftStore"];
    },
  ],
  [
    "newsletter queue",
    (c) => {
      c.queues = {
        producers: [{ binding: "NEWSLETTER_QUEUE", queue: "newsletter-send" }],
      };
    },
  ],
  [
    "email capability",
    (c) => {
      c.send_email = [{ name: "MAIL" }];
    },
  ],
  [
    "Life service",
    (c) => {
      c.services = [{ binding: "LIFE", service: "personal-reader" }];
    },
  ],
  [
    "cron work",
    (c) => {
      c.triggers = { crons: ["* * * * *"] };
    },
  ],
  [
    "unknown unsafe metadata",
    (c) => {
      c.unsafe = { bindings: [] };
    },
  ],
  [
    "secret capability",
    (c) => {
      c.secrets_store_secrets = [{ binding: "KEY" }];
    },
  ],
  [
    "publisher credentials",
    (c) => {
      c.vars.EDITORIAL_GITHUB_PRIVATE_KEY = "synthetic";
    },
  ],
  [
    "legacy publisher enabled",
    (c) => {
      c.vars.EDITORIAL_PUBLISH_ENABLED = "true";
    },
  ],
  [
    "missing publisher switch",
    (c) => {
      delete c.vars.EDITORIAL_PUBLISH_ENABLED;
    },
  ],
  [
    "remote development override",
    (c) => {
      c.d1_databases[0].remote = true;
    },
  ],
  [
    "mismatched fixture account",
    (c) => {
      c.account_id = "1".repeat(32);
    },
  ],
  [
    "unknown compatibility flag",
    (c) => {
      c.compatibility_flags.push("no_nodejs_compat_v2");
    },
  ],
  [
    "wrong compatibility date",
    (c) => {
      c.compatibility_date = "2026-09-08";
    },
  ],
  [
    "automatic bundling",
    (c) => {
      c.no_bundle = false;
    },
  ],
  [
    "unlisted module discovery",
    (c) => {
      delete c.base_dir;
    },
  ],
  [
    "main outside module directory",
    (c) => {
      c.main = "../artifacts/www/worker.mjs";
    },
  ],
];
for (const [name, mutate] of configAttacks)
  test(`rejects ${name} even with a matching config digest`, (t) => {
    const f = fixture(t);
    mutate(f.configs.admin);
    assert.throws(() => f.run());
  });

for (const id of [
  "a8aadf73-bbf4-447c-97db-cb3e50b4e26f",
  "2679fc97-e251-46b7-ad01-db8b9fe04e8d",
])
  test(`rejects protected database ${id.slice(0, 8)} behind fixture names`, (t) => {
    const f = fixture(t);
    f.manifest.resources.databaseId = id;
    for (const c of Object.values(f.configs))
      c.d1_databases[0].database_id = id;
    assert.throws(() => f.run(), /protected_resource/);
  });

test("rejects staging labels, missing identity, unknown manifest fields, and expiry", (t) => {
  const f = fixture(t);
  const original = structuredClone(f.manifest);
  for (const mutate of [
    (m) => {
      m.environment = "staging";
    },
    (m) => {
      m.dataClass = "private";
    },
    (m) => {
      delete m.owner;
    },
    (m) => {
      m.pr = 123;
    },
    (m) => {
      m.runId = "anipotts-admin";
    },
    (m) => {
      m.expiresAt = "2026-09-13T12:00:00.000Z";
    },
    (m) => {
      m.expiresAt = "2027-01-01T00:00:00.000Z";
    },
    (m) => {
      m.createdAt = "2026-09-13T13:00:00.000Z";
    },
    (m) => {
      m.creationApproved = true;
    },
    (m) => {
      m.resources.databaseId = "00000000-0000-0000-0000-000000000001";
    },
  ]) {
    for (const key of Object.keys(f.manifest)) delete f.manifest[key];
    Object.assign(f.manifest, structuredClone(original));
    mutate(f.manifest);
    assert.throws(() => f.run());
  }
});

test("reads only the pinned manifest and config rather than accepting caller replacements", (t) => {
  const f = fixture(t);
  const expectedManifestSha256 = f.freeze();
  f.manifest.owner = "codex/replacement";
  assert.throws(
    () => f.run({ expectedManifestSha256 }),
    /manifest_digest_mismatch/,
  );
  const expected = f.freeze();
  f.write("configs/admin.json", { ...f.configs.admin, workers_dev: true });
  assert.throws(
    () =>
      validateContentReleaseIsolation({
        bundleRoot: f.bundleRoot,
        manifestPath: "manifest.json",
        expectedManifestSha256: expected,
        now: clock,
      }),
    /file_digest_mismatch/,
  );
});

test("old receipts reject revised config, artifact, migration, and fixture bundles", (t) => {
  const f = fixture(t);
  const previousReceipt = f.run();
  f.configs.admin.workers_dev = true;
  assert.throws(() => f.run({ previousReceipt }), /receipt_mismatch/);
  f.configs.admin.workers_dev = false;
  for (const ref of [
    f.manifest.files.artifacts[0],
    f.manifest.files.migrations[0],
    f.manifest.files.fixture,
  ]) {
    const original = readFileSync(join(f.bundleRoot, ref.path), "utf8");
    f.write(ref.path, original + "\n");
    assert.throws(() => f.run(), /file_digest_mismatch/);
    ref.sha256 = sha256(original + "\n");
    assert.throws(() => f.run({ previousReceipt }), /receipt_mismatch/);
    f.write(ref.path, original);
    ref.sha256 = sha256(original);
  }
});

test("rejects filesystem escapes and symlinks without exposing outside values", (t) => {
  const f = fixture(t);
  const outside = mkdtempSync(join(tmpdir(), "qp-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, "private.txt"), "synthetic outside value");
  for (const path of [join(outside, "private.txt"), "../private.txt"]) {
    f.manifest.files.artifacts[0].path = path;
    assert.throws(() => f.run(), /invalid_path|path_outside_bundle/);
  }
  symlinkSync(outside, join(f.bundleRoot, "escape"));
  f.manifest.files.artifacts[0].path = "escape/private.txt";
  assert.throws(() => f.run(), /symlink_not_allowed/);
  f.manifest.files.artifacts[0].path = "artifacts/admin/worker.mjs";
  f.configs.admin.main = "../../../private.txt";
  assert.throws(() => f.run(), /path_outside_bundle/);
});

test("binds asset directory contents and rejects extra migrations", (t) => {
  const f = fixture(t);
  f.configs.admin.assets = {
    binding: "ASSETS",
    directory: "../artifacts/admin",
    run_worker_first: true,
  };
  f.run();
  f.write("artifacts/admin/extra.txt", "unlisted synthetic asset");
  assert.throws(() => f.run(), /unlisted_artifact/);
  f.manifest.files.artifacts.push(
    f.write("artifacts/admin/extra.txt", "listed synthetic asset"),
  );
  f.run();
  f.write("migrations/0002_extra.sql", "SELECT 1;");
  assert.throws(() => f.run(), /unreviewed_migration/);
});

test("accepts a frozen ordered migration chain and complete Worker chunks", (t) => {
  const f = fixture(t);
  f.manifest.files.migrations.push(
    f.write(
      "migrations/0002_fixture.sql",
      "CREATE INDEX synthetic_id ON synthetic_publication(id);\n",
    ),
  );
  f.manifest.files.artifacts.push(
    f.write(
      "artifacts/admin/chunks/shared.mjs",
      "export const synthetic = true;\n",
    ),
  );
  f.run();
  f.manifest.files.migrations.reverse();
  assert.throws(() => f.run(), /invalid_migration_order/);
  f.manifest.files.migrations.reverse();
  f.write("artifacts/admin/chunks/unlisted.mjs", "export {};\n");
  assert.throws(() => f.run(), /unlisted_artifact/);
});

test("accepts the measured current application bundle file count", (t) => {
  const f = fixture(t);
  for (let index = 0; index < 730; index++) {
    f.manifest.files.artifacts.push(
      f.write(
        `artifacts/admin/chunks/fixture-${index}.mjs`,
        "export const synthetic = true;\n",
      ),
    );
  }
  assert.equal(f.run().status, "configuration-only");
});

test("bounds deep and wide directory traversal, including empty directories", (t) => {
  const f = fixture(t);
  const nested = join(f.bundleRoot, "artifacts/admin", ...Array(17).fill("d"));
  mkdirSync(nested, { recursive: true });
  assert.throws(() => f.run(), /artifact_depth_limit/);
  rmSync(join(f.bundleRoot, "artifacts/admin/d"), { recursive: true });
  for (const group of ["a", "b", "c"]) {
    for (let index = 0; index < 800; index++)
      mkdirSync(join(f.bundleRoot, "artifacts/admin", group, String(index)), {
        recursive: true,
      });
  }
  assert.throws(() => f.run(), /artifact_limit/);
});

test("bounds JSON, files, artifact counts, and unknown fixture identities", (t) => {
  const f = fixture(t);
  f.manifest.files.fixture = f.write("fixtures/records.json", {
    schemaVersion: 1,
    runId: "other-run",
    dataClass: "synthetic",
    records: [],
  });
  assert.throws(() => f.run(), /fixture_identity_mismatch/);
  f.manifest.files.artifacts = Array.from(
    { length: 1025 },
    () => f.manifest.files.artifacts[0],
  );
  assert.throws(() => f.run(), /artifact_limit/);
  const bytes = " ".repeat(128 * 1024 + 1);
  f.write("manifest.json", bytes);
  assert.throws(
    () =>
      validateContentReleaseIsolation({
        bundleRoot: f.bundleRoot,
        manifestPath: "manifest.json",
        expectedManifestSha256: sha256(bytes),
        now: clock,
      }),
    /file_limit/,
  );
});

test("CLI errors are short fixed codes and never echo supplied values", (t) => {
  const f = fixture(t);
  const result = spawnSync(
    process.execPath,
    [
      script,
      "--bundle-root",
      f.bundleRoot,
      "--manifest",
      "../outside-sensitive-name",
      "--manifest-sha256",
      "b".repeat(64),
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.deepEqual(JSON.parse(result.stderr), {
    ok: false,
    code: "path_outside_bundle",
  });
  assert.ok(!result.stderr.includes(f.bundleRoot));
});

test("existing release-policy gate runs the preflight tests without app deploy targets", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.match(
    pkg.scripts["test:release-policy"],
    /node --test scripts\/ci\/content-release-isolation\.test\.mjs/,
  );
  const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  assert.match(ci, /pnpm test:release-policy/);
  const release = classifyRelease(
    [
      "A\tscripts/ci/content-release-isolation.mjs",
      "A\tscripts/ci/content-release-isolation.test.mjs",
      "M\tpackage.json",
    ],
    { sourceSha: "a".repeat(40), eventName: "pull_request" },
  );
  assert.equal(release.ci_policy_changed, true);
  assert.ok(
    Object.values(release.deploy_targets).every((enabled) => enabled === false),
  );
});
