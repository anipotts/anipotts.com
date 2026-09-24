import { useMemo } from "react";
import {
  DATA_READ_DEFAULTS,
  readPersonalContext,
  type DataRead,
  type DataTransport,
} from "../data/personal-context";
import {
  PersonalContextHttpError,
  readPersonalContextResponse,
} from "../data/personal-context-http";
import { ENTITY_ID } from "./data-routes";
import { discardBody } from "./response-body";
import { fetchReader } from "./reader-reach";
import type { DataReader } from "./data-read-session";
import {
  usePrivateReaderState,
  type PrivateReaderSession,
  type PrivateReaderState,
} from "./private-reader-client";

/**
 * Browser reads from the private reader on ap-mini (System PR #128 verifier).
 *
 * Each request carries exactly one `Authorization: Bearer <jws>` header. The
 * browser supplies `Origin: https://admin.anipotts.com`; this module never sets
 * device, principal or scope headers. Responses are held in memory only:
 * `cache: "no-store"` on every request, and nothing is written to Web Storage,
 * IndexedDB, Cache Storage or a service worker.
 */
export const PRIVATE_READER_ORIGIN = "https://ap-mini.tail060490.ts.net";

/**
 * Proposed relative GET routes from the System consolidation handoff
 * (2026-09-20, "proposed relative browser HTTP mapping"). They are not live
 * listeners until System activates the reader.
 */
export const PRIVATE_READER_ROUTES = {
  status: "/v1/data/status",
  sources: "/v1/data/sources",
  search: "/v1/data/search",
  record: "/v1/data/records/",
  activity: "/v1/observability/activity",
  /** Daily health summary, under its own health:read credential
   * (lib/private-reader-health.ts). */
  health: "/v1/health/daily",
  /** The life wiki's entities (lib/private-reader-knowledge.ts): System's
   * target contract, not served yet. */
  entities: "/v1/data/entities",
  entity: "/v1/data/entities/",
} as const;

/** Verifier outcomes, by HTTP status. `expired` is local: no live bearer. */
export type PrivateReaderFailure =
  | "malformed"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "method_not_allowed"
  | "unavailable"
  | "expired";

const failureByStatus: Record<number, PrivateReaderFailure> = {
  400: "malformed",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  405: "method_not_allowed",
  503: "unavailable",
};

/**
 * Extends the existing transport error so `readPersonalContext` keeps its
 * mapping: 400 invalid, 401/403 denied, 404 not_found on get, else unavailable.
 */
export class PrivateReaderError extends PersonalContextHttpError {
  readonly failure: PrivateReaderFailure;
  constructor(status: number, failure?: PrivateReaderFailure) {
    super(status);
    this.name = "PrivateReaderError";
    this.failure = failure ?? failureByStatus[status] ?? "unavailable";
  }
}

/** Contract bounds confirmed by System for the v1 reader. */
export const PRIVATE_READER_BOUNDS = {
  queryMax: 2048,
  kind: /^[A-Za-z0-9_.-]{1,80}$/,
  recordId: /^rec-[0-9a-f]{32}$/,
  entityId: ENTITY_ID,
  dataLimit: { min: 1, max: 200 },
  healthDays: { min: 1, max: 90 },
  activityLimit: { min: 1, max: 500 },
  offsetMax: 10_000_000,
  bodyOffsetMax: 16 * 1024 * 1024,
  bodyLimit: { min: 1, max: 64_000 },
} as const;
const DATA_LIMIT = DATA_READ_DEFAULTS.limit;
/** Sources groups by connector, so it reads the whole catalog: the
 * reader's largest page. */
const SOURCES_LIMIT = PRIVATE_READER_BOUNDS.dataLimit.max;
const ACTIVITY_LIMIT = 100;
const BODY_LIMIT = 32_000;

