# @evidence-poc/desktop

Electron desktop workspace for the Fulfillment Modeling source tree. It opens a
local `<project>/.evidence/model` directory, draws the model as an interactive
canvas and writes edits back to the same JSON files that Git, the sensors and
the MCP tools already read.

## Run

```bash
nx start desktop        # Electron Forge dev (Vite HMR for the renderer)
nx test desktop         # vitest: node project store + jsdom renderer
nx typecheck desktop    # tsc for app and spec configs
nx build desktop        # Vite bundles in .vite/ + unpacked app in out/
nx package desktop      # alias for build, kept for muscle memory
nx make desktop         # installers in apps/desktop/out/make
```

`build` is the Nx contract entry point: it is cached, declares `.vite` and
`out` as outputs and is what `nx run-many -t build --all` runs. `package` and
`make` depend on it instead of re-invoking Electron Forge from scratch.

`electron-forge start` needs a display; the test targets do not.

## Editor navigation

- **业务旅程** is the only canvas layout. **总台账** in the left sidebar
  (Cmd/Ctrl+1) replaces it with the read-only entity ledger. Filter by category,
  entity, context, or CEL invariant; **导出 CSV** downloads all matching rows.
  Return with **定位画布**, **总台账** again, or **Alt+1**. Use the inspector to
  edit fields or rules.
- Use **Cmd/Ctrl+Shift+K** to search for commands or jump to business objects.
- Use **放映业务流** at the right of the top canvas bar to walk through a declared
  scenario on the same canvas. The entity directory folds away and **业务故事**
  opens on the right. In **故事剧本**, expand the numbered outline to jump to a
  scene. **本步注解** shows who owes what, how completion is decided and which
  details need clarification. Open **单据归档与字段依据** to inspect the sources.
- Open **推演与分支** to select a What-If challenge. Local
  deadline and shortfall challenges use the scene’s rules and work offline.
  With AI configured, playback also suggests scenarios based on the story and
  accepts free-form questions. A simulated breach opens **固化违约分支** to
  record an agreed compensation pair or dispute handoff. Keep or revert the
  change in the panel. After keeping it, you can play a scenario containing the
  new branch or locate its evidence on the canvas. **返回画布** and **退出放映** restore the inspector and the
  previous directory state. **Esc** reverts a pending patch or exits playback
  when used outside an input or dialog. Opening **总台账** ends playback.
- The canvas HUD controls zoom, fit and density; its **更多画布工具** contains
  grid and scenario actions.
- Use **实体属性检查** in the right pane to edit the selected object. **返回画布**
  returns keyboard focus without dropping the selection. **Alt+L** opens the
  selected entity’s field ledger. **Cmd/Ctrl+Shift+R** checks the current canvas;
  automatic checks run after its edits reach disk.

## AI configuration

Evidence uses the Pi SDK to read the global Pi settings, model definitions and
credentials from `~/.pi/agent` or from `PI_CODING_AGENT_DIR` in the app's launch
environment. Set up credentials in Pi (for example, with `/login`) and define
custom endpoints in Pi's [`models.json`](https://pi.dev/docs/models-configuration).
Only providers and credentials the SDK can resolve are available; terminal-only
environment variables must also be present in the app's environment. Evidence
loads neither project settings nor user CLI extensions for its modeling sessions.

Open **配置大模型 / AI Settings** from the AI badge, **Cmd/Ctrl+,**, or the
editor command palette. The panel shows the effective model and groups the
available models by provider. **设为默认模型** updates the shared Pi default;
choosing a thinking level also updates Pi settings. **测试连通性** sends a small,
potentially billable completion request and times out after 15 seconds. It does
not change the model selection. Use **打开 Pi 配置目录** to locate the files and
**重新加载 Pi 配置** after editing them or logging in from Pi.

Selecting a model refreshes the agent and story sessions; canvas edits and undo
history are unaffected. Desktop transcripts are stored by project under
`sessions/` in Electron's `userData` directory. Without an available model,
canvas inquiries offer setup and offline story projection and import remain
available.

## Bundled instructions, no interpreter

The sensors run in-process, so the installer works on a machine with no Python
and no checkout of this repository. Nothing is discovered from the project
either: an opened folder only has to hold its `.evidence/` sources.

- The instructions the session starts with are code —
  `@evidence-poc/evidence-agent/src/prompts/` (role, modeling red lines,
  the turn loop). They are appended to Pi's prompt, and the session asks for
  `noSkills: true`, so no working copy is scanned for `SKILL.md` and the model is
  never invited to go looking for one.
- Every sensor — consistency, key data and the stage gate —
  is TypeScript. `@evidence-poc/evidence-agent` reads the model once per run
  and decides from that one read.

No interpreter variable and no skill directory are published to the agent's
environment: nothing starts a script and no path is left to guess.

See [ENVIRONMENT.md](../../ENVIRONMENT.md) for the workspace the checks and API
projection come from. The renderer composes native canvas, diagnostics, story and
delivery views from the feature libraries below.

