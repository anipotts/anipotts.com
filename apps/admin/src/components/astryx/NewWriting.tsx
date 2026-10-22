import type { EncryptedBrowserRecovery } from "../../lib/encrypted-browser-recovery";
import { recoverySession } from "../../lib/browser-recovery-session";
import { AuthReentry } from "./AuthReentry";
import {
  adminNavigationEvent,
  commitAdminNavigation,
} from "../../lib/editorial-navigation";
import { editorialReturnPath } from "../../lib/editorial-return-path";
import {
  protectedAdminJson,
  protectedSessionIsLocked,
  watchProtectedSession,
} from "../../lib/protected-admin-json";
import { dispatchEditorialRecordCreated } from "../../lib/editorial-inventory-events";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { TextInput } from "./WritingControls";
import { Button } from "./WritingControls";
import { IconButton } from "./WritingControls";
import { Banner } from "./WritingControls";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { AutoSizeTextArea } from "./AutoSizeTextArea";
import { EditorActionBar } from "./EditorActionBar";
import { writingId, validWritingId } from "../../lib/writing-draft";
import {
  newWritingRecoveryKey,
  newProjectRecoveryKey,
  encryptedWritingRecovery,
  type NewWritingRecovery,
  recoveryLogoutKey,
} from "../../lib/draft-recovery";
import {
  type RecoveryProblem,
  type RecoveryRead,
} from "../../lib/browser-recovery";
import {
  BrowserRecoveryNotice,
  downloadBrowserRecovery,
} from "./BrowserRecoveryNotice";
import { readEditorialCsrf } from "../../lib/editorial-client";
import { RecoveryEncryptionError } from "../../lib/browser-recovery-encryption";

class DraftCreationError extends Error {}
/** The address is taken: the field names it and links to the record. */
class AddressTakenError extends DraftCreationError {}

const unconfirmedCreation = "Couldn’t confirm draft creation";

/** An address as it is typed: lowercase, hyphens for anything else, and a
 * trailing hyphen kept so the next word can follow it. */
