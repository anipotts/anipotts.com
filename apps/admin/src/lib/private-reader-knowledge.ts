import { KNOWLEDGE_KINDS, entityKind, type EntityKind } from "./data-routes";
import type { PrivateReaderSession } from "./private-reader-client";
import {
  PRIVATE_READER_BOUNDS,
  PRIVATE_READER_ROUTES,
  PrivateReaderError,
  readerFetch,
} from "./private-reader-fetch";

/**
 * The life wiki: one page per person, project, place or topic, derived from
 * records, read-only. System has no entity layer yet; this is its target
 * contract from the round-2 agreement, read through the Data session
 * (`data:read`, like every `/v1/data/*` route) and in the same
 * personal_context_data_v1 envelope:
 *
 * - `GET /v1/data/entities?kind=&q=&limit=&offset=` pages
 *   `{id, kind, name, summary, record_count, last_seen_at}`;
 * - `GET /v1/data/entities/<id>` is `{id, kind, name, summary,
 *   facts: [{label, value, record_id}], timeline: [{at, title, record_id}],
 *   backlinks: [record_id]}`.
 *
 * Nothing reads these routes unless PRIVATE_READER_KNOWLEDGE_ENABLED is
 * exactly "true"; production leaves it unset, and development serves a
 * synthetic fixture of the same shape through the same parsers. The parsers
 * are strict: an unknown field, a wrong type or an over-long value rejects
 * the whole reply, and nothing from a rejected reply is shown.
 */
export { KNOWLEDGE_KINDS, entityKind, type EntityKind };
export const ENTITY_KINDS = Object.keys(KNOWLEDGE_KINDS) as EntityKind[];

export const KNOWLEDGE_PAGE_LIMIT = 50;
const LIMITS = {
  name: 200,
  summary: 4000,
  label: 120,
  value: 2000,
  title: 300,
  facts: 200,
  timeline: 500,
  backlinks: 1000,
} as const;

export type EntitySummary = {
  id: string;
  /** One of KNOWLEDGE_KINDS, or another short kind System adds. */
  kind: string;
  name: string;
  summary: string;
  records: number;
  lastSeenAt: string | null;
};

export type EntityFact = {
  label: string;
  value: string;
  recordId: string | null;
};

export type EntityEvent = {
  at: string;
  title: string;
  recordId: string | null;
};

export type Entity = {
  id: string;
  kind: string;
  name: string;
  summary: string;
  facts: EntityFact[];
  timeline: EntityEvent[];
  backlinks: string[];
};

export type EntityPage = {
  items: EntitySummary[];
  total: number;
  nextOffset: number | null;
};

/** A reply that breaks the contract. It never carries the reply's text. */
export class KnowledgeContractError extends Error {
  constructor() {
    super("Knowledge reply outside the contract");
    this.name = "KnowledgeContractError";
  }
}

const RECORD_ID = PRIVATE_READER_BOUNDS.recordId;
const ENTITY_ID = PRIVATE_READER_BOUNDS.entityId;
const KIND = /^[a-z][a-z_]{0,31}$/;
const TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/;

const fail = (): never => {
  throw new KnowledgeContractError();
};

function plain(value: unknown): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return fail();
  return value as Record<string, unknown>;
}

function exactKeys(item: Record<string, unknown>, keys: readonly string[]) {
  const own = Object.keys(item);
  if (
    own.length !== keys.length ||
    keys.some((key) => !Object.hasOwn(item, key))
  )
    fail();
}

function text(value: unknown, max: number, allowEmpty = false): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!allowEmpty && !value.trim())
  )
    return fail();
  return value;
}

function pattern(value: unknown, test: RegExp): string {
  return typeof value === "string" && test.test(value) ? value : fail();
}

function time(value: unknown): string {
  const at = pattern(value, TIMESTAMP);
  return Number.isFinite(Date.parse(at)) ? at : fail();
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : fail();
}

function list(value: unknown, max: number): unknown[] {
  return Array.isArray(value) && value.length <= max ? value : fail();
}

const recordRef = (value: unknown) =>
  value === null ? null : pattern(value, RECORD_ID);

/** The Data envelope around a page or an entity. */
function envelopeData(value: unknown): Record<string, unknown> {
  const envelope = plain(value);
  exactKeys(envelope, ["data", "response_observed_at", "schema"]);
  if (envelope.schema !== "personal_context_data_v1") fail();
  time(envelope.response_observed_at);
  return plain(envelope.data);
}

function parseSummary(value: unknown): EntitySummary {
  const item = plain(value);
  exactKeys(item, [
    "id",
    "kind",
    "last_seen_at",
    "name",
    "record_count",
    "summary",
  ]);
  return {
    id: pattern(item.id, ENTITY_ID),
    kind: pattern(item.kind, KIND),
    name: text(item.name, LIMITS.name),
    summary: text(item.summary, LIMITS.summary, true),
    records: count(item.record_count),
    lastSeenAt: item.last_seen_at === null ? null : time(item.last_seen_at),
  };
}

