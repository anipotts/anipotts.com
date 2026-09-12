/** Transport-neutral reads. Wiring a private transport requires separate access approval. */
export const LIFE_DEFAULTS = {
  mode: "lookup",
  budget: 3000,
  recent_days: 7,
  limit: 30,
} as const;
export type LifeRead =
  | { method: "status" | "sources" }
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
      data: Record<string, unknown>;
    }
  | {
      state: "disconnected" | "unavailable" | "denied" | "invalid";
      message: string;
    };
export type LifeTransport = {
  scope: "agent" | "owner";
  /** Enforce the byte cap before decoding; HTTP implementations can use decodeLifeResponse. */
  read: (path: string, signal: AbortSignal) => Promise<unknown>;
};
async function readWithDeadline(transport: LifeTransport, path: string) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      transport.read(path, controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Read timed out"));
        }, 5000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
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
): boolean {
  switch (request.method) {
    case "status":
      return (
        isObject(data.database) &&
        typeof data.database.exists === "boolean" &&
        isObject(data.ingestion) &&
        isObject(data.wiki)
      );
    case "get":
      return (
        data.record_id === request.id &&
        typeof data.revision_id === "string" &&
        typeof data.body === "string"
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
    case "status":
    case "sources":
      break;
    default:
      throw new Error("Unsupported read");
  }
  return `/api/${path}${params.size ? `?${params}` : ""}`;
}
export async function readPersonalContext(
  request: LifeRead,
  transport?: LifeTransport,
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
        "Private Life access is not connected. Existing records remain in PersonalContext.",
    };
  try {
    const data = await readWithDeadline(transport, path);
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
    if (!validResponse(request, data as Record<string, unknown>))
      return {
        state: "invalid",
        message:
          "The source returned incomplete or inconsistent read metadata.",
      };
    return {
      state: "ready",
      scope: transport.scope,
      observedAt: new Date().toISOString(),
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
