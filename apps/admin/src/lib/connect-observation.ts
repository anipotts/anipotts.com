/** Allowlisted operational metadata. Never accepts credentials or item payloads. */
export const CONNECT_FIELDS = {
  colima_vm: ["running", "stopped"],
  connect_api: ["running", "not_running", "missing", "unavailable", "unknown"],
  connect_sync: ["running", "not_running", "missing", "unavailable", "unknown"],
  docker_socket: ["present", "missing"],
  launchd: ["manual_probe", "invoked"],
  local_heartbeat: null,
  local_health: null,
  tailnet_heartbeat: null,
  tailnet_health: null,
} as const;
export type ConnectField = keyof typeof CONNECT_FIELDS;
export type ConnectObservation = {
  version: 1;
  origin: "mini-operator-runtime";
  observedAt: string;
  fields: Record<ConnectField, string | null>;
  activity: "unknown";
};

/** Project the existing status command locally; only this result crosses the adapter. */
export function projectConnectStatus(raw: unknown, observedAt: string, now = Date.now()): ConnectObservation {
  const instant = Date.parse(observedAt);
  if (!Number.isFinite(instant) || instant < 0 || instant > now)
    throw new Error("Invalid observation time");
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Connect status unavailable");
  const runtime = (raw as Record<string, unknown>).auth_runtime;
  if (!runtime || typeof runtime !== "object" || Array.isArray(runtime))
    throw new Error("Connect status unavailable");
  const fields = {} as Record<ConnectField, string | null>;
  for (const key of Object.keys(CONNECT_FIELDS) as ConnectField[]) {
    const value = (runtime as Record<string, unknown>)[key];
    const allowed = CONNECT_FIELDS[key];
    fields[key] = typeof value === "string" && (allowed
      ? (allowed as readonly string[]).includes(value)
      : /^(000|[1-5][0-9]{2})$/.test(value)) ? value : null;
  }
  return { version: 1, origin: "mini-operator-runtime", observedAt: new Date(instant).toISOString(), fields, activity: "unknown" };
}

export function connectFreshness(observation: ConnectObservation | null, now = Date.now()) {
  if (!observation) return "unavailable";
  const age = now - Date.parse(observation.observedAt);
  return !Number.isFinite(age) || age < 0 || age > 60_000 ? "stale" : "current";
}
