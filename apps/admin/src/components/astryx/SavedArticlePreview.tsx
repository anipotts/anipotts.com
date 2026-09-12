import React, { useEffect, useId, useRef, useState } from "react";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { VStack } from "@astryxdesign/core/VStack";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import {
  previewStatusType,
  type PreviewStatus,
} from "../../lib/preview-status";
const failures = {
  unavailable:
    "The preview could not load. Retry, or return to editing to check your session.",
  stale:
    "This preview no longer matches the saved draft. Return to editing and reopen Preview.",
  "invalid-source": "Correct the draft source before previewing.",
  "source-only":
    "Review this content in Source. A visual preview is unavailable for these changes.",
};
/** The sandboxed frame must identify this exact navigation before its status or size is trusted. */
export function SavedArticlePreview({
  src,
  title,
}: {
  src: string;
  title: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const id = useId();
  const [attempt, setAttempt] = useState(0);
  const request = `${id}:${src}:${attempt}`;
  const separator = src.includes("?") ? "&" : "?";
  const frameSrc = `${src}${separator}previewRequest=${encodeURIComponent(request)}`;
  const [result, setResult] = useState<{
    request: string;
    status: PreviewStatus | "loading";
  }>({ request, status: "loading" });
  const status = result.request === request ? result.status : "loading";
  const [height, setHeight] = useState(800);
  useEffect(() => {
    setHeight(800);
    setResult({ request, status: "loading" });
    const timeout = window.setTimeout(
      () =>
        setResult((current) =>
          current.request === request && current.status === "loading"
            ? { request, status: "unavailable" }
            : current,
        ),
      15000,
    );
    const receive = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.request !== request
      )
        return;
      if (event.data.type === previewStatusType) {
        const next = event.data.status;
        if (
          typeof next === "string" &&
          (next === "ready" || Object.hasOwn(failures, next))
        ) {
          window.clearTimeout(timeout);
          setResult({ request, status: next as PreviewStatus });
        }
      } else if (event.data.type === "editorial-preview-size") {
        const next = event.data.height;
        if (
          typeof next === "number" &&
          Number.isFinite(next) &&
          next >= 100 &&
          next <= 100000
        )
          setHeight(Math.ceil(next));
      }
    };
    window.addEventListener("message", receive);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", receive);
    };
  }, [request]);
  return (
    <VStack gap={3}>
      {status === "loading" && (
        <VStack gap={3}>
          <Text role="status" aria-live="polite">
            Loading preview…
          </Text>
          <VStack gap={3} aria-hidden="true">
            <Skeleton width="70%" height="var(--spacing-10)" />
            <Skeleton height="var(--spacing-6)" />
            <Skeleton height="calc(var(--spacing-10) * 6)" />
            <Skeleton height="var(--spacing-6)" />
          </VStack>
        </VStack>
      )}
      {status !== "loading" && status !== "ready" && (
        <VStack gap={2}>
          <Banner
            status="error"
            title="Preview unavailable"
            description={failures[status]}
          />
          <Button
            label="Retry preview"
            size="sm"
            variant="secondary"
            onClick={() => setAttempt((current) => current + 1)}
          />
        </VStack>
      )}
      <iframe
        ref={frame}
        src={frameSrc}
        title={title}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        className="document-preview"
        aria-busy={status === "loading"}
        hidden={status !== "ready"}
        style={{ height, display: status === "ready" ? undefined : "none" }}
      />
    </VStack>
  );
}
