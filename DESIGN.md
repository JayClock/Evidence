# Evidence Design System

## Product Character

Evidence is a neutral, precise, and evidence-first knowledge delivery workbench.
It should feel trustworthy, calm, and operational rather than playful,
decorative, or project-management-heavy.

The primary visual reference is Attio. Evidence and execution components borrow
functional patterns from GitHub Primer. Keyboard interaction follows
Superhuman principles. Pair workbenches may use Cursor-style split views and
Retool-style inspectors without making the rest of the product feel like an
IDE or an internal administration tool.

## Design Priorities

Use the references in this order:

1. **Attio** — application shell, navigation, compact records, tables, and
   object details.
2. **GitHub Primer** — evidence, checks, diffs, immutable references, timelines,
   and status semantics.
3. **Superhuman** — command palette, keyboard-first navigation, visible focus,
   and rapid human-decision processing.
4. **Cursor and Retool** — Pair and other complex operational workbenches only.
5. **Notion** — long-form knowledge content such as Problem Statements, Story
   Revisions, model explanations, and decision records.

Do not combine the products' brand treatments. Evidence has one neutral visual
foundation and borrows only task-appropriate interaction patterns.

## Theme

Use a light-first neutral interface.

Black, white, and cool gray are the permanent visual foundation. Do not
preserve or reintroduce the former warm green and paper palette.

Dark mode is secondary and must retain the same hierarchy and evidence
semantics as light mode. A dark theme must not become a saturated green theme.

## Color

### Foundation

| Token               | Light value | Purpose                                    |
| ------------------- | ----------- | ------------------------------------------ |
| Canvas              | `#F7F7F8`   | Application background                     |
| Surface             | `#FFFFFF`   | Primary work surfaces                      |
| Surface Subtle      | `#F1F1F3`   | Secondary rows and grouped controls        |
| Text Primary        | `#1A1A1A`   | Main content and titles                    |
| Text Secondary      | `#6F6F75`   | Supporting copy and metadata               |
| Border              | `#E1E1E4`   | Default separators and boundaries          |
| Border Strong       | `#C9C9CE`   | Emphasized boundaries and active structure |
| Primary Action      | `#1A1A1A`   | Primary action background                  |
| Primary Action Text | `#FFFFFF`   | Primary action foreground                  |

### Semantic states

| Meaning                         | Color        | Required non-color signal            |
| ------------------------------- | ------------ | ------------------------------------ |
| Link / Running / Information    | `#0969DA`    | Label and information icon           |
| AI Proposal / Non-authoritative | `#9B69FF`    | `Proposal` label and sparkle icon    |
| Verified / Accepted             | `#1A7F37`    | `Verified` label and check icon      |
| Human Decision Required         | `#9A6700`    | Decision label and person/clock icon |
| Failed / Rejected / Invalidated | `#CF222E`    | Failure label and alert icon         |
| Locked / Immutable              | Neutral gray | `Locked` label and lock icon         |

Never use brand color as success color. Never distinguish Human and Agent by
color alone. Semantic states always include text and an icon; color is
supplementary.

## Typography

- Interface: `Inter Variable`, `system-ui`, `sans-serif`.
- Technical: `Geist Mono`, `ui-monospace`, `monospace`.
- Page title: `24px / 32px / 600`.
- Section title: `16px / 24px / 600`.
- Primary interface text: `14px / 20px`.
- Secondary interface text: `12px / 18px`.
- Technical metadata: `11–12px`, monospace.

Never use text below `11px`. Reserve monospace for commands, hashes, paths,
identifiers, logs, and other technical evidence.

## Spacing

Use a 4px base scale:

```text
4, 8, 12, 16, 24, 32, 48
```

Prefer a compact vertical rhythm. Do not use oversized marketing whitespace
inside the product. Dense layouts must remain scannable and preserve visible
keyboard focus.

## Radius and Elevation

- Control radius: `6px`.
- Card radius: `8px`.
- Dialog radius: `12px`.
- Default surfaces use borders, not shadows.
- Shadows are limited to dialogs, sheets, menus, and floating elements.
- Avoid nested rounded cards. Use sections, separators, and rows inside a
  primary surface instead.

## Application Shell

- Left navigation: `240–256px`.
- Top command bar: `48px`.
- Contextual authority rail: `340–380px`.
- Main content consumes the remaining width.
- On narrow screens, the navigation and authority rail become sheets rather
  than squeezing the work surface below its usable width.

