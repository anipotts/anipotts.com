import React, { useEffect, useRef, useState } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { writingId, validWritingId } from "../../lib/writing-draft";
import {
  newWritingRecoveryKey,
  readNewWritingRecovery,
  recoveryLogoutKey,
} from "../../lib/draft-recovery";

export function NewWriting({ recoveryScope }: { recoveryScope?: string }) {
  return (
    <NewWritingForm
      key={recoveryScope ?? "unavailable"}
      recoveryScope={recoveryScope}
    />
  );
}
function NewWritingForm({ recoveryScope }: { recoveryScope?: string }) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [customSlug, setCustomSlug] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [restored, setRestored] = useState(false);
  const [recoveryFailed, setRecoveryFailed] = useState(false);
  const recoveryKey = recoveryScope
    ? newWritingRecoveryKey(recoveryScope)
    : null;
  const request = useRef<{ key: string; id: string } | null>(null);
  const active = useRef(true);
  const createAbort = useRef<AbortController | null>(null);
  const [loggedOut, setLoggedOut] = useState(false);
  useEffect(() => {
    active.current = true;
    const logout = (event: Event) => {
      if (event instanceof StorageEvent && event.key !== recoveryLogoutKey)
        return;
      active.current = false;
      createAbort.current?.abort();
      request.current = null;
      setLoggedOut(true);
      setTitle("");
      setSlug("");
      setError("");
    };
    window.addEventListener("storage", logout);
    window.addEventListener(recoveryLogoutKey, logout);
    try {
      if (!recoveryKey) setRecoveryFailed(true);
      else {
        const saved = readNewWritingRecovery(localStorage, recoveryKey);
        if (saved) {
          setTitle(saved.title);
          setSlug(saved.slug);
          setCustomSlug(saved.customSlug);
          request.current = saved.request;
        }
      }
    } catch {
      setRecoveryFailed(true);
    }
    setRestored(true);
    return () => {
      active.current = false;
      createAbort.current?.abort();
      window.removeEventListener("storage", logout);
      window.removeEventListener(recoveryLogoutKey, logout);
    };
  }, [recoveryKey]);
  useEffect(() => {
    if (!restored || !recoveryKey || !active.current) return;
    try {
      localStorage.setItem(
        recoveryKey,
        JSON.stringify({ title, slug, customSlug, request: request.current }),
      );
      setRecoveryFailed(false);
    } catch {
      setRecoveryFailed(true);
    }
  }, [title, slug, customSlug, restored, recoveryKey]);
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
    !loggedOut &&
    Boolean(title.trim()) &&
    title.length <= 300 &&
    validWritingId(slug);
  async function create() {
    if (!valid || pending.current || !active.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const abort = new AbortController();
    createAbort.current = abort;
    const key = JSON.stringify([title.trim(), slug]);
    if (request.current?.key !== key)
      request.current = { key, id: crypto.randomUUID() };
    try {
      try {
        if (recoveryKey)
          localStorage.setItem(
            recoveryKey,
            JSON.stringify({
              title,
              slug,
              customSlug,
              request: request.current,
            }),
          );
      } catch {
        setRecoveryFailed(true);
      }
      const csrfResponse = await fetch("/api/editorial/csrf", {
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]),
      });
      if (!csrfResponse.ok)
        throw new Error(
          "Your session needs refreshing. Your title is still here.",
        );
      const { csrf } = await csrfResponse.json();
      if (!active.current || abort.signal.aborted) return;
      const response = await fetch(
        `/api/editorial/create?kind=writing&id=${encodeURIComponent(slug)}`,
        {
          method: "POST",
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]),
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
      if (!active.current || abort.signal.aborted) return;
      if (!response.ok || !result.ok)
        throw new Error(
          response.status === 409
            ? "An article already uses this address. Choose another address or open it from Writing."
            : "Couldn’t create the draft. Your details are retained; try again.",
        );
      try {
        if (recoveryKey) localStorage.removeItem(recoveryKey);
      } catch {
        /* Server draft is saved. */
      }
      window.location.assign(`/content/writing/${slug}`);
    } catch (error) {
      if (!active.current || abort.signal.aborted) return;
      setError(
        error instanceof Error
          ? error.message
          : "Couldn’t create the draft. Try again.",
      );
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
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
        <FormLayout>
          <TextInput
            label="Title"
            value={title}
            isRequired
            isDisabled={busy || loggedOut}
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
            isDisabled={busy || loggedOut}
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
        {loggedOut && (
          <Banner
            status="warning"
            title="Session ended"
            description="Sign in again before creating an article."
          />
        )}
        {recoveryFailed && !loggedOut && (
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
            isDisabled={busy || loggedOut}
          />
        </HStack>
      </VStack>
    </form>
  );
}
