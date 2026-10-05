# Admin table standard

## Reference and scope

The October 2, 2026 standard follows the visible [Kobra grouped table demo](https://kobra.systems/components/grouped-table): compact rows, quiet group backgrounds, disclosure controls, count badges and aligned metadata. Implementation is independent. The live demo was inspected at desktop and 390px, including collapse and its animation control. Source access was behind a paid license; no source was copied and no dependency was added.

Admin retains Instrument Sans and its existing theme, spacing and control tokens. Table separators are a specific exception to the older no-dividers policy; other admin surfaces retain that policy. Navigation and the Writing SDK boundary remain unchanged.

## Inventory

| Adapter                  | Routes or context                               | Existing interactions                                        |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------------ |
| ContentLibrary           | Content Pages, Writing, Projects, Newsletter    | Search, filter, sort and editorial links                     |
| AdminOverview            | Overview recent content and records             | Bounded subsets, detail navigation                           |
| RecordsView              | Data Records and selected detail                | Server filters, append pagination, split view, partial reads |
| SourcesView              | Data Sources                                    | Lifecycle groups, family expansion, discovered group         |
| HealthView               | Data Health                                     | Date range, missing versus zero, metric comparisons          |
| KnowledgeView            | Data Knowledge, entity timeline and backlinks   | Search, kinds, pagination, detail navigation                 |
| StatusView               | Observability Status services and syncs         | Groups, detail selection, status evidence                    |
| ActivityView             | Observability Activity                          | Day groups, source filter, show more                         |
| AlertsView               | Observability Alerts and overview alert section | Incident selection, evidence and runbooks                    |
| EntryPanel               | Service detail histories and state changes      | Bounded runs, timestamps, results and duration               |
| RecordPanel              | Record revisions                                | Current marker, timestamp and hash copy                      |
| HomeEditor               | Editorial revision history                      | Pagination, compare, restore and download                    |
| HomepageWritingSelection | Homepage article order                          | Move, remove, limit and unresolved status                    |
| Development catalogs     | Kit and OpenAI fixtures                         | Shared contracts, sorting, selection and pagination          |

## Exceptions

Keep narrative authored lists, facts/definition lists, navigation, menus, chips, editable project/story sections, media controls, publication issue messages and source recovery comparisons in their appropriate semantics. Publication before/after previews describe content, rather than record datasets. Host health summaries include disk meters and related facts and remain status summaries. Health's day/metric comparison retains horizontal scrolling because stacking would lose its relationships.

## Adoption

Use `DataTable` and `Column<T>` from `components/workspace/Workspace`. Keep fetches, permissions, URLs, filters, ordering and mutations in the adapter. Supply stable record IDs and a table ID independent of headings, translations, searches or selected records. Group keys must be model identifiers; `groupLabel` provides readable text. Use grouping only where it aids scanning.

Set column sizing and responsive priorities explicitly. Primary labels retain readable space; secondary fields reflow beneath them in their meaningful order at narrow container widths. Genuine comparison tables opt into scrolling. Cell renderers retain real links/buttons rather than binding navigation to a row click; embedded actions therefore remain independent.

The adapter owns complete versus partial dataset knowledge. Supply authoritative totals only when the server provides them. Filtered counts are separate from totals; loaded counts never imply a full inventory. Shared loading, error, empty-dataset and zero-result presentations are available without replacing domain-specific session or authorization notices.

Collapse preferences are stored per table and stable group ID. Disclosure controls are keyboard operable, expose expansion state and retain visible focus. No motion is required for reflow. Existing sorting, selection and pagination remain controlled by the caller.

## Delivery

Production deployment remains pending review. Verification evidence and the final changed-file inventory accompany the implementation checkpoint; neither local screenshots nor passing tests constitute deployment or aesthetic acceptance.

## Implementation checkpoint

Integrated with production main `4247c2dbc`; isolated branch `codex/admin-table-standard`.

- All 164 admin unit test files passed, 2,122 tests. Astro route tests passed (79), editorial runtime tests passed (86), and content package tests passed (160).
- Supported admin typecheck, production build and affected-scope checks passed. Existing Astro hints remain.
- Live reference desktop and narrow layouts were inspected. Implementation uses independent source.
- Canonical managed preview now serves this branch at `http://localhost:4311/` with an isolated local seed database. Production records were not changed.
- Browser review covered Writing, Pages and Projects, plus synthetic Data, operational and selection/pagination fixtures. Content widths checked at 320, 390, 768, 1032 and 1440 CSS pixels, light/dark themes and expanded/collapsed navigation. No horizontal document overflow was observed. Keyboard group disclosure, saved collapse preferences, zero-result counts and selection/pagination were exercised.
- Fixed disclosure gutter overflow, icon/first-line alignment, excessive row chrome, redundant Writing icons/status cells, summary allocation, narrow metadata flow, orphan empty metadata labels and invisible checkboxes under SDK resets. Counts distinguish complete inventories from loaded/filtered subsets. Content's timestamp heading is Last activity.
- Screenshots are retained in the task visualization directory `admin-table-standard/`, including desktop Writing, narrow Writing, tablet Projects and narrow operational tables.
- The local seed bootstrap gives published records the same recent publication timestamp. This is fixture provenance, not a production timestamp change. Synthetic operational records supply varied dates. Physical-device and authenticated live reader data coverage are outside this local visual checkpoint.
- Production deployment remains pending Ani's visual review and exact-head required checks. No production content or reader permissions changed.

Exact changed paths at this checkpoint:

- `apps/admin/src/components/astryx/ContentLibrary.test.tsx`
- `apps/admin/src/components/astryx/ContentLibrary.tsx`
- `apps/admin/src/components/astryx/EditorialApp.test.tsx`
- `apps/admin/src/components/astryx/HomeEditor.tsx`
- `apps/admin/src/components/astryx/HomepageWritingSelection.tsx`
- `apps/admin/src/components/astryx/ObservabilityWorkspace.test.tsx`
- `apps/admin/src/components/data/HealthView.tsx`
- `apps/admin/src/components/data/KnowledgeView.tsx`
- `apps/admin/src/components/data/RecordPanel.test.tsx`
- `apps/admin/src/components/data/RecordPanel.tsx`
- `apps/admin/src/components/data/RecordsView.tsx`
- `apps/admin/src/components/data/SourcesView.test.tsx`
- `apps/admin/src/components/data/SourcesView.tsx`
- `apps/admin/src/components/observability/ActivityView.tsx`
- `apps/admin/src/components/observability/AlertsView.tsx`
- `apps/admin/src/components/observability/EntryPanel.tsx`
- `apps/admin/src/components/observability/StatusView.tsx`
- `apps/admin/src/components/overview/AdminOverview.test.tsx`
- `apps/admin/src/components/overview/AdminOverview.tsx`
- `apps/admin/src/components/workspace/AdminUI.test.tsx`
- `apps/admin/src/components/workspace/DataTable.test.tsx`
- `apps/admin/src/components/workspace/OpenAIDataTable.tsx`
- `apps/admin/src/components/workspace/Workspace.test.tsx`
- `apps/admin/src/components/workspace/Workspace.tsx`
- `apps/admin/src/components/workspace/dev-kit-catalog.tsx`
- `apps/admin/src/components/workspace/dev-openai-catalog.test.tsx`
- `apps/admin/src/components/workspace/dev-openai-catalog.tsx`
- `apps/admin/src/components/workspace/openai-table.css`
- `apps/admin/src/components/workspace/table-layout.test.tsx`
- `apps/admin/src/components/workspace/table-layout.ts`
- `apps/admin/src/lib/private-reader-fetch.test.tsx`
- `apps/admin/src/styles/no-dividers.test.ts`
- `docs/design/admin-workspace/table-standard.md`

## Compact content rows

Narrow content libraries place last activity beside the primary title and use one ellipsized summary line beneath it. Titles wrap freely; the record link retains a 44px touch target. Repeated activity labels are omitted visually while the column header and precise timestamp remain accessible. Desktop columns are unchanged. Browser verification at 320px and 390px confirmed no document overflow, including long titles and unpublished records.

Library headers and footers name their record type (articles, projects, pages or newsletter issues). Shared page headers accept a singular/plural `countNoun`; Data and Observability adapters supply source, entity, service, alert or event terminology. On phones, header actions and filter actions keep their complete 44px targets inside the same page gutter, aligning their trailing icon centers without negative margins.

## October 5 refinement

The current table contract keeps native aligned columns at every size. Secondary
columns and their headers yield together when their minimum readable widths no
longer fit. No admin table scrolls horizontally or moves metadata beneath its
title. Titles truncate to one line and retain full text on their control; row
navigation and expandable source families provide complete details. Knowledge
summaries have a separate column. The table surface clips hover backgrounds to
its corner radius. Loading cells use the same schema and responsive rules.

The independent component retains keyboard-operable grouped disclosures, stored
collapse preferences, controlled sorting, record selection, pagination and
embedded actions. It follows the publicly visible Kobra demo without importing
its paid source. Current feedback supersedes the older stacking and Health
scrolling exceptions in this document.
