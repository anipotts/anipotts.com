import {
  adminNavigationEvent,
  commitAdminNavigation,
} from "../../lib/editorial-navigation";
import { editorialRecordSummary } from "../../lib/editorial-record-summary";
import { dispatchEditorialRecordSaved } from "../../lib/editorial-inventory-events";
import { RecordPanel } from "./RecordPanel";
import {
  readRecordWorkspaceState,
  recordWorkspaceUrl,
  type RecordWorkspaceState,
  type RecordPanel as PanelName,
} from "../../lib/record-workspace-state";
import {
  captureReviewedDraft,
  matchesReviewedDraft,
  type ReviewedDraft,
} from "../../lib/reviewed-draft";
import { libraryReturnPath } from "../../lib/content-library-state";
import { DocumentTitle } from "./DocumentTitle";
import {
  draftRecovery,
  recoveryKey,
  recoveryLogoutKey,
} from "../../lib/draft-recovery";
import { ArticleBody } from "./ArticleBody";
import { SavedArticlePreview } from "./SavedArticlePreview";
import { SaveScheduler } from "../../lib/save-scheduler";
import { writingReviewChanges } from "../../lib/writing-review";
import { ArticleSettings } from "./ArticleSettings";
import React, { useEffect, useId, useRef, useState } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { TextInput } from "@astryxdesign/core/TextInput";
import { SaveStatus, saveStatusFromController } from "./SaveStatus";
import { ArrowLeftIcon, DotsThreeIcon } from "@phosphor-icons/react";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { Banner } from "@astryxdesign/core/Banner";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Spinner } from "@astryxdesign/core/Spinner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { useToast } from "@astryxdesign/core/Toast";
import { AdminSkeleton, RecoveryBanner } from "./AdminFeedback";
import {
  BrowserRecoveryNotice,
  downloadBrowserRecovery,
} from "./BrowserRecoveryNotice";
import type {
  BrowserRecovery,
  RecoveryProblem,
  RecoveryRead,
} from "../../lib/browser-recovery";
import type { RecoverySnapshot } from "../../lib/home-autosave";
import { RichTextField } from "./RichTextField";
import { editableHomeSummary } from "../../lib/rich-text";
import { editorialFields } from "../../lib/editorial-fields";
import { ReviewChanges, ReviewHeading } from "./ReviewChanges";
import { PublicationProgress } from "./PublicationProgress";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Button } from "@astryxdesign/core/Button";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { history, historyKeymap, defaultKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  parseEditorialSource,
  setEditorialField,
  validateEditorialSource,
  type EditorialRecord,
} from "@anipotts/content/editorial/source";
import {
  HomeAutosave,
  readSaveResponse,
  saveNeedsComparison,
  saveRefused,
  type SaveState,
} from "../../lib/home-autosave";
import type { Draft } from "../../editorial/draft-store";
import type { HomeBase } from "../../lib/editorial-home-api";
import type { PublishJob } from "../../editorial/publication-jobs";

type Snapshot = {
  recoveryScope?: string;
  base: HomeBase;
  draft: Draft | null;
  history: Draft[];
  publishing: "ready" | "not_configured";
  publication: PublishJob | null;
};

export const HomeEditor = React.memo(HomeEditorImpl);

