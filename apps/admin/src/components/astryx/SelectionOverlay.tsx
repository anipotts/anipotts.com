import React, { useEffect, useRef, type ReactNode } from "react";
import type { Editor } from "@tiptap/react";
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
  const anchor = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const position = () => {
      if (!anchor.current || editor.isDestroyed) return;
      const point = editor.view.coordsAtPos(editor.state.selection.from);
      anchor.current.style.left = `${Math.max(16, Math.min(point.left, window.innerWidth - 16))}px`;
      anchor.current.style.top = `${Math.max(16, Math.min(point.bottom, window.innerHeight - 16))}px`;
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
      <span
        aria-hidden="true"
        style={{
          position: "fixed",
          width: 1,
          height: 1,
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
          offset: 8,
          className: "editor-link-overlay",
          style: {
            width: "min(360px, calc(100vw - 32px))",
            maxHeight: "calc(100dvh - 32px)",
            overflowY: "auto",
          },
        },
      )}
    </>
  );
}
