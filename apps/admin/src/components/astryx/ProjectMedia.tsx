import React, { useCallback, useEffect, useRef } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { parseEditorialSource } from "@anipotts/content/editorial/source";
import { ArticleImageUpload } from "./ArticleImageUpload";
import {
  projectMediaPreview,
  type ProjectMediaEdit,
} from "../../lib/project-media";

export function ProjectMedia({
  source,
  errors,
  disabled,
  siteUrl,
  onEdit,
  onPendingChange,
}: {
  source: string;
  errors: Map<string, string>;
  disabled?: boolean;
  siteUrl: string;
  onEdit: (edit: ProjectMediaEdit) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const data = parseEditorialSource(source).data as Record<string, unknown>;
  const identity = (data.identity ?? {}) as Record<string, unknown>;
  const preview = data.preview_media as
    Record<string, unknown> | null | undefined;
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
    notify.current(value || pending.current.preview);
  }, []);
  const previewPending = useCallback((value: boolean) => {
    pending.current.preview = value;
    notify.current(value || pending.current.logo);
  }, []);
  const status = (field: string) =>
    errors.has(field)
      ? { type: "error" as const, message: errors.get(field) }
      : undefined;
  const logoSrc = projectMediaPreview(identity.logo_src, siteUrl);
  const previewSrc = projectMediaPreview(preview?.src, siteUrl);
  const upload = (slot: "logo" | "preview", src: string) => {
    if (active.current && !blocked.current)
      onEdit({ type: "upload", slot, src });
  };
  return (
    <VStack gap={4}>
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
          disabled={disabled}
          existingSrc={
            logoSrc && typeof identity.logo_src === "string"
              ? identity.logo_src
              : undefined
          }
          onUploaded={(src) => upload("logo", src)}
          onPendingChange={logoPending}
        />
        <TextInput
          label="Logo alt text"
          value={String(identity.logo_alt ?? "")}
          isDisabled={disabled}
          status={status("identity.logo_alt")}
          onChange={(value) => onEdit({ type: "logo-alt", value })}
        />
      </VStack>
      <VStack gap={2}>
        <Text>Preview media</Text>
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
              label="Preview alt text"
              value={String(preview.alt ?? "")}
              isRequired
              isDisabled={disabled}
              status={status("preview_media.alt")}
              onChange={(value) => onEdit({ type: "preview-alt", value })}
            />
            <TextInput
              label="Preview caption"
              value={String(preview.caption ?? "")}
              isDisabled={disabled}
              status={status("preview_media.caption")}
              onChange={(value) => onEdit({ type: "preview-caption", value })}
            />
            <Selector
              label="Preview fit"
              value={preview.fit === "contain" ? "contain" : "cover"}
              options={[
                { value: "cover", label: "Cover" },
                { value: "contain", label: "Contain" },
              ]}
              isDisabled={disabled}
              status={status("preview_media.fit")}
              onChange={(value) =>
                onEdit({
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
