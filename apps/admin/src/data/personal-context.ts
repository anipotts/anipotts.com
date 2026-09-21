import { applyActivityPage, emptyActivity } from "../lib/life-activity";
/** Transport-neutral reads. Wiring a private transport requires separate access approval. */
export const LIFE_DEFAULTS = {
  mode: "lookup",
  budget: 3000,
  recent_days: 7,
  limit: 30,
} as const;
export type LifeRead =
  | { method: "status" }
  | { method: "sources"; offset?: number }
  | {
      method: "search";
      q: string;
      kind?: "person" | "project" | "place";
      offset?: number;
    }
  | { method: "timeline"; entity_id?: string; offset?: number }
  | { method: "get"; id: string; body_offset?: number }
  | { method: "preview"; q: string }
  | { method: "activity"; after?: number };
export type LifeResult =
  | {
      state: "ready";
      scope: "agent" | "owner";
      observedAt: string;
      responseObservedAt?: string;
      data: Record<string, unknown>;
    }
  | {
      state: "disconnected" | "unavailable" | "denied" | "invalid";
      message: string;
    };
export type LifeTransport = {
  protocol?: "personal_context_data_v1" | "personal_context_observability_v1";
  scope: "agent" | "owner";
  /** Enforce the byte cap while reading, before decoding an untrusted body. */
  read: (path: string, signal: AbortSignal) => Promise<unknown>;
};
async function readWithDeadline(
  transport: LifeTransport,
  path: string,
  parent?: AbortSignal,
) {
  const controller = new AbortController();
  const signal = parent
    ? AbortSignal.any([parent, controller.signal])
    : controller.signal;
  signal.throwIfAborted();
  let rejectAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(new Error("Read cancelled"));
    signal.addEventListener("abort", rejectAbort, { once: true });
  });
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    return await Promise.race([transport.read(path, signal), aborted]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", rejectAbort);
    controller.abort();
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isCursor = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
export function nextLifeOffset(value: unknown, current = 0): number | null {
  if (value === null) return null;
  if (
    !isCursor(value) ||
    Number(value) <= current ||
    Number(value) > 10_000_000
  )
    throw new Error("Invalid continuation cursor");
  return Number(value);
}
function validResponse(
  request: LifeRead,
  data: Record<string, unknown>,
  versioned = false,
): boolean {
  switch (request.method) {
    case "status":
      return (
        isObject(data.database) &&
        typeof data.database.exists === "boolean" &&
        (versioned
          ? isObject(data.counts) &&
            ["records", "revisions", "sources", "changes"].every((key) =>
              isCursor((data.counts as Record<string, unknown>)[key]),
            )
          : isObject(data.ingestion) && isObject(data.wiki))
      );
    case "get":
      return (
        data.record_id === request.id &&
        typeof data.revision_id === "string" &&
        typeof data.body === "string" &&
        data.body_offset === (request.body_offset ?? 0) &&
        (data.next_body_offset === null ||
          (isCursor(data.next_body_offset) &&
            Number(data.next_body_offset) <= 10_000_000 &&
            Number(data.next_body_offset) > (request.body_offset ?? 0)))
      );
    case "preview":
      return (
        typeof data.context_text === "string" &&
        data.mode === "lookup" &&
        data.budget === 3000 &&
        data.recent_days === 7 &&
        isCursor(data.token_count) &&
        Number(data.token_count) <= 3000 &&
        Array.isArray(data.selected) &&
        Array.isArray(data.omitted)
      );
    case "activity":
      return (
        Array.isArray(data.items) &&
        data.items.every(isObject) &&
        isCursor(data.next_cursor) &&
        Number(data.next_cursor) <= 10_000_000 &&
        Number(data.next_cursor) >= (request.after ?? 0)
      );
    default:
      return (
        Array.isArray(data.items) &&
        data.items.every(isObject) &&
        isCursor(data.total) &&
        (data.next_offset === null ||
          (isCursor(data.next_offset) &&
            Number(data.next_offset) <= 10_000_000 &&
            Number(data.next_offset) >
              ("offset" in request ? (request.offset ?? 0) : 0)))
      );
  }
}
const integer = (value: number | undefined) => {
  const result = value ?? 0;
  if (!Number.isSafeInteger(result) || result < 0 || result > 10_000_000)
    throw new Error("Invalid cursor");
  return result;
};
const query = (value: string) => {
  if (typeof value !== "string" || value.length > 2048)
    throw new Error("Invalid query");
  return value;
};
export function lifeReadPath(request: LifeRead): string {
  const params = new URLSearchParams();
  let path: string = request.method;
  switch (request.method) {
    case "search":
      params.set("q", query(request.q));
      if (request.kind) {
        if (!["person", "project", "place"].includes(request.kind))
          throw new Error("Invalid kind");
        params.set("kind", request.kind);
      }
      params.set("limit", String(LIFE_DEFAULTS.limit));
      params.set("offset", String(integer(request.offset)));
      break;
    case "timeline":
      if (request.entity_id) params.set("entity_id", query(request.entity_id));
      params.set("limit", String(LIFE_DEFAULTS.limit));
      params.set("offset", String(integer(request.offset)));
      break;
    case "get":
      if (!/^[a-zA-Z0-9_-]{1,200}$/.test(request.id))
        throw new Error("Invalid record ID");
      path = `records/${encodeURIComponent(request.id)}`;
      params.set("body_offset", String(integer(request.body_offset)));
      params.set("body_limit", "32000");
      break;
    case "preview":
      params.set("q", query(request.q));
      params.set("mode", LIFE_DEFAULTS.mode);
      params.set("budget", String(LIFE_DEFAULTS.budget));
      params.set("recent_days", String(LIFE_DEFAULTS.recent_days));
      break;
    case "activity":
      params.set("after", String(integer(request.after)));
      params.set("limit", "100");
      break;
    case "sources":
      params.set("limit", String(LIFE_DEFAULTS.limit));
      params.set("offset", String(integer(request.offset)));
      break;
    case "status":
      break;
    default:
      throw new Error("Unsupported read");
  }
  return `/api/${path}${params.size ? `?${params}` : ""}`;
}
export async function readPersonalContext(
  request: LifeRead,
  transport?: LifeTransport,
  signal?: AbortSignal,
): Promise<LifeResult> {
  let path: string;
  try {
    path = lifeReadPath(request);
  } catch {
    return {
      state: "invalid",
      message: "This request is outside the supported read bounds.",
    };
  }
  if (!transport)
    return {
      state: "disconnected",
      message:
        "Private Data access is not connected. Existing records remain in PersonalContext.",
    };
  if (
    (transport.protocol === "personal_context_data_v1" &&
      (transport.scope !== "owner" ||
        !["status", "sources", "search", "get"].includes(request.method))) ||
    (transport.protocol === "personal_context_observability_v1" &&
      (transport.scope !== "agent" || request.method !== "activity"))
  )
    return {
      state: "denied",
      message: "This connection does not support this read.",
    };
  try {
    let data = await readWithDeadline(transport, path, signal);
    let responseObservedAt: string | undefined;
    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      new TextEncoder().encode(JSON.stringify(data)).byteLength > 1024 * 1024
    ) {
      return {
        state: "invalid",
        message: "The source returned an unsupported response.",
      };
    }
    if (transport.protocol) {
      const envelope = data as Record<string, unknown>;
      if (
        envelope.schema !== transport.protocol ||
        typeof envelope.response_observed_at !== "string" ||
        !Number.isFinite(Date.parse(envelope.response_observed_at)) ||
        !isObject(envelope.data)
      )
        return {
          state: "invalid",
          message: "The source returned an unsupported response contract.",
        };
      responseObservedAt = envelope.response_observed_at;
      data = envelope.data;
    }
    if (
      request.method === "status" &&
      isObject((data as Record<string, unknown>).database) &&
      ((data as Record<string, unknown>).database as Record<string, unknown>)
        .exists === false
    )
      return {
        state: "unavailable",
        message:
          "The canonical source is unavailable. This is not an empty record collection.",
      };
    if (!isObject(data))
      return {
        state: "invalid",
        message: "The source returned an unsupported response.",
      };
    if (transport.protocol === "personal_context_observability_v1") {
      try {
        if (
          Object.keys(data).some(
            (key) => !["items", "next_cursor"].includes(key),
          )
        )
          throw new Error("Unexpected activity field");
        applyActivityPage(
          {
            ...emptyActivity(),
            cursor: request.method === "activity" ? (request.after ?? 0) : 0,
          },
          data,
        );
      } catch {
        return {
          state: "invalid",
          message: "The source returned invalid activity metadata.",
        };
      }
    }
    if ("error" in data)
      return {
        state: "unavailable",
        message: "The source could not complete this read.",
      };
    if (
      request.method === "preview" &&
      (!("context_consumer" in data) ||
        data.context_consumer !== transport.scope)
    ) {
      return {
        state: "denied",
        message: "The returned context scope does not match this connection.",
      };
    }
    if (
      !validResponse(
        request,
        data as Record<string, unknown>,
        transport.protocol === "personal_context_data_v1",
      )
    )
      return {
        state: "invalid",
        message:
          "The source returned incomplete or inconsistent read metadata.",
      };
    return {
      state: "ready",
      scope: transport.scope,
      observedAt: new Date().toISOString(),
      ...(responseObservedAt ? { responseObservedAt } : {}),
      data: data as Record<string, unknown>,
    };
  } catch {
    // Provider errors can contain source paths or private payloads. Never forward them.
    return {
      state: "unavailable",
      message:
        "PersonalContext could not be reached. Try again when the source is available.",
    };
  }
}