## Layout

```text
apps/desktop/
├── src/
│   ├── main/          # main process: windows, IPC, ProjectStore, watcher,
│   │                  # agentRuntime (Pi session), sensorRuntime (debounce)
│   ├── preload/       # the only `contextBridge` surface (index.ts)
│   └── renderer/      # editor shell and remaining screens; composes Feature libs
├── tests/             # integration tests against the product-procurement fixture
└── forge.config.mjs   # entries: src/main/main.ts, src/preload/index.ts
```

The folder per process mirrors Electron's runtime boundaries: `main/` may import
`node:*`, `preload/` talks to `electron` and `desktop-contracts`, and `renderer/`
is plain DOM. Only the application shell reads `window.evidenceAPI`; feature hooks
receive narrow, typed API ports explicitly.
Forge names the preload bundle after its entry, so `vite.preload.config.mjs`
pins `preload.js` — the name `windows.ts` loads.

Renderer behavior is shared through Nx libraries:

| Renderer concern                         | Source of truth                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| documents, undo, commands                | `@evidence-poc/evidence-model-core` (universal)                              |
| IPC DTOs and channel constants           | `@evidence-poc/desktop-contracts`                                            |
| layout, viewport, rulers                 | `@evidence-poc/evidence-canvas-interaction`                                  |
| canvas and inspector UI                  | `@evidence-poc/desktop-feature-canvas`, `desktop-feature-inspector`          |
| story, delivery, modeling agent UI/hooks | `desktop-feature-story`, `desktop-feature-delivery`, `desktop-feature-agent` |
| draft ingestion, domain ledger, scenario studio, model diagnostics | `desktop-feature-ingestion`, `desktop-feature-ledger`, `desktop-feature-scenario`, `desktop-feature-diagnostics` |
| chat thread and message parts | `desktop-ui-chat` |
| desktop MCP bridge and services | `desktop-services` |
| browser sensor/event DTOs and labels     | `@evidence-poc/evidence-agent/browser`                                       |
| domain story acceptance compilation      | `@evidence-poc/evidence-acceptance/projection`                               |
| shared scripted API/renderer fixtures    | `@evidence-poc/desktop-testing` (tests only)                                 |

The feature libraries own their colocated tests. `EditorScreen` still coordinates
selection, layout and cross-feature behavior; project services, window lifecycle
and IPC registration remain in the Electron main process. No library imports
application files. Node agent/acceptance implementations are never imported as
runtime code by a browser feature.

## Module resolution

Workspace libraries are consumed **from source**, not from their built `dist`.
Each `libs/*/package.json` exports a `@evidence-poc/source` condition and
`tsconfig.base.json` sets `customConditions` to the same value, so TypeScript,
the three Vite configs and the Vitest config all resolve a package to its
`src/index.ts`. Adding a library therefore means adding a path mapping nowhere —
only the package's own `exports` field.

Electron is strict about the two runtimes: the main and preload configs add the
`node` condition, the renderer config adds `browser`, and renderer code imports
a library's `/browser` entry whenever a Node-only adapter exists.

## Data flow

```text
.evidence/model ── project open ──▶ ModelSession (renderer)
                                           │ document changes, undo/redo, AI patches
                                           ▼
                      main-process queue (fixed 400 ms debounce)
                                           │ recorded source revision and disk digest
                                           ▼
.evidence/model ◀── serialized writes ── verified disk revision
                                           ├─ context API drafts (.evidence/delivery)
                                           ├─ in-process diagnostics
                                           └─ Bruno collection (.evidence/acceptance)
```

- There is no Save button. `Cmd/Ctrl+S` flushes queued edits immediately or
  regenerates artifacts for an already persisted model. Normal close and quit
  drain writes; an actual failure keeps the editor open for retry or reload.
- Writes use temporary files and per-file atomic replacement, not a transaction
  over the whole model tree. Unchanged file bytes stay unchanged. Disk digests
  distinguish self-writes from external changes. The status bar reports
  conflicts without interrupting typing; writes pause until **从磁盘重载** adopts
  the external version and discards queued local edits.
- Unfinished CEL in a structurally valid model can be written. Failed diagnostics
  or blocked API/acceptance projections do not roll back that model. Blocked
  context files and the previous Bruno collection are not marked current.
  Only draft APIs and generated acceptance files are updated; no API release
  or HTTP tests run automatically.
- The renderer sees only the typed `window.evidenceAPI`; it has no `fs`, Node,
  or raw Electron IPC access.

## Interaction contract

- Context cards are containers: nested, titled, never selectable business
  objects; empty shells are dropped before drawing.
- One dashed boundary wraps each Request with its confirmations and proofs;
  Request and results stay horizontally aligned.
- Evidence is a rectangle, participants and roles are rounded cards, text is
  horizontally centred and vertically centred as a block, responsibility is a
  corner badge fed only by `responsibleRoleRef`.