The top command bar provides breadcrumbs, global command access, context status,
and theme controls. `Cmd/Ctrl + K` opens the command palette from anywhere.

The authority rail shows, in this order:

1. current authority;
2. responsible actor;
3. the single next action;
4. completion conditions;
5. evidence references;
6. permitted feedback targets.

Do not duplicate complete business workflows in the Electron preload or IPC
layer. Web and Desktop share the same REST/HAL domain semantics.

## Delivery Structure

Top-level delivery navigation contains six knowledge positions:

1. Problem and Intake
2. Scenario and Model
3. Tasking
4. Pair
5. Showcase
6. Run and Respond

Internal gates such as TQA, Desk Check, and Coding Approval belong inside these
positions. They must not become top-level Kanban columns.

Provide three scope lenses:

- Overall Delivery
- Current Iteration
- Software Construction

A lens changes the projection of the same authoritative knowledge. It does not
create a second workflow or authority model.

## Evidence Semantics

### Proposed

AI-generated or unconfirmed knowledge. Use violet plus a `Proposal` label and a
non-human actor indicator. A proposal must never be described as accepted
knowledge.

### Locked

Immutable input, frozen intake, revision, hash, or authority reference. Use a
neutral treatment with a lock icon and technical metadata where relevant.

### Verified

Supported by current evidence. Use green with a verification icon and explicit
`Verified` or `Accepted` text.

### Human Decision Required

The system cannot continue without human judgment. Use amber with an explicit
human-decision label and a singular primary action.

### Invalidated

Evidence has disproved, rejected, or superseded the knowledge. Use red with an
invalidated/rejected label and preserve the prior evidence trail.

## Components

Prefer:

- compact object tables;
- split-pane record details;
- evidence timelines;
- authority panels;
- decision gates;
- execution checks;
- immutable reference rows;
- feedback route history;
- command palette;
- contextual inspectors;
- bordered tabs and compact status badges.

Avoid:

- generic KPI dashboards;
- eleven-column Kanban boards;
- oversized hero sections;
- cards inside cards;
- decorative gradients;
- glassmorphism;
- emoji as domain icons;
- rainbow-colored model nodes;
- AI purple applied to the entire application.

## Tables and Records

Tables are the default collection view for durable business objects. Keep rows
compact, use restrained hover/selection states, and align technical metadata in
monospace. Selecting a record should preserve collection context through a
split detail panel when practical.

Object details prioritize identity, authority, next action, and evidence before
secondary metadata. Long-form content may use a wider reading rhythm inside the
main pane but must retain the authority rail.

## Diagram

Use neutral nodes with:

- a Lucide type icon;
- a narrow semantic color strip;
- title;
- subtype label;
- authority state.

Use edge labels and line styles to communicate relationships. Do not use emoji
or large categorical fills. Selection uses a clear focus ring rather than a
large glow or shadow. Group containers remain quiet and subordinate to their
contents.

## Pair Workbench

Pair is the most technical surface and may use a dense three-part workbench:

- execution context and current TEST;
- checks, evidence, diff, logs, and agent activity;
- authority rail with the human decision and completion conditions.

Code, commands, hashes, logs, and diffs use the technical font. Complete local
paths, source, diffs, stdout, prompts, credentials, and Pi messages remain local
to Desktop. The Server receives only the allowed authority and evidence
projection.

## Motion

- Transitions: `120–180ms`.
- Use motion only for focus, panel changes, disclosure, and state confirmation.
- Respect `prefers-reduced-motion`.
- Do not use decorative floating, bouncing, or large page transitions.

## Accessibility

- Meet WCAG AA contrast for text and interactive controls.
- Every interactive element has a visible keyboard focus state.
- Icon-only controls have accessible names.
- Status and actor distinctions do not rely on color alone.
- Dialogs and sheets have accessible titles.
- Tables, timelines, and diagrams expose useful labels and reading order.
- Never render essential interface text below `11px`.

## Voice

Use concise, factual, and authority-aware language.

Always distinguish:

- fact;
- proposal;
- automated result;
- human observation;
- human decision.

Prefer one explicit next action over several competing calls to action. Never
describe an AI proposal as accepted knowledge or imply that automation supplied
a human judgment.
