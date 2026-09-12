import { libraryReturnPath } from "./content-library-state";

export const recordViews = ["edit", "preview", "review", "source"] as const;
export const recordPanels = ["properties", "history", "publication"] as const;
export type RecordView = (typeof recordViews)[number];
export type RecordPanel = (typeof recordPanels)[number];
export type RecordWorkspaceState = {
  view: RecordView;
  panel: RecordPanel | null;
};

/** Only one inspector may be open. Unknown/deprecated modes normalize to Edit. */
export function readRecordWorkspaceState(search: string): RecordWorkspaceState {
  const params = new URLSearchParams(search);
  const view = params.get("view");
  const panel = params.get("panel");
  return {
    view: recordViews.includes(view as RecordView)
      ? (view as RecordView)
      : "edit",
    panel: recordPanels.includes(panel as RecordPanel)
      ? (panel as RecordPanel)
      : null,
  };
}

/** A same-record URL, with no caller-controlled redirect or inherited secret parameters. */
export function recordWorkspaceUrl(
  pathname: string,
  search: string,
  state: RecordWorkspaceState,
): string {
  if (
    !/^\/content\/(?:home|workPage|writingPage|systemsPage|newsletterPage|projects|writing)\/[a-z0-9][a-z0-9-]*\/?$/u.test(
      pathname,
    )
  )
    return "/content";
  const previous = new URLSearchParams(search);
  const params = new URLSearchParams();
  const theme = previous.get("theme");
  if (theme && ["light", "dark", "system"].includes(theme))
    params.set("theme", theme);
  if (previous.has("returnTo"))
    params.set("returnTo", libraryReturnPath(previous.get("returnTo")));
  if (recordViews.includes(state.view) && state.view !== "edit")
    params.set("view", state.view);
  if (state.panel && recordPanels.includes(state.panel))
    params.set("panel", state.panel);
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}
