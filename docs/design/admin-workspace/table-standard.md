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

Based on production main `8287446bc`; isolated branch `codex/admin-table-standard`.

- All 163 admin unit test files passed, 2,111 tests.
- Supported admin typecheck and production build passed.
- Admin lint passed with existing Astro hints.
- Reference desktop and narrow layouts were inspected in the live demo.
- Local browser verification and implementation screenshots remain pending. The existing listener on localhost:4311 belongs to the primary checkout but its manager metadata is stale; the isolated manager refused to replace it. A local preview switch approval was requested. No alternate port was started.
- Production deployment remains pending review. No production content or reader permissions changed.

Exact changed paths at this checkpoint:

- `apps/admin/src/components/astryx/ContentLibrary.test.tsx`
- `apps/admin/src/components/astryx/ContentLibrary.tsx`
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