/** A page of entities, strictly. */
export function parseEntityPage(value: unknown, offset = 0): EntityPage {
  const data = envelopeData(value);
  exactKeys(data, ["items", "next_offset", "total"]);
  const items = list(data.items, PRIVATE_READER_BOUNDS.dataLimit.max).map(
    parseSummary,
  );
  const total = count(data.total);
  const next = data.next_offset === null ? null : count(data.next_offset);
  if (
    next !== null &&
    (next <= offset || next > PRIVATE_READER_BOUNDS.offsetMax)
  )
    fail();
  if (new Set(items.map((item) => item.id)).size !== items.length) fail();
  return { items, total, nextOffset: next };
}

/** One entity's page, strictly. */
export function parseEntity(value: unknown, id?: string): Entity {
  const item = envelopeData(value);
  exactKeys(item, [
    "backlinks",
    "facts",
    "id",
    "kind",
    "name",
    "summary",
    "timeline",
  ]);
  const entityId = pattern(item.id, ENTITY_ID);
  if (id !== undefined && entityId !== id) fail();
  const facts = list(item.facts, LIMITS.facts).map((entry): EntityFact => {
    const fact = plain(entry);
    exactKeys(fact, ["label", "record_id", "value"]);
    return {
      label: text(fact.label, LIMITS.label),
      value: text(fact.value, LIMITS.value),
      recordId: recordRef(fact.record_id),
    };
  });
  const timeline = list(item.timeline, LIMITS.timeline).map(
    (entry): EntityEvent => {
      const event = plain(entry);
      exactKeys(event, ["at", "record_id", "title"]);
      return {
        at: time(event.at),
        title: text(event.title, LIMITS.title),
        recordId: recordRef(event.record_id),
      };
    },
  );
  const backlinks = list(item.backlinks, LIMITS.backlinks).map((entry) =>
    pattern(entry, RECORD_ID),
  );
  if (new Set(backlinks).size !== backlinks.length) fail();
  return {
    id: entityId,
    kind: pattern(item.kind, KIND),
    name: text(item.name, LIMITS.name),
    summary: text(item.summary, LIMITS.summary, true),
    facts,
    timeline,
    backlinks,
  };
}

export type EntityQuery = {
  kind: EntityKind | null;
  q: string;
  offset?: number;
};

/** The list route with exactly the params the contract names. */
export function entitiesPath({ kind, q, offset = 0 }: EntityQuery): string {
  const b = PRIVATE_READER_BOUNDS;
  if (typeof q !== "string" || q.length > b.queryMax)
    throw new Error("Invalid query");
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > b.offsetMax)
    throw new Error("Out of bounds");
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (kind) params.set("kind", kind);
  params.set("limit", String(KNOWLEDGE_PAGE_LIMIT));
  params.set("offset", String(offset));
  return `${PRIVATE_READER_ROUTES.entities}?${params}`;
}

/** One entity's route. The id is checked, never encoded into something the
 * check did not see. */
export function entityPath(id: string): string {
  if (!ENTITY_ID.test(id)) throw new Error("Invalid entity ID");
  return `${PRIVATE_READER_ROUTES.entity}${id}`;
}

/** Everything the Knowledge view reads. `get` answers null for an entity
 * the reader does not have. */
export type KnowledgeReader = {
  list(query: EntityQuery, signal?: AbortSignal): Promise<EntityPage>;
  get(id: string, signal?: AbortSignal): Promise<Entity | null>;
};

type BearerSource = Pick<
  PrivateReaderSession,
  "bearer" | "renew" | "deny" | "getState"
>;

/** The reader over the Data session's credential. */
export function createPrivateKnowledgeReader(
  session: BearerSource,
  options: { fetch?: typeof fetch } = {},
): KnowledgeReader {
  return {
    async list(query, signal) {
      const body = await readerFetch(session, entitiesPath(query), {
        fetch: options.fetch,
        signal,
      });
      return parseEntityPage(body, query.offset ?? 0);
    },
    async get(id, signal) {
      try {
        const body = await readerFetch(session, entityPath(id), {
          fetch: options.fetch,
          signal,
        });
        return parseEntity(body, id);
      } catch (error) {
        if (
          error instanceof PrivateReaderError &&
          error.failure === "not_found"
        )
          return null;
        throw error;
      }
    },
  };
}

/** The synthetic development dataset, in the contract's own shape. */
export type KnowledgeFixture = {
  entities: unknown[];
  pages: Record<string, unknown>;
};

const envelope = (data: unknown) => ({
  schema: "personal_context_data_v1",
  response_observed_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  data,
});

/** Development only: the fixture answers as the reader would, and every
 * answer goes through the same strict parsers. */
export function createFixtureKnowledgeReader(
  fixture: KnowledgeFixture,
): KnowledgeReader {
  return {
    async list({ kind, q, offset = 0 }) {
      const needle = q.trim().toLowerCase();
      const matches = fixture.entities.filter((raw) => {
        const item = raw as Record<string, unknown>;
        return (
          (!kind || item.kind === kind) &&
          (!needle ||
            `${item.name} ${item.summary}`.toLowerCase().includes(needle))
        );
      });
      const items = matches.slice(offset, offset + KNOWLEDGE_PAGE_LIMIT);
      const next = offset + KNOWLEDGE_PAGE_LIMIT;
      return parseEntityPage(
        envelope({
          items,
          total: matches.length,
          next_offset: next < matches.length ? next : null,
        }),
        offset,
      );
    },
    async get(id) {
      const raw = Object.hasOwn(fixture.pages, id) ? fixture.pages[id] : null;
      return raw ? parseEntity(envelope(raw), id) : null;
    },
  };
}
