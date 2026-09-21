import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RUNTIME_CONTRACT,
  RUNTIME_FEATURES,
  RUNTIME_REQUIRED,
  evaluateRuntimeContract,
  type RuntimeName,
} from "./runtime-contract";

const release = "a".repeat(40);
// Synthetic values stay short so the literal-secret scan keeps working here.
const secrets = {
  ACCESS_POLICY_AUD: "synthetic-aud-7c1",
  EDITORIAL_GITHUB_PRIVATE_KEY: "synthetic-pem-51",
  EDITORIAL_SIGNING_PRIVATE_KEY: "synthetic-sig-93",
};

function completeEnv(): Record<string, unknown> {
  return {
    ASSETS: { fetch: async () => new Response(null) },
    ACCESS_TEAM_DOMAIN: "https://owner.cloudflareaccess.com",
    ...secrets,
    DB: { prepare: () => null },
    EDITORIAL: { getByName: () => null },
    COMMAND_RELAY: { getByName: () => null },
    EDITORIAL_ENABLED: "true",
    EDITORIAL_PUBLISH_ENABLED: "true",
    EDITORIAL_GITHUB_APP_ID: "4242",
    EDITORIAL_GITHUB_INSTALLATION_ID: "9001",
  };
}

function without(...names: string[]) {
  const env = completeEnv();
  for (const name of names) delete env[name];
  return env;
}

function directEnv(): Record<string, unknown> {
  return {
    ...without(
      "EDITORIAL_GITHUB_APP_ID",
      "EDITORIAL_GITHUB_INSTALLATION_ID",
      "EDITORIAL_GITHUB_PRIVATE_KEY",
      "EDITORIAL_SIGNING_PRIVATE_KEY",
    ),
    EDITORIAL_PUBLISH_MODE: "direct",
    CONTENT_DB: { prepare: () => null },
    CONTENT_MEDIA: { get: async () => null, put: async () => null },
  };
}

const available = { state: "available", missing: [] };

