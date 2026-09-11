import { useEffect, useRef, useState } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { Text } from "@astryxdesign/core/Text";
import { writingId, validWritingId } from "../../lib/writing-draft";

export function NewWriting() {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [customSlug, setCustomSlug] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [restored, setRestored] = useState(false);
  const [recoveryFailed, setRecoveryFailed] = useState(false);
  const recoveryKey = "editorial:new-writing";
  const request = useRef<{ key: string; id: string } | null>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(recoveryKey) ?? "null");
      if (
        saved &&
        typeof saved.title === "string" &&
        typeof saved.slug === "string"
      ) {
        setTitle(saved.title);
        setSlug(saved.slug);
        setCustomSlug(saved.customSlug === true);
        if (
          saved.request &&
          typeof saved.request.key === "string" &&
          typeof saved.request.id === "string"
        )
          request.current = saved.request;
      }
    } catch {
      setRecoveryFailed(true);
    }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(
        recoveryKey,
        JSON.stringify({ title, slug, customSlug, request: request.current }),
      );
      setRecoveryFailed(false);
    } catch {
      setRecoveryFailed(true);
    }
  }, [title, slug, customSlug, restored]);
  useEffect(() => {
    if (!recoveryFailed || (!title && !slug)) return;
    const preventLoss = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [recoveryFailed, title, slug]);
  const valid =
    restored &&
    Boolean(title.trim()) &&
    title.length <= 300 &&
    validWritingId(slug);
  async function create() {
    if (!valid || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const key = JSON.stringify([title.trim(), slug]);
    if (request.current?.key !== key)
      request.current = { key, id: crypto.randomUUID() };
    try {
      try {
        sessionStorage.setItem(
          recoveryKey,
          JSON.stringify({ title, slug, customSlug, request: request.current }),
        );
      } catch {
        setRecoveryFailed(true);
      }
      const csrfResponse = await fetch("/api/editorial/csrf", {
        signal: AbortSignal.timeout(15000),
      });
      if (!csrfResponse.ok)
        throw new Error(
          "Your session needs refreshing. Your title is still here.",
        );
      const { csrf } = await csrfResponse.json();
      const response = await fetch(
        `/api/editorial/create?kind=writing&id=${encodeURIComponent(slug)}`,
        {
          method: "POST",
          signal: AbortSignal.timeout(15000),
          headers: {
            "Content-Type": "application/json",
            "X-Editorial-CSRF": csrf,
          },
          body: JSON.stringify({
            title: title.trim(),
            expectedRevision: 0,
            requestId: request.current.id,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.ok)
        throw new Error(
          response.status === 409
            ? "An article already uses this address. Choose another address or open it from Writing."
            : "Couldn’t create the draft. Your details are retained; try again.",
        );
      try {
        sessionStorage.removeItem(recoveryKey);
      } catch {
        /* Server draft is saved. */
      }
      window.location.assign(`/content/writing/${slug}`);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Couldn’t create the draft. Try again.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void create();
      }}
    >
      <VStack gap={6} className="new-writing-form">
        <Text color="secondary">
          Start privately. You can change the title as you write.
        </Text>
        <FormLayout>
          <TextInput
            label="Title"
            value={title}
            isRequired
            isDisabled={busy}
            status={
              title.length > 300
                ? {
                    type: "error",
                    message: "Keep the title to 300 characters or fewer.",
                  }
                : undefined
            }
            onChange={(value) => {
              setTitle(value);
              if (!customSlug) setSlug(writingId(value));
            }}
          />
          <TextInput
            label="Article address"
            value={slug}
            isRequired
            isDisabled={busy}
            description={`anipotts.com/writing/${slug || "your-article"}`}
            status={
              slug && !validWritingId(slug)
                ? {
                    type: "error",
                    message:
                      "Use lowercase letters, numbers and hyphens, up to 120 characters.",
                  }
                : undefined
            }
            onChange={(value) => {
              setCustomSlug(value.length > 0);
              setSlug(value);
            }}
          />
        </FormLayout>
        {recoveryFailed && (
          <Banner
            status="warning"
            title="Browser recovery unavailable"
            description="Keep this page open until you create the draft. Your details cannot be recovered after leaving."
          />
        )}
        {error && (
          <Banner
            status="error"
            title="Draft not created"
            description={error}
          />
        )}
        <HStack gap={2}>
          <Button
            label="Create draft"
            type="submit"
            variant="primary"
            isDisabled={!valid}
            isLoading={busy}
          />
          <Button
            label="Cancel"
            variant="ghost"
            href="/content?group=writing"
            isDisabled={busy}
          />
        </HStack>
      </VStack>
    </form>
  );
}
