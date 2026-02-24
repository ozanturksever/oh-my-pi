# Fork Features & Merge Guide

Delta between this fork (`ozanturksever/oh-my-pi`) and upstream (`can1357/oh-my-pi`).

Net effect: +3,459 / -276 lines vs upstream at fork point. Upstream baseline: `d942f04` (upstream/main, `fix: align task-template test expectations with trimmed prompt output`). Last merged: 2026-02-24.

---

## How to Read This Document

Each section is tagged with a **merge policy**:

- KEEP — Core to the fork's purpose. Must survive upstream merges. Resolve conflicts in favor of the fork.
- PREFER UPSTREAM — Adopt upstream's version on next merge. Fork changes here were tactical or temporary.
- NEGOTIATE — Fork has meaningful changes but upstream may too. Manually reconcile on merge; pick the better implementation.

---

## 1. Binary Rebranding (`omp` -> `oomp`) — KEEP

The fork binary is renamed from `omp` to `oomp` to avoid conflicts when both upstream and fork are installed side-by-side.

| File | Change |
|---|---|
| `scripts/install.sh` | Repo URL, binary name, default to binary install |
| `scripts/install.ps1` | Repo URL, binary name, install dir |
| `install.sh` | New top-level fork-specific installer |
| `README.md` | Badge URLs and image links point to fork repo |
| `packages/coding-agent/src/cli/update-cli.ts` | References fork repo |
| `packages/utils/src/dirs.ts` | Config/data dirs may reference fork name |

**Merge notes**: On upstream merge, re-apply the `oomp` branding. Conflicts are mechanical — search-and-replace `can1357` -> `ozanturksever` and `omp` -> `oomp` in install scripts. The top-level `install.sh` is fork-only and won't conflict.

## 2. Fork Release Infrastructure — KEEP

Dedicated CI and build scripts for publishing `oomp` binaries independently of upstream.

| File | Purpose |
|---|---|
| `.github/workflows/release-fork.yml` | GitHub Actions workflow: build native addons (linux/darwin x64/arm64), compile binaries, create GitHub release |
| `scripts/build-local.sh` | Local build + publish: compiles for current platform, tags, creates GH release |
| `scripts/release-fork.sh` | Lightweight release trigger: tag + push, lets CI do the build |
| `.gitignore` | Ignores compiled binaries under `packages/coding-agent/binaries/` |

**Merge notes**: Entirely additive — new files only. No conflict expected unless upstream restructures the native build pipeline or CI matrix.

## 3. Followup Suggestions System — KEEP

A new tool (`suggest_followups`) that lets the agent propose follow-up actions at the end of a turn. The user can review, select multiple, or dismiss.

| Component | Purpose |
|---|---|
| `src/tools/suggest-followups.ts` | Tool definition, schema, TUI renderer |
| `src/prompts/tools/suggest-followups.md` | Tool description prompt |
| `src/modes/interactive-mode.ts` | State management (`followupSuggestions`, `showFollowupSelector()`, `handleFollowupCommand()`) |
| `src/config/settings-schema.ts` | `followup.enabled` (boolean), `followup.loopMaxIterations` (number) settings |
| `src/tools/index.ts` | Tool registration |
| `src/tools/renderers.ts` | Renderer registration |
| `src/slash-commands/builtin-registry.ts` | `/followup` slash command to toggle |
| `test/follow-loop.test.ts` | 1,074 lines of tests |

Each suggestion carries a `priority` field (`must-have`, `nice-to-have`, `optional`) used by the follow loop (section 4).

**Merge notes**: Entirely additive. Touches `interactive-mode.ts` (new state fields + methods), `settings-schema.ts` (new settings), `builtin-registry.ts` (new commands), and tool registration files. If upstream modifies any of these, reconcile by re-inserting the followup blocks.

## 4. Follow Loop Mode — KEEP

Automated execution of `must-have` followup suggestions in a loop, with configurable iteration limits and an optional finish condition.

| Component | Purpose |
|---|---|
| `src/modes/interactive-mode.ts` | `startFollowLoop()`, `stopFollowLoop()`, `autoPickFollowup()` |
| `src/slash-commands/builtin-registry.ts` | `/followloop` (alias `/floop`) — start/stop/status |
| `src/modes/components/status-line/` | `follow_loop` segment showing active state + iteration count |
| `src/config/settings-schema.ts` | `followup.loopMaxIterations` setting (default: 25) |
| `test/follow-loop.test.ts` | Comprehensive tests for loop lifecycle |

The loop picks `must-have` suggestions one at a time; when none remain, it either sends a finish prompt or stops and shows remaining suggestions for manual selection.

**Merge notes**: Dependent on section 3 (followup suggestions). Same files touched. No upstream equivalent exists.

## 5. Multi-Select Support in Ask Tool & HookSelector — KEEP

Extended the `ask` tool and `HookSelector` component to support multi-select mode.

