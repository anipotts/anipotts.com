/**
 * Shared runtime configuration contract evaluator and log reporter.
 *
 * Each worker keeps its own closed binding table, required names, features
 * and target rules, and passes them in. Evaluation reports names and bounded
 * states only: binding objects, vars and secret values never leave the
 * caller. Reporting is log only. It never throws, blocks a request or
 * changes a response.
 *
 * The source is the package: no emitted build, no runtime dependencies and
 * erasable TypeScript only, so Node type stripping, Bun, esbuild and each
 * worker's tsc all load it directly. The build script only typechecks; it
 * exists so turbo's ^build edge carries this source into its dependents'
 * task hashes.
 */

/** "text" needs a non-blank string; any other check names a binding method. */
export type RuntimeBinding = { readonly check: string };

export type RuntimeContract<Name extends string> = Readonly<
  Record<Name, RuntimeBinding>
>;

export type RuntimeFeatures<
  Name extends string,
  Feature extends string,
> = Readonly<Record<Feature, readonly Name[]>>;

export type RuntimeRules<Name extends string> = {
  contract: RuntimeContract<Name>;
  required: readonly Name[];
  /** Overrides the contract check, for a target-specific rule. */
  satisfied?: (env: unknown, name: Name) => boolean;
};

export type RuntimeFeatureState = "available" | "unavailable";

export type RuntimeFeatureReport<Name extends string> = {
  state: RuntimeFeatureState;
  missing: Name[];
};

export type RuntimeReport<Name extends string> = {
  ok: boolean;
  missing: Name[];
};

export type RuntimeReportWithFeatures<
  Name extends string,
  Feature extends string,
> = {
  ok: boolean;
  missing: Name[];
  features: Record<Feature, RuntimeFeatureReport<Name>>;
};

/** Any report the evaluator returns, as the reporter reads it. */
export type RuntimeReportShape = {
  ok: boolean;
  missing: readonly string[];
  features?: Readonly<Record<string, { state: RuntimeFeatureState }>>;
};

export type RuntimeLogSink = {
  info(line: string): void;
  warn(line: string): void;
};

/** Reads one property; a non-object or a throwing getter reads as undefined. */
export function read(values: unknown, name: string): unknown {
  if (!values || typeof values !== "object") return undefined;
  try {
    return (values as Record<string, unknown>)[name];
  } catch {
    return undefined;
  }
}

/** Whether env carries name in the shape its contract check expects. */
export function satisfied<Name extends string>(
  contract: RuntimeContract<Name>,
  env: unknown,
  name: Name,
): boolean {
  const { check } = contract[name];
  const value = read(env, name);
  if (check === "text") return typeof value === "string" && !!value.trim();
  return typeof read(value, check) === "function";
}

/**
 * Pure: reads each contract name at most once and never throws. Required
 * names come first, then features in key order. The report carries a
 * features key only when features are passed.
 */
export function evaluateRuntimeContract<Name extends string>(
  env: unknown,
  rules: RuntimeRules<Name> & { features?: undefined },
): RuntimeReport<Name>;
export function evaluateRuntimeContract<
  Name extends string,
  Feature extends string,
>(
  env: unknown,
  rules: RuntimeRules<Name> & { features: RuntimeFeatures<Name, Feature> },
): RuntimeReportWithFeatures<Name, Feature>;
export function evaluateRuntimeContract<
  Name extends string,
  Feature extends string,
>(
  env: unknown,
  rules: RuntimeRules<Name> & { features?: RuntimeFeatures<Name, Feature> },
): RuntimeReport<Name> | RuntimeReportWithFeatures<Name, Feature> {
  const { contract, required, features } = rules;
  const check =
    rules.satisfied ??
    ((values: unknown, name: Name) => satisfied(contract, values, name));
  const results = new Map<Name, boolean>();
  const has = (name: Name): boolean => {
    let result = results.get(name);
    if (result === undefined) {
      // A throwing target rule reads as missing, like a throwing getter.
      try {
        result = check(env, name);
      } catch {
        result = false;
      }
      results.set(name, result);
    }
    return result;
  };
  const missing = required.filter((name) => !has(name));
  if (!features) return { ok: missing.length === 0, missing };
  const report = {} as Record<Feature, RuntimeFeatureReport<Name>>;
  for (const feature of Object.keys(features) as Feature[]) {
    const absent = features[feature].filter((name) => !has(name));
    report[feature] = {
      state: absent.length ? "unavailable" : "available",
      missing: absent,
    };
  }
  return { ok: missing.length === 0, missing, features: report };
}

/**
 * Returns a reporter that logs one structured line from the first entry it
 * sees. A missing required name or an unavailable feature logs at warn.
 * The sink method is looked up when the line is written, never earlier.
 */
export function createRuntimeReporter<Entry extends string>(
  worker: string,
  evaluate: (env: unknown) => RuntimeReportShape,
  sink: RuntimeLogSink,
): (env: unknown, entry: Entry) => void {
  let reported = false;
  return (env, entry) => {
    if (reported) return;
    reported = true;
    try {
      const report = evaluate(env);
      const degraded =
        !report.ok ||
        Object.values(report.features ?? {}).some(
          (feature) => feature.state === "unavailable",
        );
      const line = JSON.stringify({
        event: "runtime_contract",
        worker,
        entry,
        ...report,
      });
      if (degraded) sink.warn(line);
      else sink.info(line);
    } catch {
      // Reporting is diagnostic only and must never affect request handling.
    }
  };
}
