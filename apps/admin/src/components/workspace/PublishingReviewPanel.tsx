import React, { useLayoutEffect, useRef, useId, type ReactNode } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading } from "@astryxdesign/core/Heading";
import { IconButton } from "../astryx/WritingControls";
import { XIcon } from "@phosphor-icons/react";

/** A sibling in the record layout, never a portal or modal. The editor stays
 * mounted and operable while this region reviews an immutable saved revision. */
export function PublishingReviewPanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  useLayoutEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    heading.current?.focus({ preventScroll: true });
    return () => {
      const active = document.activeElement;
      if (!panel.current?.contains(active) || !opener?.isConnected) return;
      queueMicrotask(() => {
        if (
          opener.isConnected &&
          (document.activeElement === document.body ||
            document.activeElement === active)
        )
          opener.focus({ preventScroll: true });
      });
    };
  }, []);
  return (
    <VStack
      ref={panel}
      className="publishing-review-panel"
      gap={4}
      role="complementary"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          !event.defaultPrevented &&
          !event.nativeEvent.isComposing
        ) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <HStack gap={2} hAlign="between" vAlign="center">
        <Heading ref={heading} id={titleId} level={2} tabIndex={-1}>
          {title}
        </Heading>
        <IconButton
          label="Close review changes"
          tooltip="Back to editor"
          variant="ghost"
          size="sm"
          icon={<XIcon aria-hidden="true" />}
          onClick={onClose}
        />
      </HStack>
      {children}
    </VStack>
  );
}