| Component | Change |
|---|---|
| `src/tools/ask.ts` | Replaced manual checkbox loop with `multiSelect` UI call; removed `getDoneOptionLabel()` |
| `src/modes/components/hook-selector.ts` | Added multi-select mode with checkbox rendering |
| `src/modes/interactive-mode.ts` | `showHookMultiSelector()` method |
| `src/modes/controllers/extension-ui-controller.ts` | `showHookMultiSelector()` wiring |
| `src/modes/types.ts` | Type updates for multi-select |
| `test/ask-tool.test.ts` | 470 lines of tests |
| `test/hook-selector-multi.test.ts` | 420 lines of tests |

**Merge notes**: The ask tool refactor simplifies the multi-select flow significantly (removes manual checkbox state management). If upstream changes the ask tool, compare carefully — the fork's version is cleaner but drops the old loop-based selection. `HookSelector` changes are additive (new mode flag).

## 6. Plans Browser (`/plans` Slash Command) — KEEP

Browse and resume recent plan files from within the TUI.

| Component | Purpose |
|---|---|
| `src/modes/components/plans-selector.ts` | New `PlansSelectorComponent` with fuzzy search, date display, Ctrl+E to open in editor |
| `src/modes/controllers/selector-controller.ts` | `showPlansSelector()` controller method |
| `src/slash-commands/builtin-registry.ts` | `/plans` slash command |
| `src/modes/interactive-mode.ts` | `showPlansSelector()` delegation |

**Merge notes**: Entirely additive. The plans selector is a new component with no upstream equivalent. Touches `builtin-registry.ts` and `interactive-mode.ts` (same as sections 3-4).

## 7. Ctrl+E to Open Plan in External Editor — KEEP

Added keyboard shortcut to open plan files in the user's `$EDITOR` from the plans selector and plan mode.

| Component | Change |
|---|---|
| `src/modes/components/plans-selector.ts` | Ctrl+E handler |
| `src/modes/controllers/event-controller.ts` | Ctrl+E key binding in plan mode |

**Merge notes**: Minimal diff. Event controller change is a small addition to key handling.

## 8. Version Scheme — KEEP

Fork versions **must** include a `-fork` prerelease tag to distinguish them from upstream releases. Use the format `<upstream-version>-fork.<N>`, where `<upstream-version>` is the upstream version the fork is based on and `<N>` is the fork's incremental release counter.

Example: upstream is `13.1.2`, fork releases are `13.1.2-fork.1`, `13.1.2-fork.2`, etc. After merging a new upstream version (e.g. `13.5.0`), the fork resets to `13.5.0-fork.1`.

| File | Change |
|---|---|
| `package.json` (all packages) | `version` fields use `-fork.N` suffix |
| `Cargo.toml` | Workspace version uses `-fork.N` suffix |
| `packages/coding-agent/CHANGELOG.md` | Fork-specific changelog entries under fork versions |

Current state: versions were bumped to `13.4.0` without the fork tag — these need to be corrected to `13.1.2-fork.1` (or whatever the next appropriate fork version is).

**Merge notes**: On upstream merge, rebase fork version to `<new-upstream-version>-fork.1`. Never use a bare semver that could collide with an upstream release.

## 9. macOS Codesign Fix — NEGOTIATE

Added ad-hoc codesigning for downloaded binaries on macOS. Bun-compiled binaries may have invalid signatures after download, causing Gatekeeper rejection.

| File | Change |
|---|---|
| `scripts/install.sh` | `codesign --force --sign -` after binary download |

**Merge notes**: This is a real fix for macOS binary installs. If upstream doesn't have it, propose it upstream. If upstream adds its own solution, compare approaches.

## 10. Install Script Behavior Changes — KEEP

Fork install scripts default to binary install (not bun-from-npm) and clone from source for `--source` mode instead of `npm install -g`.

| Change | Rationale |
|---|---|
| Default mode: binary (not bun) | Fork isn't published to npm |
| Source mode: `git clone` + `bun install -g` | Fork packages come from the repo, not the registry |
| Baseline native addon variant is optional | Not all platforms have both modern/baseline variants |

**Merge notes**: These changes are fork-necessitated. On upstream merge, keep fork's install scripts as-is (they reference the fork repo). Upstream's install scripts target npm and are irrelevant to fork users.

---

## Merge Checklist

Before merging upstream:

1. **Identify upstream baseline**: compare against the commit noted above (`f838068`).
2. **KEEP items**: re-apply or conflict-resolve in favor of the fork.
3. **PREFER UPSTREAM items**: accept upstream's version; drop fork-only changes.
4. **NEGOTIATE items**: diff both versions, pick the better one, document the choice.
5. **Key conflict zones**: `interactive-mode.ts`, `settings-schema.ts`, `builtin-registry.ts`, `ask.ts`, `tools/index.ts` — these files have fork additions interleaved with upstream code.
6. **Test after merge**: `bun check` (TypeScript + Rust), then run fork-specific tests: `bun test test/ask-tool.test.ts test/follow-loop.test.ts test/hook-selector-multi.test.ts`.
7. **Re-brand after merge**: verify all install scripts, README links, and binary names still reference the fork (`ozanturksever`, `oomp`).
