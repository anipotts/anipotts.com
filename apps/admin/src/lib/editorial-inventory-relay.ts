import { recoveryLogoutKey } from "./draft-recovery";
import {
  RECORD_CREATED_EVENT,
  RECORD_SAVED_EVENT,
  parseEditorialRecordCreated,
  parseEditorialRecordSaved,
} from "./editorial-inventory-events";

export const INVENTORY_CHANNEL = "admin:editorial-inventory";

/**
 * Carries saved and created record events to the other open Admin tabs on
 * this origin, so their library rows, group counts and palette entries follow
 * an edit made elsewhere. Messages live only in memory: nothing is stored and
 * no request is made. Every message is validated again on arrival, and a sign
 * out in any tab closes the channel.
 */
export function startEditorialInventoryRelay(
  target: Pick<
    Window,
    "addEventListener" | "removeEventListener" | "dispatchEvent"
  > = window,
): () => void {
  if (typeof BroadcastChannel !== "function") return () => undefined;
  let channel: BroadcastChannel | null = new BroadcastChannel(
    INVENTORY_CHANNEL,
  );
  // Events this tab received from the channel are applied locally and never
  // sent back out.
  const relayed = new WeakSet<object>();
  const forward = (type: "saved" | "created") => (event: Event) => {
    if (
      !channel ||
      !(event instanceof CustomEvent) ||
      !event.detail ||
      typeof event.detail !== "object" ||
      relayed.has(event.detail)
    )
      return;
    const detail =
      type === "saved"
        ? parseEditorialRecordSaved(event.detail)
        : parseEditorialRecordCreated(event.detail);
    if (!detail) return;
    try {
      channel.postMessage({ type, detail });
    } catch {
      /* A closed channel or an uncloneable value leaves this tab unchanged. */
    }
  };
  const saved = forward("saved");
  const created = forward("created");
  const receive = (event: MessageEvent) => {
    const message = event.data as { type?: unknown; detail?: unknown } | null;
    if (!message || typeof message !== "object") return;
    const detail =
      message.type === "saved"
        ? parseEditorialRecordSaved(message.detail)
        : message.type === "created"
          ? parseEditorialRecordCreated(message.detail)
          : null;
    if (!detail) return;
    relayed.add(detail);
    target.dispatchEvent(
      new CustomEvent(
        message.type === "saved" ? RECORD_SAVED_EVENT : RECORD_CREATED_EVENT,
        { detail },
      ),
    );
  };
  const stop = () => {
    if (!channel) return;
    channel.removeEventListener("message", receive);
    channel.close();
    channel = null;
    target.removeEventListener(RECORD_SAVED_EVENT, saved);
    target.removeEventListener(RECORD_CREATED_EVENT, created);
    target.removeEventListener(recoveryLogoutKey, stop);
    target.removeEventListener("storage", signedOutElsewhere);
  };
  const signedOutElsewhere = (event: StorageEvent) => {
    if (event.key === recoveryLogoutKey) stop();
  };
  channel.addEventListener("message", receive);
  target.addEventListener(RECORD_SAVED_EVENT, saved);
  target.addEventListener(RECORD_CREATED_EVENT, created);
  target.addEventListener(recoveryLogoutKey, stop);
  target.addEventListener("storage", signedOutElsewhere);
  return stop;
}