- Hover or keyboard focus highlights the object plus one hop; a Context hover
  emphasises its subtree and only the edges fully inside it.
- Edges are dashed across Context boundaries and arrowed only for
  `plays_role`; cardinality appears in standard mode.
- Drag empty canvas with the left, middle or right mouse button to pan. Left
  drag needs no modifier; Space+left drag also works. Wheel or two-finger scroll
  pans; pinch or Ctrl/Cmd+wheel zooms at the pointer.
- Click a card to select it, or click empty canvas to clear the selection.
  There is no box selection, including with Shift, and cards stay in the
  automatic layout.

Type a business example on an empty canvas or press **Cmd/Ctrl+K** to open
**业务场景头脑风暴** on an existing canvas. The agent places evidence cards in
lifecycle order and the viewport frames the new cards. Command search is still
available from the header or **Cmd/Ctrl+Shift+K**.

Use **澄清权责** on an evidence card to establish who owes what to whom and
which receipt confirms delivery. Follow-up answers stay pinned to that card
and can update the model. For a breach finding in **体检**, choose
**在放映中推演** to open **推演与分支** at the request's declared scenario step.
If the request has no flow example yet, use **定位** to find its card and add
an example to a business flow to enable playback for that request.

## Agent and sensors (phase 3)

```text
Canvas storming / node inquiry ──▶ agentRuntime (main) via agent:prompt
                                    │ Pi AgentSession + built-in instructions
                                    │ custom tools: get_focused_node_context,
                                    │   evidence growth, apply_model_patch
                                    ▼
                main commits an atomic PatchTransaction to its live model
                                    │
                                    ▼
                agent:patch-committed ──▶ ModelSession (renderer undo history)
                document-changed    ──▶ main persistence queue (all edits)
                persisted revision  ──▶ diagnostics and derived files
```

- The renderer never receives stored model credentials. During a turn, local
  document writes pause while main validates and commits AI patches against the
  published revision. Tool calls do not wait for a renderer acknowledgement.
- The editor replays versioned RFC 6902 transactions using the provided inverse
  patches. The result also carries committed transactions so missed broadcasts
  can be recovered in order. `Cmd/Ctrl+Z` undoes them alongside human edits.
- Sensors run in-process and are the only implementation: there is no mode to
  select and no interpreter to install.
- Key data that still owes a provider decision is a warning, not a static error,
  but it keeps `isStageGateReady` false — the model can be saved, the gate stays
  shut.
- Modeling turns run one at a time. A node inquiry shows reasoning, tool activity
  and its patch review on the card. Storming patches and reviews whose inquiry
  closed are shown in a canvas banner. Keeping a patch leaves its edits in
  place; reverting or undoing it produces another automatically synced edit.

## Key data, CEL and fulfillment editing (phase 4)

- The attribute table edits through commands (`add-attribute`,
  `remove-attribute`, `update-attribute`), so structural edits share the undo
  stack with text edits.
- Each key data row shows the provider the sensor engine classifies: contract
  term, domain source, negotiation source, result fact, request formation input,
  derived rule — or "decision owed". Nothing is stored for it; the badge is derived
  from the model, so it cannot drift from the ledger.
- CEL invariants are displayed in the inspector. The sensor engine reports
  syntax and reference problems independently of model persistence.
- **业务场景推演** applies structurally valid edits directly to the model. Invalid
  form input (such as an incomplete timestamp) is kept in the form only, and
  does not prevent closing or switching scenarios.
- A `fulfillment_request` exposes its completion condition, the confirmation that
  decides it and the breach condition. Pairing only offers confirmations in the
  same Contract Context, and a rejected guard is shown in the panel instead of
  crashing the window.

## MCP bridge (phase 4)

```text
Cursor / Claude Code / CLI ──stdio──▶ evidence (--mcp-stdio, headless)
                                        │ local socket (0600 / named pipe)
                                        ▼
                              main process: bridge + capture
                                        │ IPC: mcp:request / mcp:response
                                        ▼
                              renderer: ModelSession + projections
```

- `nx build evidence-mcp` builds the protocol package; the desktop declares it as
  a dependency and Vite aliases it in tests.
- Seven tools: `get_app_state`, `get_domain_model`, `get_selected_entity`,
  `get_key_data_audit`, `get_canvas_screenshot`, `apply_model_patch`,
  `run_stage_gate`.
- `apply_model_patch` is the only writer and it decodes into the same commands a
  human edit uses, so an external agent's change is one ⌘Z step.
- Screenshots are captured with selection rings and the zoom control hidden, so a
  multimodal agent reviews the model, not the editor.
- The app merges its server entry into `~/.cursor/mcp.json` and the Claude Desktop
  config when those directories already exist; the merge is idempotent and keeps
  every other server.

## Not implemented yet

- The packaged app has not been signed or notarized on this machine.
