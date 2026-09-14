import { readFileSync } from "node:fs";
import { describe, expect, it, mock } from "bun:test";
import {
  RUNTIME_CONTRACT,
  RUNTIME_FEATURES,
  RUNTIME_REQUIRED,
  createRuntimeContractReporter,
  evaluateRuntimeContract,
  type RuntimeName,
} from "./runtime-contract";

// Synthetic values stay short so the literal-secret scan keeps working here.
const secrets = {
  MAC_MINI_INGEST_KEY: "synthetic-mini-41",
  BRANDS_INGEST_KEY: "synthetic-brand-52",
  GITHUB_TOKEN: "synthetic-gh-63",
  CF_API_TOKEN: "synthetic-cf-74",
};

function completeEnv(): Record<string, unknown> {
  return {
    DB: { prepare: () => null },
    CF_ACCOUNT_ID: "synthetic-acct-85",
    ...secrets,
  };
}

function without(...names: string[]) {
  const env = completeEnv();
  for (const name of names) delete env[name];
  return env;
}

const available = { state: "available", missing: [] };
const allAvailable = {
  brands_ingest: available,
  github_stats: available,
  cf_deployments: available,
};

function sink() {
  return { info: mock(() => {}), warn: mock(() => {}) };
}

describe("ingest runtime contract evaluation", () => {
  it("reports a complete deployment as ready with every feature available", () => {
    expect(evaluateRuntimeContract(completeEnv())).toEqual({
      ok: true,
      missing: [],
      features: allAvailable,
    });
  });

  for (const name of RUNTIME_REQUIRED) {
    it(`names a missing required ${name}`, () => {
      const report = evaluateRuntimeContract(without(name));
      expect(report.ok).toBe(false);
      expect(report.missing).toEqual([name]);
      // Required configuration never changes feature reporting.
      expect(report.features).toEqual(allAvailable);
    });
  }

  it("reports each feature from its own names", () => {
    const report = evaluateRuntimeContract(
      without("BRANDS_INGEST_KEY", "CF_ACCOUNT_ID"),
    );
    expect(report).toEqual({
      ok: true,
      missing: [],
      features: {
        brands_ingest: { state: "unavailable", missing: ["BRANDS_INGEST_KEY"] },
        github_stats: available,
        cf_deployments: { state: "unavailable", missing: ["CF_ACCOUNT_ID"] },
      },
    });
  });

  it("treats empty text and shapeless bindings as missing", () => {
    const report = evaluateRuntimeContract({
      ...completeEnv(),
      DB: { prepare: "not a function" },
      MAC_MINI_INGEST_KEY: " ",
      GITHUB_TOKEN: 42,
      CF_API_TOKEN: null,
    });
    expect(report.missing).toEqual(["DB", "MAC_MINI_INGEST_KEY"]);
    expect(report.features.github_stats).toEqual({
      state: "unavailable",
      missing: ["GITHUB_TOKEN"],
    });
    expect(report.features.cf_deployments).toEqual({
      state: "unavailable",
      missing: ["CF_API_TOKEN"],
    });
  });

  for (const env of [null, undefined, "env", 7]) {
    it(`reports every name for a non-object env ${String(env)}`, () => {
      expect(evaluateRuntimeContract(env)).toEqual({
        ok: false,
        missing: [...RUNTIME_REQUIRED],
        features: {
          brands_ingest: {
            state: "unavailable",
            missing: ["BRANDS_INGEST_KEY"],
          },
          github_stats: { state: "unavailable", missing: ["GITHUB_TOKEN"] },
          cf_deployments: {
            state: "unavailable",
            missing: ["CF_API_TOKEN", "CF_ACCOUNT_ID"],
          },
        },
      });
    });
  }

  it("reports a throwing binding as missing instead of throwing", () => {
    const env = completeEnv();
    Object.defineProperty(env, "DB", {
      enumerable: true,
      get() {
        throw new Error("binding exploded with provider detail");
      },
    });
    const report = evaluateRuntimeContract(env);
    expect(report.missing).toEqual(["DB"]);
    expect(JSON.stringify(report)).not.toContain("provider detail");
  });

  it("never copies configuration values into the report", () => {
    const env = completeEnv();
    for (const input of [env, { ...env, DB: undefined }]) {
      const text = JSON.stringify(evaluateRuntimeContract(input));
      for (const value of Object.values(env))
        if (typeof value === "string") expect(text).not.toContain(value);
    }
  });
});

