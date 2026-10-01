import React from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
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

type SectionKind = "story" | "technical";
type SectionEntry = { title?: string; paragraphs?: unknown[] };
type SectionControlsProps = {
  disabled?: boolean;
  onEdit: (edit: ProjectSectionEdit) => void;
};

function SectionActions({
  kind,
  index,
  count,
  disabled,
  onEdit,
}: SectionControlsProps & { kind: SectionKind; index: number; count: number }) {
  return (
    <HStack gap={1} wrap="wrap" vAlign="center" hAlign="between">
      <Text weight="semibold">
        {kind === "story" ? "Story" : "Technical section"} {index + 1}
      </Text>
      <HStack gap={0} vAlign="center">
        {index > 0 && (
          <RowAction
            label={`Move ${kind} ${index + 1} up`}
            icon={up}
            isDisabled={disabled}
            onClick={() => onEdit({ type: "move", kind, index, direction: -1 })}
          />
        )}
        {index < count - 1 && (
          <RowAction
            label={`Move ${kind} ${index + 1} down`}
            icon={down}
            isDisabled={disabled}
            onClick={() => onEdit({ type: "move", kind, index, direction: 1 })}
          />
        )}
        <RowAction
          label={`Remove ${kind} section ${index + 1}`}
          icon={remove}
          isDisabled={disabled}
          onClick={() => onEdit({ type: "remove", kind, index })}
        />
      </HStack>
    </HStack>
  );
}

/** Place controls beside the field they modify, rather than in a second list. */
export function ProjectFieldControls({
  data,
  path,
  position,
  disabled,
  onEdit,
}: SectionControlsProps & {
  data: Record<string, unknown>;
  path: string[];
  position: "before" | "after";
}) {
  const [kind, sectionIndex, field, paragraphIndex] = path;
  if (kind !== "story" && kind !== "technical") return null;
  const entries = data[kind];
  if (!Array.isArray(entries)) return null;
  const index = Number(sectionIndex);
  if (!Number.isInteger(index) || index < 0 || index >= entries.length)
    return null;
  const entry = entries[index] as SectionEntry | null;
  if (!entry || typeof entry !== "object") return null;
  if (position === "before" && field === "title")
    return (
      <SectionActions
        kind={kind}
        index={index}
        count={entries.length}
        disabled={disabled}
        onEdit={onEdit}
      />
    );
  if (position !== "after" || kind !== "story") return null;
  if (!Array.isArray(entry.paragraphs)) return null;
  const paragraphs = entry.paragraphs;
  const paragraph = Number(paragraphIndex);
  const isParagraph =
    field === "paragraphs" &&
    Number.isInteger(paragraph) &&
    paragraph >= 0 &&
    paragraph < paragraphs.length;
  const lastEditableParagraph = paragraphs.findLastIndex(
    (value) => typeof value === "string",
  );
  const canAdd =
    (isParagraph && paragraph === lastEditableParagraph) ||
    (field === "title" && lastEditableParagraph === -1);
  if (!isParagraph && !canAdd) return null;
  return (
    <HStack gap={1} wrap="wrap" vAlign="center">
      {isParagraph && paragraphs.length > 1 && (
        <Button
          label={`Remove story ${index + 1} paragraph ${paragraph + 1}`}
          size="sm"
          variant="ghost"
          isDisabled={disabled}
          onClick={() => onEdit({ type: "remove-paragraph", index, paragraph })}
        >
          Remove paragraph
        </Button>
      )}
      {canAdd && (
        <Button
          label={`Add paragraph to story ${index + 1}`}
          icon={plus}
          size="sm"
          variant="ghost"
          isDisabled={disabled}
          onClick={() => onEdit({ type: "paragraph", index })}
        >
          Add paragraph
        </Button>
      )}
    </HStack>
  );
}

export function ProjectSections({
  source,
  errors = new Map(),
  disabled,
  onEdit,
}: SectionControlsProps & {
  source: string;
  errors?: Map<string, string>;
}) {
  const data = parseEditorialSource(source).data as Record<string, unknown>;
  const status = (path: string) =>
    errors.has(path)
      ? { type: "error" as const, message: errors.get(path) }
      : undefined;
  return (
    <VStack gap={2} className="editor-sections">
      {(["story", "technical"] as const).map((kind) => {
        const entries = Array.isArray(data[kind]) ? data[kind] : [];
        // Entries without fields must still have a repair/removal path.
        return entries.map((entry, index) =>
          !entry || typeof entry !== "object" ? (
            <SectionActions
              key={`${kind}-${index}`}
              kind={kind}
              index={index}
              count={entries.length}
              disabled={disabled}
              onEdit={onEdit}
            />
          ) : null,
        );
      })}
      <HStack gap={1} wrap="wrap" className="editor-add-row">
        {(["story", "technical"] as const).map((kind) => (
          <Button
            key={kind}
            label={`Add ${kind} section`}
            icon={plus}
            size="sm"
            variant="ghost"
            isDisabled={disabled}
            onClick={() => onEdit({ type: "add", kind })}
          />
        ))}
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
