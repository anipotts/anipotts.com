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
 *   scroll on their own. Its header stays pinned while its body scrolls.
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
