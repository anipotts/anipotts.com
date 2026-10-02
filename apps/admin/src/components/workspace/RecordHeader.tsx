import React, { type ReactNode } from "react";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";

/** The record's identity stays between navigation and actions in every workspace.
 * Owners provide their status and actions; this component never infers approval,
 * freshness or permission from the presence of a record. */
export function RecordHeader({
  title,
  level = 2,
  leading,
  status,
  actions,
  className = "",
  titleClassName = "",
  headingClassName,
  titleContent,
  children,
}: {
  title: string;
  level?: 1 | 2;
  leading?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  className?: string;
  titleClassName?: string;
  headingClassName?: string;
  titleContent?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <HStack
      gap={2}
      vAlign="center"
      className={`workspace-record-header ${className}`}
    >
      {leading}
      <HStack className={`workspace-record-heading ${titleClassName}`}>
        <Heading level={level} className={headingClassName}>
          <span title={title}>{titleContent ?? title}</span>
        </Heading>
      </HStack>
      {status}
      {actions}
      {children}
    </HStack>
  );
}
