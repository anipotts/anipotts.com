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
function completeEnv(): Record<string, unknown> {
  return {
    ASSETS: { fetch: async () => new Response(null) },
    ACCESS_TEAM_DOMAIN: "https://owner.cloudflareaccess.com",
    // Synthetic and short so the literal-secret scan keeps working here.
    ACCESS_POLICY_AUD: "synthetic-aud-7c1",
    DB: { prepare: () => null },
    EDITORIAL: { getByName: () => null },
    EDITORIAL_ENABLED: "true",
    EDITORIAL_PUBLISH_ENABLED: "true",
    CONTENT_DB: { prepare: () => null },
    CONTENT_MEDIA: { get: async () => null, put: async () => null },
  };
}

function without(...names: string[]) {
  const env = completeEnv();
  for (const name of names) delete env[name];
  return env;
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
      },
    });
  });

  it.each(RUNTIME_REQUIRED)("names a missing required %s", (name) => {
    const report = evaluateRuntimeContract(without(name), release);
    expect(report.ok).toBe(false);
    expect(report.missing).toEqual([name]);
    // Required configuration never changes feature reporting.
    expect(Object.values(report.features)).toEqual(Array(3).fill(available));
  });

  it("treats empty text and shapeless bindings as missing", () => {
    const report = evaluateRuntimeContract(
      {
        ...completeEnv(),
        ASSETS: {},
        ACCESS_TEAM_DOMAIN: " ",
        ACCESS_POLICY_AUD: 42,
        DB: { prepare: "not a function" },
        EDITORIAL: null,
      },
      release,
    );
    expect(report.missing).toEqual(RUNTIME_REQUIRED);
    expect(report.features.admin_database).toEqual({
      state: "unavailable",
      missing: ["DB"],
    });
    expect(report.features.editorial).toEqual({
      state: "unavailable",
      missing: ["EDITORIAL"],
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
        },
      });
    },
  );

  it("keeps the app ready when editorial bindings are missing", () => {
    const report = evaluateRuntimeContract(
      without("EDITORIAL", "CONTENT_DB"),
      release,
    );
    expect(report.ok).toBe(true);
    expect(report.features.editorial).toEqual({
      state: "unavailable",
      missing: ["EDITORIAL", "CONTENT_DB"],
    });
    expect(report.features.editorial_publishing).toEqual({
      state: "unavailable",
      missing: ["EDITORIAL", "CONTENT_DB"],
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
      without("CONTENT_MEDIA"),
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

  it("requires a baked release identity for publishing only", () => {
    for (const build of ["dev", "", "A".repeat(40), "a".repeat(39)]) {
      const report = evaluateRuntimeContract(completeEnv(), build);
      expect(report.features.editorial).toEqual(available);
      expect(report.features.editorial_publishing).toEqual({
        state: "unavailable",
        missing: ["PUBLIC_RELEASE_SHA"],
      });
    }
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

  it("ignores the retired publish mode and never reads repository publisher credentials", () => {
    const env = completeEnv();
    const retiredRead = vi.fn(() => {
      throw new Error("retired configuration must not be read");
    });
    for (const name of [
      "EDITORIAL_PUBLISH_MODE",
      "EDITORIAL_GITHUB_APP_ID",
      "EDITORIAL_GITHUB_INSTALLATION_ID",
      "EDITORIAL_GITHUB_PRIVATE_KEY",
      "EDITORIAL_SIGNING_PRIVATE_KEY",
    ])
      Object.defineProperty(env, name, { get: retiredRead });
    expect(evaluateRuntimeContract(env, release)).toEqual(
      evaluateRuntimeContract(completeEnv(), release),
    );
    expect(retiredRead).not.toHaveBeenCalled();
    for (const mode of ["legacy", "maintenance", "future"])
      expect(
        evaluateRuntimeContract(
          { ...completeEnv(), EDITORIAL_PUBLISH_MODE: mode },
          release,
        ),
      ).toEqual(evaluateRuntimeContract(completeEnv(), release));
  });

  it.each(["EDITORIAL", "CONTENT_DB"])(
    "requires %s for save/read and publication",
    (name) => {
      const env = completeEnv();
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
    "requires readable and writable media storage for publishing only (%s)",
    (media) => {
      const report = evaluateRuntimeContract(
        { ...completeEnv(), CONTENT_MEDIA: media },
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
      { ...completeEnv(), CONTENT_DB: { prepare: false } },
      release,
    );
    expect(report.features.admin_database).toEqual(available);
    expect(report.features.editorial).toEqual({
      state: "unavailable",
      missing: ["CONTENT_DB"],
    });
  });

  it("keeps save/read available while the publishing kill switch is off", () => {
    const report = evaluateRuntimeContract(
      {
        ...completeEnv(),
        EDITORIAL_PUBLISH_ENABLED: "false",
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
          ...completeEnv(),
          EDITORIAL_PUBLISH_ENABLED: "false",
          CONTENT_DB: undefined,
        },
        release,
      ).features.editorial,
    ).toEqual({ state: "unavailable", missing: ["CONTENT_DB"] });
  });

  it("still honors disabled flags without reading disabled storage", () => {
    const env = { ...completeEnv(), EDITORIAL_ENABLED: "false" };
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
          ...completeEnv(),
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
    reportRuntimeContract(without("DB"), "fetch", release, log);
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
  // Evaluate the same feature flags against declaration-only stubs.
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
    const drafts = wrangler.replace('name = "EDITORIAL"', 'name = "DRAFTS"');
    const vars = wrangler.replace(
      /^ACCESS_TEAM_DOMAIN = .*$/m,
      'ACCESS_DOMAIN = "x"',
    );
    const assets = wrangler.replace('binding = "ASSETS"', 'binding = "FILES"');
    const database = wrangler.replace(
      'binding = "CONTENT_DB"',
      'binding = "CONTENT"',
    );
    expect(database).not.toBe(wrangler);
    expect(drafts).not.toBe(wrangler);
    expect(vars).not.toBe(wrangler);
    expect(assets).not.toBe(wrangler);
    expect(undeclared(declaredRuntimeNames(drafts))).toEqual(["EDITORIAL"]);
    expect(undeclared(declaredRuntimeNames(vars))).toEqual([
      "ACCESS_TEAM_DOMAIN",
    ]);
    expect(undeclared(declaredRuntimeNames(assets))).toEqual(["ASSETS"]);
    expect(undeclared(declaredRuntimeNames(database))).toEqual(["CONTENT_DB"]);
  });

  it("deploys direct publishing with its content bindings", () => {
    const declared = declaredRuntimeNames(wrangler);
    // The retired repository publisher's mode and App identity stay out.
    for (const name of [
      "EDITORIAL_PUBLISH_MODE",
      "EDITORIAL_GITHUB_APP_ID",
      "EDITORIAL_GITHUB_INSTALLATION_ID",
    ])
      expect(declared.vars).not.toContain(name);
    expect(declared.secret).toEqual([]);
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

  it("keeps the publishing-off kill switch complete", () => {
    const off = wrangler.replace(
      /^EDITORIAL_PUBLISH_ENABLED = .*$/m,
      'EDITORIAL_PUBLISH_ENABLED = "false"',
    );
    expect(off).not.toBe(wrangler);
    expect(undeclared(declaredRuntimeNames(off))).toEqual([]);
  });

  // The checks below start from a config without the content resources, so
  // each missing binding is reported on its own.
  const bare = wrangler
    .replace(/^\[\[d1_databases\]\]\nbinding = "CONTENT_DB"\n(?:.+\n)*/m, "")
    .replace(/^\[\[r2_buckets\]\]\nbinding = "CONTENT_MEDIA"\n(?:.+\n)*/m, "");

  it("requires content bindings only when their feature is enabled", () => {
    expect(undeclared(declaredRuntimeNames(bare))).toEqual([
      "CONTENT_DB",
      "CONTENT_MEDIA",
    ]);
    const withDatabase = `${bare}\n[[d1_databases]]\nbinding = "CONTENT_DB"\n`;
    expect(undeclared(declaredRuntimeNames(withDatabase))).toEqual([
      "CONTENT_MEDIA",
    ]);
    const withMedia = `${withDatabase}\n[[r2_buckets]]\nbinding = "CONTENT_MEDIA"\n`;
    expect(undeclared(declaredRuntimeNames(withMedia))).toEqual([]);
    const publishDisabled = withDatabase.replace(
      'EDITORIAL_PUBLISH_ENABLED = "true"',
      'EDITORIAL_PUBLISH_ENABLED = "false"',
    );
    expect(undeclared(declaredRuntimeNames(publishDisabled))).toEqual([]);
  });

  it("keeps the Health and Knowledge reader flags registered and unset in production", () => {
    const declared = declaredRuntimeNames(wrangler);
    for (const name of [
      "PRIVATE_READER_HEALTH_ENABLED",
      "PRIVATE_READER_KNOWLEDGE_ENABLED",
    ] as const) {
      expect(RUNTIME_CONTRACT[name]).toEqual({ source: "vars", check: "flag" });
      expect(declared.vars).not.toContain(name);
      expect(wrangler).not.toContain(name);
    }
    // The flags they sit beside stay as deployed.
    expect(declared.varValues.PRIVATE_READER_ENABLED).toBe("true");
    expect(declared.varValues.PRIVATE_READER_OPS_ENABLED).toBe("true");
  });

  it("keeps each feature built from contract names only", () => {
    for (const feature of Object.values(RUNTIME_FEATURES))
      for (const name of [...feature.flags, ...feature.needs])
        expect(name in RUNTIME_CONTRACT).toBe(true);
  });
});
