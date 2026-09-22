/**
 * Per-request Server-Timing: durations and counts only.
 *
 * Metric names come from this fixed generic allowlist. A description is only
 * ever a count, so no record, query, user, path or error text can reach the
 * header. Durations with the same name add up.
 *
 * Worker clocks advance across I/O, in production and in local workerd, so a
 * duration mostly measures waits (Durable Object reads, D1 queries, fetches)
 * and pure CPU work inside a loader can read as 0. Compare `app` with the
 * browser's responseStart for the unmeasured CPU and transport share. `d1`
 * sums every query, so concurrent queries can exceed the loader's wall time.
 */
export const SERVER_TIMING_METRICS = {
  /** Middleware entry until the response object exists, before body streaming. */
  app: "duration",
  inventory: "duration",
  record: "duration",
  newsletter: "duration",
  d1: "duration",
  d1q: "count",
} as const;

export type ServerTimingMetric = keyof typeof SERVER_TIMING_METRICS;
export type ServerTimingDuration = {
  [
    K in ServerTimingMetric
  ]: (typeof SERVER_TIMING_METRICS)[K] extends "duration" ? K : never;
}[ServerTimingMetric];

type D1StatementLike = {
  bind(...values: unknown[]): D1StatementLike;
  first?(...args: unknown[]): Promise<unknown>;
  all?(...args: unknown[]): Promise<unknown>;
  run?(...args: unknown[]): Promise<unknown>;
  raw?(...args: unknown[]): Promise<unknown>;
};
type D1DatabaseLike = {
  prepare(query: string): D1StatementLike;
  batch?(statements: D1StatementLike[]): Promise<unknown>;
};

const QUERY_METHODS = ["first", "all", "run", "raw"] as const;
const isDurationMetric = (name: string): name is ServerTimingDuration =>
  Object.hasOwn(SERVER_TIMING_METRICS, name) &&
  SERVER_TIMING_METRICS[name as ServerTimingMetric] === "duration";
const milliseconds = (value: number) =>
  Number.isFinite(value) && value > 0 ? Math.round(value * 10) / 10 : 0;

export type ServerTiming = ReturnType<typeof createServerTiming>;

export function createServerTiming(
  now: () => number = () => performance.now(),
) {
  const durations = new Map<ServerTimingDuration, number>();
  const d1 = { used: false, queries: 0, duration: 0 };
  const originals = new WeakMap<object, D1StatementLike>();

  function add(metric: ServerTimingDuration, duration: number) {
    if (!isDurationMetric(metric)) return;
    durations.set(
      metric,
      (durations.get(metric) ?? 0) + milliseconds(duration),
    );
  }

  function start(metric: ServerTimingDuration): () => void {
    const started = now();
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      add(metric, now() - started);
    };
  }

  async function query<T>(count: number, work: () => Promise<T>): Promise<T> {
    const started = now();
    try {
      return await work();
    } finally {
      d1.queries += count;
      d1.duration += milliseconds(now() - started);
    }
  }

  function statement(original: D1StatementLike): D1StatementLike {
    const wrapped: D1StatementLike = {
      bind: (...values) => statement(original.bind(...values)),
    };
    for (const method of QUERY_METHODS) {
      const call = original[method];
      if (typeof call === "function")
        wrapped[method] = (...args) =>
          query(1, () => call.apply(original, args));
    }
    originals.set(wrapped, original);
    return wrapped;
  }

  /** Counts queries on this handle. Null and undefined pass through. */
  function database<T extends D1DatabaseLike | null | undefined>(db: T): T {
    if (!db) return db;
    d1.used = true;
    const batch = db.batch;
    const wrapped: D1DatabaseLike = {
      prepare: (sql) => statement(db.prepare(sql)),
    };
    if (typeof batch === "function")
      wrapped.batch = (statements) =>
        query(statements.length, () =>
          batch.call(
            db,
            statements.map((item) => originals.get(item) ?? item),
          ),
        );
    return wrapped as T;
  }

  function header(): string {
    const entries = [...durations].map(
      ([name, duration]) => `${name};dur=${milliseconds(duration)}`,
    );
    if (d1.used)
      entries.push(
        `d1;dur=${milliseconds(d1.duration)}`,
        `d1q;desc=${d1.queries}`,
      );
    return entries.join(", ");
  }

  return { add, start, database, header };
}

function fromLocals(locals: unknown): ServerTiming | undefined {
  if (!locals || typeof locals !== "object" || !("serverTiming" in locals))
    return undefined;
  return (locals as { serverTiming?: ServerTiming }).serverTiming;
}

/** Runs the loader unchanged; records its duration when the request has a collector. */
export async function measureServerTiming<T>(
  locals: unknown,
  metric: ServerTimingDuration,
  work: () => Promise<T> | T,
): Promise<T> {
  const stop = fromLocals(locals)?.start(metric);
  try {
    return await work();
  } finally {
    stop?.();
  }
}

export function startServerTiming(
  locals: unknown,
  metric: ServerTimingDuration,
): () => void {
  return fromLocals(locals)?.start(metric) ?? (() => undefined);
}

export function serverTimingD1<T extends D1DatabaseLike | null | undefined>(
  locals: unknown,
  db: T,
): T {
  return fromLocals(locals)?.database(db) ?? db;
}

/** Adds the header in place. A response with immutable headers is left alone. */
export function applyServerTiming<T>(
  response: T,
  timing: ServerTiming,
  appDuration: number,
): T {
  if (!(response instanceof Response)) return response;
  timing.add("app", appDuration);
  const value = timing.header();
  try {
    if (value) response.headers.append("Server-Timing", value);
  } catch {
    /* Response.redirect and Response.error headers are immutable. */
  }
  return response;
}