function HomeEditorImpl({
  record,
  localPreview = false,
  onTitleChange,
  pageTitle,
}: {
  record: EditorialRecord;
  pageTitle?: string;
  localPreview?: boolean;
  onTitleChange?: (title: string) => void;
}) {
  const previewSupported = !(
    record.kind === "page" && record.id === "newsletter"
  );
  const reviewHeadingId = useId();
  const toast = useToast();
  const [returnPath, setReturnPath] = useState(
    record.kind === "writing" ? "/content?group=writing" : "/content",
  );
  useEffect(() => {
    const returnTo = new URLSearchParams(window.location.search).get(
      "returnTo",
    );
    if (returnTo) setReturnPath(libraryReturnPath(returnTo));
  }, []);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [historyError, setHistoryError] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const query = new URLSearchParams(record).toString();
  const endpoint = (action: string) => `/api/editorial/${action}?${query}`;
  const [state, setState] = useState<SaveState | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [tab, setCurrentTab] = useState("edit");
  const [panel, setPanel] = useState<PanelName | null>(null);
  const workspaceState = useRef<RecordWorkspaceState>({
    view: "edit",
    panel: null,
  });
  const workspaceActions = useRef<{
    preview: () => Promise<void>;
    review: () => Promise<void>;
    history: () => Promise<void>;
  } | null>(null);
  const workspaceNavigate = useRef<
    (next: RecordWorkspaceState, write: "push" | "replace" | null) => void
  >(() => {});
  const editScroll = useRef(0);
  const lastEditingFocus = useRef<HTMLElement | null>(null);
  const previousTab = useRef("edit");
  useEffect(() => {
    if (tab === "edit" && previousTab.current !== "edit") {
      const frame = requestAnimationFrame(() => {
        if (lastEditingFocus.current?.isConnected)
          lastEditingFocus.current.focus({ preventScroll: true });
        const surface = document.getElementById("astryx-app-shell-main");
        if (surface) surface.scrollTop = editScroll.current;
        else window.scrollTo({ top: editScroll.current, behavior: "instant" });
      });
      previousTab.current = tab;
      return () => cancelAnimationFrame(frame);
    }
    previousTab.current = tab;
  }, [tab]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const leavePending = useRef(false);
  const [previewRevision, setPreviewRevision] = useState<number | null>(null);
  const editor = useRef<HomeAutosave | null>(null);
  const saveScheduler = useRef<SaveScheduler | null>(null);
  const titleFlush = useRef<(() => void) | null>(null);
  const subtitleFlush = useRef<(() => void) | null>(null);
  const bodyFlush = useRef<(() => void) | null>(null);
  const bodyDirtyRef = useRef(false);
  const [bodyDirty, setBodyDirty] = useState(false);
  const editGeneration = useRef(0);
  const [resetGeneration, setResetGeneration] = useState(0);
  const resetBuffers = () => {
    // Drain synchronously before replacement so an unmount cannot commit stale text.
    titleFlush.current?.();
    subtitleFlush.current?.();
    bodyFlush.current?.();
    bodyDirtyRef.current = false;
    setBodyDirty(false);
    setResetGeneration((value) => value + 1);
  };
  const flushLocal = () => {
    titleFlush.current?.();
    subtitleFlush.current?.();
    bodyFlush.current?.();
    bodyDirtyRef.current = false;
    setBodyDirty(false);
  };
  const flush = () => {
    titleFlush.current?.();
    subtitleFlush.current?.();
    bodyFlush.current?.();
    bodyDirtyRef.current = false;
    setBodyDirty(false);
    return editor.current!.flush();
  };
  const leaveDocument = async (href: string) => {
    // Loading and failed initial reads have no editable state to flush.
    if (!editor.current) {
      commitAdminNavigation(href);
      return;
    }
    if (leavePending.current) return;
    leavePending.current = true;
    setLeaving(true);
    const navigation = ++navigationGeneration.current;
    const edits = editGeneration.current;
    try {
      await flush();
      if (navigation !== navigationGeneration.current) return;
      if (
        editor.current?.state.status !== "saved" ||
        bodyDirtyRef.current ||
        edits !== editGeneration.current
      ) {
        setError(
          "Your latest edits are still here. Save them before leaving this draft.",
        );
        return;
      }
      commitAdminNavigation(href);
    } catch {
      if (navigation === navigationGeneration.current)
        setError("Couldn’t save before leaving. Your draft is retained.");
    } finally {
      leavePending.current = false;
      setLeaving(false);
    }
  };
  const leaveDocumentRef = useRef(leaveDocument);
  leaveDocumentRef.current = leaveDocument;
  useEffect(() => {
    const requested = (event: Event) => {
      if (!(event instanceof CustomEvent) || typeof event.detail !== "string")
        return;
      event.preventDefault();
      void leaveDocumentRef.current(event.detail);
    };
    const linked = (event: MouseEvent) => {
      if (
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
      if (url.origin !== window.location.origin) return;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      )
        return;
      event.preventDefault();
      void leaveDocumentRef.current(anchor.href);
    };
    window.addEventListener(adminNavigationEvent, requested);
    document.addEventListener("click", linked);
    return () => {
      window.removeEventListener(adminNavigationEvent, requested);
      document.removeEventListener("click", linked);
    };
  }, []);
  const ensureDraft = () => {
    titleFlush.current?.();
    subtitleFlush.current?.();
    bodyFlush.current?.();
    bodyDirtyRef.current = false;
    setBodyDirty(false);
    return editor.current!.ensureDraft();
  };
  const recoveryStorageKey = useRef<string | null>(null);
  const recoveryChannel = useRef<BrowserRecovery<RecoverySnapshot> | null>(
    null,
  );
  const [recoveryProblem, setRecoveryProblem] =
    useState<RecoveryProblem | null>(null);
  const [recoveryRead, setRecoveryRead] = useState<
    RecoveryRead<RecoverySnapshot>
  >({ status: "missing" });
  const recoveryAwaitingSave = useRef(false);
  const [recoveredAwaitingSave, setRecoveredAwaitingSave] = useState(false);
  const navigationGeneration = useRef(0);
  function navigateWorkspace(
    next: RecordWorkspaceState,
    write: "push" | "replace" | null = "push",
  ) {
    if (next.panel === "properties" && record.kind !== "writing")
      next = { ...next, panel: null };
    navigationGeneration.current += 1;
    const previous = workspaceState.current;
    if (previous.view === "edit" && next.view !== "edit") {
      editScroll.current =
        document.getElementById("astryx-app-shell-main")?.scrollTop ??
        window.scrollY;
    }
    flushLocal();
    workspaceState.current = next;
    setCurrentTab(next.view === "review" ? "publish" : next.view);
    setPanel(next.panel);
    if (write) {
      const url = recordWorkspaceUrl(
        window.location.pathname,
        window.location.search,
        next,
      );
      if (write === "replace")
        window.history.replaceState(window.history.state, "", url);
      else if (url !== window.location.pathname + window.location.search)
        window.history.pushState(null, "", url);
      window.dispatchEvent(new Event("admin:workspace-navigation"));
    }
    const initialize = write === "replace";
    // Restoring URL state is not approval to save recovered text. Preview,
    // review and history prepare a stored revision only after a user action.
    if (initialize && recoveryAwaitingSave.current) return;
    if (next.view === "preview" && (initialize || previous.view !== next.view))
      void workspaceActions.current?.preview();
    if (next.view === "review" && (initialize || previous.view !== next.view))
      void workspaceActions.current?.review();
    if (
      next.panel === "history" &&
      (initialize || previous.panel !== next.panel)
    )
      void workspaceActions.current?.history();
  }
  workspaceNavigate.current = navigateWorkspace;
  function setTab(next: string) {
    if (next === "history") {
      navigateWorkspace({ ...workspaceState.current, panel: "history" });
      return;
    }
    navigateWorkspace({
      view:
        next === "publish" ? "review" : (next as RecordWorkspaceState["view"]),
      panel: null,
    });
  }
  function openPanel(next: PanelName | null) {
    navigateWorkspace({ ...workspaceState.current, panel: next });
  }
  useEffect(() => {
    const onPopState = () =>
      workspaceNavigate.current(
        readRecordWorkspaceState(window.location.search),
        null,
      );
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    if (state && snapshot)
      workspaceNavigate.current(
        readRecordWorkspaceState(window.location.search),
        "replace",
      );
  }, [Boolean(state), Boolean(snapshot), loadAttempt]);
  const csrf = useRef("");
  const importInput = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [saveComparison, setSaveComparison] = useState<{
    draft: Draft | null;
  } | null>(null);
  const [saveComparisonLoading, setSaveComparisonLoading] = useState(false);
  const [saveComparisonError, setSaveComparisonError] = useState("");
  const saveComparisonRequest = useRef(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [publication, setPublication] = useState<PublishJob | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publicationStale, setPublicationStale] = useState(false);
  const [reviewedDraft, setReviewedDraft] = useState<ReviewedDraft | null>(
    null,
  );
  const reviewRequest = useRef(0);
  const previewRequest = useRef(0);
  const historyRequest = useRef(0);
  const publishPending = useRef(false);
  const [comparison, setComparison] = useState<HomeBase | null>(null);
  const publishRequest = useRef<{ revision: number; id: string } | null>(null);
  async function postRequest(
    action: string,
    body: unknown,
    guard?: () => boolean,
  ) {
    if (!csrf.current) {
      const response = await fetch("/api/editorial/csrf", {
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("session expired");
      csrf.current = (await response.json()).csrf;
    }
    if (guard && !guard()) throw new Error("operation no longer current");
    const response = await fetch(endpoint(action), {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        "X-Editorial-CSRF": csrf.current,
      },
      body: JSON.stringify(body),
    });
    if (response.status === 401 || response.status === 403) {
      csrf.current = "";
      throw new Error("session expired");
    }
    return response;
  }
  async function post(action: string, body: unknown, guard?: () => boolean) {
    const response = await postRequest(action, body, guard);
    if (!response.ok && response.status !== 409)
      throw new Error("save unavailable");
    return response.json();
  }
  useEffect(() => {
    let cancelled = false;
    recoveryChannel.current?.close();
    recoveryChannel.current = null;
    recoveryStorageKey.current = null;
    recoveryAwaitingSave.current = false;
    setRecoveredAwaitingSave(false);
    setRecoveryRead({ status: "missing" });
    setRecoveryProblem(null);
    setError("");
    fetch(endpoint("record"), { signal: AbortSignal.timeout(15000) })
      .then(async (response) => {
        if (!response.ok) throw new Error("draft storage unavailable");
        const data: Snapshot = await response.json();
        if (cancelled) return;
        setSnapshot(data);
        setPublication(data.publication ?? null);
        const source = data.draft?.source ?? data.base.source;
        editor.current = new HomeAutosave(
          source,
          data.draft?.revision ?? 0,
          async (input) => {
            // A draft-store refusal is an answer, not a lost response. Other
            // callers keep post(), which treats every such status as a failure.
            const result = await readSaveResponse(
              await postRequest("save", input),
            );
            if (result.ok) {
              try {
                const metadata = parseEditorialSource(result.draft.source)
                  .data as Record<string, unknown>;
                const intended =
                  record.kind === "work"
                    ? metadata.public_state
                    : metadata.status;
                if (typeof metadata.title === "string")
                  dispatchEditorialRecordSaved({
                    record,
                    title: metadata.title,
                    summary: editorialRecordSummary(record, metadata) ?? "",
                    revision: result.draft.revision,
                    updatedAt: new Date(result.draft.updatedAt).toISOString(),
                    changesPending: result.draft.source !== data.base.source,
                    ...(typeof intended === "string"
                      ? { intendedVisibility: intended }
                      : {}),
                  });
              } catch {
                /* Metadata refresh never interrupts an acknowledged save. */
              }
            }
            return result;
          },
          (next) => {
            setState(next);
            try {
              const key = recoveryStorageKey.current;
              if (!key || !editor.current) return;
              const channel = recoveryChannel.current;
              if (channel)
                void channel
                  .write(
                    next.status === "saved" ? null : editor.current.recovery(),
                  )
                  .then((problem) => {
                    if (cancelled || recoveryChannel.current !== channel)
                      return;
                    setRecoveryProblem(problem);
                    // Another tab won the write. Surface its copy alongside
                    // this tab's so the author can resolve; otherwise this tab
                    // retries the same doomed compare with nothing on screen.
                    if (problem === "changed")
                      setRecoveryRead(channel.current());
                  });
            } catch {
              setRecoveryProblem("unavailable");
            }
          },
        );
        recoveryStorageKey.current = data.recoveryScope
          ? recoveryKey(data.recoveryScope, record)
          : null;
        try {
          const key = recoveryStorageKey.current;
          recoveryChannel.current?.close();
          const channel = key ? draftRecovery(localStorage, key) : null;
          recoveryChannel.current = channel;
          const result = channel?.read() ?? { status: "unavailable" as const };
          setRecoveryRead(result);
          setRecoveryProblem(
            result.status === "ready" || result.status === "missing"
              ? null
              : result.status,
          );
          if (result.status === "ready" && data.draft?.discardedAt && channel) {
            // The author discarded this draft. Retire the recovery candidate
            // instead of leaving it to resurface on a later reload, which would
            // bring back content that was deliberately thrown away.
            const problem = await channel.write(null);
            if (cancelled || recoveryChannel.current !== channel) return;
            setRecoveryProblem(problem);
          }
          if (result.status === "ready" && !data.draft?.discardedAt) {
            const recovered = result.value;
            if (recovered.source !== source || recovered.pending) {
              recoveryAwaitingSave.current = true;
              setRecoveredAwaitingSave(true);
              editor.current.recover(recovered);
              toast({
                body: "Recovered your unsaved edits. Review them before saving.",
                uniqueID: "draft-recovery",
              });
            } else if (channel) {
              // Exact acknowledged content can retire this recovery candidate,
              // while retaining legacy bytes behind a v2 acknowledgment marker.
              const problem = await channel.write(null);
              if (cancelled || recoveryChannel.current !== channel) return;
              setRecoveryProblem(problem);
            }
          }
        } catch {
          setRecoveryProblem("unavailable");
        }
        setState(editor.current.state);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn’t load this draft.");
      });
    return () => {
      cancelled = true;
      recoveryChannel.current?.close();
      navigationGeneration.current += 1;
    };
  }, [loadAttempt]);
  useEffect(() => {
    if (
      !publication ||
      publication.blocked ||
      ["live", "cancelled"].includes(publication.phase)
    )
      return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `${endpoint("publication")}&operationId=${publication.id}`,
          { signal: AbortSignal.timeout(15000) },
        );
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!cancelled) {
          if (!data.publication) throw new Error();
          setPublicationStale(false);
          setPublication(data.publication);
        }
      } catch {
        if (!cancelled) {
          setPublicationStale(true);
          setPublication({ ...publication });
        }
      }
    }, 4000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [publication]);
  useEffect(() => {
    saveScheduler.current = new SaveScheduler(() => {
      if (
        !recoveryAwaitingSave.current &&
        (bodyDirtyRef.current || editor.current?.state.status === "unsaved")
      )
        void flush();
    });
    return () => saveScheduler.current?.dispose();
  }, []);
  useEffect(() => {
    if (
      !recoveryAwaitingSave.current &&
      state?.status === "unsaved" &&
      !snapshot?.draft?.discardedAt
    )
      saveScheduler.current?.changed();
  }, [state?.source, snapshot?.draft?.discardedAt]);
  useEffect(() => {
    if (record.kind !== "writing" || !state) return;
    try {
      const title = String(
        parseEditorialSource(state.source).document.get("title") ?? "",
      );
      onTitleChange?.(title);
      document.title = `${title || "Untitled article"} | Admin`;
    } catch {
      /* Keep the last valid title while source is being edited. */
    }
  }, [state?.source, record.kind, onTitleChange]);
  useEffect(() => {
    const logout = (event: StorageEvent) => {
      // A cross-tab logout must tear down exactly what a same-tab logout does,
      // so it routes through localLogout rather than repeating a subset here.
      if (event.key === recoveryLogoutKey) localLogout();
    };
    const localLogout = () => {
      recoveryStorageKey.current = null;
      recoveryChannel.current?.close();
      recoveryChannel.current = null;
      setRecoveryRead({ status: "missing" });
      setRecoveryProblem(null);
      setRecoveredAwaitingSave(false);
      // Drop any fetched saved-draft comparison and invalidate its request, so
      // a late response cannot land after logout.
      saveComparisonRequest.current += 1;
      setSaveComparison(null);
      setSaveComparisonLoading(false);
      setSaveComparisonError("");
    };
    window.addEventListener(recoveryLogoutKey, localLogout);
    window.addEventListener("storage", logout);
    const guard = (event: BeforeUnloadEvent) => {
      titleFlush.current?.();
      subtitleFlush.current?.();
      bodyFlush.current?.();
      if (
        bodyDirtyRef.current ||
        (editor.current && editor.current.state.status !== "saved")
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => {
      window.removeEventListener("beforeunload", guard);
      window.removeEventListener("storage", logout);
      window.removeEventListener(recoveryLogoutKey, localLogout);
    };
  }, []);
  if (!state || !snapshot)
    return error ? (
      <RecoveryBanner
        title={error}
        onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
      />
    ) : (
      <AdminSkeleton fields={editorialFields(record)} />
    );
  let fields = editorialFields(record);
  let values: string[] = [];
  let parseable = false;
  let valid = false;
  let destinationId = record.id;
  const fieldErrors = new Map<string, string>();
  try {
    const parsed = parseEditorialSource(state.source);
    parseable = true;
    const configuredSlug = (parsed.data as Record<string, unknown>).slug;
    if (
      record.kind !== "page" &&
      typeof configuredSlug === "string" &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(configuredSlug)
    )
      destinationId = configuredSlug;
    fields = editorialFields(record, parsed.data);
    values = fields.map((field) =>
      String(parsed.document.getIn(field.path) ?? ""),
    );
    if (record.kind === "page" && record.id === "home") {
      const index = fields.findIndex((field) => field.rich);
      values[index] = editableHomeSummary(
        values[index] ?? "",
        (parsed.data as { sections: { intro: { mention_keys?: string[] } } })
          .sections.intro.mention_keys ?? [],
        (parsed.data as { mentions: Parameters<typeof editableHomeSummary>[2] })
          .mentions,
        parsed.document.getIn(["sections", "intro", "subheading_format"]) ===
          "markdown",
      );
    }
    const validation = validateEditorialSource(record, state.source);
    valid = validation.success;
    if (!validation.success)
      for (const issue of validation.error.issues)
        fieldErrors.set(
          issue.path.join("."),
          issue.code === "too_small" &&
            issue.type === "string" &&
            issue.minimum === 1
            ? "This field is required."
            : issue.message,
        );
  } catch {
    /* Source remains editable and recoverable while malformed. */
  }
  const download = (source?: string, name = `${record.id}-draft.md`) => {
    if (source === undefined) {
      flushLocal();
      source = editor.current!.state.source;
    }
    const url = URL.createObjectURL(
      new Blob([source], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  };
  const needsSaveComparison = saveNeedsComparison(state.saveFailureCode);
  const refusedSave = saveRefused(state.saveFailureCode);
  const comparedDraft = state.conflict
    ? state.conflict.current
    : needsSaveComparison
      ? (saveComparison?.draft ?? null)
      : null;
  const compareSavedDraft = async () => {
    // Capture buffered typing locally; do not resend an unreconcilable operation.
    flushLocal();
    const request = ++saveComparisonRequest.current;
    const navigation = navigationGeneration.current;
    const controller = editor.current;
    const isCurrent = () =>
      request === saveComparisonRequest.current &&
      navigation === navigationGeneration.current &&
      controller === editor.current &&
      saveNeedsComparison(controller?.state.saveFailureCode);
    setSaveComparisonLoading(true);
    setSaveComparisonError("");
    setSaveComparison(null);
    try {
      const response = await fetch(endpoint("draft"), {
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error();
      const data: { draft: Draft | null } = await response.json();
      if (data.draft === undefined) throw new Error();
      if (isCurrent()) setSaveComparison(data);
    } catch {
      if (isCurrent())
        setSaveComparisonError(
          "Couldn’t load the saved draft. Your edits are retained. Try comparing again.",
        );
    } finally {
      if (request === saveComparisonRequest.current)
        setSaveComparisonLoading(false);
    }
  };
  const refreshReview = async () => {
    const request = ++reviewRequest.current;
    const navigation = navigationGeneration.current;
    const controller = editor.current;
    setReviewLoading(true);
    try {
      await ensureDraft();
      if (
        request !== reviewRequest.current ||
        navigation !== navigationGeneration.current ||
        controller !== editor.current
      )
        return;
      const reviewed = captureReviewedDraft(controller?.state ?? null);
      setReviewedDraft(reviewed);
      if (!reviewed) setError("Save your draft before reviewing changes.");
    } catch {
      if (
        request === reviewRequest.current &&
        navigation === navigationGeneration.current
      )
        setError("Couldn’t prepare this review. Your draft is retained.");
    } finally {
      if (request === reviewRequest.current) setReviewLoading(false);
    }
  };
  const refreshPreview = async () => {
    if (!previewSupported || snapshot.draft?.discardedAt) return;
    const request = ++previewRequest.current;
    const navigation = navigationGeneration.current;
    const controller = editor.current;
    setPreviewLoading(true);
    try {
      await ensureDraft();
      if (
        request !== previewRequest.current ||
        navigation !== navigationGeneration.current ||
        controller !== editor.current
      )
        return;
      const current = controller!.state;
      if (
        current.status === "saved" &&
        current.revision > 0 &&
        validateEditorialSource(record, current.source).success
      ) {
        setError("");
        setPreviewRevision(current.revision);
      } else setError("Save a valid draft before previewing.");
    } catch {
      if (
        request === previewRequest.current &&
        navigation === navigationGeneration.current
      )
        setError("Couldn’t prepare the preview. Your draft is retained.");
    } finally {
      if (request === previewRequest.current) setPreviewLoading(false);
    }
  };
  const loadHistory = async () => {
    const request = ++historyRequest.current;
    const navigation = navigationGeneration.current;
    const controller = editor.current;
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      await flush();
      const response = await fetch(endpoint("record"), {
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error();
      const data: Snapshot = await response.json();
      if (
        request !== historyRequest.current ||
        navigation !== navigationGeneration.current ||
        controller !== editor.current
      )
        return;
      setSnapshot((previous) =>
        previous ? { ...previous, history: data.history } : previous,
      );
    } catch {
      if (
        request === historyRequest.current &&
        navigation === navigationGeneration.current
      )
        setHistoryError(true);
    } finally {
      if (request === historyRequest.current) setHistoryLoading(false);
    }
  };
  const compareWebsite = async () => {
    if (comparisonLoading) return;
    setComparisonLoading(true);
    try {
      const response = await fetch(endpoint("record"), {
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error();
      const data: Snapshot = await response.json();
      setComparison(data.base);
      setError("");
    } catch {
      setError("Couldn’t load the current website source. Try again.");
    } finally {
      setComparisonLoading(false);
    }
  };
  const openHistory = () => openPanel("history");
  workspaceActions.current = {
    preview: refreshPreview,
    review: refreshReview,
    history: loadHistory,
  };
  const reviewedSource = reviewedDraft?.source ?? state.source;
  const reviewCurrent = matchesReviewedDraft(reviewedDraft, state);
  const isDocumentView = tab === "edit" || tab === "preview";
  const saveStatus = saveStatusFromController(state, {
    discarded: Boolean(snapshot.draft?.discardedAt),
    bodyDirty,
    localPreview,
  });
  const publishActions = (
    <>
      <Button
        label="Approve and publish"
        variant="primary"
        size="sm"
        isDisabled={
          localPreview ||
          snapshot.publishing !== "ready" ||
          !reviewCurrent ||
          reviewLoading ||
          state.source === snapshot.base.source ||
          !valid ||
          Boolean(snapshot.draft?.discardedAt) ||
          Boolean(
            publication && !["live", "cancelled"].includes(publication.phase),
          )
        }
        isLoading={publishing}
        clickAction={async () => {
          if (publishPending.current || !reviewCurrent || reviewLoading) return;
          publishPending.current = true;
          const navigation = navigationGeneration.current;
          const reviewed = reviewedDraft;
          setPublishing(true);
          setError("");
          try {
            await ensureDraft();
            const current = editor.current!.state;
            if (
              current.status !== "saved" ||
              !matchesReviewedDraft(reviewed, current) ||
              navigation !== navigationGeneration.current ||
              !validateEditorialSource(record, current.source).success
            )
              throw new Error();
            if (publishRequest.current?.revision !== current.revision)
              publishRequest.current = {
                revision: current.revision,
                id: crypto.randomUUID(),
              };
            const result = await post(
              "publish",
              {
                expectedRevision: current.revision,
                operationId: publishRequest.current.id,
                discloseSource: true,
              },
              () =>
                navigation === navigationGeneration.current &&
                matchesReviewedDraft(reviewed, editor.current?.state ?? null),
            );
            if (!result.publication) throw new Error();
            setPublicationStale(false);
            setPublication(result.publication);
          } catch {
            if (navigation === navigationGeneration.current)
              setError(
                "Couldn’t start publishing. Your draft is retained; review the saved revision and retry.",
              );
          } finally {
            publishPending.current = false;
            setPublishing(false);
          }
        }}
      />
    </>
  );
  return (
    <VStack
      gap={5}
      className={`editor-workspace${record.kind === "writing" ? " writing-workspace" : ""}`}
      data-editor-view={tab}
    >
      {tab === "publish" ? (
        <ReviewHeading
          id={reviewHeadingId}
          level={1}
          saveStatus={{ state: saveStatus }}
        />
      ) : record.kind !== "writing" ? (
        <Heading level={1}>{pageTitle ?? record.id}</Heading>
      ) : null}
      <VStack className="editor-actionbar">
        <Toolbar
          label="Document actions"
          size="sm"
          startContent={
            <HStack
              gap={3}
              wrap="wrap"
              vAlign="center"
              className="editor-save-group"
            >
              {record.kind === "writing" && isDocumentView && (
                <Button
                  label={
                    returnPath.includes("group=writing") ? "Writing" : "Content"
                  }
                  href={returnPath}
                  isLoading={leaving}
                  onClick={async (event) => {
                    if (
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    event.preventDefault();
                    void leaveDocument(returnPath);
                  }}
                  variant="ghost"
                  size="sm"
                  icon={<ArrowLeftIcon size={18} />}
                />
              )}
              {!isDocumentView && (
                <Button
                  label="Back to editor"
                  variant="ghost"
                  icon={<ArrowLeftIcon size={18} />}
                  onClick={() => setTab("edit")}
                  size="sm"
                />
              )}
              {tab !== "publish" && <SaveStatus state={saveStatus} />}
            </HStack>
          }
          endContent={
            <HStack gap={2} wrap="wrap" className="editor-primary-actions">
              {record.kind === "writing" && isDocumentView && (
                <Button
                  label={tab === "preview" ? "Edit" : "Preview"}
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (tab === "edit")
                      editScroll.current =
                        document.getElementById("astryx-app-shell-main")
                          ?.scrollTop ?? window.scrollY;
                    setTab(tab === "preview" ? "edit" : "preview");
                  }}
                />
              )}
              {tab !== "publish" && (
                <Button
                  label="Review changes"
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setTab("publish");
                  }}
                  isLoading={reviewLoading}
                  isDisabled={!valid || Boolean(snapshot.draft?.discardedAt)}
                />
              )}
              {record.kind === "writing" && (
                <Button
                  label="Properties"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    openPanel(panel === "properties" ? null : "properties")
                  }
                />
              )}
              {publication && (
                <Button
                  label="Publication"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    openPanel(panel === "publication" ? null : "publication")
                  }
                />
              )}
              {tab === "publish" && publishActions}
              <MoreMenu
                label="Document actions"
                icon={<DotsThreeIcon size={20} />}
                size="sm"
                alignment="end"
                items={[
                  { label: "View source", onClick: () => setTab("source") },
                  {
                    label: "Version history",
                    onClick: () => {
                      void openHistory();
                    },
                  },
                  {
                    label: "Compare with website",
                    isDisabled: comparisonLoading,
                    onClick: () => {
                      void compareWebsite();
                    },
                  },
                  { type: "divider" },
                  ...(localPreview
                    ? [
                        {
                          label: "Open production editor",
                          description:
                            "Opens the current production draft. Download this local draft to keep a copy.",
                          onClick: () => {
                            window.open(
                              `https://admin.anipotts.com/content/${record.kind === "page" ? (record.id === "home" ? "home" : `${record.id}Page`) : record.kind === "work" ? "projects" : "writing"}/${record.id}`,
                              "_blank",
                              "noopener,noreferrer",
                            );
                          },
                        },
                      ]
                    : []),
                  { label: "Download draft", onClick: () => download() },
                  {
                    label: "Import draft…",
                    isDisabled:
                      importing || Boolean(snapshot.draft?.discardedAt),
                    onClick: () => importInput.current?.click(),
                  },
                  ...(state.status === "unsaved" &&
                  !needsSaveComparison &&
                  !refusedSave
                    ? [
                        { type: "divider" as const },
                        {
                          label: "Save now",
                          isDisabled: Boolean(snapshot.draft?.discardedAt),
                          onClick: () => {
                            void flush();
                          },
                        },
                      ]
                    : []),
                ]}
              />
            </HStack>
          }
        />
      </VStack>
      <HStack
        className="record-workspace-layout"
        data-record-workspace
        gap={6}
        vAlign="start"
      >
        <VStack className="record-workspace-main" gap={5}>
          {snapshot.draft?.discardedAt && (
            <Button
              label="Recover draft"
              clickAction={async () => {
                try {
                  const result = await post("restore", {
                    expectedRevision: state.revision,
                  });
                  if (!result.draft) throw new Error();
                  setSnapshot({ ...snapshot, draft: result.draft });
                  resetBuffers();
                  editor.current!.resolve(result.draft, false);
                  toast({ body: "Draft recovered", uniqueID: "draft-recover" });
                } catch {
                  setError(
                    "recovery failed. reload to compare the latest revision.",
                  );
                }
              }}
            />
          )}
          {recoveryProblem && (
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
                recoveryRead.status === "changed" &&
                !snapshot.draft?.discardedAt
                  ? recoveryRead.candidates?.map(({ label, value }) => ({
                      label,
                      source: value.source,
                      onChoose: async () => {
                        const channel = recoveryChannel.current;
                        const controller = editor.current;
                        if (!channel || !controller) return;
                        const problem = await channel.choose(value);
                        if (recoveryChannel.current !== channel) return;
                        setRecoveryProblem(problem);
                        if (!problem) {
                          recoveryAwaitingSave.current = true;
                          setRecoveredAwaitingSave(true);
                          resetBuffers();
                          controller.recover(value);
                        }
                      },
                    }))
                  : []
              }
            />
          )}
          {recoveredAwaitingSave && (
            <Banner
              status="info"
              title="Recovered edits are ready to review"
              description="Recovery has not saved or published these edits. Review them, then save the private draft."
              endContent={
                <Button
                  label="Save recovered edits"
                  size="sm"
                  clickAction={async () => {
                    recoveryAwaitingSave.current = false;
                    setRecoveredAwaitingSave(false);
                    await flush();
                  }}
                />
              }
            />
          )}
          {error && (
            <RecoveryBanner
              title={error}
              actionLabel="Download draft"
              onRetry={() => download()}
            />
          )}
          {needsSaveComparison && (
            <VStack gap={2}>
              <Banner
                status="warning"
                title="Compare before saving again"
                description={
                  state.saveFailureCode === "idempotency_key_reused"
                    ? "This save’s request ID was already used for different content, so its result could not be confirmed. Your edits are retained. Compare the saved draft before choosing which version to keep."
                    : "The result of an older save could not be confirmed. Your edits are retained. Compare the saved draft before choosing which version to keep."
                }
                endContent={
                  <HStack gap={2} wrap="wrap">
                    <Button
                      label="Compare saved draft"
                      size="sm"
                      isLoading={saveComparisonLoading}
                      clickAction={compareSavedDraft}
                    />
                    <Button
                      label="Download draft"
                      size="sm"
                      onClick={() => download()}
                    />
                  </HStack>
                }
              />
              {saveComparisonError && (
                <Text role="alert">{saveComparisonError}</Text>
              )}
            </VStack>
          )}
          {state.saveFailed && refusedSave && (
            <RecoveryBanner
              title={
                state.saveFailureCode === "source_too_large"
                  ? "Draft is too large to save"
                  : "Draft could not be saved"
              }
              description={
                state.saveFailureCode === "source_too_large"
                  ? "Saving stopped because drafts are limited to 512 KB. Download a copy, then shorten the draft to resume saving."
                  : "Saving stopped because the server rejected this draft as invalid. Your edits are retained. Download a copy, then edit the draft to try again."
              }
              actionLabel="Download draft"
              onRetry={() => download()}
            />
          )}
          {state.saveFailed && !needsSaveComparison && !refusedSave && (
            <RecoveryBanner
              title="Draft could not be saved"
              description={
                state.saveFailureCode === "draft_base_changed"
                  ? "The website version changed while this draft was saving. Your edits are still here. Retry saving before leaving this page."
                  : "Your edits are still here. Retry saving before leaving this page."
              }
              actionLabel="Retry save"
              onRetry={() => flush()}
            />
          )}
          {comparisonLoading && <Spinner label="Loading website source…" />}
          {comparison && (
            <VStack gap={2}>
              <Text>
                compare the current website with your draft. update your draft
                below before keeping it over the website version.
              </Text>
              <TextArea
                label="Current website source"
                value={comparison.source}
                isReadOnly
                rows={5}
              />
              <TextArea
                label="Your draft source"
                value={state.source}
                isReadOnly
                rows={5}
              />
              <Button
                label="Keep draft over this website version"
                isDisabled={
                  state.status !== "saved" ||
                  Boolean(snapshot.draft?.discardedAt) ||
                  Boolean(
                    publication &&
                    !["live", "cancelled"].includes(publication.phase),
                  )
                }
                clickAction={async () => {
                  try {
                    await ensureDraft();
                    const current = editor.current!.state;
                    if (current.status !== "saved") throw new Error();
                    const result = await post("rebase", {
                      source: current.source,
                      expectedRevision: current.revision,
                      requestId: crypto.randomUUID(),
                      reviewedBaseCommit: comparison.baseCommit,
                      reviewedBaseFileHash: comparison.baseFileHash,
                    });
                    if (result.error === "upstream_changed") {
                      setComparison(result.base);
                      setError(
                        "website changed again. compare the updated source before continuing.",
                      );
                      return;
                    }
                    if (!result.ok) throw new Error();
                    setSnapshot({
                      ...snapshot,
                      base: comparison,
                      draft: result.draft,
                    });
                    editor.current!.resolve(
                      result.draft,
                      editor.current!.state.source !== result.draft.source,
                    );
                    setComparison(null);
                    setPreviewRevision(null);
                    setError("");
                  } catch {
                    setError(
                      "couldn’t update the draft base. reload to compare the latest saved revision.",
                    );
                  }
                }}
              />
              <Button
                label="Close comparison"
                onClick={() => setComparison(null)}
              />
            </VStack>
          )}
          {(state.conflict || (needsSaveComparison && saveComparison)) && (
            <VStack gap={2}>
              {state.conflict && (
                <Banner
                  status="warning"
                  title={
                    comparedDraft
                      ? "Another edit was saved"
                      : "Saved draft not found"
                  }
                  description={
                    comparedDraft
                      ? "Compare the saved source with your draft before choosing which version to keep."
                      : "The saved draft this edit was based on is no longer available. Your edits are retained."
                  }
                />
              )}
              {comparedDraft && (
                <TextArea
                  label="Saved on another tab or device"
                  value={comparedDraft.source}
                  isReadOnly
                  rows={5}
                />
              )}
              {needsSaveComparison && (
                <TextArea
                  label="Your retained draft"
                  value={state.source}
                  isReadOnly
                  rows={5}
                />
              )}
              {!comparedDraft && (
                <Text>
                  No saved draft is available to compare. Keep your version to
                  save your retained edits as a new draft.
                </Text>
              )}
              {needsSaveComparison &&
                comparedDraft &&
                comparedDraft.discardedAt !== null && (
                  <VStack gap={2}>
                    <Text>
                      This saved draft was discarded. Restore it before choosing
                      which version to keep.
                    </Text>
                    <Button
                      label="Restore saved draft"
                      clickAction={async () => {
                        const controller = editor.current;
                        const navigation = navigationGeneration.current;
                        const request = saveComparisonRequest.current;
                        const isCurrent = () =>
                          controller === editor.current &&
                          navigation === navigationGeneration.current &&
                          request === saveComparisonRequest.current &&
                          saveNeedsComparison(
                            controller?.state.saveFailureCode,
                          );
                        try {
                          const result = await post("restore", {
                            expectedRevision: comparedDraft.revision,
                          });
                          if (!result.draft) throw new Error();
                          if (!isCurrent()) return;
                          setSaveComparison({ draft: result.draft });
                        } catch {
                          if (isCurrent())
                            setSaveComparisonError(
                              "Couldn’t restore the saved draft. Your edits are retained. Compare again before retrying.",
                            );
                        }
                      }}
                    />
                  </VStack>
                )}
              <HStack gap={2}>
                <Button
                  label="Keep my version"
                  isDisabled={Boolean(
                    comparedDraft && comparedDraft.discardedAt !== null,
                  )}
                  clickAction={async () => {
                    flushLocal();
                    // Without a saved draft this starts a new one from the edits.
                    editor.current!.resolve(comparedDraft, true);
                    setSaveComparison(null);
                    setSaveComparisonError("");
                    setError("");
                    setReviewedDraft(null);
                    setPreviewRevision(null);
                    await flush();
                  }}
                />
                {comparedDraft && (
                  <Button
                    label="Use saved version"
                    isDisabled={comparedDraft.discardedAt !== null}
                    onClick={() => {
                      resetBuffers();
                      editor.current!.resolve(comparedDraft, false);
                      setSaveComparison(null);
                      setSaveComparisonError("");
                      setError("");
                      setReviewedDraft(null);
                      setPreviewRevision(null);
                    }}
                  />
                )}
              </HStack>
            </VStack>
          )}
          {isDocumentView && record.kind !== "writing" ? (
            <HStack
              gap={3}
              wrap="wrap"
              vAlign="center"
              className="editor-viewbar"
            >
              <TabList
                size="sm"
                value={tab}
                onChange={(next) => {
                  setTab(next);
                }}
              >
                <Tab label="Edit" value="edit" />
                {previewSupported && <Tab label="Preview" value="preview" />}
              </TabList>
            </HStack>
          ) : !isDocumentView && tab !== "publish" ? (
            <Heading level={2}>
              {tab === "source" ? "Source" : "Version history"}
            </Heading>
          ) : null}
          {!previewSupported && tab === "edit" && (
            <Text color="secondary" type="supporting">
              Website preview is unavailable for this draft-only newsletter
              page.
            </Text>
          )}
          {tab === "preview" && !previewSupported && (
            <EmptyState
              title="Preview unavailable"
              description="This draft-only newsletter page has no website preview. You can still edit, review changes, and view source."
            />
          )}
          {tab === "preview" && previewSupported && (
            <VStack gap={2}>
              {previewRevision && (
                <HStack gap={3} wrap="wrap" vAlign="center">
                  <Text color="secondary" type="supporting">
                    Preview of saved revision {previewRevision}
                  </Text>
                  <Button
                    label="Refresh preview"
                    size="sm"
                    variant="ghost"
                    isLoading={previewLoading}
                    clickAction={refreshPreview}
                  />
                </HStack>
              )}
              {previewRevision && record.kind === "writing" ? (
                <SavedArticlePreview
                  title={`${record.id} draft preview`}
                  src={`/preview/record?${query}&revision=${previewRevision}`}
                />
              ) : previewRevision ? (
                <iframe
                  title={`${record.id} draft preview`}
                  src={`/preview/${record.kind === "page" && record.id === "home" ? "home" : "record"}?${query}&revision=${previewRevision}`}
                  sandbox="allow-scripts"
                  referrerPolicy="no-referrer"
                  className="editorial-preview"
                />
              ) : previewLoading ? (
                <Spinner label="Preparing preview…" />
              ) : (
                <EmptyState
                  title="Preview unavailable"
                  description="Check your draft, then try again."
                  actions={
                    <Button
                      label="Retry preview"
                      clickAction={refreshPreview}
                    />
                  }
                />
              )}
            </VStack>
          )}
          {(tab === "edit" || record.kind === "writing") && (
            <VStack
              gap={0}
              hidden={tab !== "edit"}
              style={tab !== "edit" ? { display: "none" } : undefined}
              onFocusCapture={(event) => {
                const target = event.target as HTMLElement;
                if (target.matches('textarea, input, [contenteditable="true"]'))
                  lastEditingFocus.current = target;
              }}
            >
              <FormLayout>
                {fields.map((field, index) =>
                  record.kind === "writing" &&
                  field.path.join(".") === "title" ? (
                    <DocumentTitle
                      resetGeneration={resetGeneration}
                      key="title"
                      value={values[index] ?? ""}
                      disabled={
                        !parseable || Boolean(snapshot.draft?.discardedAt)
                      }
                      error={fieldErrors.get("title")}
                      flushRef={titleFlush}
                      onDirty={() => {
                        editGeneration.current += 1;
                        bodyDirtyRef.current = true;
                        setBodyDirty(true);
                        saveScheduler.current?.changed();
                      }}
                      onDraftTitle={(value) => {
                        onTitleChange?.(value);
                        document.title = `${value || "Untitled article"} | Admin`;
                      }}
                      onCommit={(value) =>
                        editor.current!.edit(
                          setEditorialField(
                            editor.current!.state.source,
                            field.path,
                            value,
                          ),
                        )
                      }
                    />
                  ) : field.rich ? (
                    <RichTextField
                      resetGeneration={resetGeneration}
                      compact={record.kind === "writing"}
                      flushRef={
                        record.kind === "writing" ? subtitleFlush : undefined
                      }
                      onDirty={
                        record.kind === "writing"
                          ? () => {
                              editGeneration.current += 1;
                              bodyDirtyRef.current = true;
                              setBodyDirty(true);
                              saveScheduler.current?.changed();
                            }
                          : undefined
                      }
                      key={field.path.join(".")}
                      label={field.label}
                      description={
                        record.kind === "writing"
                          ? undefined
                          : field.description
                      }
                      validationError={fieldErrors.get(field.path.join("."))}
                      value={values[index] ?? ""}
                      disabled={
                        !parseable || Boolean(snapshot.draft?.discardedAt)
                      }
                      onChange={(value) => {
                        let next = setEditorialField(
                          editor.current!.state.source,
                          field.path,
                          value,
                        );
                        if (record.kind === "page" && record.id === "home")
                          next = setEditorialField(
                            next,
                            ["sections", "intro", "subheading_format"],
                            "markdown",
                          );
                        editor.current!.edit(next);
                      }}
                    />
                  ) : (
                    <TextInput
                      key={field.path.join(".")}
                      label={field.label}
                      description={field.description}
                      status={
                        fieldErrors.has(field.path.join("."))
                          ? {
                              type: "error",
                              message: fieldErrors.get(field.path.join(".")),
                            }
                          : undefined
                      }
                      value={values[index] ?? ""}
                      isDisabled={
                        !parseable || Boolean(snapshot.draft?.discardedAt)
                      }
                      onChange={(value) =>
                        editor.current!.edit(
                          setEditorialField(
                            editor.current!.state.source,
                            field.path,
                            value,
                          ),
                        )
                      }
                    />
                  ),
                )}
                {record.kind === "writing" && parseable && (
                  <>
                    <ArticleBody
                      resetGeneration={resetGeneration}
                      flushRef={bodyFlush}
                      onDirty={() => {
                        editGeneration.current += 1;
                        bodyDirtyRef.current = true;
                        setBodyDirty(true);
                        saveScheduler.current?.changed();
                      }}
                      value={parseEditorialSource(state.source).body}
                      disabled={Boolean(snapshot.draft?.discardedAt)}
                      onChange={(body) => {
                        const source = editor.current!.state.source;
                        const oldBody = parseEditorialSource(source).body;
                        editor.current!.edit(
                          source.slice(0, source.length - oldBody.length) +
                            body,
                        );
                      }}
                    />
                  </>
                )}
              </FormLayout>
            </VStack>
          )}
          {tab === "publish" && (
            <VStack gap={4} className="editor-review">
              {reviewLoading && <Text role="status">Preparing review…</Text>}
              {!reviewedDraft && !reviewLoading && (
                <Button
                  label="Retry review"
                  onClick={() => void refreshReview()}
                />
              )}
              <ReviewChanges
                labelledBy={reviewHeadingId}
                destination={`anipotts.com${record.kind === "page" ? (record.id === "home" ? "/" : `/${record.id}`) : `/${record.kind}/${destinationId}`}`}
                before={snapshot.base.source}
                after={reviewedSource}
                changes={[
                  ...fields.flatMap((field) => {
                    try {
                      return [
                        {
                          label: field.label,
                          rich: field.rich,
                          before: String(
                            parseEditorialSource(
                              snapshot.base.source,
                            ).document.getIn(field.path) ?? "",
                          ),
                          after: String(
                            parseEditorialSource(reviewedSource).document.getIn(
                              field.path,
                            ) ?? "",
                          ),
                        },
                      ];
                    } catch {
                      return [];
                    }
                  }),
                  ...(record.kind === "writing" && parseable
                    ? writingReviewChanges(snapshot.base.source, reviewedSource)
                    : []),
                ]}
              />
              {reviewedDraft && !reviewCurrent && (
                <Banner
                  status="warning"
                  title="This review is out of date"
                  description="The draft changed after this review opened."
                  endContent={
                    <Button
                      label="Review latest changes"
                      onClick={() => void refreshReview()}
                      isLoading={reviewLoading}
                    />
                  }
                />
              )}
            </VStack>
          )}
          {tab === "source" && (
            <VStack gap={3}>
              <Text color="secondary">
                The complete Markdown file. Formatting uses standard Markdown;
                underlines use &lt;u&gt;. Use Document actions to import or
                download a draft. Imports replace this private draft and retain
                revision history.
              </Text>
            </VStack>
          )}
          <input
            ref={importInput}
            type="file"
            hidden
            accept=".md,text/markdown,text/plain"
            aria-label="Import draft"
            disabled={Boolean(snapshot.draft?.discardedAt)}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (file.size > 512 * 1024) {
                setError("Choose a Markdown file smaller than 512 KB.");
                return;
              }
              flushLocal();
              const beforeGeneration = editGeneration.current;
              const beforeImport = editor.current!.state.source;
              setImporting(true);
              try {
                const source = await file.text();
                if (
                  editGeneration.current !== beforeGeneration ||
                  editor.current!.state.source !== beforeImport
                ) {
                  setError(
                    "Your draft changed while the file was opening. Import it again when you are ready.",
                  );
                  return;
                }
                if (!validateEditorialSource(record, source).success)
                  throw new Error();
                resetBuffers();
                editor.current!.edit(source);
                setTab("edit");
                setError("");
                toast({
                  body: "Draft imported. Saving your changes…",
                  uniqueID: "draft-import",
                });
              } catch {
                setError(
                  "That file does not match this record. Your draft was kept.",
                );
              } finally {
                setImporting(false);
              }
            }}
          />
          <SourceEditor
            source={state.source}
            onChange={(source) => editor.current!.edit(source)}
            hidden={tab !== "source"}
            readOnly={Boolean(snapshot.draft?.discardedAt)}
          />
          {!valid && (
            <Banner
              status="warning"
              title={
                parseable
                  ? "Complete the draft details"
                  : "Source needs correction"
              }
              description={
                parseable
                  ? "Review the highlighted fields and article settings before previewing or publishing. Your edits are retained."
                  : "Fix the source before previewing or publishing. Your edits are retained."
              }
              endContent={
                !parseable && (
                  <Button
                    label="Edit source"
                    onClick={() => setTab("source")}
                  />
                )
              }
            />
          )}
        </VStack>
        {panel && (
          <RecordPanel
            title={
              panel === "properties"
                ? "Properties"
                : panel === "history"
                  ? "Version history"
                  : "Publication"
            }
            onClose={() => openPanel(null)}
          >
            {panel === "properties" && !parseable && (
              <Banner
                status="warning"
                title="Properties need valid source"
                description="Your draft is retained. Correct the source to edit its properties."
                endContent={
                  <Button
                    label="Edit source"
                    onClick={() => setTab("source")}
                  />
                }
              />
            )}
            {panel === "properties" &&
              record.kind === "writing" &&
              parseable && (
                <ArticleSettings
                  disclosure={false}
                  errors={fieldErrors}
                  source={state.source}
                  id={record.id}
                  disabled={Boolean(snapshot.draft?.discardedAt)}
                  onChange={(source) => editor.current!.edit(source)}
                />
              )}
            {panel === "history" && (
              <VStack gap={2}>
                <Text color="secondary">
                  Restore an earlier version as a new draft. Existing revisions
                  stay available.
                </Text>
                {historyError && (
                  <RecoveryBanner
                    title="Couldn’t load history"
                    onRetry={loadHistory}
                  />
                )}
                {historyLoading &&
                  (snapshot.history.length ? (
                    <Text role="status" color="secondary">
                      Refreshing history…
                    </Text>
                  ) : (
                    <AdminSkeleton kind="history" />
                  ))}
                {snapshot.history.map((revision) => (
                  <HStack
                    key={revision.revision}
                    gap={3}
                    wrap="wrap"
                    vAlign="center"
                    className="editor-history-row"
                  >
                    <VStack gap={1}>
                      <Text weight="semibold">
                        Revision {revision.revision}
                      </Text>
                      <Timestamp
                        value={new Date(revision.updatedAt).toISOString()}
                        format="date_time"
                        isTimezoneShown
                      />
                    </VStack>
                    <HStack gap={2}>
                      <Button
                        label="Restore"
                        aria-label={`Restore revision ${revision.revision}`}
                        variant="ghost"
                        size="sm"
                        isDisabled={Boolean(snapshot.draft?.discardedAt)}
                        onClick={() => {
                          resetBuffers();
                          editor.current!.edit(revision.source);
                          setTab("edit");
                          toast({
                            body: `Revision ${revision.revision} restored as a draft.`,
                            uniqueID: "draft-restore",
                          });
                        }}
                      />
                      <MoreMenu
                        label={`Revision ${revision.revision} actions`}
                        size="sm"
                        items={[
                          {
                            label: "Download revision",
                            onClick: () =>
                              download(
                                revision.source,
                                `${record.id}-revision-${revision.revision}.md`,
                              ),
                          },
                        ]}
                      />
                    </HStack>
                  </HStack>
                ))}
                {!historyLoading &&
                  !historyError &&
                  snapshot.history.length === 0 && (
                    <EmptyState
                      title="No saved revisions yet"
                      description="Revisions appear after you save an edit."
                      actions={
                        <Button
                          label="Back to editor"
                          onClick={() => setTab("edit")}
                        />
                      }
                    />
                  )}
              </VStack>
            )}{" "}
            {panel === "publication" && publication && (
              <PublicationProgress
                publication={publication}
                stale={publicationStale}
              >
                {publication.blocked &&
                  ["validate", "commit", "branch", "pr", "checks"].includes(
                    publication.phase,
                  ) && (
                    <Button
                      label="Stop publishing"
                      size="sm"
                      clickAction={async () => {
                        try {
                          const result = await post("cancel-publication", {
                            expectedRevision: state.revision,
                            operationId: publication.id,
                            expectedVersion: publication.version,
                          });
                          if (!result.ok) throw new Error();
                          setError("");
                          setPublicationStale(false);
                          setPublication({ ...publication, blocked: null });
                        } catch {
                          setError(
                            "couldn’t stop. reload to check the latest publication.",
                          );
                        }
                      }}
                    />
                  )}
                {publication.blocked &&
                  !["publication_base_changed", "record_changed"].includes(
                    publication.blocked,
                  ) && (
                    <Button
                      label="Retry publishing"
                      size="sm"
                      clickAction={async () => {
                        try {
                          const result = await post("retry-publication", {
                            expectedRevision: state.revision,
                            operationId: publication.id,
                            expectedVersion: publication.version,
                          });
                          if (!result.ok) throw new Error();
                          setError("");
                          setPublicationStale(false);
                          setPublication({ ...publication, blocked: null });
                        } catch {
                          setError(
                            "couldn’t retry. reload to check the latest publication.",
                          );
                        }
                      }}
                    />
                  )}
              </PublicationProgress>
            )}
            {panel === "publication" && !publication && (
              <EmptyState
                title="No publication yet"
                description="Publication details appear after you approve a reviewed draft."
              />
            )}
          </RecordPanel>
        )}
      </HStack>
    </VStack>
  );
}

