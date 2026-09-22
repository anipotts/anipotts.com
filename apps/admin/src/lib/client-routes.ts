/**
 * In-document navigation between the overview and Data. The page island
 * registers the routes it can draw; a link to one of them (from the page or
 * the sidebar) moves with history.pushState instead of loading a document,
 * so the private Data session and everything read stay in memory. Any other
 * link loads a document as usual.
 */
type Router = {
  /** True when this island can draw the route without a document load. */
  handles: (url: URL) => boolean;
  show: (url: URL) => void;
};

let router: Router | null = null;

export function registerClientRoutes(next: Router): () => void {
  router = next;
  return () => {
    if (router === next) router = null;
  };
}

/** Moves to `href` in this document if a registered island draws it. */
export function clientNavigate(href: string): boolean {
  if (!router || typeof window === "undefined") return false;
  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin || !router.handles(url))
    return false;
  if (
    url.pathname + url.search !==
    window.location.pathname + window.location.search
  )
    window.history.pushState(null, "", url.pathname + url.search);
  router.show(url);
  window.dispatchEvent(new Event("admin:workspace-navigation"));
  return true;
}

/** A click handler for a region of links: plain clicks on handled links stay
 * in the document; modified clicks, new tabs and other routes are left to
 * the browser. */
export function onClientLinkClick(event: {
  target: EventTarget | null;
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  preventDefault: () => void;
}) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const link = (event.target as Element | null)?.closest?.("a[href]");
  if (!(link instanceof HTMLAnchorElement)) return;
  if (link.target && link.target !== "_self") return;
  if (link.hasAttribute("download")) return;
  if (clientNavigate(link.href)) event.preventDefault();
}
