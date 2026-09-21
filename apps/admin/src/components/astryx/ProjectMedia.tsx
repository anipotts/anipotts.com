import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { parseEditorialSource } from "@anipotts/content/editorial/source";
import { ArticleImageUpload } from "./ArticleImageUpload";
import {
  projectMediaPreview,
  type ProjectMediaEdit,
  type ProjectBaseMediaEdit,
} from "../../lib/project-media";

export function ProjectMedia({
  source,
  errors,
  disabled,
  siteUrl,
  onEdit,
  onPendingChange,
  storyIndex,
}: {
  storyIndex?: number;
  source: string;
  errors: Map<string, string>;
  disabled?: boolean;
  siteUrl: string;
  onEdit: (edit: ProjectMediaEdit) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const data = parseEditorialSource(source).data as Record<string, unknown>;
  const identity = (data.identity ?? {}) as Record<string, unknown>;
  const section =
    storyIndex === undefined
      ? undefined
      : ((Array.isArray(data.story) ? data.story[storyIndex] : undefined) as
          Record<string, unknown> | undefined);
  const expectedSection = JSON.stringify(section);
  const mediaLabel =
    storyIndex === undefined ? "Preview" : `Story ${storyIndex + 1} image`;
  const emit = (edit: ProjectBaseMediaEdit) => {
    if (storyIndex === undefined) onEdit(edit);
    else if (section)
      onEdit({ type: "story-media", index: storyIndex, expectedSection, edit });
  };
  const preview = (
    storyIndex === undefined ? data.preview_media : section?.media
  ) as Record<string, unknown> | null | undefined;
  const [busy, setBusy] = useState(false);
  const pending = useRef({ logo: false, preview: false });
  const notify = useRef(onPendingChange);
  notify.current = onPendingChange;
  const blocked = useRef(disabled);
  blocked.current = disabled;
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      notify.current(false);
    };
  }, []);
  const logoPending = useCallback((value: boolean) => {
    pending.current.logo = value;
    setBusy(value || pending.current.preview);
    notify.current(value || pending.current.preview);
  }, []);
  const previewPending = useCallback((value: boolean) => {
    pending.current.preview = value;
    setBusy(value || pending.current.logo);
    notify.current(value || pending.current.logo);
  }, []);
  const status = (field: string) => {
    const path =
      storyIndex === undefined
        ? field
        : field.replace("preview_media", `story.${storyIndex}.media`);
    return errors.has(path)
      ? { type: "error" as const, message: errors.get(path) }
      : undefined;
  };
  const logoSrc = projectMediaPreview(identity.logo_src, siteUrl);
  const previewSrc = projectMediaPreview(preview?.src, siteUrl);
  const upload = (slot: "logo" | "preview", src: string) => {
    if (active.current && !blocked.current) emit({ type: "upload", slot, src });
  };
  return (
    <VStack gap={4}>
      {storyIndex === undefined && (
        <VStack gap={2}>
          <Text>Project logo</Text>
          {logoSrc && (
            <img
              src={logoSrc}
              alt={String(identity.logo_alt ?? "")}
              style={{ maxWidth: 160, maxHeight: 120, objectFit: "contain" }}
            />
          )}
          <ArticleImageUpload
            key={String(identity.logo_src ?? "no-logo")}
            disabled={disabled}
            existingSrc={
              logoSrc && typeof identity.logo_src === "string"
                ? identity.logo_src
                : undefined
            }
            onUploaded={(src) => upload("logo", src)}
            onPendingChange={logoPending}
          />
          {Boolean(identity.logo_src) && (
            <Button
              label="Remove logo"
              variant="ghost"
              size="sm"
              isDisabled={disabled || busy}
              onClick={() => emit({ type: "remove", slot: "logo" })}
            />
          )}
          <TextInput
            label="Logo alt text"
            value={String(identity.logo_alt ?? "")}
            isDisabled={disabled}
            status={status("identity.logo_alt")}
            onChange={(value) => emit({ type: "logo-alt", value })}
          />
        </VStack>
      )}
      <VStack gap={2}>
        <Text>
          {storyIndex === undefined
            ? "Preview media"
            : `Story ${storyIndex + 1} media`}
        </Text>
        {previewSrc && preview?.kind !== "video" && (
          <img
            src={previewSrc}
            alt={String(preview?.alt ?? "")}
            style={{
              maxWidth: "100%",
              maxHeight: 240,
              objectFit: preview?.fit === "contain" ? "contain" : "cover",
            }}
          />
        )}
        {preview?.kind === "video" && (
          <Text>
            Existing video: {String(preview.src ?? "")}. Uploading an image
            replaces this preview.
          </Text>
        )}
        <ArticleImageUpload
          key={String(preview?.src ?? "no-preview")}
          disabled={disabled}
          existingSrc={
            previewSrc &&
            preview?.kind === "image" &&
            typeof preview.src === "string"
              ? preview.src
              : undefined
          }
          onUploaded={(src) => upload("preview", src)}
          onPendingChange={previewPending}
        />
        {preview && (
          <>
            <Button
              label={
                storyIndex === undefined
                  ? "Remove preview"
                  : "Remove story media"
              }
              variant="ghost"
              size="sm"
              isDisabled={disabled || busy}
              onClick={() => emit({ type: "remove", slot: "preview" })}
            />
            <TextInput
              label={`${mediaLabel} alt text`}
              value={String(preview.alt ?? "")}
              isRequired
              isDisabled={disabled}
              status={status("preview_media.alt")}
              onChange={(value) => emit({ type: "preview-alt", value })}
            />
            <TextInput
              label={`${mediaLabel} caption`}
              value={String(preview.caption ?? "")}
              isDisabled={disabled}
              status={status("preview_media.caption")}
              onChange={(value) => emit({ type: "preview-caption", value })}
            />
            <Selector
              label={`${mediaLabel} fit`}
              value={preview.fit === "contain" ? "contain" : "cover"}
              options={[
                { value: "cover", label: "Cover" },
                { value: "contain", label: "Contain" },
              ]}
              isDisabled={disabled}
              status={status("preview_media.fit")}
              onChange={(value) =>
                emit({
                  type: "preview-fit",
                  value: value as "cover" | "contain",
                })
              }
            />
          </>
        )}
      </VStack>
    </VStack>
  );
}
