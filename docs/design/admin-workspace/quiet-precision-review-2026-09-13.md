# Quiet Precision: reviewing and refining content

## Current implementation

The review uses the available content-panel width with responsive padding.
Desktop offers side-by-side and unified comparisons; narrow panels use unified
rows. Removed and added text appear on separate lines, with line numbers and
subdued word highlights. Source mode preserves whitespace and exposes formatting,
link, image, and line-ending changes. Large comparisons have a bounded work budget.

The title and Added/Removed legend share one row. The destination, changed-field
count, and comparison controls occupy the next. The redundant document-level
collapsible and header band are removed.

Publish is in the document toolbar. The back/save group and action group wrap
intact when space is limited. A reusable save-status token distinguishes an
unchanged base, unsaved changes, saving, acknowledged local/private saves, failed
saves, conflicts, and discarded drafts. It has no timer or simulated progress.
An earlier save acknowledgement cannot make a newer buffered edit appear saved.

The 768px navigation boundary matches Astryx AppShell's inclusive mobile query.
The approved desktop rail and mobile header retain their existing design.

This UI increment preserves the released publisher's handlers, exact-revision
checks, navigation guards, and recovery behavior. It does not activate the local
direct publisher, transfer bridge, or new storage bindings.

## Proposed next feature: editable field reviews

Status: design proposal requested by Ani. Not implemented or approved as part of
this UI release.

Each changed field gains **Edit** and **Expand**. The published Before side is
immutable. Edit opens the existing appropriate editor on the Draft side. Expand
shows only that field's comparison and editor in a full-screen Astryx dialog.
Done returns to the review and retains all edits. It is not a discard action.

Only one field editor is active at a time. Selecting another field drains the
current local buffer before moving focus. Expansion is a layout change of the
same editing session: text, composition, selection, and undo history survive.
The normal editor and review must never create separate buffered writers for the
same source field.

### Editing and approval

1. The first keystroke marks the review out of date immediately, before buffering
   or saving. Publish becomes unavailable.
2. The existing document autosave serializes changes and reports actual status.
   It applies a field write to the latest document source, not an old snapshot.
3. After saving, **Review latest changes** captures the new exact revision for
   approval. Autosave never silently approves edits.
4. Publish uses that revision and existing concurrency checks. The comparison
   base stays fixed until an explicit refresh or verified publication changes it.

Keep the active field visible if an edit returns it to its original value; remove
its unchanged row only after editing ends so focus does not disappear.

### Component and source contract

- Field identity is record identity plus a typed target: a JSON-encoded
  frontmatter path or Markdown body. Labels are presentation, not identifiers.
- Rich scalars use RichTextField; article bodies use ArticleBody; metadata uses
  its existing typed controls. Preserve homepage introduction formatting behavior.
- Structural changes and unsupported Markdown/YAML retain a source-editor
  fallback. Never coerce arrays, booleans, or objects into text, or round-trip
  unsupported syntax through a rich editor.
- Array reordering invalidates the field's structural generation. Rebind
  explicitly instead of writing into an unrelated item at the previous index.
- HomeEditor owns one controller, recovery record, save scheduler, and reviewed
  revision. A shared field-session/flush registry coordinates normal editing,
  inline review, full-screen review, navigation, and recovery.
- ReviewChanges owns presentation. Field descriptors and typed source adapters
  belong in a separate review-fields module shared with normal editing.
- Publishing and storage APIs remain unchanged by this feature.

### Full-screen and failure behavior

Desktop shows Before and Draft together; smaller screens stack them. The dialog
contains the field name, save status, comparison controls, and Done. Escape first
closes a nested link/image menu, then exits full-screen and restores focus to the
field's Expand action.

Closing retains the local buffer even when the network is unavailable. Failed or
expired saves stay visibly unsaved and retain recovery. An old response cannot
overwrite newer typing. Conflicts, retries, and ambiguous acknowledgements use
the existing controller's identities and guards. Prevent editing during the
short publish-submission critical section; keep a submitted revision distinct
from later drafts.

### Acceptance before implementation is promoted

- A field edit changes only its typed source target and preserves unrelated bytes.
- Typing disables Publish immediately; an acknowledged save still needs review.
- Inline → full-screen → inline preserves text, selection, undo, and one writer.
- Slow saves, newer typing, expired sessions, lost acknowledgements, retries, and
  competing revisions preserve the latest text.
- Reordering, conflict resolution, malformed source, and unsupported formatting
  cannot redirect or erase edits.
- Navigation, Back, Escape, nested menus, and closing restore focus and recovery.
- Desktop, tablet, phone, both themes, keyboard, reduced motion, and touch checks
  pass using synthetic drafts. User drafts are not used for destructive QA.

## Verification boundary

The canonical local increment passed 86 focused tests, admin type checking, and
an admin build. Browser review verified full-width desktop comparison, dark
colors, tablet group wrapping, the 768px header boundary, and a 320px source view
without off-screen actions. Further exact-release checks and production proof
are recorded separately; local screenshots are not deployment evidence.

The isolated release was installed from its unchanged frozen lockfile. Its full
affected-scope command passed formatting, route and fixture boundaries, build,
lint, type checks, 645 admin tests, and 89 real Workers tests. Keyboard switching
retained visible focus with reduced motion; search remained 520px tall with a
68px input row both before and after typing. A fresh local load had no console
errors after an earlier development-module hot-reload invalidation.
