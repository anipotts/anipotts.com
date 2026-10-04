import React, { useLayoutEffect, useRef, type ComponentProps } from "react";
import { TextArea } from "./WritingControls";

/** Document fields grow with their text, including after a narrow-screen reflow. */
export function AutoSizeTextArea(props: ComponentProps<typeof TextArea>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const field = ref.current;
    if (!field) return;
    let disposed = false;
    const fit = () => {
      if (disposed) return;
      field.style.height = "auto";
      const style = getComputedStyle(field);
      const borders =
        style.boxSizing === "border-box"
          ? (parseFloat(style.borderTopWidth) || 0) +
            (parseFloat(style.borderBottomWidth) || 0)
          : 0;
      const padding =
        style.boxSizing === "border-box"
          ? 0
          : (parseFloat(style.paddingTop) || 0) +
            (parseFloat(style.paddingBottom) || 0);
      field.style.height = `${field.scrollHeight + borders - padding}px`;
    };
    fit();
    let width = field.clientWidth;
    const observer = new ResizeObserver(() => {
      if (width === field.clientWidth) return;
      width = field.clientWidth;
      fit();
    });
    observer.observe(field);
    // Font arrival can change wrapping without changing the field width.
    void document.fonts?.ready.then(fit);
    document.fonts?.addEventListener("loadingdone", fit);
    return () => {
      disposed = true;
      observer.disconnect();
      document.fonts?.removeEventListener("loadingdone", fit);
    };
  }, [props.value]);
  return (
    <TextArea
      {...props}
      ref={ref}
      rows={1}
      className={`document-auto-textarea ${props.className ?? ""}`}
    />
  );
}
