import { useMemo } from "react";
import {
  LIFE_DEFAULTS,
  lifeReadPath,
  readPersonalContext,
  type LifeRead,
  type LifeTransport,
} from "../data/personal-context";
import {
  PersonalContextHttpError,
  readPersonalContextResponse,
} from "../data/personal-context-http";
import { discardBody } from "./response-body";
import type { LifeReader } from "./life-read-session";
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

/** Maps a validated read to the v1 route. Timeline and preview are not served. */
export function privateReaderPath(request: LifeRead): string {
  // Reuse the existing bounds checks (query length, cursor range, record ID).
  lifeReadPath(request);
  const params = new URLSearchParams();
  let path: string;
  switch (request.method) {
    case "status":
      path = PRIVATE_READER_ROUTES.status;
      break;
    case "sources":
      path = PRIVATE_READER_ROUTES.sources;
      params.set("limit", String(LIFE_DEFAULTS.limit));
      params.set("offset", String(request.offset ?? 0));
      break;
    case "search":
      path = PRIVATE_READER_ROUTES.search;
      params.set("q", request.q);
      if (request.kind) params.set("kind", request.kind);
      params.set("limit", String(LIFE_DEFAULTS.limit));
      params.set("offset", String(request.offset ?? 0));
      break;
    case "get":
      path = `${PRIVATE_READER_ROUTES.record}${encodeURIComponent(request.id)}`;
      params.set("body_offset", String(request.body_offset ?? 0));
      params.set("body_limit", "32000");
      break;
    case "activity":
      path = PRIVATE_READER_ROUTES.activity;
      params.set("after", String(request.after ?? 0));
      params.set("limit", "100");
      break;
    default:
      throw new Error("The private reader does not serve this read");
  }
  return params.size ? `${path}?${params}` : path;
}

function readerUrl(path: string): string {
  const pathname = typeof path === "string" ? path.split("?")[0]! : "";
  const { record, ...fixed } = PRIVATE_READER_ROUTES;
  const recordId = pathname.startsWith(record)
    ? pathname.slice(record.length)
    : "";
  if (
    !(Object.values(fixed) as string[]).includes(pathname) &&
    !(recordId && !recordId.includes("/"))
  )
    throw new PrivateReaderError(400, "malformed");
  const url = new URL(path, PRIVATE_READER_ORIGIN);
  if (url.origin !== PRIVATE_READER_ORIGIN)
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
};

type BearerSource = Pick<
  PrivateReaderSession,
  "bearer" | "renew" | "deny" | "getState"
>;

/**
 * One private GET. A 401 renews the credential once and retries; a second 401
 * (or a failed renewal) clears the session. A logout while the request is in
 * flight discards the reply.
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
    const bearer = session.bearer();
    if (!bearer) throw new PrivateReaderError(401, "expired");
    const response = await fetcher(
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
      const next = await session.renew();
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
export function createPrivateLifeReader(
  session: BearerSource,
  options: { fetch?: typeof fetch } = {},
): LifeReader {
  const read = (path: string, signal: AbortSignal) =>
    readerFetch(session, path, { fetch: options.fetch, signal });
  const data: LifeTransport = {
    protocol: "personal_context_data_v1",
    scope: "owner",
    path: privateReaderPath,
    read,
  };
  const activity: LifeTransport = {
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
): { state: PrivateReaderState; reader: LifeReader | null } {
  const state = usePrivateReaderState(session);
  const ready = state.status === "ready";
  const fetcher = options.fetch;
  const reader = useMemo(
    () => (ready ? createPrivateLifeReader(session, { fetch: fetcher }) : null),
    [session, ready, fetcher],
  );
  return { state, reader };
}
