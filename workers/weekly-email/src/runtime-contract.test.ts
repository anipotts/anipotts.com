import { readFileSync } from "node:fs";
import { describe, expect, it, mock } from "bun:test";
import {
  RUNTIME_CONTRACT,
  RUNTIME_REQUIRED,
  createRuntimeContractReporter,
  evaluateRuntimeContract,
} from "./runtime-contract";

// Synthetic values stay short so the literal-secret scan keeps working here.
// They stand in for secrets that may still be set in Cloudflare.
const staleSecrets = {
  RESEND_API_KEY: "synthetic-resend-51",
  MERCURY_API_TOKEN: "synthetic-mercury-62",
  MINI_API_KEY: "synthetic-mini-95",
  MINI_API_URL: "https://mini.example",
};

function completeEnv(): Record<string, unknown> {
  return { DB: { prepare: () => null } };
}

function sink() {
  return { info: mock(() => {}), warn: mock(() => {}) };
}

describe("weekly email runtime contract evaluation", () => {
  it("needs only DB now that the worker sends nothing", () => {
    expect(Object.keys(RUNTIME_CONTRACT)).toEqual(["DB"]);
    expect([...RUNTIME_REQUIRED]).toEqual(["DB"]);
    expect(evaluateRuntimeContract(completeEnv())).toEqual({
      ok: true,
      missing: [],
    });
  });

  it("ignores stale secrets that may still be set in Cloudflare", () => {
    const report = evaluateRuntimeContract({
      ...completeEnv(),
      ...staleSecrets,
    });
    expect(report).toEqual({ ok: true, missing: [] });
    const text = JSON.stringify(report);
    for (const [name, value] of Object.entries(staleSecrets)) {
      expect(text).not.toContain(name);
      expect(text).not.toContain(value);
    }
  });

  it("names a missing DB", () => {
    expect(evaluateRuntimeContract({ ...staleSecrets })).toEqual({
      ok: false,
      missing: ["DB"],
    });
  });

  for (const env of [null, undefined, "env", 7]) {
    it(`reports DB missing for a non-object env ${String(env)}`, () => {
      expect(evaluateRuntimeContract(env)).toEqual({
        ok: false,
        missing: ["DB"],
      });
    });
  }

  it("reports a shapeless or throwing binding as missing instead of throwing", () => {
    expect(evaluateRuntimeContract({ DB: {} }).missing).toEqual(["DB"]);
    expect(evaluateRuntimeContract({ DB: { prepare: "no" } }).missing).toEqual([
      "DB",
    ]);
    const env: Record<string, unknown> = {};
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
});

describe("weekly email runtime contract logging", () => {
  it("logs one bounded line per reporter and reads the env once", () => {
    const log = sink();
    const report = createRuntimeContractReporter(log);
    let reads = 0;
    const env = new Proxy(
      { ...staleSecrets },
      {
        get(target, key) {
          reads += 1;
          return Reflect.get(target, key);
        },
      },
    );
    expect(report(env, "scheduled")).toBeUndefined();
    const readsAfterFirst = reads;
    expect(readsAfterFirst).toBeGreaterThan(0);
    report(env, "scheduled");
    report(completeEnv(), "fetch");
    expect(reads).toBe(readsAfterFirst);
    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledTimes(1);
    const line = log.warn.mock.calls[0]?.[0] as unknown as string;
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toEqual({
      event: "runtime_contract",
      worker: "weekly-email",
      entry: "scheduled",
      ok: false,
      missing: ["DB"],
    });
    for (const value of Object.values(staleSecrets))
      expect(line).not.toContain(value);
  });

  it("logs a complete deployment at info level", () => {
    const log = sink();
    createRuntimeContractReporter(log)(completeEnv(), "fetch");
    expect(log.warn).not.toHaveBeenCalled();
    const line = log.info.mock.calls[0]?.[0] as unknown as string;
    expect(JSON.parse(line)).toEqual({
      event: "runtime_contract",
      worker: "weekly-email",
      entry: "fetch",
      ok: true,
      missing: [],
    });
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
      createRuntimeContractReporter(broken)(hostile, "scheduled"),
    ).not.toThrow();
  });
});

// wrangler.toml is the deployed source for the D1 binding, and `# Secrets:`
// or `# Optional secrets:` comments name the values set with
// `wrangler secret put`. The retired worker declares none.
type Declared = {
  vars: string[];
  d1: string[];
  secret: string[];
  crons: string | null;
  observability: boolean;
  invocationLogs: boolean;
  unrecognized: string[];
};

// Tables and top-level keys this parser reads or that carry no runtime name.
// Any other table or top-level key, such as a KV, R2, queue producer or
// service binding, is reported so the contract has to classify it first.
const RECOGNIZED_TABLES = new Set([
  "vars",
  "d1_databases",
  "triggers",
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
    crons: null,
    observability: false,
    invocationLogs: true,
    unrecognized: [],
  };
  let section = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const secretComment = /^# (?:Secrets|Optional secrets): (.+)\.$/.exec(line);
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
    if (section === "triggers" && key === "crons") declared.crons = value;
    if (section === "observability" && key === "enabled")
      declared.observability = value === "true";
    if (section === "observability.logs" && key === "invocation_logs")
      declared.invocationLogs = value !== "false";
  }
  return declared;
}

function undeclared(declared: Declared) {
  return Object.keys(RUNTIME_CONTRACT).filter(
    (name) => !declared.d1.includes(name),
  );
}

function unclassified(declared: Declared) {
  return [...declared.vars, ...declared.d1, ...declared.secret].filter(
    (name) => !(name in RUNTIME_CONTRACT),
  );
}

describe("weekly email wrangler.toml runtime contract drift", () => {
  const wrangler = readFileSync(
    new URL("../wrangler.toml", import.meta.url),
    "utf8",
  );

  it("declares the DB binding under its contract name", () => {
    expect(undeclared(declaredRuntimeNames(wrangler))).toEqual([]);
  });

  it("declares no var or secret the contract does not classify", () => {
    const declared = declaredRuntimeNames(wrangler);
    expect(declared.vars).toEqual([]);
    expect(declared.secret).toEqual([]);
    expect(unclassified(declared)).toEqual([]);
    expect(declared.unrecognized).toEqual([]);
  });

  it("keeps an explicit empty schedule so a deploy removes the Sunday cron", () => {
    expect(declaredRuntimeNames(wrangler).crons).toBe("[]");
    const dropped = wrangler.replace(/^\[triggers\]\ncrons = \[\]\n/m, "");
    expect(dropped).not.toBe(wrangler);
    expect(declaredRuntimeNames(dropped).crons).toBeNull();
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

  it("flags a renamed binding or a secret declared again", () => {
    const d1 = wrangler.replace('binding = "DB"', 'binding = "DATABASE"');
    const secret = `${wrangler}\n# Secrets: RESEND_API_KEY.\n`;
    const optional = `${wrangler}\n# Optional secrets: MINI_API_URL.\n`;
    expect(d1).not.toBe(wrangler);
    expect(undeclared(declaredRuntimeNames(d1))).toEqual(["DB"]);
    expect(unclassified(declaredRuntimeNames(d1))).toEqual(["DATABASE"]);
    expect(unclassified(declaredRuntimeNames(secret))).toEqual([
      "RESEND_API_KEY",
    ]);
    expect(unclassified(declaredRuntimeNames(optional))).toEqual([
      "MINI_API_URL",
    ]);
  });
});
