import { dispatchEditorialRecordCreated } from "../../lib/editorial-inventory-events";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Banner } from "@astryxdesign/core/Banner";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { AutoSizeTextArea } from "./AutoSizeTextArea";
import { EditorActionBar } from "./EditorActionBar";
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
/** The address is taken: the field names it and links to the record. */
class AddressTakenError extends DraftCreationError {}

const unconfirmedCreation = "Couldn’t confirm draft creation";

/** An address as it is typed: lowercase, hyphens for anything else, and a
 * trailing hyphen kept so the next word can follow it. */
export function typedAddress(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-/u, "")
    .slice(0, 120);
}

/** An address keyboard: no capitals, corrections or spelling marks. */
const ADDRESS_HINTS: Record<string, string> = {
  inputmode: "url",
  autocapitalize: "none",
  autocorrect: "off",
  autocomplete: "off",
  spellcheck: "false",
  enterkeyhint: "go",
};
function addressHints(input: HTMLInputElement | null) {
  if (!input) return;
  for (const [name, value] of Object.entries(ADDRESS_HINTS))
    input.setAttribute(name, value);
}

type NewWritingProps = {
  recoveryScope?: string;
  recordKind?: "writing" | "work";
  back?: { href: string; label: string };
  /** Open the created draft in place. Without it the page navigates. */
  onCreated?: (record: { kind: "writing" | "work"; id: string }) => void;
};
export function NewWriting(props: NewWritingProps) {
  const { recordKind = "writing", recoveryScope } = props;
  return (
    <NewWritingForm
      key={`${recordKind}:${recoveryScope ?? "unavailable"}`}
      {...props}
      recordKind={recordKind}
    />
  );
}
/**
 * Create is the editor itself: a large title and, under it, the address it
 * derives with a pencil to change it. Return or leaving the title creates
 * the private draft and opens it; every keystroke before that is kept in
 * browser recovery.
 */
function NewWritingForm({
  recoveryScope,
  recordKind = "writing",
  back,
  onCreated,
}: NewWritingProps) {
  const project = recordKind === "work";
  const collection = project ? "projects" : "writing";
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [customSlug, setCustomSlug] = useState(false);
  const [editingSlug, setEditingSlug] = useState(false);
  const [error, setError] = useState("");
  const [taken, setTaken] = useState(false);
  const titleHost = useRef<HTMLDivElement>(null);
  /** A press on the address pencil has started; the title's blur waits. */
  const holding = useRef(false);
  /** The pencil opened the address field: it takes focus as it mounts, in
   * the same tap, so a phone keeps its keyboard. */
  const focusAddress = useRef(false);
  const addressField = useCallback((input: HTMLInputElement | null) => {
    addressHints(input);
    if (input && focusAddress.current) {
      focusAddress.current = false;
      input.focus();
    }
  }, []);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const field = titleHost.current?.querySelector("textarea");
    if (!field) return;
    field.setAttribute("enterkeyhint", "go");
    field.setAttribute("autocapitalize", "off");
    // A hardware keyboard starts typing at once; a phone waits for a tap, so
    // the keyboard never covers the page before it is wanted.
    if (window.matchMedia?.("(pointer: fine)").matches) field.focus();
  }, []);
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
        throw response.status === 409
          ? new AddressTakenError(
              project
                ? "A project already uses this address"
                : "An article already uses this address",
            )
          : new DraftCreationError(unconfirmedCreation);
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
      if (onCreated) onCreated({ kind: recordKind, id: slug });
      else window.location.assign(`/content/${collection}/${slug}`);
    } catch (error) {
      if (!active.current || abort.signal.aborted) return;
      setTaken(error instanceof AddressTakenError);
      if (error instanceof AddressTakenError) setEditingSlug(true);
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
  const addressLabel = project ? "Project address" : "Article address";
  const path = `/${project ? "work" : "writing"}/`;
  const slugError =
    slug && !validWritingId(slug)
      ? "Lowercase letters, numbers and hyphens"
      : taken
        ? error
        : undefined;
  return (
    <form
      ref={form}
      onSubmit={(event) => {
        event.preventDefault();
        void create();
      }}
    >
      <VStack gap={4} className="new-writing-form">
        {back && (
          <EditorActionBar
            back={back}
            title={title.trim() || (project ? "New project" : "New article")}
          />
        )}
        <div
          ref={titleHost}
          className="document-title"
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            form.current?.requestSubmit();
          }}
        >
          <AutoSizeTextArea
            label="Title"
            isLabelHidden
            placeholder="Title"
            value={title}
            isDisabled={busy || loggedOut}
            status={
              title.length > 300
                ? { type: "error", message: "Up to 300 characters" }
                : undefined
            }
            onBlur={(event) => {
              // Moving to the address pencil or field is not leaving.
              if (
                holding.current ||
                form.current?.contains(event.relatedTarget as Node | null)
              )
                return;
              if (valid) void create();
            }}
            onChange={(input) => {
              const value = input.replace(/[\r\n]+/gu, " ");
              setTitle(value);
              setTaken(false);
              if (!customSlug) setSlug(writingId(value));
            }}
          />
        </div>
        {editingSlug ? (
          <TextInput
            label={addressLabel}
            value={slug}
            ref={addressField}
            isDisabled={busy || loggedOut}
            status={
              slugError ? { type: "error", message: slugError } : undefined
            }
            onEnter={() => form.current?.requestSubmit()}
            onChange={(value) => {
              const next = typedAddress(value);
              setCustomSlug(next.length > 0);
              setTaken(false);
              setSlug(next);
            }}
          />
        ) : (
          <HStack gap={1} vAlign="center" className="editor-address">
            <span className="sr-only">{addressLabel}</span>
            <code className="editor-address-path">
              {path}
              {slug}
            </code>
            <IconButton
              label="Edit address"
              tooltip="Edit address"
              variant="ghost"
              size="sm"
              icon={<PencilSimpleIcon weight="regular" aria-hidden="true" />}
              isDisabled={busy || loggedOut}
              onPointerDown={() => {
                holding.current = true;
              }}
              onClick={() => {
                holding.current = false;
                focusAddress.current = true;
                setEditingSlug(true);
              }}
            />
          </HStack>
        )}
        {taken && (
          <Link href={`/content/${collection}/${slug}`}>
            Open the existing {project ? "project" : "article"}
          </Link>
        )}
        {loggedOut && <Banner status="warning" title="Session ended" />}
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
          <Banner status="warning" title="Browser recovery unavailable" />
        )}
        {error && !taken && (
          <Banner
            status="error"
            title={error}
            endContent={
              <Button
                label="Retry"
                size="sm"
                isLoading={busy}
                onClick={() => void create()}
              />
            }
          />
        )}
        {busy && (
          <Text role="status" className="sr-only">
            Creating draft
          </Text>
        )}
      </VStack>
    </form>
  );
}
