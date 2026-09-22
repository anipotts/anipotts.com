import { useEffect, type RefObject } from "react";
import type { Editor } from "@tiptap/react";

/**
 * While `active`, keeps `--keyboard-inset` on the root element at the height
 * the on-screen keyboard covers, so a writing toolbar can dock above it. iOS
 * leaves the layout viewport in place and shrinks only the visual viewport,
 * so a fixed bar at bottom 0 would sit behind the keyboard. Browsers without
 * a visual viewport keep the inset at 0.
 */
export function useKeyboardInset(active: boolean) {
  useEffect(() => {
    const viewport =
      typeof window === "undefined" ? null : window.visualViewport;
    if (!active || !viewport) return;
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const covered =
          window.innerHeight - viewport.height - viewport.offsetTop;
        root.style.setProperty(
          "--keyboard-inset",
          `${Math.max(0, Math.round(covered))}px`,
        );
      });
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      root.style.removeProperty("--keyboard-inset");
    };
  }, [active]);
}

/** The room kept between the caret and a docked toolbar's top edge. */
const CARET_CLEARANCE = 8;

/**
 * On a phone the writing toolbar docks over the bottom of the page, above
 * the keyboard. While `editor` has focus and its toolbar (inside `surface`)
 * is docked, the caret is scrolled back above the toolbar whenever it moves
 * or the keyboard resizes the visual viewport. The composer's docked padding
 * (styles/editor.css) leaves the page room to scroll at the end.
 */
export function useCaretAboveDock(
  editor: Editor | null,
  surface: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!editor || typeof window === "undefined") return;
    let frame = 0;
    const keep = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (editor.isDestroyed || !editor.isFocused) return;
        const dock = surface.current?.querySelector<HTMLElement>(
          ".document-editor-toolbar",
        );
        if (!dock || getComputedStyle(dock).position !== "fixed") return;
        const caret = editor.view.coordsAtPos(editor.state.selection.head);
        const limit = dock.getBoundingClientRect().top - CARET_CLEARANCE;
        if (caret.bottom > limit) window.scrollBy(0, caret.bottom - limit);
      });
    };
    editor.on("selectionUpdate", keep);
    editor.on("focus", keep);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", keep);
    return () => {
      cancelAnimationFrame(frame);
      editor.off("selectionUpdate", keep);
      editor.off("focus", keep);
      viewport?.removeEventListener("resize", keep);
    };
  }, [editor, surface]);
}
