import { libraryPath } from "../../lib/content-library-state";
import { dispatchEditorialRecordCreated } from "../../lib/editorial-inventory-events";
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
  newProjectRecoveryKey,
  writingRecovery,
  type NewWritingRecovery,
  recoveryLogoutKey,
} from "../../lib/draft-recovery";
import type {
  BrowserRecovery,
  RecoveryProblem,
  RecoveryRead,
} from "../../lib/browser-recovery";
import {
  BrowserRecoveryNotice,
  downloadBrowserRecovery,
} from "./BrowserRecoveryNotice";

class DraftCreationError extends Error {}

const unconfirmedCreation =
  "Couldn’t confirm draft creation. Your details are retained; retry to check the same request safely.";

type NewWritingProps = {
  recoveryScope?: string;
  recordKind?: "writing" | "work";
};
export function NewWriting({
  recoveryScope,
  recordKind = "writing",
}: NewWritingProps) {
  return (
    <NewWritingForm
      key={`${recordKind}:${recoveryScope ?? "unavailable"}`}
      recoveryScope={recoveryScope}
      recordKind={recordKind}
    />
  );
}
function NewWritingForm({
  recoveryScope,
  recordKind = "writing",
}: NewWritingProps) {
  const project = recordKind === "work";
  const collection = project ? "projects" : "writing";
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [customSlug, setCustomSlug] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [restored, setRestored] = useState(false);
  const [recoveryFailed, setRecoveryFailed] = useState(false);
  const [recoveryProblem, setRecoveryProblem] =
    useState<RecoveryProblem | null>(null);
  const [recoveryRead, setRecoveryRead] = useState<
    RecoveryRead<NewWritingRecovery>
  >({ status: "missing" });
  const recoveryChannel = useRef<BrowserRecovery<NewWritingRecovery> | null>(
    null,
  );
  const recoveryKey = recoveryScope
    ? project
      ? newProjectRecoveryKey(recoveryScope)
      : newWritingRecoveryKey(recoveryScope)
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
      recoveryChannel.current?.close();
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
        const channel = writingRecovery(localStorage, recoveryKey);
        recoveryChannel.current = channel;
        const result = channel.read();
        setRecoveryRead(result);
        setRecoveryProblem(
          result.status === "ready" || result.status === "missing"
            ? null
            : result.status,
        );
        if (result.status === "ready") {
          const saved = result.value;
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
      recoveryChannel.current?.close();
      createAbort.current?.abort();
      window.removeEventListener("storage", logout);
      window.removeEventListener(recoveryLogoutKey, logout);
    };
  }, [recoveryKey]);
  useEffect(() => {
    if (!restored || !recoveryKey || !active.current) return;
    const channel = recoveryChannel.current;
    if (!channel) return;
    void channel
      .write({ title, slug, customSlug, request: request.current })
      .then((problem) => {
        if (!active.current || recoveryChannel.current !== channel) return;
        setRecoveryProblem(problem);
        setRecoveryFailed(Boolean(problem));
      });
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
      const channel = recoveryChannel.current;
      if (channel) {
        const problem = await channel.write({
          title,
          slug,
          customSlug,
          request: request.current,
        });
        if (!active.current || abort.signal.aborted) return;
        setRecoveryProblem(problem);
        setRecoveryFailed(Boolean(problem));
      }
      const csrfResponse = await fetch("/api/editorial/csrf", {
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]),
      });
      if (!csrfResponse.ok)
        throw new DraftCreationError(
          "Your session needs refreshing. Your title is still here.",
        );
      const { csrf } = await csrfResponse.json();
      if (!active.current || abort.signal.aborted) return;
      const response = await fetch(
        `/api/editorial/create?kind=${recordKind}&id=${encodeURIComponent(slug)}`,
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
        throw new DraftCreationError(
          response.status === 409
            ? project
              ? "A project already uses this address. Choose another address or open it from Projects."
              : "An article already uses this address. Choose another address or open it from Writing."
            : unconfirmedCreation,
        );
      // The library in this tab and in other open tabs lists the new draft
      // without a reload.
      if (result.draft)
        dispatchEditorialRecordCreated({
          record: { kind: recordKind, id: slug },
          title: title.trim(),
          summary: "",
          revision: result.draft.revision,
          updatedAt: new Date(result.draft.updatedAt).toISOString(),
        });
      if (channel) await channel.write(null);
      if (!active.current || abort.signal.aborted) return;
      window.location.assign(`/content/${collection}/${slug}`);
    } catch (error) {
      if (!active.current || abort.signal.aborted) return;
      setError(
        error instanceof DraftCreationError
          ? error.message
          : unconfirmedCreation,
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
            label={project ? "Project address" : "Article address"}
            value={slug}
            isRequired
            isDisabled={busy || loggedOut}
            description={`anipotts.com/${project ? "work" : "writing"}/${slug || (project ? "your-project" : "your-article")}`}
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
            description={`Sign in again before creating ${project ? "a project" : "an article"}.`}
          />
        )}
        {recoveryProblem && !loggedOut && (
          <BrowserRecoveryNotice
            problem={recoveryProblem}
            onDownload={
              recoveryChannel.current
                ? () => {
                    try {
                      downloadBrowserRecovery(
                        recoveryChannel.current!.export(),
                      );
                    } catch {
                      setRecoveryProblem("unavailable");
                    }
                  }
                : undefined
            }
            candidates={
              recoveryRead.status === "changed"
                ? recoveryRead.candidates?.map(({ label, value }) => ({
                    label,
                    source: `${value.title}\n${value.slug}`,
                    onChoose: async () => {
                      const channel = recoveryChannel.current;
                      if (!channel) return;
                      const problem = await channel.choose(value);
                      if (
                        !active.current ||
                        recoveryChannel.current !== channel
                      )
                        return;
                      setRecoveryProblem(problem);
                      if (!problem) {
                        request.current = value.request;
                        setTitle(value.title);
                        setSlug(value.slug);
                        setCustomSlug(value.customSlug);
                      }
                    },
                  }))
                : []
            }
          />
        )}
        {recoveryFailed && !recoveryProblem && !loggedOut && (
          <Banner
            status="warning"
            title="Browser recovery unavailable"
            description="Keep this page open until you create the draft. Your details cannot be recovered after leaving."
          />
        )}
        {error && (
          <Banner
            status="error"
            title="Draft creation needs attention"
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
            href={libraryPath(recordKind)}
            isDisabled={busy || loggedOut}
          />
        </HStack>
      </VStack>
    </form>
  );
}
