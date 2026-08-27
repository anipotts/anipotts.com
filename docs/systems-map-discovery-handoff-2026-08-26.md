# systems map discovery handoff

Date: 2026-08-26

Status: decision-complete discovery and design preparation

Standing owner: Site task `01a026ea-1eee-7d11-a9cf-5a7f8a518644`

Scope: the future public `/systems` work-and-life map. This packet does not
implement the page or establish provider, deployment, authentication, or live
runtime state.

## decision

The public map should express one principle:

> autonomy is an attention-routing problem.

This is a work-and-life system map, not an agent demo. Ani remains the shared
center of two coupled loops:

1. The attention loop turns signals from life into a decision about what needs
   Ani and what can continue elsewhere.
2. The execution loop delegates bounded work, preserves its context and
   authority, and returns proof or a decision.

The system should feel alive and continuous. Its public form stays selective:
it explains roles, boundaries, and movement without exposing private data or
current operational topology.

## resolved interview decisions

- Use two coupled loops rather than a horizontal software pipeline.
- Use four one-word life domains: `career`, `learning`, `wellbeing`, and
  `personal`.
- Place `business` and `content` inside career. Building is an activity within
  career or business, not its own life domain.
- Treat administration as coordination attached to the domain it serves.
- Treat the system as the surrounding meta-layer, not another life domain.
- Name only Notes, Reminders, Codex, Claude Code, GitHub, and Admin.
- Use solid connections for the established pattern and dotted connections for
  meaningful consolidation still in progress.
- Omit a public legacy-systems lane.
- Keep the privacy boundary implicit in visible page copy.
- Make the first version fully understandable as a static semantic map.
- Add two restrained, infinitely circulating currents as progressive visual
  enhancement.

No product or content decisions remain open in this packet.

## evidence reviewed

### current Site sources

- `apps/www/src/pages/systems.astro` contains the current placeholder and shows
  that field notes and public tools already surround the map location.
- `content/public/pages/systems.md` owns the current public systems copy.
- `packages/types/src/cms.ts` defines `SystemsPageContent`.
- `packages/content/src/public/editor.ts` normalizes and validates systems
  content.
- `docs/platform-architecture.md` establishes the public, admin, content, and
  proof boundaries.
- `docs/admin-v2-architecture.md` records the intent, authority, operation,
  proof, and state separation behind the operator model.
- `docs/admin-canvas-design-system.md` provides an existing precedent for typed
  graph roles, restrained visual hierarchy, and responsive semantic fallback.

### canvas corpus

The offline tldraw specialist inspected the current board and its retained
predecessor without mutating either canvas:

- `~/Documents/Codex/2026-07-18/are/outputs/unified-agent-system.tldraw`
- `~/Documents/Codex/2026-07-18/are/outputs/unified-agent-system.pre-operator-20260720T142355Z.tldraw`
- `~/Documents/Codex/2026-07-18/are/outputs/unified-agent-system-first-slice.md`

The retained boards use a sparse node-and-arrow grammar. Their strongest idea
is the return path: execution produces proof, and attention returns to Ani only
when the system needs judgment. Passive context supports execution without
becoming another task owner. Schedules can initiate bounded work without
becoming a second priority system.

The boards are useful source material, but their agent-only topology is too
narrow for the public work-and-life map. The public version should preserve the
return path while adding the life-domain and attention loop.

### private architectural sources

The discovery pass also reviewed current local policy and architecture material
covering:

- canonical life-system ownership and the capture, owner, review, proof model;
- local-first knowledge routing and sanitized attention projections;
- agent task ownership, finite workers, and durable handoffs;
- separate authoring, review, always-on runtime, and approval roles;
- source-controlled project state and proof-backed completion;
- creator, career, study, business, wellbeing, and personal workflows.

These sources inform the public abstraction. Their raw records, identifiers,
payloads, and current runtime details are not page content.

## evidence-backed source model

### life domains

The four public domains are deliberately broad:

| domain    | public meaning                                            |
| --------- | --------------------------------------------------------- |
| career    | employment, business, products, professional content      |
| learning  | coursework, study, research, and skill development        |
| wellbeing | health, care, energy, routines, and sustainable capacity  |
| personal  | relationships, home, money, recreation, and personal work |

`Business` and `content` appear as small children inside career. No project,
employer, person, account, condition, balance, or obligation is required to
make these domains legible.

### attention loop

