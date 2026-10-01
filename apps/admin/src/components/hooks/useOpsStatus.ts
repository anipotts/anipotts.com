import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPrivateReaderSession } from "../../lib/private-reader-client";
import {
  OPS_CREDENTIAL_ENDPOINT,
  createOpsStatusController,
  type OpsStatusController,
  type OpsStatusState,
} from "../../lib/ops-reader";
import { readEditorialCsrf } from "../../lib/editorial-client";
import {
  releasePrivateSession,
  trackPrivateSession,
} from "../../lib/private-session-store";

const OFF: OpsStatusState = Object.freeze({
  connection: "off",
  snapshot: null,
  checkedAt: null,
  events: null,
  eventsStale: false,
}) as OpsStatusState;
const offStore = {
  getState: () => OFF,
  subscribe: () => () => undefined,
};
/** The server render of an enabled page: the controller's own starting
 * state, so hydration matches without creating a session on the server. */
const IDLE: OpsStatusState = Object.freeze({ ...OFF, connection: "idle" });
const idleStore = {
  getState: () => IDLE,
  subscribe: () => () => undefined,
};

type OpsLease = {
  controller: OpsStatusController;
  events: (enabled: boolean) => void;
  release: () => void;
};
type OwnedOps = {
  controller: OpsStatusController;
  consumers: number;
  events: number;
  retire: () => void;
};
let shared: OwnedOps | null = null;

/** One browser-document controller, created only by committed consumers. */
function acquireOps(events: boolean): OpsLease {
  if (!shared) {
    const session = createPrivateReaderSession({
      fetch: (...args) => globalThis.fetch(...args),
      csrf: readEditorialCsrf,
      endpoint: OPS_CREDENTIAL_ENDPOINT,
    });
    trackPrivateSession(session);
    const controller = createOpsStatusController({ session });
    const visibility = () => controller.visibilityChanged();
    const hide = () => controller.end();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", hide);
    shared = {
      controller,
      consumers: 0,
      events: 0,
      retire() {
        document.removeEventListener("visibilitychange", visibility);
        window.removeEventListener("pagehide", hide);
        controller.dispose();
        releasePrivateSession(session);
      },
    };
  }
  const entry = shared;
  entry.consumers++;
  if (events) entry.events++;
  entry.controller.setEventsEnabled(entry.events > 0);
  if (entry.consumers === 1) entry.controller.start();
  let active = true;
  let wantsEvents = events;
  return {
    controller: entry.controller,
    events(enabled) {
      if (!active || wantsEvents === enabled) return;
      entry.events += enabled ? 1 : -1;
      wantsEvents = enabled;
      entry.controller.setEventsEnabled(entry.events > 0);
    },
    release() {
      if (!active) return;
      active = false;
      entry.consumers--;
      if (wantsEvents) entry.events--;
      if (entry.consumers === 0) {
        if (shared === entry) shared = null;
        entry.retire();
      } else entry.controller.setEventsEnabled(entry.events > 0);
    },
  };
}

/**
 * The Observability binding for lib/ops-reader.ts. With the reader off,
 * nothing is created and no request is made. Otherwise polling starts on
 * mount, follows tab visibility, closes after 15 idle minutes like Data, and
 * the private session ends on page hide (bfcache) and unmount.
 */
export function useOpsStatus({
  enabled,
  controller: injected,
  events = false,
}: {
  enabled: boolean;
  controller?: OpsStatusController;
  /** Also read the events feed. */
  events?: boolean;
}): { state: OpsStatusState; controller: OpsStatusController | null } {
  const [controller, setController] = useState<OpsStatusController | null>(
    null,
  );
  const lease = useRef<OpsLease | null>(null);
  useEffect(() => {
    if (!enabled) {
      setController(null);
      return;
    }
    if (injected) {
      // An injected controller has an external owner; release only our listeners.
      const visibility = () => injected.visibilityChanged();
      document.addEventListener("visibilitychange", visibility);
      injected.start();
      setController(injected);
      return () => document.removeEventListener("visibilitychange", visibility);
    }
    const owned = acquireOps(events);
    lease.current = owned;
    setController(owned.controller);
    return () => {
      lease.current = null;
      owned.release();
    };
  }, [enabled, injected]);
  useEffect(() => lease.current?.events(events), [events]);
  const store = enabled ? (controller ?? idleStore) : offStore;
  const state = useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState,
  );
  return { state, controller };
}
