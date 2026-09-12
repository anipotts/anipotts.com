import React, { useEffect, useRef, useState } from "react";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Button } from "@astryxdesign/core/Button";
import { VStack } from "@astryxdesign/core/VStack";
import {
  editorialMediaId,
  editorialMediaPrefix,
  editorialImagePreview,
} from "../../lib/editorial-media";

import { ArticleImageCrop } from "./ArticleImageCrop";

function fileBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Couldn’t read this image."));
    reader.readAsDataURL(file);
  });
}

export async function uploadEditorialImage(file: Blob): Promise<string> {
  if (file.size > 10 * 1024 * 1024)
    throw new Error(
      "This image exceeds 10 MB. Choose a smaller crop or image.",
    );
  const csrfResponse = await fetch("/api/editorial/csrf", {
    signal: AbortSignal.timeout(15000),
  });
  if (!csrfResponse.ok)
    throw new Error(
      "Your session needs refreshing. Your selected image is retained.",
    );
  const { csrf } = await csrfResponse.json();
  const response = await fetch("/api/editorial/media", {
    method: "POST",
    signal: AbortSignal.timeout(60000),
    headers: { "Content-Type": "application/json", "X-Editorial-CSRF": csrf },
    body: JSON.stringify({ base64: await fileBase64(file) }),
  });
  if (!response.ok) throw new Error("Couldn’t save the image. Try again.");
  const result = await response.json();
  if (!result.ok || !editorialMediaId.test(result.media?.id))
    throw new Error("Couldn’t save the image. Try again.");
  return editorialMediaPrefix + result.media.id;
}

export function ArticleImageUpload({
  disabled,
  onUploaded,
  onPendingChange,
  initialFile,
  existingSrc,
  startCropping = false,
}: {
  disabled?: boolean;
  onUploaded: (src: string) => void;
  onPendingChange: (pending: boolean) => void;
  initialFile?: File | null;
  existingSrc?: string;
  startCropping?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [cropping, setCropping] = useState(false);
  const [original, setOriginal] = useState("");
  useEffect(() => {
    if (
      !existingSrc?.startsWith(editorialMediaPrefix) ||
      initialFile ||
      disabled
    )
      return;
    const controller = new AbortController();
    setBusy(true);
    fetch(editorialImagePreview(existingSrc), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "Couldn’t load this image. Choose its original file to crop it.",
          );
        const blob = await response.blob();
        if (blob.size > 10 * 1024 * 1024)
          throw new Error("Choose an image smaller than 10 MB.");
        if (controller.signal.aborted) return;
        setFile(new File([blob], "original-image", { type: blob.type }));
        setOriginal(existingSrc);
        setCropping(startCropping);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [existingSrc, initialFile, disabled, startCropping]);
  useEffect(() => {
    if (initialFile && !disabled) {
      setFile(initialFile);
      void upload(initialFile);
    }
  }, [initialFile, disabled]);
  useEffect(() => {
    onPendingChange(busy || cropping);
  }, [busy, cropping, onPendingChange]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);
  async function upload(selected: File) {
    if (pending.current || disabled) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const decoded = await createImageBitmap(selected);
      decoded.close();
      const src = await uploadEditorialImage(selected);
      if (!mounted.current) return;
      setOriginal(src);
      onUploaded(src);
    } catch (error) {
      if (!mounted.current) return;
      setError(
        error instanceof Error
          ? error.message
          : "Couldn’t save the image. Try again.",
      );
    } finally {
      if (mounted.current) setBusy(false);
      pending.current = false;
    }
  }
  return (
    <VStack gap={2}>
      <FileInput
        label="Upload image"
        value={file}
        mode="dropzone"
        description="JPEG, PNG or WebP, up to 10 MB. Uploaded images stay private until publication. Cropping keeps your original."
        accept="image/jpeg,image/png,image/webp"
        maxSize={10 * 1024 * 1024}
        isDisabled={disabled || busy || cropping}
        isLoading={busy}
        status={error ? { type: "error", message: error } : undefined}
        onChange={(value) => {
          const selected = Array.isArray(value) ? (value[0] ?? null) : value;
          setFile(selected);
          setOriginal("");
          setCropping(false);
          setError("");
          if (selected) void upload(selected);
        }}
      />
      {file && original && !cropping && (
        <Button
          label="Crop image"
          variant="secondary"
          size="sm"
          isDisabled={disabled || busy}
          onClick={() => setCropping(true)}
        />
      )}
      {file && cropping && (
        <ArticleImageCrop
          file={file}
          busy={busy}
          onCancel={() => setCropping(false)}
          onApply={async (blob) => {
            if (pending.current || disabled) return;
            pending.current = true;
            setBusy(true);
            try {
              const src = await uploadEditorialImage(blob);
              if (!mounted.current) return;
              onUploaded(src);
              setCropping(false);
            } finally {
              pending.current = false;
              if (mounted.current) setBusy(false);
            }
          }}
        />
      )}
      {error && file && (
        <Button
          label="Retry image upload"
          variant="secondary"
          size="sm"
          isDisabled={disabled || busy || cropping}
          onClick={() => void upload(file)}
        />
      )}
    </VStack>
  );
}
