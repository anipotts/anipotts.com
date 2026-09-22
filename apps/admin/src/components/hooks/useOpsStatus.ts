import { useEffect, useState, useSyncExternalStore } from "react";
import { createPrivateReaderSession } from "../../lib/private-reader-client";
import {
  OPS_CREDENTIAL_ENDPOINT,
  createOpsStatusController,
  type OpsStatusController,
  type OpsStatusState,
} from "../../lib/ops-reader";
import {
  readEditorialCsrf,
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

/** A fresh ops session, under the same idle rule as the Data session. */
function opsController(events: boolean): OpsStatusController {
  const session = createPrivateReaderSession({
    fetch: (...args) => globalThis.fetch(...args),
    csrf: readEditorialCsrf,
    endpoint: OPS_CREDENTIAL_ENDPOINT,
  });
  trackPrivateSession(session);
  return createOpsStatusController({ session, events });
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
  const [controller] = useState<OpsStatusController | null>(() =>
    !enabled ? null : (injected ?? opsController(events)),
  );
  useEffect(() => {
    if (!controller) return;
    const visibility = () => controller.visibilityChanged();
    const end = () => controller.end();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", end);
    controller.start();
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", end);
      // End, not dispose: a remount (Strict Mode) starts the same controller.
      controller.end();
    };
  }, [controller]);
  const store = controller ?? offStore;
  const state = useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState,
  );
  return { state, controller };
}
