import React from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Heading } from "@astryxdesign/core/Heading";
import {
  CaretDownIcon,
  CaretUpIcon,
  PlusIcon,
  XIcon,
} from "@phosphor-icons/react";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { parseEditorialSource } from "@anipotts/content/editorial/source";
import type { ProjectSectionEdit } from "../../lib/project-sections";

/** Move and remove controls: glyphs named by their label and tooltip. */
function RowAction({
  label,
  icon,
  isDisabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  isDisabled?: boolean;
  onClick: () => void;
}) {
  return (
    <IconButton
      label={label}
      tooltip={label}
      size="sm"
      variant="ghost"
      icon={icon}
      isDisabled={isDisabled}
      onClick={onClick}
    />
  );
}
const up = <CaretUpIcon weight="regular" aria-hidden="true" />;
const down = <CaretDownIcon weight="regular" aria-hidden="true" />;
const remove = <XIcon weight="regular" aria-hidden="true" />;
const plus = <PlusIcon weight="regular" aria-hidden="true" />;

export function ProjectSections({
  source,
  errors = new Map(),
  disabled,
  onEdit,
}: {
  source: string;
  errors?: Map<string, string>;
  disabled?: boolean;
  onEdit: (edit: ProjectSectionEdit) => void;
}) {
  const data = parseEditorialSource(source).data as Record<string, unknown>;
  const status = (path: string) =>
    errors.has(path)
      ? { type: "error" as const, message: errors.get(path) }
      : undefined;
  return (
    <VStack gap={2} className="editor-sections">
      <Heading level={2} className="editor-sections-title">
        Sections
      </Heading>
      {(["story", "technical"] as const).map((kind) => {
        const entries = Array.isArray(data[kind])
          ? (data[kind] as Array<{ title?: string; paragraphs?: string[] }>)
          : [];
        // An empty kind draws nothing, so it adds no gap under the heading.
        if (!entries.length) return null;
        return (
          <VStack key={kind} gap={1}>
            {entries.map((entry, index) => (
              <HStack key={index} gap={1} wrap="wrap" vAlign="center">
                <Text className="editor-section-name">
                  {(typeof entry?.title === "string" && entry.title) ||
                    `${kind === "story" ? "Story" : "Technical"} ${index + 1}`}
                </Text>
                {index > 0 && (
                  <RowAction
                    label={`Move ${kind} ${index + 1} up`}
                    icon={up}
                    isDisabled={disabled}
                    onClick={() =>
                      onEdit({ type: "move", kind, index, direction: -1 })
                    }
                  />
                )}
                {index < entries.length - 1 && (
                  <RowAction
                    label={`Move ${kind} ${index + 1} down`}
                    icon={down}
                    isDisabled={disabled}
                    onClick={() =>
                      onEdit({ type: "move", kind, index, direction: 1 })
                    }
                  />
                )}
                <RowAction
                  label={`Remove ${kind} section ${index + 1}`}
                  icon={remove}
                  isDisabled={disabled}
                  onClick={() => onEdit({ type: "remove", kind, index })}
                />
                {kind === "story" &&
                  Array.isArray(entry?.paragraphs) &&
                  entry.paragraphs.length > 1 &&
                  entry.paragraphs.map((_, paragraph) => (
                    <Button
                      key={paragraph}
                      label={`Remove story ${index + 1} paragraph ${paragraph + 1}`}
                      children={`Remove paragraph ${paragraph + 1}`}
                      size="sm"
                      variant="ghost"
                      isDisabled={disabled}
                      onClick={() =>
                        onEdit({ type: "remove-paragraph", index, paragraph })
                      }
                    />
                  ))}
                {kind === "story" && entry && typeof entry === "object" && (
                  <Button
                    label="Add paragraph"
                    size="sm"
                    variant="ghost"
                    isDisabled={disabled}
                    onClick={() => onEdit({ type: "paragraph", index })}
                  />
                )}
              </HStack>
            ))}
          </VStack>
        );
      })}
      <HStack className="editor-add-row">
        <DropdownMenu
          button={{
            label: "Add section",
            icon: plus,
            size: "sm",
            variant: "ghost",
            isDisabled: disabled,
          }}
          hasChevron={false}
          items={[
            {
              label: "Story section",
              onClick: () => onEdit({ type: "add", kind: "story" }),
            },
            {
              label: "Technical section",
              onClick: () => onEdit({ type: "add", kind: "technical" }),
            },
          ]}
        />
      </HStack>
      <Heading level={2} className="editor-sections-title">
        Roadmap
      </Heading>
      {(Array.isArray(data.roadmap)
        ? (data.roadmap as Array<{ text?: string; status?: string }>)
        : []
      ).map((item, index, items) => (
        <VStack key={index} gap={1}>
          {(!item || typeof item !== "object") && (
            <Text color="secondary">Malformed item</Text>
          )}
          <TextInput
            label={`Roadmap item ${index + 1}`}
            value={typeof item?.text === "string" ? item.text : ""}
            status={status(`roadmap.${index}.text`)}
            isDisabled={disabled || !item || typeof item !== "object"}
            onChange={(value) =>
              onEdit({ type: "roadmap-field", index, field: "text", value })
            }
          />
          <HStack gap={1} wrap="wrap" vAlign="center">
            <Selector
              label={`Roadmap item ${index + 1} status`}
              value={typeof item?.status === "string" ? item.status : ""}
              status={status(`roadmap.${index}.status`)}
              options={[
                { value: "planned", label: "Planned" },
                { value: "in-progress", label: "In progress" },
                { value: "done", label: "Done" },
              ]}
              isDisabled={disabled || !item || typeof item !== "object"}
              onChange={(value) =>
                onEdit({ type: "roadmap-field", index, field: "status", value })
              }
            />
            {index > 0 && (
              <RowAction
                label={`Move roadmap item ${index + 1} up`}
                icon={up}
                isDisabled={disabled}
                onClick={() =>
                  onEdit({
                    type: "move",
                    kind: "roadmap",
                    index,
                    direction: -1,
                  })
                }
              />
            )}
            {index < items.length - 1 && (
              <RowAction
                label={`Move roadmap item ${index + 1} down`}
                icon={down}
                isDisabled={disabled}
                onClick={() =>
                  onEdit({ type: "move", kind: "roadmap", index, direction: 1 })
                }
              />
            )}
            <RowAction
              label={`Remove roadmap item ${index + 1}`}
              icon={remove}
              isDisabled={disabled}
              onClick={() => onEdit({ type: "remove", kind: "roadmap", index })}
            />
          </HStack>
        </VStack>
      ))}
      <HStack className="editor-add-row">
        <Button
          label="Add roadmap item"
          icon={plus}
          size="sm"
          variant="ghost"
          isDisabled={disabled}
          onClick={() => onEdit({ type: "add", kind: "roadmap" })}
        />
      </HStack>
    </VStack>
  );
}