describe("ingest runtime contract logging", () => {
  it("logs one bounded line per reporter and reads the env once", () => {
    const log = sink();
    const report = createRuntimeContractReporter(log);
    let reads = 0;
    const env = new Proxy(without("MAC_MINI_INGEST_KEY", "GITHUB_TOKEN"), {
      get(target, key) {
        reads += 1;
        return Reflect.get(target, key);
      },
    });
    expect(report(env, "scheduled")).toBeUndefined();
    const readsAfterFirst = reads;
    expect(readsAfterFirst).toBeGreaterThan(0);
    report(env, "scheduled");
    report(completeEnv(), "fetch");
    expect(reads).toBe(readsAfterFirst);
    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledTimes(1);
    const line = log.warn.mock.calls[0]?.[0] as unknown as string;
    expect(typeof line).toBe("string");
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toEqual({
      event: "runtime_contract",
      worker: "ingest",
      entry: "scheduled",
      ok: false,
      missing: ["MAC_MINI_INGEST_KEY"],
      features: {
        ...allAvailable,
        github_stats: { state: "unavailable", missing: ["GITHUB_TOKEN"] },
      },
    });
    for (const value of Object.values(completeEnv()))
      if (typeof value === "string") expect(line).not.toContain(value);
  });

  it("logs a complete deployment at info level", () => {
    const log = sink();
    createRuntimeContractReporter(log)(completeEnv(), "fetch");
    expect(log.warn).not.toHaveBeenCalled();
    const line = log.info.mock.calls[0]?.[0] as unknown as string;
    expect(JSON.parse(line)).toMatchObject({ entry: "fetch", ok: true });
  });

  it("warns when only a feature is unavailable", () => {
    const log = sink();
    createRuntimeContractReporter(log)(without("CF_API_TOKEN"), "fetch");
    expect(log.info).not.toHaveBeenCalled();
    const line = log.warn.mock.calls[0]?.[0] as unknown as string;
    expect(JSON.parse(line).ok).toBe(true);
  });

  it("swallows evaluation and sink failures", () => {
    const hostile = new Proxy(
      {},
      {
        get() {
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
      createRuntimeContractReporter(broken)(hostile, "fetch"),
    ).not.toThrow();
  });
});

// wrangler.toml is the deployed source for every non-secret name, and its
// `# Secrets:` comment names the values set with `wrangler secret put`.
type Source = "vars" | "d1" | "secret";
type Declared = Record<Source, string[]> & {
  observability: boolean;
  invocationLogs: boolean;
  unrecognized: string[];
};

// Tables and top-level keys this parser reads or that carry no runtime name.
// Any other table or top-level key, such as a KV, R2, queue producer or
// service binding, is reported so the contract has to classify it first.
const RECOGNIZED_TABLES = new Set([
  "vars",
  "triggers",
  "d1_databases",
  "observability",
  "observability.logs",
]);
const RECOGNIZED_KEYS = new Set([
  "name",
  "compatibility_date",
  "compatibility_flags",
  "account_id",
  "main",
  "workers_dev",
]);

function declaredRuntimeNames(text: string): Declared {
  const declared: Declared = {
    vars: [],
    d1: [],
    secret: [],
    observability: false,
    invocationLogs: true,
    unrecognized: [],
  };
  let section = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const secretComment = /^# Secrets: (.+)\.$/.exec(line);
    if (secretComment?.[1]) {
      declared.secret.push(...secretComment[1].split(/,\s*|\s+and\s+/));
      continue;
    }
    if (!line || line.startsWith("#")) continue;
    const header = /^\[{1,2}([^\]]+)\]{1,2}$/.exec(line);
    if (header?.[1]) {
      section = header[1];
      if (!RECOGNIZED_TABLES.has(section)) declared.unrecognized.push(section);
      continue;
    }
    const pair = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(line);
    if (!pair?.[1] || !pair[2]) continue;
    const [, key, value] = pair;
    if (!section && !RECOGNIZED_KEYS.has(key)) declared.unrecognized.push(key);
    const quoted = /^"([^"]*)"$/.exec(value)?.[1];
    if (section === "vars") declared.vars.push(key);
    if (section === "d1_databases" && key === "binding" && quoted)
      declared.d1.push(quoted);
    if (section === "observability" && key === "enabled")
      declared.observability = value === "true";
    if (section === "observability.logs" && key === "invocation_logs")
      declared.invocationLogs = value !== "false";
  }
  return declared;
}

