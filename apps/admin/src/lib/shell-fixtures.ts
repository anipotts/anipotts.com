import type { DataFixture } from "./data-fixture-reader";

/**
 * Development sample data for the overview, Data and Observability pages: a
 * local preview cannot reach the private reader or ops (see
 * docs/local-development.md).
 *
 * Payloads captured from System can stand in for the synthetic ones: when
 * `apps/admin/.local/replay/ops_v1.json`, `ops_events_v1.json` or
 * `data_sources_v1.json` (a /v1/data/sources reply) exists (ignored by git,
 * never committed), it is served instead, read on every load so a new
 * capture shows on reload. A replay runs on the real clock, so a stale
 * capture reads as a stopped sampler; `?fixture=replay-frozen` pins the
 * page to the capture's moment instead. `?fixture=synthetic` keeps the
 * committed samples and `?fixture=none` shows the real local states.
 *
 * The loader is chosen on `import.meta.env.DEV`, which is false in builds,
 * so the production branch holds no import of the fixtures, the replay
 * files or node:fs, and none ships.
 */
export type ShellFixtures = {
  /** System's ops_v1 snapshot: the sample, or a local replay. */
  snapshot: unknown;
  /** An ops_events_v1 page: synthetic, or a local replay. */
  events: unknown;
  /** The synthetic personal_context_data_v1 dataset. */
  data: DataFixture;
  /** True when a local replay file stood in for a committed sample. */
  replay: boolean;
  /** `?fixture=replay-frozen`: the replay is read at its capture's moment,
   * as the committed samples are, rather than on the real clock. */
  frozen: boolean;
  /** When a replay was captured: its snapshot's generated_at, else its
   * sources reply's response_observed_at. Null for the samples. */
  capturedAt: string | null;
  /** Each payload a replay file stood in for, with its own capture stamp
   * (null for the events page, which carries none), so a page marks Replay
   * only where its data is replayed. Records, Health and Knowledge are
   * always the synthetic samples. */
  payloads: Partial<Record<ReplayPayload, string | null>>;
};

/** The payloads a local replay can stand in for. */
export type ReplayPayload = "snapshot" | "events" | "sources";

/** A replay's capture time, from the payloads' own stamps. */
function capturedAt(snapshot: unknown, sources: unknown): string | null {
  const stamp = (value: unknown, key: string) => {
    const at =
      value && typeof value === "object"
        ? (value as Record<string, unknown>)[key]
        : undefined;
    return typeof at === "string" && Number.isFinite(Date.parse(at))
      ? at
      : null;
  };
  return (
    stamp(snapshot, "generated_at") ?? stamp(sources, "response_observed_at")
  );
}

export const loadShellFixtures: (
  url: URL,
) => Promise<ShellFixtures | undefined> = import.meta.env.DEV
  ? async (url) => {
      const mode = url.searchParams.get("fixture");
      if (mode === "none") return undefined;
      const fs = mode === "synthetic" ? null : await import("node:fs/promises");
      // A missing replay file is no replay; a malformed one fails the page.
      const replay = async (name: string): Promise<unknown> => {
        if (!fs) return undefined;
        try {
          const file = new URL(`../../.local/replay/${name}`, import.meta.url);
          return JSON.parse(await fs.readFile(file, "utf8")) as unknown;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT")
            return undefined;
          throw error;
        }
      };
      const [snapshot, events, data, liveSnapshot, liveEvents, liveSources] =
        await Promise.all([
          import("../fixtures/ops_v1.sample.json"),
          import("../fixtures/ops_events_v1.synthetic.json"),
          import("../fixtures/data_v1.synthetic.json"),
          replay("ops_v1.json"),
          replay("ops_events_v1.json"),
          replay("data_sources_v1.json"),
        ]);
      const sources = (liveSources as { data?: { items?: unknown } })?.data
        ?.items;
      if (liveSources !== undefined && !Array.isArray(sources))
        throw new Error("data_sources_v1.json is not a /v1/data/sources reply");
      return {
        snapshot: liveSnapshot ?? snapshot.default,
        events: liveEvents ?? events.default,
        data: {
          ...(data.default as DataFixture),
          ...(sources
            ? {
                sources: sources as DataFixture["sources"],
                sources_as_of: undefined,
              }
            : {}),
        },
        replay:
          liveSnapshot !== undefined ||
          liveEvents !== undefined ||
          liveSources !== undefined,
        frozen: mode === "replay-frozen",
        capturedAt: capturedAt(liveSnapshot, liveSources),
        payloads: {
          ...(liveSnapshot !== undefined
            ? { snapshot: capturedAt(liveSnapshot, undefined) }
            : {}),
          ...(liveEvents !== undefined ? { events: null } : {}),
          ...(liveSources !== undefined
            ? { sources: capturedAt(undefined, liveSources) }
            : {}),
        },
      };
    }
  : async () => undefined;
