import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createRuntimeReporter,
  evaluateRuntimeContract,
  read,
  satisfied,
  type RuntimeLogSink,
} from "./index.ts";

const CONTRACT = {
  DB: { source: "d1", check: "prepare" },
  MAIN_KEY: { source: "secret", check: "text" },
  SIDE_KEY: { source: "secret", check: "text" },
} as const;
type Name = keyof typeof CONTRACT;
const REQUIRED: readonly Name[] = ["DB"];
const FEATURES = {
  main: ["MAIN_KEY"],
  both: ["DB", "MAIN_KEY", "SIDE_KEY"],
} as const;

function completeEnv(): Record<string, unknown> {
  return {
    DB: { prepare: () => null },
    MAIN_KEY: "synthetic-main-1",
    SIDE_KEY: "synthetic-side-2",
  };
}

function recorder() {
  const calls: [string, string][] = [];
  const sink: RuntimeLogSink = {
    info: (line) => void calls.push(["info", line]),
    warn: (line) => void calls.push(["warn", line]),
  };
  return { calls, sink };
}

function counted(env: Record<string, unknown>) {
  const reads: PropertyKey[] = [];
  const proxy = new Proxy(env, {
    get(target, key) {
      reads.push(key);
      return Reflect.get(target, key);
    },
  });
  return { reads, proxy };
}

const withFeatures = (env: unknown) =>
  evaluateRuntimeContract(env, {
    contract: CONTRACT,
    required: REQUIRED,
    features: FEATURES,
  });

const withoutFeatures = (env: unknown) =>
  evaluateRuntimeContract(env, { contract: CONTRACT, required: REQUIRED });

describe("read", () => {
  it("reads a plain property", () => {
    assert.equal(read({ A: 1 }, "A"), 1);
    assert.equal(read({ A: 1 }, "B"), undefined);
  });

  for (const values of [null, undefined, "env", 7, true]) {
    it(`reads undefined from a non-object ${String(values)}`, () => {
      assert.equal(read(values, "length"), undefined);
    });
  }

  it("reads undefined from a throwing getter", () => {
    const values = {};
    Object.defineProperty(values, "A", {
      get() {
        throw new Error("binding exploded with provider detail");
      },
    });
    assert.equal(read(values, "A"), undefined);
  });
});

describe("satisfied", () => {
  it("accepts only non-blank strings for a text check", () => {
    assert.equal(satisfied(CONTRACT, { MAIN_KEY: "x" }, "MAIN_KEY"), true);
    for (const value of ["", " \n", 42, null, { trim: () => "x" }])
      assert.equal(satisfied(CONTRACT, { MAIN_KEY: value }, "MAIN_KEY"), false);
  });

  it("needs the named method to be a function for a binding check", () => {
    assert.equal(satisfied(CONTRACT, completeEnv(), "DB"), true);
    for (const value of [{}, { prepare: "no" }, "prepare", null])
      assert.equal(satisfied(CONTRACT, { DB: value }, "DB"), false);
  });
});

