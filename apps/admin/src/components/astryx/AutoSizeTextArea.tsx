import React, { useLayoutEffect, useRef, type ComponentProps } from "react";
import { TextArea } from "@astryxdesign/core/TextArea";

/** Document fields grow with their text, including after a narrow-screen reflow. */
export function AutoSizeTextArea(props: ComponentProps<typeof TextArea>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const field = ref.current;
    if (!field) return;
    const fit = () => {
      field.style.height = "auto";
      field.style.height = `${field.scrollHeight}px`;
    };
    fit();
    let width = field.clientWidth;
    const observer = new ResizeObserver(() => {
      if (width === field.clientWidth) return;
      width = field.clientWidth;
      fit();
    });
    observer.observe(field);
    return () => observer.disconnect();
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
