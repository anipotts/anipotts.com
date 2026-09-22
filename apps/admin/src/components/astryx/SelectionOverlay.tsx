import React, { useEffect, useRef, type ReactNode } from "react";
import type { Editor } from "@tiptap/react";
import { VStack } from "@astryxdesign/core/VStack";
import { usePopover } from "@astryxdesign/core/Popover";

/** Astryx owns dismissal and focus trapping; the editor selection supplies the anchor. */
export function SelectionOverlay({
  editor,
  enabled,
  onClose,
  onApply,
  children,
}: {
  editor: Editor | null;
  enabled: boolean;
  onClose: () => void;
  onApply: () => void;
  children: ReactNode;
}) {
  if (!enabled || !editor) return children;
  return (
    <LinkOverlay editor={editor} onClose={onClose} onApply={onApply}>
      {children}
    </LinkOverlay>
  );
}

/** The link panel's width and its gutter: it keeps the page's side gutter
 * on a phone, so it is never clipped at the screen edge. */
const GUTTER = "var(--admin-gutter, var(--spacing-4))";
const PANEL_WIDTH = `min(calc(var(--spacing-10) * 9), calc(100vw - 2 * ${GUTTER}))`;

function LinkOverlay({
  editor,
  onClose,
  onApply,
  children,
}: {
  editor: Editor;
  onClose: () => void;
  onApply: () => void;
  children: ReactNode;
}) {
  const composing = useRef(false);
  const close = useRef(onClose);
  close.current = onClose;
  const popover = usePopover({
    dialogLabel: "Edit link",
    hasCloseButton: false,
    onHide: () => {
      const active = document.activeElement;
      const restoreFocus =
        !active ||
        active === document.body ||
        overlay.current.contentRef.current?.contains(active);
      close.current();
      if (restoreFocus && !editor.isDestroyed)
        editor.commands.focus(undefined, { scrollIntoView: false });
    },
  });
  const overlay = useRef(popover);
  overlay.current = popover;
  const anchor = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const position = () => {
      if (!anchor.current || editor.isDestroyed) return;
      const point = editor.view.coordsAtPos(editor.state.selection.from);
      anchor.current.style.left = `clamp(${GUTTER}, ${point.left}px, calc(100vw - ${GUTTER} - ${PANEL_WIDTH}))`;
      anchor.current.style.top = `clamp(var(--spacing-4), ${point.bottom}px, calc(100dvh - var(--spacing-4)))`;
    };
    position();
    overlay.current.show();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [editor]);
  return (
    <>
      <VStack
        width={0}
        height={0}
        aria-hidden="true"
        style={{
          position: "fixed",
          pointerEvents: "none",
        }}
        ref={(element) => {
          anchor.current = element;
          popover.triggerRef(element);
        }}
      />
      {popover.render(
        <form
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
          onKeyDownCapture={(event) => {
            if (
              event.key === "Enter" &&
              (composing.current ||
                event.nativeEvent.isComposing ||
                event.nativeEvent.keyCode === 229)
            )
              event.preventDefault();
          }}
          onSubmit={(event) => {
            event.preventDefault();
            if (!composing.current) onApply();
          }}
        >
          {children}
        </form>,
        {
          placement: "below",
          alignment: "start",
          className: "editor-link-overlay",
          style: {
            width: PANEL_WIDTH,
            maxHeight: "calc(100dvh - var(--spacing-8))",
            overflowY: "auto",
          },
        },
      )}
    </>
  );
}
