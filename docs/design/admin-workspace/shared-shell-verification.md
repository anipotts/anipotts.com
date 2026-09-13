# Shared shell verification

Local integration receipt, 2026-09-12. Not a release receipt.

The Content shell now also hosts Operations and Life. Workspace selection remembers
allowlisted destinations without retaining Life queries. Admin/ani potts identity,
sidebar preference, appearance controls and centered command palette are shared.
Operations sidebar contains only Overview, Machines and Loops. Legacy routes remain
available without duplicating Content or Life navigation.

The expanded header uses two rows. Collapsed navigation places the expand control
first, followed by the temporary identity/workspace indicators and Search. Ani will
supply a combined identity mark separately. The footer uses an attached anipotts.com
tab above appearance controls, with the approved AP mark in the rail.

Native AppShell fill mode keeps the outer frame fixed. Expanded main height subtracts
the inset gap; editor preview return now restores the main panel's scroll position.
Neutral document surfaces apply in all sidebar modes. Sidebar tint and active accents
are scoped through Astryx themes; semantic colors remain unchanged.

## Evidence

- 94 tests passed across eight files after the corrected hover runtime import;
  four focused shell tests also cover the final collapsed control ordering.
- Three theme tests passed, generated theme checks passed; Astro checked 244 files
  with zero errors and zero warnings (six hints).
- 57 access-policy tests passed, including explicit local read-only Life section
  paths and production/non-loopback/write denial. No private transport activated.
- Chrome DevTools browser inspection of the managed preview: desktop 1440 by 900,
  body height900 and expanded panel y12 through900. Tablet792 by783 collapsed
  panel y0 through783; expanded y12 through783. No outer overflow in these states.
- Actual collapse/expand and Search clicks worked. Palette center measured at
  approximately396,391 in792 by783 viewport. Hovering away from the workspace
  menu hid it. Timing precision is not established by these tool round trips.
- True390 by844 device emulation exposed a nested480px Operations layout.
  Constraining it to its container removed page overflow (main client/scroll width390).
  Scrolling its content left panel top56 and window scroll0; body height844.
  The evidence table still scrolls horizontally inside its own container and needs
  a more compact mobile presentation in the Operations feature pass. No mobile global Search.
- Managed preview remains running, process22426. No PR, merge or deploy in this receipt.

## Remaining verification

Complete pointer travel and immediate hover timing regression after the Astryx patch,
true390px emulation, dark/system and reduced-motion visual checks, menu keyboard
flows, full editor/recovery interaction, full affected validation, exact-head release
and live verification. Operations remains without live telemetry evidence; Life's
private transport remains unavailable. Do not interpret these UI changes as connected
integrations or published content.