describe("admin runtime contract evaluation", () => {
  it("reports a complete deployment as ready with every feature available", () => {
    expect(evaluateRuntimeContract(completeEnv(), release)).toEqual({
      ok: true,
      missing: [],
      features: {
        editorial: available,
        editorial_publishing: available,
        admin_database: available,
        control_plane: available,
      },
    });
  });

  it.each(RUNTIME_REQUIRED)("names a missing required %s", (name) => {
    const report = evaluateRuntimeContract(without(name), release);
    expect(report.ok).toBe(false);
    expect(report.missing).toEqual([name]);
    // Required configuration never changes feature reporting.
    expect(Object.values(report.features)).toEqual(Array(4).fill(available));
  });

  it("treats empty text and shapeless bindings as missing", () => {
    const report = evaluateRuntimeContract(
      {
        ...completeEnv(),
        ASSETS: {},
        ACCESS_TEAM_DOMAIN: " ",
        ACCESS_POLICY_AUD: 42,
        DB: { prepare: "not a function" },
        COMMAND_RELAY: null,
      },
      release,
    );
    expect(report.missing).toEqual(RUNTIME_REQUIRED);
    expect(report.features.admin_database).toEqual({
      state: "unavailable",
      missing: ["DB"],
    });
    expect(report.features.control_plane).toEqual({
      state: "unavailable",
      missing: ["COMMAND_RELAY"],
    });
  });

  it.each([null, undefined, "env", 7])(
    "reports every requirement for a non-object env %s",
    (env) => {
      expect(evaluateRuntimeContract(env, release)).toEqual({
        ok: false,
        missing: RUNTIME_REQUIRED,
        features: {
          editorial: { state: "disabled", missing: [] },
          editorial_publishing: { state: "disabled", missing: [] },
          admin_database: { state: "unavailable", missing: ["DB"] },
          control_plane: { state: "unavailable", missing: ["COMMAND_RELAY"] },
        },
      });
    },
  );

  it("keeps the app ready when editorial bindings are missing", () => {
    const report = evaluateRuntimeContract(
      without("EDITORIAL", "EDITORIAL_GITHUB_PRIVATE_KEY"),
      release,
    );
    expect(report.ok).toBe(true);
    expect(report.features.editorial).toEqual({
      state: "unavailable",
      missing: ["EDITORIAL", "EDITORIAL_GITHUB_PRIVATE_KEY"],
    });
    expect(report.features.editorial_publishing).toEqual({
      state: "unavailable",
      missing: ["EDITORIAL", "EDITORIAL_GITHUB_PRIVATE_KEY"],
    });
  });

  it("mirrors the editorial installation id rule", () => {
    for (const id of ["0", "-3", "abc", "1.5", "9007199254740993"])
      expect(
        evaluateRuntimeContract(
          { ...completeEnv(), EDITORIAL_GITHUB_INSTALLATION_ID: id },
          release,
        ).features.editorial,
      ).toEqual({
        state: "unavailable",
        missing: ["EDITORIAL_GITHUB_INSTALLATION_ID"],
      });
  });

  it("reports switched-off editorial flags as disabled, not unavailable", () => {
    const editorialOff = evaluateRuntimeContract(
      { ...without("EDITORIAL"), EDITORIAL_ENABLED: "false" },
      release,
    );
    expect(editorialOff.features.editorial).toEqual({
      state: "disabled",
      missing: [],
    });
    expect(editorialOff.features.editorial_publishing).toEqual({
      state: "disabled",
      missing: [],
    });
    const publishingOff = evaluateRuntimeContract(
      { ...without("EDITORIAL_SIGNING_PRIVATE_KEY") },
      release,
    );
    expect(publishingOff.features.editorial_publishing.state).toBe(
      "unavailable",
    );
    expect(
      evaluateRuntimeContract(
        { ...completeEnv(), EDITORIAL_PUBLISH_ENABLED: "TRUE" },
        release,
      ).features,
    ).toMatchObject({
      editorial: available,
      editorial_publishing: { state: "disabled", missing: [] },
    });
  });

  it("requires a baked release identity and signing key for publishing", () => {
    for (const build of ["dev", "", "A".repeat(40), "a".repeat(39)])
      expect(
        evaluateRuntimeContract(without("EDITORIAL_SIGNING_PRIVATE_KEY"), build)
          .features.editorial_publishing,
      ).toEqual({
        state: "unavailable",
        missing: ["EDITORIAL_SIGNING_PRIVATE_KEY", "PUBLIC_RELEASE_SHA"],
      });
  });

  it("reports a throwing binding as missing instead of throwing", () => {
    const env = completeEnv();
    Object.defineProperty(env, "DB", {
      enumerable: true,
      get() {
        throw new Error("binding exploded with provider detail");
      },
    });
    const report = evaluateRuntimeContract(env, release);
    expect(report.features.admin_database).toEqual({
      state: "unavailable",
      missing: ["DB"],
    });
    expect(JSON.stringify(report)).not.toContain("provider detail");
  });

  it("keeps the omitted mode compatible with explicit legacy deployment", () => {
    expect(evaluateRuntimeContract(completeEnv(), release)).toEqual(
      evaluateRuntimeContract(
        { ...completeEnv(), EDITORIAL_PUBLISH_MODE: "legacy" },
        release,
      ),
    );
  });

  it("makes direct authoring and publishing available without reading Git credentials", () => {
    const env = directEnv();
    const secretRead = vi.fn(() => {
      throw new Error("credential must not be read");
    });
    for (const name of [
      "EDITORIAL_GITHUB_APP_ID",
      "EDITORIAL_GITHUB_INSTALLATION_ID",
      "EDITORIAL_GITHUB_PRIVATE_KEY",
      "EDITORIAL_SIGNING_PRIVATE_KEY",
    ])
      Object.defineProperty(env, name, { get: secretRead });
    const report = evaluateRuntimeContract(env, release);
    expect(report.ok).toBe(true);
    expect(report.features.editorial).toEqual(available);
    expect(report.features.editorial_publishing).toEqual(available);
    expect(secretRead).not.toHaveBeenCalled();
  });

  it.each(["EDITORIAL", "CONTENT_DB"])(
    "requires %s for direct save/read and publication",
    (name) => {
      const env = directEnv();
      delete env[name];
      const report = evaluateRuntimeContract(env, release);
      expect(report.features.editorial).toEqual({
        state: "unavailable",
        missing: [name],
      });
      expect(report.features.editorial_publishing).toEqual({
        state: "unavailable",
        missing: [name],
      });
    },
  );

  it.each([
    undefined,
    {},
    { get: (): null => null },
    { put: (): null => null },
    { get: "get", put: (): null => null },
  ])(
    "requires readable and writable direct media storage for publishing only (%s)",
    (media) => {
      const report = evaluateRuntimeContract(
        { ...directEnv(), CONTENT_MEDIA: media },
        release,
      );
      expect(report.features.editorial).toEqual(available);
      expect(report.features.editorial_publishing).toEqual({
        state: "unavailable",
        missing: ["CONTENT_MEDIA"],
      });
    },
  );

  it("does not accept an unrelated DB as the CMS database", () => {
    const report = evaluateRuntimeContract(
      { ...directEnv(), CONTENT_DB: { prepare: false } },
      release,
    );
    expect(report.features.admin_database).toEqual(available);
    expect(report.features.editorial).toEqual({
      state: "unavailable",
      missing: ["CONTENT_DB"],
    });
  });

  it("requires a build identity for direct publishing without requiring a signing key", () => {
    const report = evaluateRuntimeContract(directEnv(), "dev");
    expect(report.features.editorial).toEqual(available);
    expect(report.features.editorial_publishing).toEqual({
      state: "unavailable",
      missing: ["PUBLIC_RELEASE_SHA"],
    });
  });

  it("keeps save/read available in maintenance while publication is disabled", () => {
    const report = evaluateRuntimeContract(
      {
        ...directEnv(),
        EDITORIAL_PUBLISH_MODE: "maintenance",
        CONTENT_MEDIA: undefined,
      },
      "dev",
    );
    expect(report.features.editorial).toEqual(available);
    expect(report.features.editorial_publishing).toEqual({
      state: "disabled",
      missing: [],
    });
    expect(
      evaluateRuntimeContract(
        {
          ...directEnv(),
          EDITORIAL_PUBLISH_MODE: "maintenance",
          CONTENT_DB: undefined,
        },
        release,
      ).features.editorial,
    ).toEqual({ state: "unavailable", missing: ["CONTENT_DB"] });
  });

  it.each(["DIRECT", "", "other", null, true, { privateValue: "do not log" }])(
    "fails closed for an invalid publisher mode (%s)",
    (mode) => {
      const report = evaluateRuntimeContract(
        { ...completeEnv(), EDITORIAL_PUBLISH_MODE: mode },
        release,
      );
      expect(report.features.editorial).toEqual({
        state: "unavailable",
        missing: ["EDITORIAL_PUBLISH_MODE"],
      });
      expect(report.features.editorial_publishing).toEqual({
        state: "unavailable",
        missing: ["EDITORIAL_PUBLISH_MODE"],
      });
      expect(JSON.stringify(report)).not.toContain("do not log");
    },
  );

  it("fails closed on an unreadable mode instead of selecting legacy", () => {
    const env = completeEnv();
    const modeRead = vi.fn(() => {
      throw new Error("private provider error");
    });
    Object.defineProperty(env, "EDITORIAL_PUBLISH_MODE", { get: modeRead });
    const report = evaluateRuntimeContract(env, release);
    expect(report.features.editorial_publishing).toEqual({
      state: "unavailable",
      missing: ["EDITORIAL_PUBLISH_MODE"],
    });
    expect(modeRead).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(report)).not.toContain("private provider error");
  });

  it("still honors disabled flags in direct mode without reading disabled storage", () => {
    const env = { ...directEnv(), EDITORIAL_ENABLED: "false" };
    const storageRead = vi.fn(() => {
      throw new Error("offline storage");
    });
    Object.defineProperty(env, "CONTENT_DB", { get: storageRead });
    const report = evaluateRuntimeContract(env, release);
    expect(report.features.editorial).toEqual({
      state: "disabled",
      missing: [],
    });
    expect(report.features.editorial_publishing).toEqual({
      state: "disabled",
      missing: [],
    });
    expect(storageRead).not.toHaveBeenCalled();
    expect(
      evaluateRuntimeContract(
        {
          ...directEnv(),
          EDITORIAL_PUBLISH_ENABLED: "false",
          CONTENT_MEDIA: undefined,
        },
        release,
      ).features.editorial_publishing,
    ).toEqual({ state: "disabled", missing: [] });
  });

  it("never copies configuration values into the report", () => {
    const env = completeEnv();
    const partial = { ...env, ASSETS: undefined, EDITORIAL: undefined };
    for (const input of [env, partial]) {
      const text = JSON.stringify(evaluateRuntimeContract(input, release));
      for (const value of Object.values(env))
        if (typeof value === "string" && value !== "true")
          expect(text).not.toContain(value);
      expect(text).not.toContain(release);
    }
  });
});

