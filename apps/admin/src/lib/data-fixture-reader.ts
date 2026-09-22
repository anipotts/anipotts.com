import type { DataRead, DataResult } from "../data/personal-context";
import type { DataReader } from "./data-read-session";

/**
 * Development preview reader over a synthetic dataset, shaped like the
 * private reader's personal_context_data_v1 responses. Pages pass the dataset
 * only when `import.meta.env.DEV` is true, so no fixture data ships; this
 * function holds no data of its own.
 */
export type DataFixture = {
  status: Record<string, unknown>;
  records: Array<Record<string, unknown>>;
  sources: Array<Record<string, unknown>>;
  /** When the synthetic source times were written. The preview moves them
   * to its own now; a replayed capture has none and keeps its real times. */
  sources_as_of?: string;
  /** System's /v1/health/daily reply for its widest range, synthetic. */
  health?: unknown;
  /** The life wiki's target contract, synthetic. */
  knowledge?: import("./private-reader-knowledge").KnowledgeFixture;
};

const PAGE = 20;

/** Source times the fixture writes, moved to the reader's own now. */
const SOURCE_TIMES = [
  "first_observed_at",
  "last_observed_at",
  "last_success_at",
  "held_from",
  "held_to",
] as const;

/** The synthetic sources as of now: every time moves by how long ago they
 * were written, so a live source reads live in a preview on any day. */
function currentSources(fixture: DataFixture): Array<Record<string, unknown>> {
  const written = Date.parse(fixture.sources_as_of ?? "");
  if (!Number.isFinite(written)) return fixture.sources;
  const shift = Date.now() - written;
  return fixture.sources.map((source) => {
    const moved = { ...source };
    for (const key of SOURCE_TIMES) {
      const at = Date.parse(String(source[key] ?? ""));
      if (typeof source[key] === "string" && Number.isFinite(at))
        moved[key] = new Date(at + shift).toISOString();
    }
    return moved;
  });
}

export function createFixtureReader(fixture: DataFixture): DataReader {
  const ready = (data: Record<string, unknown>): DataResult => ({
    state: "ready",
    scope: "owner",
    observedAt: new Date().toISOString(),
    data,
  });
  const page = (items: unknown[], offset = 0) => ({
    items: items.slice(offset, offset + PAGE),
    total: items.length,
    next_offset: offset + PAGE < items.length ? offset + PAGE : null,
  });
  return async (request: DataRead) => {
    switch (request.method) {
      case "status":
        return ready(fixture.status);
      case "sources":
        return ready(page(currentSources(fixture), request.offset));
      case "search": {
        const q = request.q.trim().toLowerCase();
        const matches = fixture.records
          .filter((record) => !request.kind || record.kind === request.kind)
          .filter(
            (record) =>
              !q || `${record.title} ${record.body}`.toLowerCase().includes(q),
          )
          .sort((a, b) =>
            String(b.observed_at).localeCompare(String(a.observed_at)),
          )
          .map(({ body: _body, revisions: _revisions, ...item }) => item);
        return ready(page(matches, request.offset));
      }
      case "get": {
        const record = fixture.records.find(
          (item) => item.record_id === request.id,
        );
        return record
          ? ready({ ...record, body_offset: 0, next_body_offset: null })
          : { state: "not_found", message: "Not in the fixture." };
      }
      default:
        return { state: "invalid", message: "Not in the fixture." };
    }
  };
}
