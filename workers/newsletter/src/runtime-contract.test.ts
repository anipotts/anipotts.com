import { readFileSync } from "node:fs";
import { describe, expect, it, mock } from "bun:test";
import {
  RUNTIME_CONTRACT,
  RUNTIME_DEFAULTED,
  RUNTIME_FEATURES,
  RUNTIME_REQUIRED,
  createRuntimeContractReporter,
  evaluateRuntimeContract,
  type RuntimeName,
} from "./runtime-contract";

// Synthetic values stay short so the literal-secret scan keeps working here.
const secrets = {
  RESEND_API_KEY: "synthetic-resend-17",
  NEWSLETTER_MAILING_ADDRESS: "synthetic-postal-28",
};

function completeEnv(): Record<string, unknown> {
  return {
    DB: { prepare: () => null },
    NEWSLETTER_BASE_URL: "https://news.example",
    NEWSLETTER_FROM: "Sender <from@example.com>",
    NEWSLETTER_REPLY_TO: "reply@example.com",
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
  confirmation_email: available,
  issue_delivery: available,
};

function sink() {
  return { info: mock(() => {}), warn: mock(() => {}) };
}

describe("newsletter runtime contract evaluation", () => {
  it("reports a complete deployment as ready with every feature available", () => {
    expect(evaluateRuntimeContract(completeEnv())).toEqual({
      ok: true,
      missing: [],
      features: allAvailable,
    });
  });

  it("names a missing required DB without changing feature reporting", () => {
    expect(evaluateRuntimeContract(without("DB"))).toEqual({
      ok: false,
      missing: ["DB"],
      features: allAvailable,
    });
  });

  it("reports mocked delivery when the Resend key is missing", () => {
    expect(evaluateRuntimeContract(without("RESEND_API_KEY"))).toEqual({
      ok: true,
      missing: [],
      features: {
        confirmation_email: {
          state: "unavailable",
          missing: ["RESEND_API_KEY"],
        },
        issue_delivery: { state: "unavailable", missing: ["RESEND_API_KEY"] },
      },
    });
  });

  it("reports issue delivery unavailable without a mailing address", () => {
    const report = evaluateRuntimeContract({
      ...completeEnv(),
      NEWSLETTER_MAILING_ADDRESS: " ",
    });
    expect(report.features).toEqual({
      confirmation_email: available,
      issue_delivery: {
        state: "unavailable",
        missing: ["NEWSLETTER_MAILING_ADDRESS"],
      },
    });
  });

  it("keeps defaulted vars out of readiness", () => {
    expect(evaluateRuntimeContract(without(...RUNTIME_DEFAULTED))).toEqual(
      evaluateRuntimeContract(completeEnv()),
    );
  });

  for (const env of [null, undefined, "env", 7]) {
    it(`reports every name for a non-object env ${String(env)}`, () => {
      expect(evaluateRuntimeContract(env)).toEqual({
        ok: false,
        missing: ["DB"],
        features: {
          confirmation_email: {
            state: "unavailable",
            missing: ["RESEND_API_KEY"],
          },
          issue_delivery: {
            state: "unavailable",
            missing: ["RESEND_API_KEY", "NEWSLETTER_MAILING_ADDRESS"],
          },
        },
      });
    });
  }

  it("reports a shapeless or throwing binding as missing instead of throwing", () => {
    expect(
      evaluateRuntimeContract({ ...completeEnv(), DB: { prepare: 1 } }).missing,
    ).toEqual(["DB"]);
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

describe("newsletter runtime contract logging", () => {
  it("logs one bounded line per reporter and reads the env once", () => {
    const log = sink();
    const report = createRuntimeContractReporter(log);
    let reads = 0;
    const env = new Proxy(without("NEWSLETTER_MAILING_ADDRESS"), {
      get(target, key) {
        reads += 1;
        return Reflect.get(target, key);
      },
    });
    expect(report(env, "queue")).toBeUndefined();
    const readsAfterFirst = reads;
    expect(readsAfterFirst).toBeGreaterThan(0);
    report(env, "queue");
    report(completeEnv(), "fetch");
    expect(reads).toBe(readsAfterFirst);
    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledTimes(1);
    const line = log.warn.mock.calls[0]?.[0] as unknown as string;
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toEqual({
      event: "runtime_contract",
      worker: "newsletter",
      entry: "queue",
      ok: true,
      missing: [],
      features: {
        confirmation_email: available,
        issue_delivery: {
          state: "unavailable",
          missing: ["NEWSLETTER_MAILING_ADDRESS"],
        },
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
      createRuntimeContractReporter(broken)(hostile, "queue"),
    ).not.toThrow();
  });
});

// wrangler.toml is the deployed source for every non-secret name, and its
// `# Secrets:` comment names the values the deploy job uploads.
type Source = "vars" | "d1" | "secret";
type Declared = Record<Source, string[]> & {
  observability: boolean;
  unrecognized: string[];
};

// Tables and top-level keys this parser reads or that carry no runtime name.
// Any other table or top-level key, such as a KV, R2, queue producer or
// service binding, is reported so the contract has to classify it first.
const RECOGNIZED_TABLES = new Set([
  "vars",
  "d1_databases",
  "queues.consumers",
  "observability",
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

describe("newsletter wrangler.toml runtime contract drift", () => {
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

  it("keeps observability enabled for the contract line", () => {
    expect(declaredRuntimeNames(wrangler).observability).toBe(true);
  });

  it("flags a removed or renamed name", () => {
    const d1 = wrangler.replace('binding = "DB"', 'binding = "DATABASE"');
    const vars = wrangler.replace(/^NEWSLETTER_FROM = .*$/m, 'SENDER = "x"');
    const secret = wrangler.replace(" and NEWSLETTER_MAILING_ADDRESS", "");
    for (const changed of [d1, vars, secret])
      expect(changed).not.toBe(wrangler);
    expect(undeclared(declaredRuntimeNames(d1))).toEqual(["DB"]);
    expect(undeclared(declaredRuntimeNames(vars))).toEqual(["NEWSLETTER_FROM"]);
    expect(unclassified(declaredRuntimeNames(vars))).toEqual(["SENDER"]);
    expect(undeclared(declaredRuntimeNames(secret))).toEqual([
      "NEWSLETTER_MAILING_ADDRESS",
    ]);
  });

  it("keeps every contract name required, owned by a feature or defaulted", () => {
    const used = new Set<string>([
      ...RUNTIME_REQUIRED,
      ...Object.values(RUNTIME_FEATURES).flat(),
      ...RUNTIME_DEFAULTED,
    ]);
    expect(Object.keys(RUNTIME_CONTRACT).filter((n) => !used.has(n))).toEqual(
      [],
    );
    for (const name of used) expect(name in RUNTIME_CONTRACT).toBe(true);
  });
});