describe("admin runtime contract logging", () => {
  beforeEach(() => vi.resetModules());

  async function freshModule() {
    return import("./runtime-contract");
  }

  function sink() {
    return { info: vi.fn(), warn: vi.fn() };
  }

  it("logs one bounded line per isolate and never blocks", async () => {
    const { reportRuntimeContract } = await freshModule();
    const log = sink();
    let reads = 0;
    const env = new Proxy(without("ACCESS_POLICY_AUD", "DB"), {
      get(target, key) {
        reads += 1;
        return Reflect.get(target, key);
      },
    });
    expect(reportRuntimeContract(env, "fetch", release, log)).toBeUndefined();
    const readsAfterFirst = reads;
    expect(readsAfterFirst).toBeGreaterThan(0);
    reportRuntimeContract(env, "fetch", release, log);
    reportRuntimeContract(completeEnv(), "durable_object", release, log);
    expect(reads).toBe(readsAfterFirst);
    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledTimes(1);
    const [line] = log.warn.mock.calls[0];
    expect(typeof line).toBe("string");
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toEqual({
      event: "runtime_contract",
      app: "admin",
      entry: "fetch",
      release,
      ok: false,
      missing: ["ACCESS_POLICY_AUD"],
      features: {
        editorial: available,
        editorial_publishing: available,
        admin_database: { state: "unavailable", missing: ["DB"] },
        control_plane: available,
      },
    });
    for (const value of Object.values(completeEnv()))
      if (typeof value === "string" && value !== "true")
        expect(line).not.toContain(value);
  });

  it("logs a complete deployment at info level", async () => {
    const { reportRuntimeContract } = await freshModule();
    const log = sink();
    reportRuntimeContract(completeEnv(), "durable_object", release, log);
    expect(log.warn).not.toHaveBeenCalled();
    expect(JSON.parse(log.info.mock.calls[0][0])).toMatchObject({
      entry: "durable_object",
      ok: true,
      missing: [],
    });
  });

  it("warns when only a feature is unavailable", async () => {
    const { reportRuntimeContract } = await freshModule();
    const log = sink();
    reportRuntimeContract(without("COMMAND_RELAY"), "fetch", release, log);
    expect(log.info).not.toHaveBeenCalled();
    expect(JSON.parse(log.warn.mock.calls[0][0]).ok).toBe(true);
  });

  it("bounds the release label to a commit identity or dev", async () => {
    const { reportRuntimeContract } = await freshModule();
    const log = sink();
    reportRuntimeContract(completeEnv(), "fetch", "<script>v9</script>", log);
    const line = log.warn.mock.calls[0][0];
    expect(JSON.parse(line).release).toBe("dev");
    expect(line).not.toContain("script");
  });

  it("swallows evaluation and sink failures", async () => {
    const { reportRuntimeContract } = await freshModule();
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("hostile env");
        },
        has() {
          throw new Error("hostile env");
        },
      },
    );
    const broken = {
      info: () => {
        throw new Error("sink offline");
      },
      warn: () => {
        throw new Error("sink offline");
      },
    };
    expect(() =>
      reportRuntimeContract(hostile, "fetch", release, broken),
    ).not.toThrow();
  });
});

