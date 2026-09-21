import { EditorToolBoundary } from "./EditorToolBoundary";
import { AutoSizeTextArea } from "./AutoSizeTextArea";
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
import { ProjectSections } from "./ProjectSections";
import { editProjectSections } from "../../lib/project-sections";
import { siteConfig } from "@anipotts/content/public/site";
import { ProjectMedia } from "./ProjectMedia";
import { editProjectMedia } from "../../lib/project-media";
import { ProjectSettings } from "./ProjectSettings";
import { ArticleSettings } from "./ArticleSettings";
import React, {
  useEffect,
  useId,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
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
import { discardBody } from "../../lib/response-body";
import type { PublishJob } from "../../editorial/publication-jobs";
import type {
  DirectPublicationStatus,
  PublicationStatus,
} from "../../lib/editorial-publication-status";
import { prepareWritingPublication } from "../../lib/writing-publication-source";
import { publicationSourceHash } from "@anipotts/content/editorial/publication-contract";

// Older releases can still return the original job during a rolling deploy.
type VisiblePublication =
  | (PublishJob &
      Partial<Pick<PublicationStatus, "queue" | "canCancel" | "revision">> & {
        mode?: "legacy";
        publicationId?: never;
        superseded?: never;
      })
  | DirectPublicationStatus;

type Snapshot = {
  recoveryScope?: string;
  base: HomeBase;
  draft: Draft | null;
  history: Draft[];
  nextBeforeRevision?: number | null;
  publishing: "ready" | "not_configured";
  publicationMode?: "legacy" | "maintenance" | "direct";
  publication: VisiblePublication | null;
};

const savedDraftNotFound = {
  title: "Saved draft not found",
  description:
    "The saved draft this edit was based on is no longer available. Your edits are retained.",
};

/**
 * A refused save cannot be retried, so its copy never asks the author to save.
 * The remaining invalid_draft_request causes are server-side, so editing does
 * not help. Reloading reopens the saved draft and browser recovery brings the
 * edits back for review, which is only true while recovery is working.
 */
const SourceEditor = lazy(() => import("./SourceEditor"));

function refusedSaveCopy(
  code: SaveState["saveFailureCode"],
  { leaving, recoverable }: { leaving: boolean; recoverable: boolean },
) {
  if (code === "source_too_large")
    return {
      title: "Draft is too large to save",
      description: leaving
        ? "Your latest edits are not saved because drafts are limited to 512 KB. Download a copy before leaving, or shorten the draft to resume saving."
        : "Saving stopped because drafts are limited to 512 KB. Download a copy, then shorten the draft to resume saving.",
    };
  const kept = recoverable ? " Your edits are kept on this device." : "";
  return {
    title: "Server refused this save",
    description: leaving
      ? `Your latest edits are not saved.${kept} Download a copy before leaving this draft.`
      : recoverable
        ? `Saving stopped.${kept} Download a copy, then reload to reopen the saved draft with your edits ready to review.`
        : "Saving stopped. Download a copy before you reload to reopen the saved draft.",
  };
}

/**
 * Save now is hidden while a conflict or unconfirmed save needs an explicit
 * choice, so a held leave names the actions the author still has.
 */
function heldLeaveCopy(current: SaveState | undefined, compared: boolean) {
  if (
    current?.conflict ||
    (saveNeedsComparison(current?.saveFailureCode) && compared)
  )
    return "Your latest edits are not saved. Choose which version to keep, or download a copy before leaving this draft.";
  if (saveNeedsComparison(current?.saveFailureCode))
    return "Your latest edits are not saved. Compare the saved draft and choose a version, or download a copy before leaving this draft.";
  return "Your latest edits are still here. Save them before leaving this draft.";
}

/** Tell the library, and through the inventory relay the other open tabs,
 * what an acknowledged draft now says. A row refresh never interrupts the
 * editor, so unreadable metadata is skipped. */
function announceRecordFreshness(
  record: EditorialRecord,
  draft: { source: string; revision: number; updatedAt: number | string },
  baseSource: string,
  publishedAt?: string,
) {
  try {
    const metadata = parseEditorialSource(draft.source).data as Record<
      string,
      unknown
    >;
    const intended =
      record.kind === "work" ? metadata.public_state : metadata.status;
    if (typeof metadata.title !== "string") return;
    dispatchEditorialRecordSaved({
      record,
      title: metadata.title,
      summary: editorialRecordSummary(record, metadata) ?? "",
      revision: draft.revision,
      updatedAt: new Date(draft.updatedAt).toISOString(),
      changesPending: publishedAt ? false : draft.source !== baseSource,
      ...(typeof intended === "string" ? { intendedVisibility: intended } : {}),
      ...(publishedAt ? { publishedAt } : {}),
    });
  } catch {
    /* Metadata refresh never interrupts an acknowledged save. */
  }
}

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
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [historyError, setHistoryError] = useState(false);
  const [comparedRevision, setComparedRevision] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const query = new URLSearchParams(record).toString();
  const endpoint = (action: string) => `/api/editorial/${action}?${query}`;
  const [state, setState] = useState<SaveState | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [tab, setCurrentTab] = useState("edit");
  const sourceRequested = useRef(false);
  if (tab === "source") sourceRequested.current = true;
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
  const fieldElements = useRef(new Map<string, HTMLDivElement>());
  const requestedEditingField = useRef<string | null>(null);
  useEffect(() => {
    if (tab === "edit" && previousTab.current !== "edit") {
      const frame = requestAnimationFrame(() => {
        const requested = requestedEditingField.current;
        requestedEditingField.current = null;
        const target = requested
          ? fieldElements.current
              .get(requested)
              ?.querySelector<HTMLElement>(
                'input, textarea, [contenteditable="true"]',
              )
          : null;
        if (target) {
          target.focus({ preventScroll: true });
          target.scrollIntoView({ block: "center", behavior: "instant" });
          return;
        }
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
  const mediaPending = useRef(false);
  const pendingMediaSlots = useRef(new Set<string>());
  const mediaAuthorized = useRef(true);
  const [uploadPending, setUploadPending] = useState(false);
  const holdForMedia = () => {
    if (!mediaPending.current) return false;
    setError(
      "Finish uploading or close the image crop before leaving this editor.",
    );
    return true;
  };
  const [reviewLoading, setReviewLoading] = useState(false);
  /** A leave attempt was held by a refused save the author cannot retry. */
  const [leaveRefused, setLeaveRefused] = useState(false);
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
    if (holdForMedia()) return;
    // Loading and failed initial reads have no editable state to flush.
    if (!editor.current) {
      commitAdminNavigation(href);
      return;
    }
    if (leavePending.current) return;
    leavePending.current = true;
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
        const current = editor.current?.state;
        if (current?.saveFailed && saveRefused(current.saveFailureCode)) {
          // Saving cannot succeed. The refusal banner carries the one warning.
          setError("");
          setLeaveRefused(true);
        } else setError(heldLeaveCopy(current, saveComparison !== null));
        return;
      }
      commitAdminNavigation(href);
    } catch {
      if (navigation === navigationGeneration.current)
        setError("Couldn’t save before leaving. Your draft is retained.");
    } finally {
      leavePending.current = false;
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
    if (holdForMedia()) {
      // Back/Forward has already changed the URL. Keep it aligned with the
      // retained editor while the selected image is still being processed.
      if (write === null)
        window.history.replaceState(
          window.history.state,
          "",
          recordWorkspaceUrl(
            window.location.pathname,
            window.location.search,
            workspaceState.current,
          ),
        );
      return;
    }
    if (next.panel === "properties" && record.kind === "page")
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
  const [publication, setPublication] = useState<VisiblePublication | null>(
    null,
  );
  const [publishing, setPublishing] = useState(false);
  const [publicationStale, setPublicationStale] = useState(false);
  const [reviewedDraft, setReviewedDraft] = useState<ReviewedDraft | null>(
    null,
  );
  const [reviewedBase, setReviewedBase] = useState<HomeBase | null>(null);
  const reviewRequest = useRef(0);
  const previewRequest = useRef(0);
  const historyRequest = useRef(0);
  const historyRetryCursor = useRef<number | undefined>(undefined);
  const publishPending = useRef(false);
  const [comparison, setComparison] = useState<HomeBase | null>(null);
  const publishRequest = useRef<{ revision: number; id: string } | null>(null);
  /** The saved revision this tab submitted, so the row can follow it live. */
  const publishedDraft = useRef<{
    operationId: string;
    revision: number;
    source: string;
  } | null>(null);
  async function postRequest(
    action: string,
    body: unknown,
    guard?: () => boolean,
  ) {
    if (!csrf.current) {
      const response = await fetch("/api/editorial/csrf", {
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        discardBody(response);
        throw new Error("session expired");
      }
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
      discardBody(response);
      csrf.current = "";
      throw new Error("session expired");
    }
    return response;
  }
  async function post(action: string, body: unknown, guard?: () => boolean) {
    const response = await postRequest(action, body, guard);
    if (!response.ok && response.status !== 409) {
      discardBody(response);
      throw new Error("save unavailable");
    }
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
        if (!response.ok) {
          discardBody(response);
          throw new Error("draft storage unavailable");
        }
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
            if (result.ok)
              announceRecordFreshness(record, result.draft, data.base.source);
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
    if (!publication || ["live", "cancelled"].includes(publication.phase))
      return;
    const job = publication;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active: AbortController | null = null;
    // Poll only while the page is visible. Hiding the page stops the timer and
    // the in-flight read; showing it again waits one interval before reading.
    const schedule = () => {
      clearTimeout(timer);
      timer = undefined;
      if (!cancelled && !active && !document.hidden)
        timer = setTimeout(
          () => void poll(),
          job.blocked || job.queue?.head?.blocked ? 30000 : 4000,
        );
    };
    async function poll() {
      timer = undefined;
      const request = new AbortController();
      active = request;
      try {
        const response = await fetch(
          `${endpoint("publication")}&operationId=${job.id}`,
          {
            signal: AbortSignal.any([
              request.signal,
              AbortSignal.timeout(15000),
            ]),
          },
        );
        if (!response.ok) {
          discardBody(response);
          throw new Error();
        }
        const data = await response.json();
        if (!cancelled && active === request) {
          if (!data.publication) throw new Error();
          const submitted = publishedDraft.current;
          if (
            submitted &&
            data.publication.phase === "live" &&
            submitted.operationId === data.publication.id
          ) {
            const publishedAt = new Date().toISOString();
            announceRecordFreshness(
              record,
              { ...submitted, updatedAt: publishedAt },
              submitted.source,
              publishedAt,
            );
            publishedDraft.current = null;
          }
          setPublicationStale(false);
          setPublication(data.publication);
        }
      } catch {
        if (!cancelled && active === request && !request.signal.aborted) {
          setPublicationStale(true);
          setPublication({ ...job });
        }
      } finally {
        if (active === request) active = null;
      }
    }
    const visibilityChanged = () => {
      if (document.hidden) {
        clearTimeout(timer);
        timer = undefined;
        active?.abort();
        active = null;
      } else if (timer === undefined) schedule();
    };
    document.addEventListener("visibilitychange", visibilityChanged);
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      active?.abort();
      document.removeEventListener("visibilitychange", visibilityChanged);
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
  const refusalShown = Boolean(
    state?.saveFailed && saveRefused(state.saveFailureCode),
  );
  useEffect(() => {
    // A later refusal starts without a held leave attempt.
    if (!refusalShown) setLeaveRefused(false);
  }, [refusalShown]);
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
      mediaAuthorized.current = false;
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
        mediaPending.current ||
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
  let unsupportedPublication = false;
  let storyMediaIndexes: number[] = [];
  const fieldErrors = new Map<string, string>();
  try {
    const parsed = parseEditorialSource(state.source);
    parseable = true;
    const metadata = parsed.data as Record<string, unknown>;
    if (Array.isArray(metadata.story)) {
      storyMediaIndexes = metadata.story.flatMap((section, index) =>
        section && typeof section === "object" ? [index] : [],
      );
    }
    unsupportedPublication =
      snapshot.publicationMode === "direct" &&
      ((record.kind === "writing" && metadata.status !== "published") ||
        (record.kind === "work" &&
          !["featured", "listed"].includes(String(metadata.public_state))) ||
        (record.kind === "page" && record.id === "newsletter"));
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
  const savedDraftMissing =
    needsSaveComparison && saveComparison !== null && !saveComparison.draft;
  const refusal = refusedSaveCopy(state.saveFailureCode, {
    leaving: leaveRefused,
    recoverable: recoveryProblem === null,
  });
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
      if (!response.ok) {
        discardBody(response);
        throw new Error();
      }
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
    setReviewedBase(null);
    const isCurrent = () =>
      request === reviewRequest.current &&
      navigation === navigationGeneration.current &&
      controller === editor.current;
    try {
      await ensureDraft();
      if (!isCurrent()) return;
      if (
        snapshot.publicationMode === "direct" &&
        record.kind === "writing" &&
        controller
      ) {
        const candidate = prepareWritingPublication(controller.state.source);
        if (candidate !== controller.state.source) {
          controller.edit(candidate);
          await ensureDraft();
          if (!isCurrent()) return;
        }
      }
      // Stopped approvals are immutable. A new review may explicitly create a
      // fresh private revision with identical text, never reactivate the old job.
      if (
        publication?.phase === "cancelled" &&
        (publication.revision === undefined ||
          publication.revision === controller?.state.revision)
      )
        await controller?.checkpoint();
      if (
        request !== reviewRequest.current ||
        navigation !== navigationGeneration.current ||
        controller !== editor.current
      )
        return;
      let baseline = snapshot.base;
      if (snapshot.publicationMode === "direct") {
        const response = await fetch(endpoint("baseline"), {
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) {
          discardBody(response);
          throw new Error();
        }
        baseline = (await response.json()).base;
        if (!baseline || typeof baseline.source !== "string") throw new Error();
        if (!isCurrent()) return;
        setSnapshot((previous) =>
          previous ? { ...previous, base: baseline } : previous,
        );
      }
      const reviewed = captureReviewedDraft(controller?.state ?? null);
      setReviewedBase(baseline);
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
  const loadHistory = async (beforeRevision?: number) => {
    historyRetryCursor.current = beforeRevision;
    const request = ++historyRequest.current;
    const navigation = navigationGeneration.current;
    const controller = editor.current;
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      await flush();
      const response = await fetch(
        `${endpoint("history")}${beforeRevision === undefined ? "" : `&beforeRevision=${beforeRevision}`}`,
        {
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) {
        discardBody(response);
        throw new Error();
      }
      const data: Pick<Snapshot, "history" | "nextBeforeRevision"> =
        await response.json();
      if (
        request !== historyRequest.current ||
        navigation !== navigationGeneration.current ||
        controller !== editor.current
      )
        return;
      setSnapshot((previous) =>
        previous
          ? {
              ...previous,
              history:
                beforeRevision === undefined
                  ? data.history
                  : [
                      ...previous.history,
                      ...data.history.filter(
                        (revision) =>
                          !previous.history.some(
                            (existing) =>
                              existing.revision === revision.revision,
                          ),
                      ),
                    ],
              nextBeforeRevision: data.nextBeforeRevision,
            }
          : previous,
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
      if (!response.ok) {
        discardBody(response);
        throw new Error();
      }
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
  const reviewCurrent =
    matchesReviewedDraft(reviewedDraft, state) &&
    (snapshot.publicationMode !== "direct" || reviewedBase !== null);
  const isDocumentView = tab === "edit" || tab === "preview";
  const saveStatus = saveStatusFromController(state, {
    discarded: Boolean(snapshot.draft?.discardedAt),
    bodyDirty,
    localPreview,
  });
  const publicationActive = Boolean(
    publication &&
    !["live", "cancelled"].includes(publication.phase) &&
    !(publication.mode === "direct" && publication.publicationId),
  );
  const needsNewPublicationReview =
    publication?.phase === "cancelled" &&
    (publication.revision === undefined ||
      publication.revision === state.revision);
  const publishUnavailable = uploadPending
    ? "Finish uploading or close the image crop before publishing."
    : localPreview
      ? "Publishing is available in the production editor. This draft stays local."
      : snapshot.publishing !== "ready"
        ? "Publishing is not configured. Your private draft is retained."
        : publicationActive
          ? "A publication is already in progress. See its status below; you can keep editing privately."
          : needsNewPublicationReview
            ? "This publication was stopped. Review again to prepare a new private revision."
            : unsupportedPublication
              ? "This publisher supports visible pages only. Scheduling and unpublishing are unavailable. Update visibility in Properties or source before reviewing again; your draft is retained."
              : !valid
                ? "Correct the marked fields before publishing."
                : snapshot.draft?.discardedAt
                  ? "Recover this draft before publishing."
                  : !reviewCurrent || reviewLoading
                    ? "Waiting for the latest saved revision to finish reviewing."
                    : state.source === snapshot.base.source
                      ? "There are no changes to publish."
                      : null;
  const publicationControls = publication ? (
    <>
      {(publication.canCancel ??
        Boolean(
          publication.blocked &&
          ["validate", "commit", "branch", "pr", "checks"].includes(
            publication.phase,
          ),
        )) && (
        <Button
          label="Stop publishing"
          size="sm"
          clickAction={() => changePublication("cancel-publication")}
        />
      )}
      {publication.blocked &&
        !["publication_base_changed", "record_changed"].includes(
          publication.blocked,
        ) && (
          <Button
            label="Retry publishing"
            size="sm"
            clickAction={() => changePublication("retry-publication")}
          />
        )}
    </>
  ) : null;
  async function readPublication(
    operationId: string,
  ): Promise<VisiblePublication | null> {
    const response = await fetch(
      `${endpoint("publication")}&operationId=${encodeURIComponent(operationId)}`,
      {
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) {
      discardBody(response);
      throw new Error();
    }
    return (await response.json()).publication ?? null;
  }
  async function changePublication(
    action: "cancel-publication" | "retry-publication",
  ) {
    if (!publication) return;
    const operationId = publication.id;
    let confirmed: VisiblePublication | null = null;
    try {
      const result = await post(action, {
        expectedRevision: state!.revision,
        operationId,
        expectedVersion: publication.version,
      });
      // Never turn a paused job into apparent progress by clearing its error locally.
      confirmed = result.publication ?? (await readPublication(operationId));
      if (confirmed) {
        setPublication(confirmed);
        setPublicationStale(false);
        if (confirmed.phase === "cancelled") publishRequest.current = null;
      }
      if (!result.ok || !confirmed) throw new Error();
      setError("");
    } catch {
      setError(
        confirmed
          ? "Publication changed before that action completed. Its current status is shown; review it before retrying."
          : "Couldn’t confirm that action. Check publication status before retrying. Your draft is retained.",
      );
      setPublicationStale(!confirmed);
    }
  }
  const publishActions = (
    <>
      <Button
        label="Approve and publish"
        variant="primary"
        size="sm"
        isDisabled={Boolean(publishUnavailable)}
        aria-describedby={
          publishUnavailable ? `${reviewHeadingId}-availability` : undefined
        }
        isLoading={publishing}
        clickAction={async () => {
          if (publishPending.current || !reviewCurrent || reviewLoading) return;
          publishPending.current = true;
          const navigation = navigationGeneration.current;
          const reviewed = reviewedDraft;
          let submittedRequestId: string | null = null;
          let refusalMessage: string | null = null;
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
            submittedRequestId = publishRequest.current.id;
            const result = await post(
              "publish",
              {
                expectedRevision: current.revision,
                operationId: publishRequest.current.id,
                discloseSource: true,
                ...(snapshot.publicationMode === "direct" && reviewedBase
                  ? {
                      reviewedSourceSha256: await publicationSourceHash(
                        current.source,
                      ),
                      expectedBaselineSha256: await publicationSourceHash(
                        reviewedBase.source,
                      ),
                      expectedPublicationId: reviewedBase.publicationId ?? null,
                    }
                  : {}),
              },
              () =>
                navigation === navigationGeneration.current &&
                matchesReviewedDraft(reviewed, editor.current?.state ?? null),
            );
            if (!result.publication || result.error) {
              if (result.publication) setPublication(result.publication);
              const reasons: Record<string, string> = {
                publication_in_progress:
                  "This record already has a publication in progress. Its current status is shown below; retry or stop that operation before publishing another revision.",
                legacy_publication_requires_reconciliation:
                  "The previous publisher has unfinished work that needs reconciliation before the new publisher can start. Your draft is saved privately.",
                revision_conflict:
                  "The saved draft changed. Review the latest revision before publishing.",
                publication_review_upgrade_required:
                  "This tab needs the current editor. Your draft is saved; reload, then review again.",
                unsupported_visibility_change:
                  "This publisher supports publishing visible pages. Scheduled publication and unpublishing are not available yet. Your draft is retained.",
                invalid_source:
                  "Correct the marked content fields, then review again. Your draft is retained.",
                invalid_request:
                  "This review could not be accepted. Reload the editor and review the saved draft again.",
              };
              refusalMessage =
                typeof result.error === "string"
                  ? (reasons[result.error] ?? null)
                  : null;
              throw new Error();
            }
            publishedDraft.current = {
              operationId: result.publication.id,
              revision: current.revision,
              source: current.source,
            };
            setPublicationStale(false);
            setPublication(result.publication);
          } catch {
            // A lost HTTP response is ambiguous: the durable job may already exist.
            // Reconcile the same operation before offering another submission.
            let confirmed: VisiblePublication | null = null;
            try {
              if (submittedRequestId)
                confirmed = await readPublication(submittedRequestId);
            } catch {
              /* Keep the retry identity when status is unavailable too. */
            }
            if (confirmed) {
              setPublication(confirmed);
              setPublicationStale(false);
              if (reviewed)
                publishedDraft.current = {
                  operationId: confirmed.id,
                  revision: reviewed.revision,
                  source: reviewed.source,
                };
            } else if (navigation === navigationGeneration.current) {
              setError(
                refusalMessage ??
                  (submittedRequestId
                    ? "Couldn’t confirm publication. Your draft is retained. Retry uses the same request and won’t publish twice."
                    : "The draft changed before publishing. Review the latest saved changes before approving."),
              );
            }
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
      gap={3}
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
                  label="Publish"
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setTab("publish");
                  }}
                  isLoading={reviewLoading}
                  isDisabled={!valid || Boolean(snapshot.draft?.discardedAt)}
                />
              )}
              {tab === "publish" && publishActions}
              <HStack gap={2} className="editor-secondary-actions">
                {record.kind !== "page" && (
                  <Button
                    label="Properties"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      openPanel(panel === "properties" ? null : "properties")
                    }
                  />
                )}
                <Button
                  label="History"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void openHistory();
                  }}
                />
                <MoreMenu
                  label="Document actions"
                  icon={<DotsThreeIcon size={20} />}
                  size="sm"
                  alignment="end"
                  items={[
                    {
                      type: "section",
                      title: "Inspect",
                      items: [
                        ...(publication
                          ? [
                              {
                                label: "Publication details",
                                onClick: () =>
                                  openPanel(
                                    panel === "publication"
                                      ? null
                                      : "publication",
                                  ),
                              },
                            ]
                          : []),
                        {
                          label: "View source",
                          onClick: () => setTab("source"),
                        },
                        {
                          label: "Compare with website",
                          isDisabled: comparisonLoading,
                          onClick: () => {
                            void compareWebsite();
                          },
                        },
                      ],
                    },
                    {
                      type: "section",
                      title: "Draft",
                      items: [
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
                            uploadPending ||
                            importing ||
                            Boolean(snapshot.draft?.discardedAt),
                          onClick: () => importInput.current?.click(),
                        },
                        ...(state.status === "unsaved" &&
                        !needsSaveComparison &&
                        !refusedSave
                          ? [
                              {
                                label: "Save now",
                                isDisabled: Boolean(
                                  snapshot.draft?.discardedAt,
                                ),
                                onClick: () => {
                                  void flush();
                                },
                              },
                            ]
                          : []),
                      ],
                    },
                  ]}
                />
              </HStack>
            </HStack>
          }
        />
      </VStack>
      {tab === "publish" && publishUnavailable && (
        <Text
          type="supporting"
          color="secondary"
          id={`${reviewHeadingId}-availability`}
        >
          {publishUnavailable}
          {needsNewPublicationReview && (
            <Button
              label="Review again"
              size="sm"
              variant="ghost"
              onClick={() => void refreshReview()}
            />
          )}
        </Text>
      )}
      {publication && panel !== "publication" && (
        <PublicationProgress
          publication={publication}
          stale={publicationStale}
          compact
        >
          <Button
            label="Publication details"
            size="sm"
            variant="ghost"
            onClick={() => openPanel("publication")}
          />
        </PublicationProgress>
      )}
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
                  announceRecordFreshness(
                    record,
                    result.draft,
                    snapshot.base.source,
                  );
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
                title={
                  savedDraftMissing
                    ? savedDraftNotFound.title
                    : "Compare before saving again"
                }
                description={
                  savedDraftMissing
                    ? savedDraftNotFound.description
                    : state.saveFailureCode === "idempotency_key_reused"
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
              title={refusal.title}
              description={refusal.description}
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
                      : savedDraftNotFound.title
                  }
                  description={
                    comparedDraft
                      ? "Compare the saved source with your draft before choosing which version to keep."
                      : savedDraftNotFound.description
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
                          announceRecordFreshness(
                            record,
                            result.draft,
                            snapshot.base.source,
                          );
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
                {fields.map((field, index) => (
                  <div
                    key={field.path.join(".")}
                    ref={(element) => {
                      const key = field.path.join(".");
                      if (element) fieldElements.current.set(key, element);
                      else fieldElements.current.delete(key);
                    }}
                  >
                    {record.kind === "writing" &&
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
                    ) : field.path.join(".") === "opening" ? (
                      <AutoSizeTextArea
                        key="opening"
                        label={field.label}
                        description={field.description}
                        size="sm"
                        value={values[index] ?? ""}
                        isDisabled={
                          !parseable || Boolean(snapshot.draft?.discardedAt)
                        }
                        status={
                          fieldErrors.has("opening")
                            ? {
                                type: "error",
                                message: fieldErrors.get("opening"),
                              }
                            : undefined
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
                    )}
                  </div>
                ))}
                {record.kind === "work" && parseable && (
                  <ProjectSections
                    source={state.source}
                    disabled={
                      uploadPending || Boolean(snapshot.draft?.discardedAt)
                    }
                    onEdit={(edit) => {
                      if (mediaPending.current || snapshot.draft?.discardedAt)
                        return;
                      editor.current!.edit(
                        editProjectSections(editor.current!.state.source, edit),
                      );
                    }}
                  />
                )}
                {record.kind === "work" &&
                  parseable &&
                  [undefined, ...storyMediaIndexes].map((storyIndex) => (
                    <ProjectMedia
                      key={
                        storyIndex === undefined
                          ? "project"
                          : `story-${storyIndex}`
                      }
                      storyIndex={storyIndex}
                      source={state.source}
                      errors={fieldErrors}
                      disabled={Boolean(snapshot.draft?.discardedAt)}
                      siteUrl={siteConfig.url}
                      onEdit={(edit) => {
                        const current = editor.current;
                        if (
                          !current ||
                          !mediaAuthorized.current ||
                          snapshot.draft?.discardedAt
                        )
                          return;
                        try {
                          current.edit(
                            editProjectMedia(current.state.source, edit),
                          );
                        } catch {
                          setError(
                            "The section changed during this media edit. Your draft is preserved. Retry the image on the current section.",
                          );
                        }
                      }}
                      onPendingChange={(pending) => {
                        const slot =
                          storyIndex === undefined
                            ? "project"
                            : `story-${storyIndex}`;
                        if (pending) pendingMediaSlots.current.add(slot);
                        else pendingMediaSlots.current.delete(slot);
                        const anyPending = pendingMediaSlots.current.size > 0;
                        mediaPending.current = anyPending;
                        setUploadPending(anyPending);
                        if (!anyPending)
                          setError((current) =>
                            current ===
                            "Finish uploading or close the image crop before leaving this editor."
                              ? ""
                              : current,
                          );
                      }}
                    />
                  ))}
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
                          onEdit: () => {
                            requestedEditingField.current =
                              field.path.join(".");
                            setTab("edit");
                          },
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
          {sourceRequested.current && (
            <div hidden={tab !== "source"}>
              <EditorToolBoundary>
                <Suspense
                  fallback={<Text role="status">Loading source editor…</Text>}
                >
                  <SourceEditor
                    source={state.source}
                    onChange={(source) => editor.current!.edit(source)}
                    hidden={tab !== "source"}
                    readOnly={Boolean(snapshot.draft?.discardedAt)}
                  />
                </Suspense>
              </EditorToolBoundary>
            </div>
          )}
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
                  publicationMode={snapshot.publicationMode}
                  errors={fieldErrors}
                  source={state.source}
                  id={record.id}
                  disabled={Boolean(snapshot.draft?.discardedAt)}
                  onChange={(source) => editor.current!.edit(source)}
                />
              )}
            {panel === "properties" && record.kind === "work" && parseable && (
              <ProjectSettings
                source={state.source}
                errors={fieldErrors}
                disabled={Boolean(snapshot.draft?.discardedAt)}
                publicationMode={snapshot.publicationMode}
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
                    onRetry={() => void loadHistory(historyRetryCursor.current)}
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
                  <VStack key={revision.revision} gap={2}>
                    <HStack
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
                          label={
                            comparedRevision === revision.revision
                              ? "Close comparison"
                              : "Compare"
                          }
                          aria-label={`Compare revision ${revision.revision}`}
                          aria-expanded={comparedRevision === revision.revision}
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setComparedRevision(
                              comparedRevision === revision.revision
                                ? null
                                : revision.revision,
                            )
                          }
                        />
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
                    {comparedRevision === revision.revision && (
                      <VStack gap={2}>
                        <Text color="secondary">
                          Before is your current draft. After is the saved
                          revision. Comparing does not change or publish your
                          draft.
                        </Text>
                        <ReviewChanges
                          destination={`Revision ${revision.revision}`}
                          before={state.source}
                          after={revision.source}
                          changes={[
                            {
                              label: "Document source",
                              before: state.source,
                              after: revision.source,
                            },
                          ]}
                        />
                      </VStack>
                    )}
                  </VStack>
                ))}
                {snapshot.nextBeforeRevision != null && (
                  <Button
                    label={
                      historyLoading
                        ? "Loading revisions…"
                        : "Load older revisions"
                    }
                    variant="ghost"
                    size="sm"
                    isDisabled={historyLoading}
                    onClick={() =>
                      void loadHistory(snapshot.nextBeforeRevision ?? undefined)
                    }
                  />
                )}
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
                {publicationControls}
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
