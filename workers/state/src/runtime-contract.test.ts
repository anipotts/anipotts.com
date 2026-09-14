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
  STATE_PUBLISH_KEY: "synthetic-publish-39",
  CONTROL_PLANE_DEVICE_PUBLIC_JWK: "synthetic-jwk-40",
};

function namespace() {
  return { idFromName: () => null, get: () => null, getByName: () => null };
}

function completeEnv(): Record<string, unknown> {
  return {
    LINK_VAULT: namespace(),
    CODE_STATS: namespace(),
    COMMAND_RELAY: namespace(),
    ALLOWED_ORIGINS: "https://owner.example",
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
  cors: available,
  publish: available,
  control_connect: available,
};

function sink() {
  return { info: mock(() => {}), warn: mock(() => {}) };
}

describe("state runtime contract evaluation", () => {
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

  it("reports publish and control connect from their own names", () => {
    expect(
      evaluateRuntimeContract(
        without("STATE_PUBLISH_KEY", "CONTROL_PLANE_DEVICE_PUBLIC_JWK"),
      ),
    ).toEqual({
      ok: true,
      missing: [],
      features: {
        cors: available,
        publish: { state: "unavailable", missing: ["STATE_PUBLISH_KEY"] },
        control_connect: {
          state: "unavailable",
          missing: ["CONTROL_PLANE_DEVICE_PUBLIC_JWK"],
        },
      },
    });
  });

  it("checks each Durable Object binding for the method the worker calls", () => {
    const report = evaluateRuntimeContract({
      ...completeEnv(),
      LINK_VAULT: { getByName: () => null },
      CODE_STATS: {},
      COMMAND_RELAY: { idFromName: () => null },
      ALLOWED_ORIGINS: "",
    });
    expect(report.missing).toEqual(["LINK_VAULT", "CODE_STATS"]);
    expect(report.features.cors).toEqual({
      state: "unavailable",
      missing: ["ALLOWED_ORIGINS"],
    });
    expect(report.features.control_connect).toEqual({
      state: "unavailable",
      missing: ["COMMAND_RELAY"],
    });
  });

  for (const env of [null, undefined, "env", 7]) {
    it(`reports every name for a non-object env ${String(env)}`, () => {
      expect(evaluateRuntimeContract(env)).toEqual({
        ok: false,
        missing: [...RUNTIME_REQUIRED],
        features: {
          cors: { state: "unavailable", missing: ["ALLOWED_ORIGINS"] },
          publish: { state: "unavailable", missing: ["STATE_PUBLISH_KEY"] },
          control_connect: {
            state: "unavailable",
            missing: ["COMMAND_RELAY", "CONTROL_PLANE_DEVICE_PUBLIC_JWK"],
          },
        },
      });
    });
  }

  it("reports a throwing binding as missing instead of throwing", () => {
    const env = completeEnv();
    Object.defineProperty(env, "LINK_VAULT", {
      enumerable: true,
      get() {
        throw new Error("binding exploded with provider detail");
      },
    });
    const report = evaluateRuntimeContract(env);
    expect(report.missing).toEqual(["LINK_VAULT"]);
    expect(JSON.stringify(report)).not.toContain("provider detail");
  });

  it("never copies configuration values into the report", () => {
    const env = completeEnv();
    for (const input of [env, { ...env, LINK_VAULT: undefined }]) {
      const text = JSON.stringify(evaluateRuntimeContract(input));
      for (const value of Object.values(env))
        if (typeof value === "string") expect(text).not.toContain(value);
    }
  });
});

describe("state runtime contract logging", () => {
  it("logs one bounded line per reporter and reads the env once", () => {
    const log = sink();
    const report = createRuntimeContractReporter(log);
    let reads = 0;
    const env = new Proxy(without("CODE_STATS", "STATE_PUBLISH_KEY"), {
      get(target, key) {
        reads += 1;
        return Reflect.get(target, key);
      },
    });
    expect(report(env, "fetch")).toBeUndefined();
    const readsAfterFirst = reads;
    expect(readsAfterFirst).toBeGreaterThan(0);
    report(env, "fetch");
    report(completeEnv(), "fetch");
    expect(reads).toBe(readsAfterFirst);
    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledTimes(1);
    const line = log.warn.mock.calls[0]?.[0] as unknown as string;
    expect(line).not.toContain("\n");
    expect(JSON.parse(line)).toEqual({
      event: "runtime_contract",
      worker: "state",
      entry: "fetch",
      ok: false,
      missing: ["CODE_STATS"],
      features: {
        ...allAvailable,
        publish: { state: "unavailable", missing: ["STATE_PUBLISH_KEY"] },
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
      createRuntimeContractReporter(broken)(hostile, "fetch"),
    ).not.toThrow();
  });
});

// wrangler.toml is the deployed source for every non-secret name, and its
// `# Secrets:` comment names the values set with `wrangler secret put`.
type Source = "vars" | "durable_objects" | "secret";
type Declared = Record<Source, string[]> & { observability: boolean };

function declaredRuntimeNames(text: string): Declared {
  const declared: Declared = {
    vars: [],
    durable_objects: [],
    secret: [],
    observability: false,
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
    if (section === "durable_objects.bindings" && key === "name" && quoted)
      declared.durable_objects.push(quoted);
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
  return [
    ...declared.vars,
    ...declared.durable_objects,
    ...declared.secret,
  ].filter((name) => !(name in RUNTIME_CONTRACT));
}

describe("state wrangler.toml runtime contract drift", () => {
  const wrangler = readFileSync(
    new URL("../wrangler.toml", import.meta.url),
    "utf8",
  );

  it("declares every contract binding, var and secret under its contract name", () => {
    expect(undeclared(declaredRuntimeNames(wrangler))).toEqual([]);
  });

  it("classifies every deployed binding, var and secret in the contract", () => {
    expect(unclassified(declaredRuntimeNames(wrangler))).toEqual([]);
  });

  it("keeps observability enabled for the contract line", () => {
    expect(declaredRuntimeNames(wrangler).observability).toBe(true);
  });

  it("flags a removed or renamed name", () => {
    const relay = wrangler.replace('name = "COMMAND_RELAY"', 'name = "RELAY"');
    const vars = wrangler.replace(/^ALLOWED_ORIGINS = .*$/m, 'ORIGINS = "x"');
    const secret = wrangler.replace(" and CONTROL_PLANE_DEVICE_PUBLIC_JWK", "");
    for (const changed of [relay, vars, secret])
      expect(changed).not.toBe(wrangler);
    expect(undeclared(declaredRuntimeNames(relay))).toEqual(["COMMAND_RELAY"]);
    expect(unclassified(declaredRuntimeNames(relay))).toEqual(["RELAY"]);
    expect(undeclared(declaredRuntimeNames(vars))).toEqual(["ALLOWED_ORIGINS"]);
    expect(undeclared(declaredRuntimeNames(secret))).toEqual([
      "CONTROL_PLANE_DEVICE_PUBLIC_JWK",
    ]);
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