function SourceEditor({
  source,
  onChange,
  hidden,
  readOnly = false,
}: {
  source: string;
  onChange: (source: string) => void;
  hidden: boolean;
  readOnly?: boolean;
}) {
  const host = useRef<HTMLElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const readOnlyMode = useRef(new Compartment());
  const appliedSource = useRef(source);
  const applyingSource = useRef(false);
  const newline = useRef(source.includes("\r\n") ? "\r\n" : "\n");
  const change = useRef(onChange);
  change.current = onChange;
  useEffect(() => {
    const instance = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: source,
        extensions: [
          markdown(),
          readOnlyMode.current.of(EditorState.readOnly.of(readOnly)),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": "record source" }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !applyingSource.current) {
              const next = update.state.doc
                .toString()
                .replaceAll("\n", newline.current);
              appliedSource.current = next;
              change.current(next);
            }
          }),
        ],
      }),
    });
    view.current = instance;
    return () => {
      instance.destroy();
    };
  }, []);
  useEffect(() => {
    view.current?.dispatch({
      effects: readOnlyMode.current.reconfigure(
        EditorState.readOnly.of(readOnly),
      ),
    });
  }, [readOnly]);
  useEffect(() => {
    const current = view.current;
    if (current && appliedSource.current !== source) {
      // CodeMirror normalizes line breaks internally. Merely displaying recovered
      // source must never become an authored edit or alter its retry payload.
      appliedSource.current = source;
      newline.current = source.includes("\r\n") ? "\r\n" : "\n";
      applyingSource.current = true;
      try {
        current.dispatch({
          changes: { from: 0, to: current.state.doc.length, insert: source },
        });
      } finally {
        applyingSource.current = false;
      }
    }
  }, [source]);
  return (
    <section
      ref={host}
      hidden={hidden}
      className="editorial-source"
      aria-label="Source editor"
    />
  );
}
