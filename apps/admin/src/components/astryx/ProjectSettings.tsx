import React from "react";
import { TagInput } from "./TagInput";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { setProjectLink } from "../../lib/project-properties";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import {
  parseEditorialSource,
  setEditorialField,
} from "@anipotts/content/editorial/source";

const choices = [
  ["category", "Category", ["ai", "product", "quant", "music", "other"]],
  ["kind", "Kind", ["experience", "project"]],
  ["status", "Project status", ["live", "wip", "archived"]],
  ["public_state", "Website visibility", ["featured", "listed", "hidden"]],
  ["homepage_placement", "Homepage section", ["experience", "work", "none"]],
  ["catalog_group", "Project group", ["active", "past", "taken_down"]],
] as const;
const labels: Record<string, string> = {
  ai: "AI",
  wip: "In progress",
  taken_down: "Taken down",
  none: "Not on homepage",
  hidden: "Hidden",
  listed: "Listed",
  featured: "Featured",
};
export function ProjectSettings({
  source,
  errors,
  disabled,
  publicationMode,
  onChange,
}: {
  source: string;
  errors: Map<string, string>;
  disabled?: boolean;
  publicationMode?: "legacy" | "maintenance" | "direct";
  onChange: (source: string) => void;
}) {
  const data = parseEditorialSource(source).data as Record<string, unknown>;
  const update = (key: string, value: unknown) =>
    onChange(setEditorialField(source, [key], value));
  const status = (key: string) =>
    errors.has(key)
      ? { type: "error" as const, message: errors.get(key) }
      : undefined;
  return (
    <FormLayout>
      {(
        [
          ["year", "Year"],
          ["role", "Role"],
          ["duration", "Duration"],
        ] as const
      ).map(([key, label]) => (
        <TextInput
          key={key}
          label={label}
          value={String(data[key] ?? "")}
          status={status(key)}
          isDisabled={disabled}
          onChange={(value) => update(key, value)}
        />
      ))}
      {choices.map(([key, label, values]) => (
        <Selector
          key={key}
          label={label}
          value={
            key === "homepage_placement" && data[key] === "making"
              ? "work"
              : String(data[key] ?? "")
          }
          isDisabled={disabled}
          status={status(key)}
          description={
            key === "public_state" && publicationMode === "direct"
              ? "To hide a project from the website, use Unpublish in the document actions. Listed and featured projects can be published after review."
              : key === "status"
                ? "An archived project can remain visible on the website."
                : undefined
          }
          options={values.map((value) => ({
            value,
            label:
              labels[value] ?? value.charAt(0).toUpperCase() + value.slice(1),
            disabled:
              key === "public_state" &&
              value === "hidden" &&
              publicationMode === "direct",
          }))}
          onChange={(value) => update(key, value)}
        />
      ))}
      {(
        [
          ["link_live", "Website link"],
          ["link_repo", "Repository link"],
        ] as const
      ).map(([key, label]) => (
        <TextInput
          key={key}
          label={label}
          value={String(data[key] ?? "")}
          status={status(key)}
          isDisabled={disabled}
          onChange={(value) => onChange(setProjectLink(source, key, value))}
        />
      ))}
      {(
        [
          ["homepage_order", "Homepage order"],
          ["sort_order", "Catalog order"],
        ] as const
      ).map(([key, label]) => (
        <NumberInput
          key={key}
          label={label}
          value={typeof data[key] === "number" ? data[key] : 0}
          isDisabled={disabled}
          status={status(key)}
          onChange={(value) => update(key, value)}
        />
      ))}
      <TagInput
        value={data.tags}
        disabled={disabled}
        error={errors.get("tags")}
        onChange={(tags) => update("tags", tags)}
      />
      <Text color="secondary">
        Changes stay private until you review and publish them.
      </Text>
    </FormLayout>
  );
}
