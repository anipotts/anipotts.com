import React from "react";
import { ArticleDate } from "./ArticleDate";
import { TagInput } from "./TagInput";
import { Selector } from "@astryxdesign/core/Selector";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { CopySimpleIcon, GlobeSimpleIcon } from "@phosphor-icons/react";
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
  publicUrl,
}: {
  /** The live page, when the article is on the site. */
  publicUrl?: string;
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
      <Address
        path={`/writing/${typeof data.slug === "string" && data.slug ? data.slug : id}`}
        publicUrl={publicUrl}
      />
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

/** The article's address in the code face, clipped with an ellipsis, with
 * copy and, once it is live, open. */
function Address({ path, publicUrl }: { path: string; publicUrl?: string }) {
  const address = publicUrl ?? `https://anipotts.com${path}`;
  return (
    <VStack gap={1}>
      <Text type="label">Address</Text>
      <HStack gap={1} vAlign="center" className="editor-address">
        <code className="editor-address-path" title={path}>
          {path}
        </code>
        <IconButton
          label="Copy address"
          tooltip="Copy address"
          variant="ghost"
          size="sm"
          icon={<CopySimpleIcon weight="regular" aria-hidden="true" />}
          onClick={() => void navigator.clipboard?.writeText(address)}
        />
        {publicUrl && (
          <IconButton
            label="Open on site"
            tooltip="Open on site"
            variant="ghost"
            size="sm"
            icon={<GlobeSimpleIcon weight="regular" aria-hidden="true" />}
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
          />
        )}
      </HStack>
    </VStack>
  );
}
