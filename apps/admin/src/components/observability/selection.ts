import { useEffect, useRef, useState } from "react";
import { OPS_V1_BOUNDS } from "../../lib/ops-v1";

/**
 * Which entry or alert is open, kept in the URL (`?entry=` on Status,
 * `?alert=` on Alerts) with real history: opening from the list pushes,
 * another row picked beside an open one replaces it, so Back or Escape
 * always closes to the list, and focus returns to the row.
 */
export type OpsSelectionParam = "entry" | "alert";

/** The id a URL opens, when it names a well-formed catalog id. */
export function opsSelectionParam(
  search: string,
  param: OpsSelectionParam,
): string | null {
  const id = new URLSearchParams(search).get(param);
  return id && OPS_V1_BOUNDS.id.test(id) ? id : null;
}

export function opsSelectionHref(
  path: string,
  param: OpsSelectionParam,
  id: string,
) {
  return `${path}?${param}=${encodeURIComponent(id)}`;
}

export function useOpsSelection(
  initial: string | null,
  { path, param }: { path: string; param: OpsSelectionParam },
) {
  const [selected, setSelected] = useState(initial);
  const trigger = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLElement | null>(null);
  const pushed = useRef(false);
  useEffect(() => {
    const read = () => {
      const next = opsSelectionParam(window.location.search, param);
      setSelected(next);
      if (!next) trigger.current?.focus({ preventScroll: true });
    };
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [param]);
  useEffect(() => {
    if (!selected) return;
    const node = panel.current;
    // Beside the list the panel sticks in view; as the page (the list has
    // stepped aside) it starts at the top.
    const list = node?.previousElementSibling;
    const asPage =
      !(list instanceof HTMLElement) ||
      getComputedStyle(list).display === "none";
    if (asPage) node?.scrollIntoView?.({ block: "start" });
    node?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
    // `close` reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);
  const open = (id: string, from: HTMLElement) => {
    trigger.current = from;
    if (id === selected) return;
    const href = opsSelectionHref(path, param, id);
    if (selected) window.history.replaceState({ ops: id }, "", href);
    else {
      window.history.pushState({ ops: id }, "", href);
      pushed.current = true;
    }
    setSelected(id);
  };
  function close() {
    if (pushed.current && window.history.state?.ops) {
      pushed.current = false;
      window.history.back();
      return;
    }
    window.history.replaceState(null, "", path);
    setSelected(null);
    trigger.current?.focus({ preventScroll: true });
  }
  return { selected, open, close, panel };
}