```text
career / learning / wellbeing / personal
  -> capture (Notes + Reminders)
  -> attention (Admin)
  -> Ani
  -> life domains or delegated execution
```

This loop shows why the system exists. Signals need a low-friction place to
land, one projection needs to make them reviewable, and Ani decides which work
stays human and which work can continue through an agent.

### execution loop

```text
Ani
  -> runtimes (Codex + Claude Code)
  -> authority
  -> work
  -> proof
  -> attention (Admin)
  -> Ani
```

GitHub appears as durable source-controlled state supporting work and proof. It
is not presented as the owner of every life outcome. Private context supports
the runtimes. Native schedules can enter the loop, but neither support surface
owns priority or completion.

### stable and evolving connections

The public map should use solid edges for the durable operating pattern:

- life creates signals;
- Notes and Reminders provide human capture;
- Ani delegates bounded execution to Codex or Claude Code;
- authority sits between runtime intent and consequential work;
- work returns proof;
- GitHub preserves committed technical state.

Use dotted edges only where the unified system is still being consolidated:

- private context projected into the appropriate runtime;
- schedules routed into the common attention model;
- Admin becoming the unified attention return across domains.

Dotted means evolving, not broken, unavailable, or promised live.

## contradictions and safe resolution

| source tension                                 | public resolution                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| machine roles changed across historical plans  | use creation, review, runtime, and approval roles; publish no machine identifiers |
| Brain, memory, and Rudy lineage varies         | show one `private context` support role and make no live-backend claim            |
| Admin is both implemented surface and target   | show it as the intended attention projection with an evolving connection          |
| older controller models used one central owner | show Ani plus bounded project execution, not a monolithic autonomous controller   |
| the old canvas is agent-only                   | retain its proof return while adding the life-domain attention loop               |

The map must not select a stale historical document as proof of current state.
It presents the stable design principle and marks material consolidation
honestly.

## public and private classification

### safe public model

- the four life-domain names and the two coupled loops;
- Ani as the point of judgment;
- Notes and Reminders as capture surfaces;
- Admin as the attention projection;
- Codex and Claude Code as bounded execution runtimes;
- authority, work, proof, schedules, private context, and durable state as
  role labels;
- GitHub as the named committed-state anchor;
- solid and dotted connection semantics;
- the principle that autonomy is an attention-routing problem.

### private source model only

- machine identities, network layout, users, runtime locations, and listeners;
- raw memories, transcripts, messages, notes, health information, financial
  information, relationships, and provider payloads;
- credentials, sessions, permission material, approval records, and recovery
  details;
- native task, branch, worktree, account, deployment, and provider identifiers;
- current authentication, deployment, service, schedule, or machine health;
- private project and source locators not already part of public work.

If the implementation needs a private identifier to remain understandable, the
abstraction is wrong and the standing Site task should stop for review.

## public information architecture

Keep the existing page order and replace only the placeholder:

1. Page title and the principle.
2. `work and life system` map.
3. Existing field note.
4. Existing public tools.

Do not add a visible privacy explainer, implementation diary, architecture
essay, or legend-heavy inspector. A compact legend may explain only `stable`
and `evolving` edges.

## diagram grammar

### composition

- Use an inline SVG for desktop and tablet.
- Place Ani at the shared center of the loops.
- Group the four life domains on the life side of the composition.
- Nest `business` and `content` visually inside career.
- Group Notes and Reminders inside capture.
- Group Codex and Claude Code inside runtimes.
- Use a diamond only for authority.
- Use rounded boxes for other system roles.
- Place private context, schedules, and GitHub-backed durable state in a muted
  support band rather than the main narrative path.
- Keep base edges visible at all times.

### visual language

- Use existing public-site surface, ink, muted-ink, and interactive tokens.
- Reserve blue for the moving flow current.
- Use solid base edges for stable connections and dotted base edges for
  evolving connections.
- Use short relation verbs rather than implementation details.
- Do not add gradients, glows, particles, fake dashboard chrome, provider
  branding, or decorative infrastructure icons.

### continuous motion

Overlay two short, rounded blue stroke segments on the static base paths:

- one travels around the attention loop;
- one travels around the execution loop;
- use different linear cycle lengths so they do not move in lockstep;
- make the proof return visually clear without changing edge meaning;
- keep labels and nodes stationary;
- implement with CSS stroke-dashoffset animation and no interaction state;
- remove the animated overlays under `prefers-reduced-motion: reduce`.