// wrangler.toml is the deployed source for every non-secret name. A rename or
// removal there must fail here instead of silently degrading production.
type Declared = {
  assets: string[];
  vars: string[];
  d1: string[];
  r2: string[];
  varValues: Record<string, string>;
  durable_objects: string[];
  secret: string[];
  observability: boolean;
  invocationLogs: boolean;
};

function declaredRuntimeNames(text: string): Declared {
  const declared: Declared = {
    assets: [],
    vars: [],
    d1: [],
    r2: [],
    varValues: {},
    durable_objects: [],
    secret: [],
    observability: false,
    invocationLogs: true,
  };
  let section = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const secretComment = /^# Secrets: (.+)\.$/.exec(line);
    if (secretComment) {
      declared.secret.push(...secretComment[1].split(/,\s*|\s+and\s+/));
      continue;
    }
    if (!line || line.startsWith("#")) continue;
    const header = /^\[{1,2}([^\]]+)\]{1,2}$/.exec(line);
    if (header) {
      section = header[1];
      continue;
    }
    const pair = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(line);
    if (!pair) continue;
    const [, key, value] = pair;
    const text = /^"([^"]*)"$/.exec(value)?.[1];
    if (section === "assets" && key === "binding" && text)
      declared.assets.push(text);
    if (section === "vars") {
      declared.vars.push(key);
      declared.varValues[key] = text ?? value;
    }
    if (section === "d1_databases" && key === "binding" && text)
      declared.d1.push(text);
    if (section === "r2_buckets" && key === "binding" && text)
      declared.r2.push(text);
    if (section === "durable_objects.bindings" && key === "name" && text)
      declared.durable_objects.push(text);
    if (section === "observability" && key === "enabled")
      declared.observability = value === "true";
    if (section === "observability.logs" && key === "invocation_logs")
      declared.invocationLogs = value !== "false";
  }
  return declared;
}

