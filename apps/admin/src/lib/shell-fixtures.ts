import type { DataFixture } from "./data-fixture-reader";

/**
 * Development sample data for the overview, Data and Observability pages: a
 * local preview cannot reach the private reader or ops (see
 * docs/local-development.md).
 *
 * Ops payloads captured from System can stand in for the synthetic ones:
 * when `apps/admin/.local/replay/ops_v1.json` or `ops_events_v1.json` exists
 * (ignored by git, never committed), it is served instead, read on every
 * load so a new capture shows on reload. `?fixture=synthetic` keeps the
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
};

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
      const [snapshot, events, data, liveSnapshot, liveEvents] =
        await Promise.all([
          import("../fixtures/ops_v1.sample.json"),
          import("../fixtures/ops_events_v1.synthetic.json"),
          import("../fixtures/data_v1.synthetic.json"),
          replay("ops_v1.json"),
          replay("ops_events_v1.json"),
        ]);
      return {
        snapshot: liveSnapshot ?? snapshot.default,
        events: liveEvents ?? events.default,
        data: data.default as DataFixture,
      };
    }
  : async () => undefined;
