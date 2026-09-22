import React, {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";

/**
 * A list and its open item side by side: a Data record, an alert, a job's
 * run history. Data and Observability pages put a list and a SplitPanel in
 * it; the geometry lives in styles/shell.css ("Split view").
 *
 * - From SPLIT_VIEW_MIN_WIDTH of its own width, an open panel sits beside
 *   the list, sticks to the top of the main panel as the list scrolls, and
 *   scrolls its own content, so the sidebar, the list and the panel each
 *   scroll on their own. Its header stays pinned while its body scrolls, and
 *   its height is the room below its own top (useFitPanel), so its end is
 *   always in view.
 * - Narrower (tablets with the full sidebar, phones), an open panel is the
 *   page: the list steps aside and the panel scrolls with the page, under
 *   the phone's sticky top bar.
 *
 * `useSplitView()` tells the parts CSS cannot decide, such as the panel
 * heading's level, whether the panel is beside the list.
 */
export const SPLIT_VIEW_MIN_WIDTH = 960;

const SplitContext = createContext(false);

/** Whether the enclosing SplitView holds its panel beside the list. */
export function useSplitView(): boolean {
  return useContext(SplitContext);
}

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function SplitView({
  list,
  panel,
  className,
  listClassName,
}: {
  list: ReactNode;
  /** The open item's SplitPanel; null or undefined when nothing is open. */
  panel?: ReactNode;
  className?: string;
  /** Extra classes for the list column, such as a list container name. */
  listClassName?: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(false);
  useIsomorphicLayoutEffect(() => {
    const node = frame.current;
    if (!node) return;
    const measure = () =>
      setSplit(node.getBoundingClientRect().width >= SPLIT_VIEW_MIN_WIDTH);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const open = panel !== null && panel !== undefined && panel !== false;
  useFitPanel(frame, split && open);
  return (
    <SplitContext value={split}>
      <div
        ref={frame}
        className={className ? `admin-split ${className}` : "admin-split"}
      >
        <div className="admin-split-grid" data-panel-open={open}>
          <div
            className={
              listClassName
                ? `admin-split-list ${listClassName}`
                : "admin-split-list"
            }
          >
            {list}
          </div>
          {open && panel}
        </div>
      </div>
    </SplitContext>
  );
}

/**
 * Beside the list the panel sticks under the top of main, but it starts
 * lower, under the page's title and filters. Sized to main's height it would
 * hang past the viewport until main scrolled, hiding its last lines. This
 * sizes it to the room left below its own top instead, following main's
 * scroll, so its bottom always rests on the viewport's edge.
 */
function useFitPanel(
  frame: React.RefObject<HTMLDivElement | null>,
  active: boolean,
) {
  useIsomorphicLayoutEffect(() => {
    const node = frame.current;
    const panel = node?.querySelector<HTMLElement>(
      ":scope > .admin-split-grid > .admin-split-panel",
    );
    if (!node || !panel || !active) return;
    const scroller = node.closest<HTMLElement>("#astryx-app-shell-main");
    let frameId = 0;
    const fit = () => {
      frameId = 0;
      const gap = parseFloat(getComputedStyle(panel).insetBlockStart) || 0;
      const view = scroller?.getBoundingClientRect() ?? {
        top: 0,
        bottom: window.innerHeight,
      };
      const bottom = Math.min(view.bottom, window.innerHeight);
      const top = Math.max(panel.getBoundingClientRect().top, view.top + gap);
      panel.style.setProperty(
        "--admin-split-panel-room",
        `${Math.max(Math.floor(bottom - top - gap), 160)}px`,
      );
    };
    const schedule = () => {
      if (!frameId) frameId = requestAnimationFrame(fit);
    };
    fit();
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(schedule);
    observer?.observe(node);
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      target.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
      panel.style.removeProperty("--admin-split-panel-room");
    };
  }, [active]);
}

/** The open item: a surface whose header stays pinned while its body
 * scrolls. Extra props (aria-label, tabIndex, id) reach the section. */
export const SplitPanel = forwardRef<
  HTMLElement,
  { header?: ReactNode; children: ReactNode } & Omit<
    HTMLAttributes<HTMLElement>,
    "children"
  >
>(function SplitPanel({ header, children, className, ...rest }, ref) {
  return (
    <section
      ref={ref}
      className={
        className ? `admin-split-panel ${className}` : "admin-split-panel"
      }
      {...rest}
    >
      {header !== undefined && (
        <div className="admin-split-panel-header">{header}</div>
      )}
      <div className="admin-split-panel-body">{children}</div>
    </section>
  );
});
