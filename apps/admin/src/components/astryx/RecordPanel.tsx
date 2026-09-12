import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutPanel } from "@astryxdesign/core/Layout";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading } from "@astryxdesign/core/Heading";
import { IconButton } from "@astryxdesign/core/IconButton";
import { XIcon } from "@phosphor-icons/react";

export type RecordPanelMode = "inspector" | "drawer" | "sheet";
/** Budget includes the 256px inspector and a comfortable gap around 600px prose. */
export function recordPanelMode(
  viewportWidth: number,
  availableWidth: number,
): RecordPanelMode {
  if (viewportWidth < 768) return "sheet";
  return viewportWidth >= 1280 && availableWidth >= 900
    ? "inspector"
    : "drawer";
}

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** The full workspace region, before subtracting the inspector. */
  containerRef?: RefObject<HTMLElement | null>;
};

/** Mount beside the document in a `data-record-workspace` region when open. */
export function RecordPanel({ title, onClose, children, containerRef }: Props) {
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
      marker.current?.closest<HTMLElement>("[data-record-workspace]") ??
      marker.current?.parentElement;
    const measure = () =>
      setMode(
        recordPanelMode(
          window.innerWidth,
          container?.clientWidth ?? window.innerWidth,
        ),
      );
    measure();
    const observer = new ResizeObserver(measure);
    if (container) observer.observe(container);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [containerRef]);
  useEffect(() => {
    if (mode === "inspector") heading.current?.focus({ preventScroll: true });
  }, [mode, title]);
  return (
    <VStack ref={marker} className="record-panel-host">
      {mode === "inspector" ? (
        <LayoutPanel
          className="record-inspector"
          width="calc(var(--spacing-8) * 8)"
          padding={0}
          role="complementary"
          label={title}
          hasDivider
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
      ) : mode ? (
        <Dialog
          isOpen
          onOpenChange={(open) => {
            if (!open) close.current();
          }}
          purpose="form"
          variant={mode === "sheet" ? "fullscreen" : "standard"}
          width="min(calc(var(--spacing-10) * 10), 100vw)"
          maxHeight="100dvh"
          position={
            mode === "drawer" ? { top: 0, bottom: 0, end: 0 } : undefined
          }
          className="record-panel-dialog"
        >
          <Layout
            height="fill"
            header={
              <DialogHeader
                title={title}
                onOpenChange={(open) => {
                  if (!open) close.current();
                }}
              />
            }
            content={<LayoutContent padding={4}>{children}</LayoutContent>}
          />
        </Dialog>
      ) : null}
    </VStack>
  );
}