function undeclared(declared: Declared) {
  return (Object.keys(RUNTIME_CONTRACT) as RuntimeName[]).filter(
    (name) => !declared[RUNTIME_CONTRACT[name].source].includes(name),
  );
}

function unclassified(declared: Declared) {
  return [...declared.vars, ...declared.d1, ...declared.secret].filter(
    (name) => !(name in RUNTIME_CONTRACT),
  );
}

describe("ingest wrangler.toml runtime contract drift", () => {
  const wrangler = readFileSync(
    new URL("../wrangler.toml", import.meta.url),
    "utf8",
  );

  it("declares every contract binding, var and secret under its contract name", () => {
    expect(undeclared(declaredRuntimeNames(wrangler))).toEqual([]);
  });

  it("classifies every deployed binding, var and secret in the contract", () => {
    const declared = declaredRuntimeNames(wrangler);
    expect(unclassified(declared)).toEqual([]);
    expect(declared.unrecognized).toEqual([]);
  });

  it("flags a binding table or top-level binding the parser cannot classify", () => {
    const table = `${wrangler}\n[[kv_namespaces]]\nbinding = "CACHE"\nid = "x"\n`;
    const inline = `browser = { binding = "BROWSER" }\n${wrangler}`;
    expect(declaredRuntimeNames(table).unrecognized).toEqual(["kv_namespaces"]);
    expect(declaredRuntimeNames(inline).unrecognized).toEqual(["browser"]);
  });

  it("retains the contract line without invocation logs", () => {
    const declared = declaredRuntimeNames(wrangler);
    expect(declared.observability).toBe(true);
    expect(declared.invocationLogs).toBe(false);
  });

  it("flags a removed or renamed name", () => {
    const d1 = wrangler.replace('binding = "DB"', 'binding = "DATABASE"');
    const vars = wrangler.replace(/^CF_ACCOUNT_ID = .*$/m, 'ACCOUNT_ID = "x"');
    const secret = wrangler.replace(" GITHUB_TOKEN and", "");
    for (const changed of [d1, vars, secret])
      expect(changed).not.toBe(wrangler);
    expect(undeclared(declaredRuntimeNames(d1))).toEqual(["DB"]);
    expect(undeclared(declaredRuntimeNames(vars))).toEqual(["CF_ACCOUNT_ID"]);
    expect(unclassified(declaredRuntimeNames(vars))).toEqual(["ACCOUNT_ID"]);
    expect(undeclared(declaredRuntimeNames(secret))).toEqual(["GITHUB_TOKEN"]);
  });

  it("keeps every contract name required or owned by a feature", () => {
    const used = new Set<string>([
      ...RUNTIME_REQUIRED,
      ...Object.values(RUNTIME_FEATURES).flat(),
    ]);
    expect(Object.keys(RUNTIME_CONTRACT).filter((n) => !used.has(n))).toEqual(
      [],
    );
    for (const name of used) expect(name in RUNTIME_CONTRACT).toBe(true);
  });
});
