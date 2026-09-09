import React, { useEffect, useRef, useState } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { TextInput } from "@astryxdesign/core/TextInput";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  DotsThreeIcon,
} from "@phosphor-icons/react";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { Banner } from "@astryxdesign/core/Banner";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Spinner } from "@astryxdesign/core/Spinner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { useToast } from "@astryxdesign/core/Toast";
import { AdminSkeleton, RecoveryBanner } from "./AdminFeedback";
import { RichTextField } from "./RichTextField";
import { editableHomeSummary } from "../../lib/rich-text";
import { editorialFields } from "../../lib/editorial-fields";
import { ReviewChanges } from "./ReviewChanges";
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
import { HomeAutosave, type SaveState } from "../../lib/home-autosave";
import type { Draft, SaveResult } from "../../editorial/draft-store";
import type { HomeBase } from "../../lib/editorial-home-api";
import type { PublishJob } from "../../editorial/publication-jobs";

type Snapshot = {
  base: HomeBase;
  draft: Draft | null;
  history: Draft[];
  publishing: "ready" | "not_configured";
  publication: PublishJob | null;
};

export function HomeEditor({
  record,
  localPreview = false,
}: {
  record: EditorialRecord;
  localPreview?: boolean;
}) {
  const toast = useToast();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [historyError, setHistoryError] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const query = new URLSearchParams(record).toString();
  const endpoint = (action: string) => `/api/editorial/${action}?${query}`;
  const [state, setState] = useState<SaveState | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("edit");
  const [previewRevision, setPreviewRevision] = useState<number | null>(null);
  const editor = useRef<HomeAutosave | null>(null);
  const csrf = useRef("");
  const importInput = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [publication, setPublication] = useState<PublishJob | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publicationStale, setPublicationStale] = useState(false);
  const [reviewSource, setReviewSource] = useState<string | null>(null);
  const [comparison, setComparison] = useState<HomeBase | null>(null);
  const publishRequest = useRef<{ revision: number; id: string } | null>(null);
  async function post(action: string, body: unknown) {
    if (!csrf.current) {
      const response = await fetch("/api/editorial/csrf", {
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("session expired");
      csrf.current = (await response.json()).csrf;
    }
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
    if (!response.ok && response.status !== 409)
      throw new Error("save unavailable");
    return response.json();
  }
  useEffect(() => {
    let cancelled = false;
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
          (input) => post("save", input) as Promise<SaveResult>,
          setState,
        );
        setState(editor.current.state);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn’t load this draft.");
      });
    return () => {
      cancelled = true;
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
    if (state?.status !== "unsaved" || snapshot?.draft?.discardedAt) return;
    const timer = setTimeout(() => {
      void editor.current?.flush();
    }, 1000);
    return () => clearTimeout(timer);
  }, [state?.source, snapshot?.draft?.discardedAt]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (editor.current && editor.current.state.status !== "saved") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
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
  const fieldErrors = new Map<string, string>();
  try {
    const parsed = parseEditorialSource(state.source);
    parseable = true;
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
        fieldErrors.set(issue.path.join("."), issue.message);
  } catch {
    /* Source remains editable and recoverable while malformed. */
  }
  const download = (source = state.source, name = `${record.id}-draft.md`) => {
    const url = URL.createObjectURL(
      new Blob([source], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  };
  const refreshPreview = async () => {
    if (!valid || snapshot.draft?.discardedAt) {
      setError("Save a valid, active draft before previewing.");
      return;
    }
    setPreviewLoading(true);
    await editor.current!.ensureDraft();
    setPreviewLoading(false);
    const current = editor.current!.state;
    try {
      if (
        current.status === "saved" &&
        current.revision > 0 &&
        validateEditorialSource(record, current.source).success
      ) {
        setError("");
        setPreviewRevision(current.revision);
        return;
      }
    } catch {
      /* The source may have changed while its previous revision was saving. */
    }
    setError("save a valid draft before previewing.");
  };
  const openHistory = async () => {
    setTab("history");
    if (historyLoading) return;
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      await editor.current!.flush();
      const response = await fetch(endpoint("record"), {
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error();
      const data: Snapshot = await response.json();
      setSnapshot((previous) =>
        previous ? { ...previous, history: data.history } : previous,
      );
      setError("");
    } catch {
      setHistoryError(true);
    } finally {
      setHistoryLoading(false);
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
  const isDocumentView = tab === "edit" || tab === "preview";
  return (
    <VStack gap={5} className="editor-workspace">
      <VStack className="editor-actionbar">
        <Toolbar
          label="Document actions"
          size="sm"
          startContent={
            <HStack gap={3} vAlign="center" className="editor-save-group">
              {!isDocumentView && (
                <Button
                  label="Back to editor"
                  variant="ghost"
                  icon={<ArrowLeftIcon size={18} />}
                  onClick={() => setTab("edit")}
                  size="sm"
                />
              )}
              <HStack gap={2} vAlign="center" role="status">
                <StatusDot
                  variant={state.status === "saved" ? "success" : "warning"}
                  label={state.status}
                />
                <Text color="secondary">
                  {snapshot.draft?.discardedAt
                    ? "Discarded draft"
                    : state.status === "saved"
                      ? localPreview
                        ? "Saved locally"
                        : "Saved privately"
                      : state.status === "saving"
                        ? "Saving…"
                        : state.status === "conflict"
                          ? "Resolve conflicting edits"
                          : "Unsaved changes"}
                </Text>
              </HStack>
            </HStack>
          }
          endContent={
            <HStack gap={2} wrap="wrap" className="editor-primary-actions">
              {tab !== "publish" && (
                <Button
                  label="Review changes"
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setReviewSource(state.source);
                    setTab("publish");
                  }}
                  isDisabled={!valid || Boolean(snapshot.draft?.discardedAt)}
                />
              )}
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
                  { label: "Download draft", onClick: () => download() },
                  {
                    label: "Import draft…",
                    isDisabled:
                      importing || Boolean(snapshot.draft?.discardedAt),
                    onClick: () => importInput.current?.click(),
                  },
                  ...(state.status === "unsaved"
                    ? [
                        { type: "divider" as const },
                        {
                          label: "Save now",
                          isDisabled: Boolean(snapshot.draft?.discardedAt),
                          onClick: () => {
                            void editor.current!.flush();
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
      {publication && (
        <PublicationProgress publication={publication} stale={publicationStale}>
          {publication.blocked &&
            ["validate", "commit", "branch", "pr", "checks"].includes(
              publication.phase,
            ) && (
              <Button
                label="stop publishing"
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
                label="retry publishing"
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
      {snapshot.draft?.discardedAt && (
        <Button
          label="recover draft"
          clickAction={async () => {
            try {
              const result = await post("restore", {
                expectedRevision: state.revision,
              });
              if (!result.draft) throw new Error();
              setSnapshot({ ...snapshot, draft: result.draft });
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
      {error && (
        <RecoveryBanner
          title={error}
          actionLabel="Download draft"
          onRetry={() => download()}
        />
      )}
      {state.saveFailed && (
        <RecoveryBanner
          title="Draft could not be saved"
          description="Your edits are still here. Retry saving before leaving this page."
          actionLabel="Retry save"
          onRetry={() => editor.current!.flush()}
        />
      )}
      {comparisonLoading && <Spinner label="Loading website source…" />}
      {comparison && (
        <VStack gap={2}>
          <Text>
            compare the current website with your draft. update your draft below
            before keeping it over the website version.
          </Text>
          <TextArea
            label="current website source"
            value={comparison.source}
            isReadOnly
            rows={5}
          />
          <TextArea
            label="your draft source"
            value={state.source}
            isReadOnly
            rows={5}
          />
          <Button
            label="keep draft over this website version"
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
                await editor.current!.ensureDraft();
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
            label="close comparison"
            onClick={() => setComparison(null)}
          />
        </VStack>
      )}
      {state.conflict && (
        <VStack gap={2}>
          <Banner
            status="warning"
            title="Another edit was saved"
            description="Compare the saved source with your draft before choosing which version to keep."
          />
          <TextArea
            label="saved on another tab or device"
            value={state.conflict.current?.source ?? ""}
            isReadOnly
            rows={5}
          />
          <HStack gap={2}>
            <Button
              label="keep my version"
              isDisabled={
                !state.conflict.current ||
                state.conflict.current.discardedAt !== null
              }
              clickAction={async () => {
                editor.current!.resolve(state.conflict!.current!, true);
                await editor.current!.flush();
              }}
            />
            <Button
              label="use saved version"
              isDisabled={
                !state.conflict.current ||
                state.conflict.current.discardedAt !== null
              }
              onClick={() =>
                editor.current!.resolve(state.conflict!.current!, false)
              }
            />
          </HStack>
        </VStack>
      )}
      {isDocumentView ? (
        <HStack gap={3} wrap="wrap" vAlign="center" className="editor-viewbar">
          <TabList
            size="sm"
            value={tab}
            onChange={(next) => {
              setTab(next);
              if (next === "preview") void refreshPreview();
            }}
          >
            <Tab label="Edit" value="edit" />
            <Tab label="Preview" value="preview" />
          </TabList>
        </HStack>
      ) : (
        <Heading level={2}>
          {tab === "publish"
            ? "Review changes"
            : tab === "source"
              ? "Source"
              : "Version history"}
        </Heading>
      )}
      {tab === "preview" && (
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
          {previewRevision ? (
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
                <Button label="Retry preview" clickAction={refreshPreview} />
              }
            />
          )}
        </VStack>
      )}
      {tab === "edit" && (
        <FormLayout>
          {fields.map((field, index) =>
            field.rich ? (
              <RichTextField
                key={field.path.join(".")}
                label={field.label}
                description={field.description}
                validationError={fieldErrors.get(field.path.join("."))}
                value={values[index] ?? ""}
                disabled={!parseable || Boolean(snapshot.draft?.discardedAt)}
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
                isDisabled={!parseable || Boolean(snapshot.draft?.discardedAt)}
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
        </FormLayout>
      )}
      {tab === "publish" && (
        <VStack gap={4} className="editor-review">
          <ReviewChanges
            destination={`anipotts.com${record.kind === "page" ? (record.id === "home" ? "/" : `/${record.id}`) : `/${record.kind}/${record.id}`}`}
            before={snapshot.base.source}
            after={state.source}
            changes={fields.flatMap((field) => {
              try {
                return [
                  {
                    label: field.label,
                    rich: field.rich,
                    before: String(
                      parseEditorialSource(snapshot.base.source).document.getIn(
                        field.path,
                      ) ?? "",
                    ),
                    after: String(
                      parseEditorialSource(state.source).document.getIn(
                        field.path,
                      ) ?? "",
                    ),
                  },
                ];
              } catch {
                return [];
              }
            })}
          />
          {state.source !== reviewSource && (
            <Banner
              status="warning"
              title="This review is out of date"
              description="The draft changed after this review opened."
              endContent={
                <Button
                  label="Review latest changes"
                  onClick={() => setReviewSource(state.source)}
                />
              }
            />
          )}
          <HStack gap={2} wrap="wrap">
            <Button
              label="Approve and publish"
              variant="primary"
              size="sm"
              isDisabled={
                localPreview ||
                snapshot.publishing !== "ready" ||
                state.source !== reviewSource ||
                state.source === snapshot.base.source ||
                !valid ||
                Boolean(snapshot.draft?.discardedAt) ||
                Boolean(
                  publication &&
                  !["live", "cancelled"].includes(publication.phase),
                )
              }
              isLoading={publishing}
              tooltip={
                localPreview
                  ? "Publishing is available in the production editor"
                  : snapshot.publishing === "ready"
                    ? "publishes this record’s source to GitHub and the website"
                    : "publishing is not connected yet"
              }
              clickAction={async () => {
                setPublishing(true);
                setError("");
                try {
                  await editor.current!.ensureDraft();
                  const current = editor.current!.state;
                  if (
                    current.status !== "saved" ||
                    current.source !== reviewSource ||
                    !validateEditorialSource(record, current.source).success
                  )
                    throw new Error();
                  if (publishRequest.current?.revision !== current.revision)
                    publishRequest.current = {
                      revision: current.revision,
                      id: crypto.randomUUID(),
                    };
                  const result = await post("publish", {
                    expectedRevision: current.revision,
                    operationId: publishRequest.current.id,
                    discloseSource: true,
                  });
                  if (!result.publication) throw new Error();
                  setPublicationStale(false);
                  setPublication(result.publication);
                } catch {
                  setError(
                    "couldn’t start publishing. your draft is retained; retry after saving.",
                  );
                } finally {
                  setPublishing(false);
                }
              }}
            />
            {localPreview && (
              <Button
                label="Open production editor"
                size="sm"
                icon={<ArrowSquareOutIcon size={18} />}
                href={`https://admin.anipotts.com/content/${record.kind === "page" ? (record.id === "home" ? "home" : `${record.id}Page`) : record.kind === "work" ? "projects" : "writing"}/${record.id}`}
                target="_blank"
                rel="noopener noreferrer"
              />
            )}
          </HStack>
        </VStack>
      )}
      {tab === "source" && (
        <VStack gap={3}>
          <Text color="secondary">
            The complete Markdown file. Formatting uses standard Markdown;
            underlines use &lt;u&gt;. Use Document actions to import or download
            a draft. Imports replace this private draft and retain revision
            history.
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
          const beforeImport = editor.current!.state.source;
          setImporting(true);
          try {
            const source = await file.text();
            if (editor.current!.state.source !== beforeImport) {
              setError(
                "Your draft changed while the file was opening. Import it again when you are ready.",
              );
              return;
            }
            if (!validateEditorialSource(record, source).success)
              throw new Error();
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
          title="Source needs correction"
          description="Fix the source before previewing or publishing. Your edits are retained."
          endContent={
            <Button label="Edit source" onClick={() => setTab("source")} />
          }
        />
      )}
      {tab === "history" && (
        <VStack gap={2}>
          <Text color="secondary">
            Restore an earlier version as a new draft. Existing revisions stay
            available.
          </Text>
          {historyError && (
            <RecoveryBanner
              title="Couldn’t load history"
              onRetry={openHistory}
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
                <Text weight="semibold">Revision {revision.revision}</Text>
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
      )}
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
            if (update.docChanged) change.current(update.state.doc.toString());
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
    if (current && current.state.doc.toString() !== source)
      current.dispatch({
        changes: { from: 0, to: current.state.doc.length, insert: source },
      });
  }, [source]);
  return (
    <section
      ref={host}
      hidden={hidden}
      className="editorial-source"
      aria-label="source editor"
    />
  );
}