The animation is progressive polish. Removing it must not alter comprehension,
layout, semantics, or the accessible fallback.

## responsive and accessible behavior

- Desktop and tablet render the coupled-loop SVG at the available content
  width.
- Mobile replaces the graph with a single-column semantic sequence using the
  same content and relationship order.
- The mobile sequence must not require horizontal scrolling, dragging, zooming,
  or disclosure controls.
- Keep an ordered relationship summary in the DOM for assistive technology.
- Treat the SVG as decorative for screen readers so labels are not announced
  twice.
- Use a figure caption or adjacent heading to bind the principle and map.
- Do not make static nodes keyboard-focusable.
- In reduced-motion mode, preserve all base connections and hide only animated
  overlays.

## structured content contract

The future Site implementation should extend `SystemsPageContent` with:

```ts
interface SystemsMapDomain {
  label: string;
  children: string[];
}

interface SystemsPageContent {
  // existing fields remain
  map_principle: string;
  map_domains: SystemsMapDomain[];
}
```

Canonical content values:

```yaml
map_principle: "autonomy is an attention-routing problem."
map_domains:
  - label: career
    children:
      - business
      - content
  - label: learning
    children: []
  - label: wellbeing
    children: []
  - label: personal
    children: []
```

The normalizer should trim values, discard incomplete domain rows, cap the
small public list, and fall back to canonical defaults when the source is
missing or empty. Validation should require a non-empty principle, exactly the
four canonical top-level domains for this first version, unique labels, and
unique child labels within each domain.

Topology, relation IDs, geometry, tool anchors, animation paths, and accessible
relationship sentences belong to the reviewed `SystemMap.astro` implementation.
They are not live data and should not be derived from private sources, Admin,
D1, tasks, machines, or providers.

## implementation contract for the standing Site task

The standing task should:

- replace only the current map placeholder;
- retain the field-note and public-tools sections;
- add the two structured content fields and their normalizer, validator,
  defaults, and focused tests;
- implement one reviewed `SystemMap.astro` component;
- render from static public content with no live API or private data access;
- preserve the coupled-loop structure on desktop and the semantic sequence on
  mobile;
- implement the two infinite currents as optional CSS-only polish;
- keep every public claim source-backed and temporally honest.

The standing task should not:

- create another task manager, controller, operator, or public live-status
  surface;
- add interactions, inspectors, filters, or animation controls;
- read Admin, D1, provider, task, machine, or private-context state at runtime;
- expose exact authority policy, credential topology, or current operational
  state;
- refactor unrelated page sections;
- merge or deploy without the standing Site lane's separate release proof.

## implementation verification contract

The future implementation is complete only when:

- systems-content normalization and validation tests cover valid, missing,
  empty, duplicate, and malformed map content;
- `pnpm check:changed` passes;
- scoped public-site typecheck and build pass;
- desktop, tablet, and mobile browser review confirms both loops, correct label
  hierarchy, and no overflow;
- both currents animate continuously in normal motion mode;
- reduced-motion mode shows the complete static map with no animated overlays;
- the semantic fallback communicates the same nodes and connections without
  the SVG;
- a boundary scan finds no private identifiers or live-state claims;
- local, PR/CI, deployed, and live proof remain separately reported.

## research basis for the principle

`autonomy is an attention-routing problem` is an inference, not a quotation.
It synthesizes current frontier engineering observations:

- agent work is becoming delegated and long-horizon;
- human attention and quality review become the scarce resource as execution
  scales;
- reliable autonomy depends on legible environments, durable context,
  constraints, feedback, and outcome validation;
- consequential actions and agent handoffs need explicit control boundaries.

Primary references:

- [OpenAI: Harness engineering](https://openai.com/index/harness-engineering/)
- [OpenAI: How agents are transforming work](https://openai.com/index/how-agents-are-transforming-work/)
- [Anthropic: Scaling Managed Agents](https://www.anthropic.com/engineering/managed-agents)
- [Anthropic: Claude Code auto mode](https://www.anthropic.com/engineering/claude-code-auto-mode)

## rollback-safe boundary

This packet is docs-only. It changes no page, content schema, runtime,
provider, task topology, authentication, database, deployment, or production
surface. The standing Site task can absorb or supersede the packet without a
rollback operation. Any future page implementation remains a normal public-site
change with its own branch, checks, review, merge, deployment, and live proof.
