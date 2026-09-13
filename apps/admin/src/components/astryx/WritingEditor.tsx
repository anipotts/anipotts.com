import React from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import {
  MetadataList,
  MetadataListItem,
} from "@astryxdesign/core/MetadataList";
import { VStack } from "@astryxdesign/core/VStack";
import type { ContentEditorState } from "../../lib/content-editor";

type WritingEditorProps = {
  currentPublicRoute: string;
  currentRollbackReference: string;
  editorState: ContentEditorState;
  isNew: boolean;
  pageMode: string;
  pageSummary: string;
  sourceFieldCount: number;
};

/** Retained D1 record viewer. The current writing workflow lives in /content. */
export function WritingEditor({
  currentPublicRoute,
  currentRollbackReference,
  editorState,
  isNew,
  pageMode,
  pageSummary,
  sourceFieldCount,
}: WritingEditorProps) {
  const current = editorState.current;
  return (
    <VStack gap={5}>
      <Banner
        status="info"
        title="Legacy content diagnostics"
        description="These retained D1 records are read-only. The Website content editor uses Git-backed content and private drafts."
      />
      <Button
        label="Open Website content"
        href="/content"
        variant="secondary"
      />
      {isNew ? (
        <EmptyState
          title="No legacy record selected"
          description="Browse Website content to edit a current record."
        />
      ) : (
        <VStack gap={4}>
          <h2>{current.title || editorState.page_key}</h2>
          <MetadataList orientation="horizontal">
            <MetadataListItem label="Record">
              {editorState.page_key}
            </MetadataListItem>
            <MetadataListItem label="Source">{pageMode}</MetadataListItem>
            <MetadataListItem label="Version">
              {editorState.current_version}
            </MetadataListItem>
            <MetadataListItem label="Visibility">
              {current.visibility}
            </MetadataListItem>
            <MetadataListItem label="Slug">{current.slug}</MetadataListItem>
            <MetadataListItem label="Date">{current.date}</MetadataListItem>
            <MetadataListItem label="Tags">
              {current.tags.join(", ") || "None"}
            </MetadataListItem>
            <MetadataListItem label="Recorded route">
              {currentPublicRoute}
            </MetadataListItem>
            <MetadataListItem label="Source fields">
              {sourceFieldCount}
            </MetadataListItem>
            <MetadataListItem label="Rollback reference">
              {currentRollbackReference}
            </MetadataListItem>
          </MetadataList>
          {pageSummary && <p>{pageSummary}</p>}
          {current.summary && <p>{current.summary}</p>}
          <section aria-label="Retained Markdown source">
            <h3>Retained source</h3>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {current.body}
            </pre>
          </section>
        </VStack>
      )}
      <section aria-label="Legacy revision history">
        <h2>Revision history</h2>
        {editorState.revisions.length === 0 ? (
          <EmptyState
            title="No retained revisions"
            description="No revision records were returned for this legacy page key."
          />
        ) : (
          <VStack gap={4}>
            {editorState.revisions.map((revision) => (
              <section key={revision.id}>
                <h3>{revision.summary}</h3>
                <MetadataList orientation="horizontal">
                  <MetadataListItem label="Source">
                    {revision.source}
                  </MetadataListItem>
                  <MetadataListItem label="Status">
                    {revision.status}
                  </MetadataListItem>
                  <MetadataListItem label="Recorded at">
                    {revision.timestamp}
                  </MetadataListItem>
                  <MetadataListItem label="Author">
                    {revision.author}
                  </MetadataListItem>
                  <MetadataListItem label="Rollback reference">
                    {revision.rollback_target}
                  </MetadataListItem>
                </MetadataList>
                <Button
                  label="View retained record"
                  href={revision.view_href}
                  variant="ghost"
                />
              </section>
            ))}
          </VStack>
        )}
      </section>
    </VStack>
  );
}