function undeclared(declared: Declared) {
  // Evaluate the same mode and feature flags against declaration-only stubs.
  // Secrets are names in comments here; no actual credential is loaded.
  const env: Record<string, unknown> = { ...declared.varValues };
  for (const name of declared.assets) env[name] = { fetch() {} };
  for (const name of declared.d1) env[name] = { prepare() {} };
  for (const name of declared.r2) env[name] = { get() {}, put() {} };
  for (const name of declared.durable_objects) env[name] = { getByName() {} };
  for (const name of declared.secret) env[name] = "declared";
  const report = evaluateRuntimeContract(env, release);
  const missing = new Set<RuntimeName>([
    ...report.missing,
    ...Object.values(report.features).flatMap((feature) => feature.missing),
    ...Object.values(RUNTIME_FEATURES)
      .flatMap((feature) => feature.flags)
      .filter((name) => !declared.vars.includes(name)),
  ]);
  return (Object.keys(RUNTIME_CONTRACT) as RuntimeName[]).filter((name) =>
    missing.has(name),
  );
}

// Declared for retained or build tooling; no admin runtime surface reads it.
const UNCONTRACTED_VARS = ["PUBLIC_STATE_API"];

describe("admin wrangler.toml runtime contract drift", () => {
  const wrangler = readFileSync(
    new URL("../../wrangler.toml", import.meta.url),
    "utf8",
  );

  it("declares every contract binding, var and secret under its contract name", () => {
    expect(undeclared(declaredRuntimeNames(wrangler))).toEqual([]);
  });

  it("classifies every deployed binding and var in the contract", () => {
    const declared = declaredRuntimeNames(wrangler);
    const deployed = [
      ...declared.assets,
      ...declared.vars,
      ...declared.d1,
      ...declared.r2,
      ...declared.durable_objects,
      ...declared.secret,
    ].filter((name) => !UNCONTRACTED_VARS.includes(name));
    expect(deployed.filter((name) => !(name in RUNTIME_CONTRACT))).toEqual([]);
  });

  it("retains the contract line without request URL invocation logs", () => {
    const declared = declaredRuntimeNames(wrangler);
    expect(declared.observability).toBe(true);
    expect(declared.invocationLogs).toBe(false);
  });

  it("flags a removed or renamed binding", () => {
    const relay = wrangler.replace('name = "COMMAND_RELAY"', 'name = "RELAY"');
    const vars = wrangler.replace(
      /^ACCESS_TEAM_DOMAIN = .*$/m,
      'ACCESS_DOMAIN = "x"',
    );
    const assets = wrangler.replace('binding = "ASSETS"', 'binding = "FILES"');
    // Maintenance reads no Git credential, so check secrets against the
    // legacy rollback target they are retained for.
    const legacy = wrangler.replace(
      /^EDITORIAL_PUBLISH_MODE = .*$/m,
      'EDITORIAL_PUBLISH_MODE = "legacy"',
    );
    const secret = legacy.replace(" and EDITORIAL_SIGNING_PRIVATE_KEY", "");
    const database = wrangler.replace(
      'binding = "CONTENT_DB"',
      'binding = "CONTENT"',
    );
    expect(legacy).not.toBe(wrangler);
    expect(database).not.toBe(wrangler);
    expect(relay).not.toBe(wrangler);
    expect(vars).not.toBe(wrangler);
    expect(assets).not.toBe(wrangler);
    expect(secret).not.toBe(legacy);
    expect(undeclared(declaredRuntimeNames(relay))).toEqual(["COMMAND_RELAY"]);
    expect(undeclared(declaredRuntimeNames(vars))).toEqual([
      "ACCESS_TEAM_DOMAIN",
    ]);
    expect(undeclared(declaredRuntimeNames(assets))).toEqual(["ASSETS"]);
    expect(undeclared(declaredRuntimeNames(secret))).toEqual([
      "EDITORIAL_SIGNING_PRIVATE_KEY",
    ]);
    expect(undeclared(declaredRuntimeNames(database))).toEqual(["CONTENT_DB"]);
  });

  it("deploys direct publishing with its content bindings", () => {
    const declared = declaredRuntimeNames(wrangler);
    expect(wrangler).toMatch(/^EDITORIAL_PUBLISH_MODE = "direct"$/m);
    expect(declared.varValues.EDITORIAL_PUBLISH_ENABLED).toBe("true");
    expect(declared.varValues.EDITORIAL_ENABLED).toBe("true");
    expect(declared.d1).toContain("CONTENT_DB");
    expect(declared.r2).toContain("CONTENT_MEDIA");
    expect(undeclared(declared)).toEqual([]);
    const env: Record<string, unknown> = { ...declared.varValues };
    for (const name of declared.assets) env[name] = { fetch() {} };
    for (const name of declared.d1) env[name] = { prepare() {} };
    for (const name of declared.r2) env[name] = { get() {}, put() {} };
    for (const name of declared.durable_objects) env[name] = { getByName() {} };
    for (const name of declared.secret) env[name] = "declared";
    const { features } = evaluateRuntimeContract(env, release);
    expect(features.editorial).toEqual(available);
    expect(features.editorial_publishing).toEqual(available);
    // Without the media binding direct publishing reports what is missing
    // instead of silently activating.
    const { features: withoutMedia } = evaluateRuntimeContract(
      { ...env, CONTENT_MEDIA: undefined },
      release,
    );
    expect(withoutMedia.editorial_publishing).toEqual({
      state: "unavailable",
      missing: ["CONTENT_MEDIA"],
    });
  });

  it("keeps the maintenance rollback target complete", () => {
    const maintenance = wrangler.replace(
      /^EDITORIAL_PUBLISH_MODE = .*$/m,
      'EDITORIAL_PUBLISH_MODE = "maintenance"',
    );
    expect(maintenance).not.toBe(wrangler);
    expect(undeclared(declaredRuntimeNames(maintenance))).toEqual([]);
  });

  it("keeps the retained legacy rollback target complete", () => {
    const legacy = wrangler.replace(
      /^EDITORIAL_PUBLISH_MODE = .*$/m,
      'EDITORIAL_PUBLISH_MODE = "legacy"',
    );
    expect(undeclared(declaredRuntimeNames(legacy))).toEqual([]);
  });

  // The direct-mode checks below start from a config without the content
  // resources, so each missing binding is reported on its own.
  const bare = wrangler
    .replace(/^EDITORIAL_PUBLISH_MODE = .*\n/m, "")
    .replace(/^\[\[d1_databases\]\]\nbinding = "CONTENT_DB"\n(?:.+\n)*/m, "")
    .replace(/^\[\[r2_buckets\]\]\nbinding = "CONTENT_MEDIA"\n(?:.+\n)*/m, "");

  it("requires direct bindings only when their mode and feature are enabled", () => {
    const direct = bare
      .replace(
        'EDITORIAL_ENABLED = "true"',
        'EDITORIAL_ENABLED = "true"\nEDITORIAL_PUBLISH_MODE = "direct"',
      )
      .replace(/^EDITORIAL_GITHUB_.*$/gm, "")
      .replace(/^# Secrets:.*$/gm, "");
    expect(undeclared(declaredRuntimeNames(direct))).toEqual([
      "CONTENT_DB",
      "CONTENT_MEDIA",
    ]);
    const withDatabase = `${direct}\n[[d1_databases]]\nbinding = "CONTENT_DB"\n`;
    expect(undeclared(declaredRuntimeNames(withDatabase))).toEqual([
      "CONTENT_MEDIA",
    ]);
    const withMedia = `${withDatabase}\n[[r2_buckets]]\nbinding = "CONTENT_MEDIA"\n`;
    expect(undeclared(declaredRuntimeNames(withMedia))).toEqual([]);
    const maintenance = withDatabase.replace(
      'EDITORIAL_PUBLISH_MODE = "direct"',
      'EDITORIAL_PUBLISH_MODE = "maintenance"',
    );
    expect(undeclared(declaredRuntimeNames(maintenance))).toEqual([]);
    const publishDisabled = withDatabase.replace(
      'EDITORIAL_PUBLISH_ENABLED = "true"',
      'EDITORIAL_PUBLISH_ENABLED = "false"',
    );
    expect(undeclared(declaredRuntimeNames(publishDisabled))).toEqual([]);
    const invalid = withMedia.replace(
      'EDITORIAL_PUBLISH_MODE = "direct"',
      'EDITORIAL_PUBLISH_MODE = "future"',
    );
    expect(undeclared(declaredRuntimeNames(invalid))).toEqual([
      "EDITORIAL_PUBLISH_MODE",
    ]);
  });

  it("keeps each feature built from contract names only", () => {
    for (const feature of Object.values(RUNTIME_FEATURES)) {
      const needs =
        "legacy" in feature.needs
          ? Object.values(feature.needs).flat()
          : feature.needs;
      for (const name of [...feature.flags, ...needs])
        expect(name in RUNTIME_CONTRACT).toBe(true);
    }
  });
});