/** Unknown query params are a 400 upstream, so each route sends only these. */
const ALLOWED_PARAMS: Record<string, readonly string[]> = {
  [PRIVATE_READER_ROUTES.status]: [],
  [PRIVATE_READER_ROUTES.sources]: ["limit", "offset"],
  [PRIVATE_READER_ROUTES.search]: ["q", "limit", "offset", "kind"],
  [PRIVATE_READER_ROUTES.record]: ["body_offset", "body_limit"],
  [PRIVATE_READER_ROUTES.activity]: ["after", "limit"],
  [PRIVATE_READER_ROUTES.health]: ["days"],
  [PRIVATE_READER_ROUTES.entities]: ["q", "kind", "limit", "offset"],
  [PRIVATE_READER_ROUTES.entity]: [],
};
const REQUIRED_PARAMS: Record<string, readonly string[]> = {
  [PRIVATE_READER_ROUTES.sources]: ["limit", "offset"],
  [PRIVATE_READER_ROUTES.search]: ["q", "limit", "offset"],
  [PRIVATE_READER_ROUTES.record]: ["body_offset", "body_limit"],
  [PRIVATE_READER_ROUTES.activity]: ["after", "limit"],
  [PRIVATE_READER_ROUTES.health]: ["days"],
  [PRIVATE_READER_ROUTES.entities]: ["limit", "offset"],
};

function bounded(value: number | undefined, max: number, min = 0): string {
  const result = value ?? min;
  if (!Number.isSafeInteger(result) || result < min || result > max)
    throw new Error("Out of bounds");
  return String(result);
}

/**
 * Maps a read to its v1 route, validating every argument before anything is
 * sent. Search always carries `q`, which may be empty (recent records).
 * Timeline and preview are not served by this reader.
 */
export function privateReaderPath(request: DataRead): string {
  const b = PRIVATE_READER_BOUNDS;
  const params = new URLSearchParams();
  let path: string;
  switch (request.method) {
    case "status":
      path = PRIVATE_READER_ROUTES.status;
      break;
    case "sources":
      path = PRIVATE_READER_ROUTES.sources;
      params.set(
        "limit",
        bounded(SOURCES_LIMIT, b.dataLimit.max, b.dataLimit.min),
      );
      params.set("offset", bounded(request.offset, b.offsetMax));
      break;
    case "search":
      if (typeof request.q !== "string" || request.q.length > b.queryMax)
        throw new Error("Invalid query");
      if (request.kind !== undefined && !b.kind.test(request.kind))
        throw new Error("Invalid kind");
      path = PRIVATE_READER_ROUTES.search;
      params.set("q", request.q);
      params.set(
        "limit",
        bounded(DATA_LIMIT, b.dataLimit.max, b.dataLimit.min),
      );
      params.set("offset", bounded(request.offset, b.offsetMax));
      if (request.kind !== undefined) params.set("kind", request.kind);
      break;
    case "get":
      if (typeof request.id !== "string" || !b.recordId.test(request.id))
        throw new Error("Invalid record ID");
      path = `${PRIVATE_READER_ROUTES.record}${request.id}`;
      params.set("body_offset", bounded(request.body_offset, b.bodyOffsetMax));
      params.set(
        "body_limit",
        bounded(BODY_LIMIT, b.bodyLimit.max, b.bodyLimit.min),
      );
      break;
    case "activity":
      path = PRIVATE_READER_ROUTES.activity;
      params.set("after", bounded(request.after, b.offsetMax));
      params.set(
        "limit",
        bounded(ACTIVITY_LIMIT, b.activityLimit.max, b.activityLimit.min),
      );
      break;
    default:
      throw new Error("The private reader does not serve this read");
  }
  return params.size ? `${path}?${params}` : path;
}

/** Second gate at the fetch boundary: route, record ID and exact param set. */
function readerUrl(path: string): string {
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.startsWith("//")
  )
    throw new PrivateReaderError(400, "malformed");
  const url = new URL(path, PRIVATE_READER_ORIGIN);
  if (url.origin !== PRIVATE_READER_ORIGIN || url.hash)
    throw new PrivateReaderError(400, "malformed");
  const { record, entity } = PRIVATE_READER_ROUTES;
  let route = url.pathname;
  if (route.startsWith(record)) {
    if (!PRIVATE_READER_BOUNDS.recordId.test(route.slice(record.length)))
      throw new PrivateReaderError(400, "malformed");
    route = record;
  } else if (route.startsWith(entity)) {
    if (!PRIVATE_READER_BOUNDS.entityId.test(route.slice(entity.length)))
      throw new PrivateReaderError(400, "malformed");
    route = entity;
  }
  const allowed = ALLOWED_PARAMS[route];
  if (!allowed) throw new PrivateReaderError(400, "malformed");
  const keys = [...url.searchParams.keys()];
  if (
    keys.some((key) => !allowed.includes(key)) ||
    new Set(keys).size !== keys.length ||
    (REQUIRED_PARAMS[route] ?? []).some((key) => !url.searchParams.has(key))
  )
    throw new PrivateReaderError(400, "malformed");
  return url.href;
}

