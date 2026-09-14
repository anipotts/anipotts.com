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
  RESEND_API_KEY: "synthetic-resend-51",
  MERCURY_API_TOKEN: "synthetic-mercury-62",
  MERCURY_ACCOUNT_ID_CHECKING: "synthetic-chk-73",
  MERCURY_ACCOUNT_ID_SAVINGS: "synthetic-sav-84",
  MINI_API_KEY: "synthetic-mini-95",
  MINI_API_URL: "https://mini.example",
};

function completeEnv(): Record<string, unknown> {
  return { DB: { prepare: () => null }, ...secrets };
}

function without(...names: string[]) {
  const env = completeEnv();
  for (const name of names) delete env[name];
  return env;
}

const available = { state: "available", missing: [] };
const allAvailable = {
  mercury_checking: available,
  mercury_savings: available,
  mini_status: available,
};

function sink() {
  return { info: mock(() => {}), warn: mock(() => {}) };
}

describe("weekly email runtime contract evaluation", () => {
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

  it("reports each Mercury account from the shared token and its own id", () => {
    expect(
      evaluateRuntimeContract(without("MERCURY_ACCOUNT_ID_SAVINGS")).features,
    ).toEqual({
      ...allAvailable,
      mercury_savings: {
        state: "unavailable",
        missing: ["MERCURY_ACCOUNT_ID_SAVINGS"],
      },
    });
    expect(
      evaluateRuntimeContract(without("MERCURY_API_TOKEN", "MINI_API_KEY"))
        .features,
    ).toEqual({
      mercury_checking: {
        state: "unavailable",
        missing: ["MERCURY_API_TOKEN"],
      },
      mercury_savings: { state: "unavailable", missing: ["MERCURY_API_TOKEN"] },
      mini_status: { state: "unavailable", missing: ["MINI_API_KEY"] },
    });
  });

  it("keeps the defaulted Mini URL out of readiness", () => {
    expect(evaluateRuntimeContract(without(...RUNTIME_DEFAULTED))).toEqual(
      evaluateRuntimeContract(completeEnv()),
    );
  });

  for (const env of [null, undefined, "env", 7]) {
    it(`reports every name for a non-object env ${String(env)}`, () => {
      expect(evaluateRuntimeContract(env)).toEqual({
        ok: false,
        missing: [...RUNTIME_REQUIRED],
        features: {
          mercury_checking: {
            state: "unavailable",
            missing: ["MERCURY_API_TOKEN", "MERCURY_ACCOUNT_ID_CHECKING"],
          },
          mercury_savings: {
            state: "unavailable",
            missing: ["MERCURY_API_TOKEN", "MERCURY_ACCOUNT_ID_SAVINGS"],
          },
          mini_status: { state: "unavailable", missing: ["MINI_API_KEY"] },
        },
      });
    });
  }

  it("reports a shapeless or throwing binding as missing instead of throwing", () => {
    expect(
      evaluateRuntimeContract({ ...completeEnv(), DB: {}, RESEND_API_KEY: "" })
        .missing,
    ).toEqual(["DB", "RESEND_API_KEY"]);
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

describe("weekly email runtime contract logging", () => {
  it("logs one bounded line per reporter and reads the env once", () => {
    const log = sink();
    const report = createRuntimeContractReporter(log);
    let reads = 0;
    const env = new Proxy(without("RESEND_API_KEY", "MINI_API_KEY"), {
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
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toEqual({
      event: "runtime_contract",
      worker: "weekly-email",
      entry: "scheduled",
      ok: false,
      missing: ["RESEND_API_KEY"],
      features: {
        ...allAvailable,
        mini_status: { state: "unavailable", missing: ["MINI_API_KEY"] },
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
      createRuntimeContractReporter(broken)(hostile, "scheduled"),
    ).not.toThrow();
  });
});

// wrangler.toml is the deployed source for the D1 binding, and its
// `# Secrets:` comments name the values set with `wrangler secret put`.
type Source = "d1" | "secret";
type Declared = Record<Source, string[]> & {
  vars: string[];
  observability: boolean;
  invocationLogs: boolean;
};

function declaredRuntimeNames(text: string): Declared {
  const declared: Declared = {
    vars: [],
    d1: [],
    secret: [],
    observability: false,
    invocationLogs: true,
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
      continue;
    }
    const pair = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(line);
    if (!pair?.[1] || !pair[2]) continue;
    const [, key, value] = pair;
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

describe("weekly email wrangler.toml runtime contract drift", () => {
  const wrangler = readFileSync(
    new URL("../wrangler.toml", import.meta.url),
    "utf8",
  );

  it("declares every contract binding and secret under its contract name", () => {
    expect(undeclared(declaredRuntimeNames(wrangler))).toEqual([]);
  });

  it("classifies every deployed binding, var and secret in the contract", () => {
    expect(unclassified(declaredRuntimeNames(wrangler))).toEqual([]);
  });

  it("retains the contract line without invocation logs", () => {
    const declared = declaredRuntimeNames(wrangler);
    expect(declared.observability).toBe(true);
    expect(declared.invocationLogs).toBe(false);
  });

  it("flags a removed or renamed name", () => {
    const d1 = wrangler.replace('binding = "DB"', 'binding = "DATABASE"');
    const secret = wrangler.replace(" MINI_API_KEY and", "");
    for (const changed of [d1, secret]) expect(changed).not.toBe(wrangler);
    expect(undeclared(declaredRuntimeNames(d1))).toEqual(["DB"]);
    expect(unclassified(declaredRuntimeNames(d1))).toEqual(["DATABASE"]);
    expect(undeclared(declaredRuntimeNames(secret))).toEqual(["MINI_API_KEY"]);
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
