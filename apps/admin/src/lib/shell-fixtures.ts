import type { DataFixture } from "./data-fixture-reader";

/**
 * Development sample data for the overview, Data and Observability pages: a
 * local preview cannot reach the private reader or ops (see
 * docs/local-development.md). `?fixture=none` shows the real local states.
 *
 * The loader is chosen on `import.meta.env.DEV`, which is false in builds,
 * so the production branch holds no import of the fixtures and none ships.
 */
export type ShellFixtures = {
  /** System's ops_v1 snapshot sample. */
  snapshot: unknown;
  /** A synthetic ops_events_v1 page. */
  events: unknown;
  /** The synthetic personal_context_data_v1 dataset. */
  data: DataFixture;
};

export const loadShellFixtures: (
  url: URL,
) => Promise<ShellFixtures | undefined> = import.meta.env.DEV
  ? async (url) => {
      if (url.searchParams.get("fixture") === "none") return undefined;
      const [snapshot, events, data] = await Promise.all([
        import("../fixtures/ops_v1.sample.json"),
        import("../fixtures/ops_events_v1.synthetic.json"),
        import("../fixtures/data_v1.synthetic.json"),
      ]);
      return {
        snapshot: snapshot.default,
        events: events.default,
        data: data.default as DataFixture,
      };
    }
  : async () => undefined;