/** Exactly the request the verifier accepts. Exported for header-shape tests. */
export function privateReaderInit(
  bearer: string,
  signal?: AbortSignal,
): RequestInit {
  return {
    method: "GET",
    mode: "cors",
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
    referrerPolicy: "no-referrer",
    headers: { Authorization: `Bearer ${bearer}` },
    ...(signal ? { signal } : {}),
  };
}

export type ReaderFetchOptions = {
  fetch?: typeof fetch;
  signal?: AbortSignal;
  /** Runs before every send, the renewed one included, and throws to stop
   * it: a mode's exact-scope check (lib/private-reader-health.ts). */
  beforeSend?: () => void;
  /** Runs a 401's renewal, so the caller can hold its reader deadline while
   * admin issues the new credential (A-26). */
  renewing?: DeadlineHold;
};

/** Runs admin's own work (a credential renewal) outside a read's reader
 * deadline, under a deadline of its own. */
export type DeadlineHold = <T>(work: () => Promise<T>) => Promise<T>;

type BearerSource = Pick<
  PrivateReaderSession,
  "bearer" | "renew" | "deny" | "getState"
>;

/**
 * One private GET. A 401 renews the credential once and retries; a second 401
 * (or a failed renewal) clears the session. A logout while the request is in
 * flight discards the reply. A request that gets no reply throws
 * ReaderNoReplyError (lib/reader-reach.ts), naming the hop.
 */
export async function readerFetch(
  session: BearerSource,
  path: string,
  options: ReaderFetchOptions = {},
): Promise<unknown> {
  const url = readerUrl(path);
  const fetcher = options.fetch ?? ((...args) => globalThis.fetch(...args));
  let renewed = false;
  for (;;) {
    options.beforeSend?.();
    const bearer = session.bearer();
    if (!bearer) throw new PrivateReaderError(401, "expired");
    const response = await fetchReader(
      fetcher,
      url,
      privateReaderInit(bearer, options.signal),
    );
    if (session.getState().status !== "ready") {
      discardBody(response);
      throw new PrivateReaderError(401, "expired");
    }
    if (response.status === 401) {
      discardBody(response);
      if (renewed) {
        session.deny();
        throw new PrivateReaderError(401);
      }
      renewed = true;
      const renew = () => session.renew();
      const next = await (options.renewing ? options.renewing(renew) : renew());
      if (next.status !== "ready") throw new PrivateReaderError(401);
      continue;
    }
    if (!response.ok) {
      discardBody(response);
      throw new PrivateReaderError(response.status);
    }
    const body = await readPersonalContextResponse(response);
    if (session.getState().status !== "ready")
      throw new PrivateReaderError(401, "expired");
    return body;
  }
}

/** The Data workspace reader: owner Data reads plus metadata-only activity. */
export function createPrivateDataReader(
  session: BearerSource,
  options: { fetch?: typeof fetch } = {},
): DataReader {
  const read = (path: string, signal: AbortSignal, hold?: DeadlineHold) =>
    readerFetch(session, path, {
      fetch: options.fetch,
      signal,
      renewing: hold,
    });
  const data: DataTransport = {
    protocol: "personal_context_data_v1",
    scope: "owner",
    path: privateReaderPath,
    read,
  };
  const activity: DataTransport = {
    protocol: "personal_context_observability_v1",
    scope: "agent",
    path: privateReaderPath,
    read,
  };
  return (request, signal) =>
    readPersonalContext(
      request,
      request.method === "activity" ? activity : data,
      signal,
    );
}

/**
 * Binds the session to a Data reader. The reader exists only while the session
 * is ready, and a new one is created for each new session, so every consumer
 * keyed on it drops its private state on logout, denial or expiry.
 */
export function usePrivateReader(
  session: PrivateReaderSession,
  options: { fetch?: typeof fetch } = {},
): { state: PrivateReaderState; reader: DataReader | null } {
  const state = usePrivateReaderState(session);
  const ready = state.status === "ready";
  const fetcher = options.fetch;
  const reader = useMemo(
    () => (ready ? createPrivateDataReader(session, { fetch: fetcher }) : null),
    [session, ready, fetcher],
  );
  return { state, reader };
}
