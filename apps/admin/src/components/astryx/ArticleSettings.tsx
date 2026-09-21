import React from "react";
import { ArticleDate } from "./ArticleDate";
import { TagInput } from "./TagInput";
import { Selector } from "@astryxdesign/core/Selector";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Text } from "@astryxdesign/core/Text";
import { Collapsible, CollapsibleGroup } from "@astryxdesign/core/Collapsible";
import {
  parseEditorialSource,
  setEditorialField,
} from "@anipotts/content/editorial/source";

export function ArticleSettings({
  source,
  id,
  disabled,
  onChange,
  errors,
  disclosure = true,
  publicationMode = "legacy",
}: {
  disclosure?: boolean;
  publicationMode?: "legacy" | "maintenance" | "direct";
  errors: Map<string, string>;
  source: string;
  id: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const data = parseEditorialSource(source).data as Record<string, unknown>;
  const fieldStatus = (name: string) =>
    errors.has(name)
      ? { type: "error" as const, message: errors.get(name) }
      : undefined;
  const update = (name: string, value: unknown) =>
    onChange(setEditorialField(source, [name], value));
  const fields = (
    <FormLayout>
      <Selector
        label="Type"
        value={
          typeof data.content_type === "string" ? data.content_type : "article"
        }
        status={fieldStatus("content_type")}
        isDisabled={disabled}
        options={[
          { value: "article", label: "Article" },
          { value: "note", label: "Note" },
          { value: "playbook", label: "Playbook" },
        ]}
        onChange={(value) => update("content_type", value)}
      />
      <Selector
        label="Visibility after publication"
        value={typeof data.status === "string" ? data.status : "draft"}
        status={fieldStatus("status")}
        isDisabled={disabled}
        description={
          publicationMode === "direct"
            ? "Only visible publication is supported. Scheduling and unpublishing are unavailable. Your draft stays private until you approve publication."
            : "Changes take effect only after you approve publication."
        }
        options={[
          {
            value: "draft",
            label: "Draft, hidden from the website",
            disabled: publicationMode === "direct",
          },
          {
            value: "published",
            label: "Published, visible on the website",
          },
          {
            value: "scheduled",
            label: "Scheduled",
            disabled: publicationMode === "direct",
          },
        ]}
        onChange={(value) => {
          let next = setEditorialField(source, ["status"], value);
          if (value === "published" && !data.published_at)
            next = setEditorialField(
              next,
              ["published_at"],
              new Date().toISOString(),
            );
          onChange(next);
        }}
      />
      {(data.status === "published" || data.status === "scheduled") && (
        <ArticleDate
          label={
            data.status === "scheduled" ? "Scheduled date" : "Publication date"
          }
          value={
            data.status === "scheduled" ? data.scheduled_at : data.published_at
          }
          error={errors.get(
            data.status === "scheduled" ? "scheduled_at" : "published_at",
          )}
          disabled={disabled}
          onChange={(value) =>
            update(
              data.status === "scheduled" ? "scheduled_at" : "published_at",
              value,
            )
          }
        />
      )}
      <TagInput
        value={data.tags}
        disabled={disabled}
        error={errors.get("tags")}
        onChange={(tags) => update("tags", tags)}
      />
      <Text color="secondary">
        Address: /writing/
        {typeof data.slug === "string" && data.slug ? data.slug : id}
      </Text>
    </FormLayout>
  );
  return disclosure ? (
    <CollapsibleGroup type="multiple">
      <Collapsible value="article-details" trigger="Properties">
        {fields}
      </Collapsible>
    </CollapsibleGroup>
  ) : (
    fields
  );
}