describe("evaluateRuntimeContract", () => {
  it("returns ok, missing and features in that key and feature order", () => {
    const report = withFeatures(completeEnv());
    assert.deepEqual(Object.keys(report), ["ok", "missing", "features"]);
    assert.deepEqual(Object.keys(report.features), ["main", "both"]);
    assert.equal(
      JSON.stringify(report),
      '{"ok":true,"missing":[],"features":{"main":{"state":"available","missing":[]},"both":{"state":"available","missing":[]}}}',
    );
  });

  it("omits the features key when no features are passed", () => {
    const report = withoutFeatures(completeEnv());
    assert.deepEqual(Object.keys(report), ["ok", "missing"]);
    assert.equal(
      JSON.stringify(withoutFeatures({})),
      '{"ok":false,"missing":["DB"]}',
    );
  });

  it("reports missing names in declaration order inside each feature", () => {
    assert.equal(
      JSON.stringify(withFeatures(null)),
      '{"ok":false,"missing":["DB"],"features":{"main":{"state":"unavailable","missing":["MAIN_KEY"]},"both":{"state":"unavailable","missing":["DB","MAIN_KEY","SIDE_KEY"]}}}',
    );
  });

  it("reads each name once, required first, then features in order", () => {
    const { reads, proxy } = counted(completeEnv());
    withFeatures(proxy);
    assert.deepEqual(reads, ["DB", "MAIN_KEY", "SIDE_KEY"]);
  });

  it("uses a target-specific rule in place of the contract check", () => {
    const seen: string[] = [];
    const report = evaluateRuntimeContract(completeEnv(), {
      contract: CONTRACT,
      required: REQUIRED,
      features: FEATURES,
      satisfied: (env, name) => {
        seen.push(name);
        return name !== "SIDE_KEY" && satisfied(CONTRACT, env, name);
      },
    });
    assert.deepEqual(seen, ["DB", "MAIN_KEY", "SIDE_KEY"]);
    assert.deepEqual(report.features.both, {
      state: "unavailable",
      missing: ["SIDE_KEY"],
    });
  });

  it("reports a throwing binding as missing instead of throwing", () => {
    const env = completeEnv();
    Object.defineProperty(env, "DB", {
      get() {
        throw new Error("binding exploded with provider detail");
      },
    });
    const text = JSON.stringify(withFeatures(env));
    assert.equal(withFeatures(env).ok, false);
    assert.equal(text.includes("provider detail"), false);
  });

  it("never copies configuration values into the report", () => {
    const env = completeEnv();
    const text = JSON.stringify(withFeatures(env));
    for (const value of Object.values(env))
      if (typeof value === "string") assert.equal(text.includes(value), false);
  });
});

describe("createRuntimeReporter", () => {
  it("logs one line from the first entry and ignores later entries", () => {
    const { calls, sink } = recorder();
    const report = createRuntimeReporter<"fetch" | "queue">(
      "example",
      withoutFeatures,
      sink,
    );
    const { reads, proxy } = counted({});
    assert.equal(report(proxy, "queue"), undefined);
    report(proxy, "queue");
    report(completeEnv(), "fetch");
    assert.deepEqual(reads, ["DB"]);
    assert.deepEqual(calls, [
      [
        "warn",
        '{"event":"runtime_contract","worker":"example","entry":"queue","ok":false,"missing":["DB"]}',
      ],
    ]);
  });

  it("logs info only when every required name and feature is present", () => {
    const complete = recorder();
    createRuntimeReporter(
      "example",
      withFeatures,
      complete.sink,
    )(completeEnv(), "fetch");
    assert.deepEqual(
      complete.calls.map(([level]) => level),
      ["info"],
    );

    const feature = recorder();
    const env = completeEnv();
    delete env.SIDE_KEY;
    createRuntimeReporter("example", withFeatures, feature.sink)(env, "fetch");
    assert.deepEqual(
      feature.calls.map(([level]) => level),
      ["warn"],
    );
    assert.equal(JSON.parse(feature.calls[0]?.[1] ?? "").ok, true);
  });

  it("looks up the sink method when it writes, not when it is created", () => {
    const lines: string[] = [];
    const sink: RuntimeLogSink = {
      info: () => assert.fail("replaced before the first entry"),
      warn: () => assert.fail("replaced before the first entry"),
    };
    const report = createRuntimeReporter("example", withoutFeatures, sink);
    sink.info = (line) => void lines.push(line);
    report(completeEnv(), "fetch");
    assert.deepEqual(lines, [
      '{"event":"runtime_contract","worker":"example","entry":"fetch","ok":true,"missing":[]}',
    ]);
  });

  it("swallows evaluation and sink failures and still reports only once", () => {
    let evaluations = 0;
    const report = createRuntimeReporter(
      "example",
      () => {
        evaluations += 1;
        throw new Error("hostile env");
      },
      recorder().sink,
    );
    assert.doesNotThrow(() => report(completeEnv(), "fetch"));
    assert.doesNotThrow(() => report(completeEnv(), "fetch"));
    assert.equal(evaluations, 1);

    const broken: RuntimeLogSink = {
      info: () => {
        throw new Error("sink offline");
      },
      warn: () => {
        throw new Error("sink offline");
      },
    };
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("hostile env");
        },
      },
    );
    assert.doesNotThrow(() =>
      createRuntimeReporter("example", withFeatures, broken)(hostile, "fetch"),
    );
    assert.doesNotThrow(() =>
      createRuntimeReporter(
        "example",
        withFeatures,
        broken,
      )(completeEnv(), "fetch"),
    );
  });
});
