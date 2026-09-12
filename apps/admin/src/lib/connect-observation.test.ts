import { describe, expect, it } from "vitest";
import { connectFreshness, projectConnectStatus } from "./connect-observation";
const at = "2026-09-12T12:00:00.000Z";
const now = Date.parse(at);
describe("Connect metadata projection", () => {
  it("keeps probe and process evidence separate from activity", () => {
    const value = projectConnectStatus({ auth_runtime: { connect_api: "running", tailnet_heartbeat: "200", launchd: "manual_probe" } }, at, now);
    expect(value.fields.connect_api).toBe("running");
    expect(value.fields.local_health).toBeNull();
    expect(value.activity).toBe("unknown");
    expect(value.origin).toBe("mini-operator-runtime");
  });
  it("drops unknown fields and arbitrary field values", () => {
    const value = projectConnectStatus({ secret: "private", auth_runtime: { detail: "private", connect_sync: "private" } }, at, now);
    expect(JSON.stringify(value)).not.toContain("private");
    expect(value.fields.connect_sync).toBeNull();
  });
  it("preserves unavailable probes without inventing a disconnect", () => {
    const value = projectConnectStatus({ auth_runtime: { tailnet_heartbeat: "000" } }, at, now);
    expect(value.fields.tailnet_heartbeat).toBe("000");
    expect(connectFreshness(value, now)).toBe("current");
    expect(connectFreshness(value, now + 60_001)).toBe("stale");
    expect(connectFreshness(null, now)).toBe("unavailable");
  });
  it("rejects missing sources and future observation times", () => {
    expect(() => projectConnectStatus({}, at, now)).toThrow();
    expect(() => projectConnectStatus({ auth_runtime: {} }, at, now - 1)).toThrow();
  });
});