function typedAddress(value: string): string {
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
 * derives with a pencil to change it. Create draft or Return explicitly
 * creates the private draft and opens it; every keystroke before that is
 * kept in browser recovery.
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

  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [restored, setRestored] = useState(false);
  const [recoveryFailed, setRecoveryFailed] = useState(false);
  const [recoveryProblem, setRecoveryProblem] =
    useState<RecoveryProblem | null>(null);
  const [recoveryRead, setRecoveryRead] = useState<
    RecoveryRead<NewWritingRecovery>
  >({ status: "missing" });
  const recoveryChannel =
    useRef<EncryptedBrowserRecovery<NewWritingRecovery> | null>(null);
  const recoveryKey = recoveryScope
    ? project
      ? newProjectRecoveryKey(recoveryScope)
      : newWritingRecoveryKey(recoveryScope)
    : null;
  const request = useRef<{ key: string; id: string } | null>(null);
  const recoveryWriteSequence = useRef(0);
  const editGeneration = useRef(0);
  const recoveryUnsafe = useRef(false);
  const leavePending = useRef(false);
  const leaveIntent = useRef<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState("");
  const latestRecovery = useRef<NewWritingRecovery | null>(null);
  latestRecovery.current = {
    title,
    slug,
    customSlug,
    request: request.current,
  };
  const changedRecovery = (value: NewWritingRecovery) => {
    // The DOM can receive another click or unload before React's write effect.
    // Mark the exact input unsafe synchronously, before any async encryption.
    latestRecovery.current = value;
    editGeneration.current++;
    recoveryWriteSequence.current++;
    recoveryUnsafe.current = true;
    setLeaveError("");
  };
  const active = useRef(true);
  const createAbort = useRef<AbortController | null>(null);
  const [loggedOut, setLoggedOut] = useState(false);
  useEffect(() => {
    if (!restored || loggedOut) return;
    const field = titleHost.current?.querySelector("textarea");
    if (!field) return;
    field.setAttribute("enterkeyhint", "go");
    field.setAttribute("autocapitalize", "off");
    // A hardware keyboard starts typing at once; a phone waits for a tap, so
    // the keyboard never covers the page before it is wanted.
    if (window.matchMedia?.("(pointer: fine)").matches) field.focus();
  }, [restored, loggedOut]);
  useEffect(
    () =>
      recoverySession().capture(() => {
        const channel = recoveryChannel.current;
        return channel && latestRecovery.current
          ? channel.sealFinal(latestRecovery.current)
          : Promise.resolve();
      }),
    [],
  );
  useEffect(() => {
    active.current = true;
    const logout = (event: Event) => {
      if (event instanceof StorageEvent && event.key !== recoveryLogoutKey)
        return;
      active.current = false;
      const channel = recoveryChannel.current;
      if (
        event instanceof CustomEvent &&
        event.detail !== "logout" &&
        channel &&
        latestRecovery.current
      )
        void channel
          .write(latestRecovery.current)
          .finally(() => channel.close());
      else channel?.close();
      recoveryChannel.current = null;
      latestRecovery.current = null;
      createAbort.current?.abort();
      request.current = null;
      setLoggedOut(true);
      setRecoveryRead({ status: "missing" });
      setTitle("");
      setSlug("");
      setError("");
    };
    const stopWatching = watchProtectedSession((reason) =>
      logout(new CustomEvent("session-lock", { detail: reason })),
    );
    window.addEventListener("storage", logout);
    window.addEventListener(recoveryLogoutKey, logout);
    void (async () => {
      try {
        if (!active.current) {
          /* A locked document must never restore recovery into memory. */
        } else if (!recoveryKey) setRecoveryFailed(true);
        else {
          const channel = encryptedWritingRecovery(localStorage, recoveryKey);
          recoveryChannel.current = channel;
          const result = await channel.read();
          if (!active.current || recoveryChannel.current !== channel) return;
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
      if (active.current) setRestored(true);
    })();
    return () => {
      stopWatching();
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
    const sequence = ++recoveryWriteSequence.current;
    void channel
      .write({ title, slug, customSlug, request: request.current })
      .then((problem) => {
        if (
          !active.current ||
          recoveryChannel.current !== channel ||
          sequence !== recoveryWriteSequence.current ||
          problem === "superseded"
        )
          return;
        setRecoveryProblem(problem);
        setRecoveryFailed(Boolean(problem));
        if (problem === "changed") setRecoveryRead(channel.current());
        if (problem) {
          const value = latestRecovery.current;
          if (editGeneration.current > 0 || value?.title || value?.slug)
            recoveryUnsafe.current = true;
        } else {
          recoveryUnsafe.current = false;
          setLeaveError("");
        }
      });
  }, [title, slug, customSlug, restored, recoveryKey]);
  const leaveDocument = async (href: string) => {
    if (!active.current || protectedSessionIsLocked()) return;
    leaveIntent.current = href;
    if (pending.current) {
      setLeaveError("Wait for draft creation before leaving.");
      return;
    }
    if (leavePending.current) return;
    if (!recoveryUnsafe.current) {
      commitAdminNavigation(href);
      return;
    }
    const channel = recoveryChannel.current;
    const snapshot = latestRecovery.current;
    if (!channel || !snapshot) {
      setRecoveryFailed(true);
      setLeaveError("Resolve browser recovery before leaving this title.");
      return;
    }
    const generation = editGeneration.current;
    // An older ordinary acknowledgment cannot settle this newer barrier.
    recoveryWriteSequence.current++;
    leavePending.current = true;
    setLeaving(true);
    setLeaveError("");
    try {
      // This is a local recovery barrier, never draft creation or a server save.
      const problem = await channel.writeDurable(snapshot);
      if (
        !active.current ||
        protectedSessionIsLocked() ||
        recoveryChannel.current !== channel
      )
        return;
      if (generation !== editGeneration.current) {
        setLeaveError(
          "Your title changed. Try leaving again when you’re ready.",
        );
        return;
      }
      setRecoveryProblem(problem);
      setRecoveryFailed(Boolean(problem));
      if (problem === "changed") setRecoveryRead(channel.current());
      if (problem) {
        recoveryUnsafe.current = true;
        setLeaveError("Resolve browser recovery before leaving this title.");
        return;
      }
      recoveryUnsafe.current = false;
      commitAdminNavigation(leaveIntent.current ?? href);
    } catch {
      if (active.current && recoveryChannel.current === channel) {
        recoveryUnsafe.current = true;
        setRecoveryFailed(true);
        setLeaveError("Resolve browser recovery before leaving this title.");
      }
    } finally {
      leavePending.current = false;
      if (active.current) setLeaving(false);
    }
  };
  const leaveDocumentRef = useRef(leaveDocument);
  leaveDocumentRef.current = leaveDocument;
  useEffect(() => {
    const requested = (event: Event) => {
      if (
        !active.current ||
        !(event instanceof CustomEvent) ||
        typeof event.detail !== "string"
      )
        return;
      event.preventDefault();
      void leaveDocumentRef.current(event.detail);
    };
    const linked = (event: MouseEvent) => {
      if (
        !active.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self")
      )
        return;
      const url = new URL(anchor.href);
      if (
        url.origin !== window.location.origin ||
        (url.pathname === window.location.pathname &&
          url.search === window.location.search)
      )
        return;
      event.preventDefault();
      void leaveDocumentRef.current(anchor.href);
    };
    const preventLoss = (event: BeforeUnloadEvent) => {
      if (active.current && (pending.current || recoveryUnsafe.current)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener(adminNavigationEvent, requested);
    // Run before React's sidebar handler can commit an in-document route.
    document.addEventListener("click", linked, true);
    window.addEventListener("beforeunload", preventLoss);
    return () => {
      window.removeEventListener(adminNavigationEvent, requested);
      document.removeEventListener("click", linked, true);
      window.removeEventListener("beforeunload", preventLoss);
    };
  }, []);
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
    changedRecovery({ title, slug, customSlug, request: request.current });
    try {
      const channel = recoveryChannel.current;
      if (channel) {
        const problem = await channel.writeDurable({
          title,
          slug,
          customSlug,
          request: request.current,
        });
        if (!active.current || abort.signal.aborted) return;
        setRecoveryProblem(problem);
        setRecoveryFailed(Boolean(problem));
        if (!problem) recoveryUnsafe.current = false;
      }
      const csrf = await readEditorialCsrf(
        AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]),
      ).catch(() => {
        throw new DraftCreationError(
          "Your session needs refreshing. Your title is still here.",
        );
      });
      if (!active.current || abort.signal.aborted) return;
      const response = await protectedAdminJson(
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
      // The server confirmed the created record, so leaving no longer risks
      // losing this form even if local recovery cleanup was unavailable.
      recoveryUnsafe.current = false;
      pending.current = false;
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
  if (loggedOut)
    return (
      <VStack gap={3}>
        <Banner
          role="alert"
          status="warning"
          title="Session ended. Sign in again to resume."
        />
        <AuthReentry
          href={editorialReturnPath(location.pathname + location.search)}
        />
      </VStack>
    );
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
            title={project ? "New project" : "New article"}
          />
        )}
        <VStack
          gap={0}
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
            isDisabled={!restored || busy || loggedOut}
            status={
              title.length > 300
                ? { type: "error", message: "Up to 300 characters" }
                : undefined
            }
            onChange={(input) => {
              const value = input.replace(/[\r\n]+/gu, " ");
              const nextSlug = customSlug ? slug : writingId(value);
              changedRecovery({
                title: value,
                slug: nextSlug,
                customSlug,
                request: request.current,
              });
              setTitle(value);
              setTaken(false);
              if (!customSlug) setSlug(nextSlug);
            }}
          />
        </VStack>
        {editingSlug ? (
          <TextInput
            label={addressLabel}
            value={slug}
            ref={addressField}
            isDisabled={!restored || busy || loggedOut}
            status={
              slugError ? { type: "error", message: slugError } : undefined
            }
            onEnter={() => form.current?.requestSubmit()}
            onChange={(value) => {
              const next = typedAddress(value);
              changedRecovery({
                title,
                slug: next,
                customSlug: next.length > 0,
                request: request.current,
              });
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
              isDisabled={!restored || busy || loggedOut}
              onClick={() => {
                focusAddress.current = true;
                setEditingSlug(true);
              }}
            />
          </HStack>
        )}
        <HStack gap={1} wrap="wrap">
          <Button
            label="Create draft"
            variant="primary"
            size="sm"
            type="submit"
            isLoading={busy}
            isDisabled={!valid || busy}
          />
        </HStack>
        {taken && (
          <Link href={`/content/${collection}/${slug}`}>
            Open the existing {project ? "project" : "article"}
          </Link>
        )}
        {loggedOut && (
          <Banner role="alert" status="warning" title="Session ended" />
        )}
        {(recoveryProblem || recoveryFailed) && !loggedOut && (
          <BrowserRecoveryNotice
            problem={recoveryProblem ?? "unavailable"}
            onDownload={async () => {
              try {
                if (protectedSessionIsLocked() || !active.current) return;
                const channel = recoveryChannel.current;
                if (!channel) throw new Error("Recovery channel unavailable");
                const contents = await channel.export({
                  title,
                  slug,
                  customSlug,
                  request: request.current,
                });
                if (protectedSessionIsLocked() || !active.current) return;
                downloadBrowserRecovery(contents);
              } catch (cause) {
                setRecoveryProblem(
                  cause instanceof RecoveryEncryptionError &&
                    cause.problem === "key-usage-limit"
                    ? "key-usage-limit"
                    : "unavailable",
                );
              }
            }}
            candidates={
              recoveryRead.status === "changed"
                ? recoveryRead.candidates?.map(({ label, value }) => ({
                    label,
                    source: `${value.title}\n${value.slug}`,
                    onChoose: async () => {
                      const channel = recoveryChannel.current;
                      if (!channel) return;
                      const generation = editGeneration.current;
                      const problem = await channel.choose(value);
                      if (
                        !active.current ||
                        recoveryChannel.current !== channel ||
                        generation !== editGeneration.current
                      )
                        return;
                      setRecoveryProblem(problem);
                      if (!problem) {
                        editGeneration.current++;
                        recoveryWriteSequence.current++;
                        recoveryUnsafe.current = false;
                        setRecoveryFailed(false);
                        setLeaveError("");
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
        {leaving && <Text role="status">Keeping title before leaving</Text>}
        {leaveError && (
          <Banner role="alert" status="warning" title={leaveError} />
        )}
        {error && !taken && (
          <Banner
            role="alert"
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
