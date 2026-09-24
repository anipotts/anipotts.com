import React, { useCallback, useEffect, useRef, useState } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Heading } from "@astryxdesign/core/Heading";
import { IconButton } from "@astryxdesign/core/IconButton";
import { XIcon } from "@phosphor-icons/react";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { parseEditorialSource } from "@anipotts/content/editorial/source";
import { ArticleImageUpload } from "./ArticleImageUpload";
import {
  projectMediaPreview,
  projectIconOptions,
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
        <VStack gap={4}>
          <Heading level={2} className="editor-sections-title">
            Project logo
          </Heading>
          <Selector
            label="Fallback icon"
            value={String(identity.icon ?? "")}
            options={[
              ...projectIconOptions,
              ...(identity.icon &&
              !projectIconOptions.some(
                (option) => option.value === identity.icon,
              )
                ? [
                    {
                      value: String(identity.icon),
                      label: `Current: ${String(identity.icon)}`,
                    },
                  ]
                : []),
            ]}
            isDisabled={disabled || busy}
            status={status("identity.icon")}
            onChange={(value) => emit({ type: "icon", value })}
          />
          {logoSrc && (
            <HStack gap={2} vAlign="center" className="editor-media-row">
              <img
                src={logoSrc}
                alt={String(identity.logo_alt ?? "")}
                className="editor-media-thumb"
                data-fit="contain"
              />
              <IconButton
                label="Remove logo"
                tooltip="Remove logo"
                variant="ghost"
                size="sm"
                icon={<XIcon weight="regular" aria-hidden="true" />}
                isDisabled={disabled || busy}
                onClick={() => emit({ type: "remove", slot: "logo" })}
              />
            </HStack>
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
            <Selector
              label="Logo theme treatment"
              value={String(identity.logo_tone ?? "default")}
              options={[
                { value: "default", label: "Original colors" },
                { value: "light", label: "Light mark" },
                { value: "adaptive", label: "Adapt to theme" },
              ]}
              isDisabled={disabled}
              status={status("identity.logo_tone")}
              onChange={(value) =>
                emit({
                  type: "logo-tone",
                  value: value as "default" | "light" | "adaptive",
                })
              }
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
        <Heading level={2} className="editor-sections-title">
          {storyIndex === undefined
            ? "Preview media"
            : `Story ${storyIndex + 1} media`}
        </Heading>
        {preview && (
          <HStack gap={2} vAlign="center" className="editor-media-row">
            {previewSrc && preview.kind !== "video" ? (
              <img
                src={previewSrc}
                alt={String(preview.alt ?? "")}
                className="editor-media-thumb"
                data-fit={preview.fit === "contain" ? "contain" : "cover"}
              />
            ) : (
              <Text
                type="supporting"
                color="secondary"
                className="editor-address-path"
              >
                {String(preview.src ?? "")}
              </Text>
            )}
            <IconButton
              label={
                storyIndex === undefined
                  ? "Remove preview"
                  : "Remove story media"
              }
              tooltip="Remove"
              variant="ghost"
              size="sm"
              icon={<XIcon weight="regular" aria-hidden="true" />}
              isDisabled={disabled || busy}
              onClick={() => emit({ type: "remove", slot: "preview" })}
            />
          </HStack>
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
            <TextInput
              label={`${mediaLabel} alt text`}
              value={String(preview.alt ?? "")}
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
