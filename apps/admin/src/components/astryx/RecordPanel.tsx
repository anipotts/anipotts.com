import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { BottomSheet } from "@astryxdesign/core/BottomSheet";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutPanel } from "@astryxdesign/core/Layout";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading } from "@astryxdesign/core/Heading";
import { IconButton } from "@astryxdesign/core/IconButton";
import { XIcon } from "@phosphor-icons/react";
import { BREAKPOINT_MIN } from "../../lib/breakpoints";

export type RecordPanelMode = "inspector" | "drawer" | "sheet";
/** The inline inspector needs the 45rem writing measure, its own 16rem and
 * the gap between them. */
const INSPECTOR_BUDGET = 1040;
/** Phones get a sheet. Wider screens get the inline inspector when the main
 * region, not the capped document column, has room for it beside the
 * writing; otherwise a drawer. */
export function recordPanelMode(
  viewportWidth: number,
  availableWidth: number,
): RecordPanelMode {
  if (viewportWidth < BREAKPOINT_MIN.medium) return "sheet";
  return availableWidth >= INSPECTOR_BUDGET ? "inspector" : "drawer";
}

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** The region to measure. Defaults to the page's main region. */
  containerRef?: RefObject<HTMLElement | null>;
  /** `review` never sits inline: a wide dialog, and a tall sheet on phones.
   * Properties and History are half-height sheets on phones. */
  form?: "panel" | "review";
};

/** Mount beside the document in a `data-record-workspace` region when open. */
export function RecordPanel({
  title,
  onClose,
  children,
  containerRef,
  form = "panel",
}: Props) {
  const marker = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [mode, setMode] = useState<RecordPanelMode | null>(null);
  const titleId = useId();
  const currentMode = useRef(mode);
  currentMode.current = mode;
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    return () => {
      // Native modal dialogs own their focus restoration. For a nonmodal panel,
      // restore only when the focus being removed actually belongs to this panel.
      const active = document.activeElement;
      const shouldRestore =
        currentMode.current === "inspector" && marker.current?.contains(active);
      const target = opener.current;
      if (!shouldRestore || !target?.isConnected) return;
      queueMicrotask(() => {
        const now = document.activeElement;
        if (target.isConnected && (now === document.body || now === active))
          target.focus({ preventScroll: true });
      });
    };
  }, []);
  useEffect(() => {
    const container =
      containerRef?.current ??
      marker.current?.closest<HTMLElement>("#astryx-app-shell-main, main") ??
      marker.current?.closest<HTMLElement>("[data-record-workspace]") ??
      marker.current?.parentElement;
    const measure = () => {
      const next = recordPanelMode(
        window.innerWidth,
        container?.clientWidth ?? window.innerWidth,
      );
      setMode(form === "review" && next === "inspector" ? "drawer" : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (container) observer.observe(container);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [containerRef, form]);
  useEffect(() => {
    if (mode === "inspector") heading.current?.focus({ preventScroll: true });
  }, [mode, title]);
  const dismiss = (open: boolean) => {
    if (!open) close.current();
  };
  return (
    <VStack ref={marker} className="record-panel-host">
      {mode === "inspector" ? (
        <LayoutPanel
          className="record-inspector"
          width="calc(var(--spacing-8) * 8)"
          padding={0}
          role="complementary"
          label={title}
          onKeyDown={(event) => {
            if (
              event.key === "Escape" &&
              !event.defaultPrevented &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              event.stopPropagation();
              close.current();
            }
          }}
        >
          <VStack gap={4} padding={4}>
            <HStack gap={2} hAlign="between" vAlign="center">
              <Heading ref={heading} id={titleId} level={2} tabIndex={-1}>
                {title}
              </Heading>
              <IconButton
                label={`Close ${title.toLowerCase()}`}
                tooltip={`Close ${title.toLowerCase()}`}
                size="sm"
                variant="ghost"
                icon={<XIcon size={18} aria-hidden="true" />}
                onClick={onClose}
              />
            </HStack>
            {children}
          </VStack>
        </LayoutPanel>
      ) : mode === "sheet" ? (
        <BottomSheet
          label={title}
          isOpen
          onOpenChange={dismiss}
          purpose="form"
          height={form === "review" ? "tall" : "50dvh"}
          className="record-panel-sheet"
        >
          <VStack gap={4} padding={3}>
            <HStack gap={2} hAlign="between" vAlign="center">
              <Heading level={2} id={titleId}>
                {title}
              </Heading>
              <IconButton
                label={`Close ${title.toLowerCase()}`}
                tooltip={`Close ${title.toLowerCase()}`}
                variant="ghost"
                icon={<XIcon size={18} aria-hidden="true" />}
                onClick={onClose}
              />
            </HStack>
            {children}
          </VStack>
        </BottomSheet>
      ) : mode ? (
        <Dialog
          isOpen
          onOpenChange={dismiss}
          purpose="form"
          variant="standard"
          width={
            form === "review"
              ? "min(64rem, calc(100vw - 2 * var(--admin-gutter, 16px)))"
              : "min(calc(var(--spacing-10) * 10), 100vw)"
          }
          maxHeight="100dvh"
          position={
            form === "review" ? undefined : { top: 0, bottom: 0, end: 0 }
          }
          className={`record-panel-dialog${form === "review" ? " record-review-dialog" : ""}`}
        >
          <Layout
            height="fill"
            header={<DialogHeader title={title} onOpenChange={dismiss} />}
            content={<LayoutContent padding={4}>{children}</LayoutContent>}
          />
        </Dialog>
      ) : null}
    </VStack>
  );
}
