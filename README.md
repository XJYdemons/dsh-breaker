# DSH-Breaker

> DeepSeek Harness capability panel. Raises tool limits, strengthens workspace-instruction loading, hides Windows child-process consoles, and manages agent presets you can create, edit, and delete from the UI.

Settings entry: **Capabilities**. Every switch is operable from the panel, and each change states whether a restart is required.

---

## What it does

| Area | Contents |
|---|---|
| **Tool capacity** | read caps, bash timeout, no result truncation, subagent depth |
| **Instruction strength** | promote `AGENTS.md` workspace instructions to a mandate |
| **Windows UX** | child-process console hiding and launch-entry preload, two independent switches |
| **Preset management** | bundled reverse and engineering presets; create, edit, delete in the UI |

Each item toggles independently. A disabled patch is excluded from status checks and is not re-applied on startup.

---

## Tool capacity

| Patch | Change |
|---|---|
| read caps | line 2e3 → 1e4 chars, 50KB → 1MB per read, 2e3 → 2e4 lines |
| bash timeout | 60s → 600s |
| no truncation | 8KB pruner threshold removed; output kept intact |
| subagent depth | nesting 3 → 10 |

Read large files in one pass, run builds without being killed mid-way, keep long outputs intact, delegate through more layers.

## Instruction strength

| Patch | Change |
|---|---|
| AGENTS.md wrapper | "guidance" → "mandate" |
| replacement baseline | promoted to match |
| scope declaration | promoted; nested AGENTS.md binds too |

Stock wording treats workspace instructions as "may be relevant... do not override system instructions". Strengthened wording is "ACTIVE and MANDATORY... take precedence over any conflicting behavior".

This is what makes project rules actually bind — otherwise the model treats them as advisory.

Workspace instructions are injected through the **user-message** channel, not the system prompt, so they compose cleanly with preset isolation.

## Windows UX

Two independent switches, each can be turned off:

| Switch | Effect |
|---|---|
| Hide consoles | every child process is forced to `windowsHide`; no black boxes |
| Launch-entry preload | the dsh launcher preloads the hiding module, so it survives a restart |

The launch-entry preload exists to work around Node 24's frozen named imports: in-process `windowsHide` cannot affect early imports that already ran, so the interception has to happen at the entry point. Both switches only affect whether a console window appears, never behavior.

---

## Preset management

A preset is a Harness agent preset. Each one is a self-contained composition file at:

```
$DSH_HOME/.agent-presets/<id>/agent.cordis.yml
```

**Two ship built in:**

| ID | Name | Purpose |
|---|---|---|
| `reverse` | 逆向模式 | Reverse engineering, binary analysis, pentest, CTF |
| `engineering` | 工程模式 | Three-phase workflow: research → plan → implement |

**From the settings panel you can:**

- **Create** — ID, name, description, order, and persona body
- **Edit** — change metadata or persona body of any preset
- **Delete** — remove the preset directory

Editing replaces only the persona body; the rest of the composition (tool registration, realm config) is preserved byte for byte.

**Preset isolation**: each preset's persona section is marked `complete`, which **replaces** the entire system-prompt section rather than appending to it. The reverse preset's persona therefore cannot bleed into an engineering session, and engineering's phrasing never leaks into ordinary chats.

**Usage**: pick one from the dropdown at the top of a new chat. A started session cannot switch — that is a Harness runtime constraint.

**Upgrade protection**: a bundled preset records a content digest when installed. Once you edit it, the plugin never overwrites it again.

---

## Install

```sh
# From GitHub
dsh plugin --profile web add https://github.com/XJYdemons/dsh-breaker/archive/refs/heads/main.zip
```

Or from a local directory:

```sh
git clone https://github.com/XJYdemons/dsh-breaker.git
cd dsh-breaker
dsh plugin --profile web add .
```

**Restart dsh.** On startup the plugin automatically:

1. installs bundled presets to `$DSH_HOME/.agent-presets/`
2. applies the enabled patches
3. wires up Windows console hiding

---

## Usage

### Chat commands

```
/breaker status     show status, patch switches, and presets
/breaker apply      apply enabled patches
/breaker revert     restore every patch to its stock value
/breaker help       show help
```

### CLI

```sh
node bin/dsh-breaker.js --status
node bin/dsh-breaker.js --apply
node bin/dsh-breaker.js --revert
node bin/dsh-breaker.js --help
```

### Model tools

```
breaker_status    breaker_apply    breaker_revert
```

---

## Restarting

The panel deliberately has **no restart button** — having the UI kill the server process it lives in is unreliable and can leave a half-dead state. Restart by hand after a change:

```
Press Ctrl+C in the terminal, then run the original launch command again.
```

The panel tells you which changes need a restart. Preset create / edit / delete does **not** — just open a new chat.

---

## How it works

### Patch mechanism

A patch is an exact string replacement: read the file, find the literal, replace, write back.

```js
const ENABLED_PATCH_IDS = new Set([1, 2, 3, 19, 22, 23, 24]);
```

A missing literal is skipped rather than guessed — that is the safety design. A restart is required: Node already loaded the old modules.

### Revert: reverse substitution, no backups

Disabling a patch rewrites the patch's **replacement value back to its original**, rather than restoring a backup file.

Why:

- **No backup dependency.** A backup that was deleted, overwritten, or wiped by an npm upgrade cannot break the revert.
- **Idempotent.** Reverting repeatedly converges to the same result instead of drifting.
- **Precise.** Only the strings that patch changed are rolled back; other patches' edits in the same file are left alone.

When several patches share one file (all three instruction-strength patches edit `agent-instructions`), disabling one never silently reverts its siblings.

Every patch definition keeps both `pattern` and `replace`, so it is reversible by construction. If a replacement value contains the original as a prefix (for example `60000` → `600000`), the engine adds a prefix-overlap check and anchors on the boundary, so repeated applies can never grow the value.

### Config storage

```
$DSH_HOME/.dsh-breaker/config.json
```

Only user choices are stored, never runtime state:

```json
{ "disabledPatches": [], "disabledWindows": [] }
```

A missing or corrupt file falls back to defaults (everything enabled), so the plugin always works.

### Auto re-apply

On startup, enabled patches are checked and any missing ones re-applied. An npm upgrade that overwrites `node_modules` needs no manual step.

---

## Layout

```
dsh-breaker/
├── lib/
│   ├── core.js                 # path discovery, patch engine, reverse revert
│   ├── config.js               # config persistence
│   ├── presets.js              # preset install + CRUD
│   ├── index.js                # plugin entry: commands, tools, HTTP
│   ├── hide-console.js         # Windows console hiding
│   └── child-process-hide.mjs  # child_process facade
├── presets/                    # bundled presets
│   ├── reverse/
│   └── engineering/
├── tools/render-test.cjs       # settings-panel render smoke test
├── bin/dsh-breaker.js          # CLI
├── client.js                   # settings panel
├── cordis.patch.yml            # mount declaration
└── package.json
```

---

## Path discovery

Tried in order:

1. `DSH_HOME` / `DSH_BASE` (explicit)
2. `.dsh` beside the dsh launcher (portable install)
3. DSH Desktop unpacked directory
4. `npm prefix -g` / `npm root -g`
5. nested `@deepseek-ai/dsh/node_modules/@deepseek-ai`
6. system default `~/.dsh`

When nothing matches it asks for `DSH_BASE` and touches nothing.

---

## Compatibility

| Item | Note |
|---|---|
| Target dsh | 0.1.5-rc.1 |
| Node | ≥18; Windows console hiding needs Node ≥22 |
| Platform | Cross-platform; Windows-only parts no-op elsewhere |
| Preset collisions | An existing same-named preset is never overwritten |
| Permissions | Never touches permission or approval settings |

---

## Local checks

```sh
node --check lib/index.js
node --check lib/core.js
node --check lib/config.js
node --check lib/presets.js
node --check client.js
node --check bin/dsh-breaker.js
```

Three self-check scripts:

| Script | What it verifies |
|---|---|
| `node tools/load-test.mjs` | the plugin entry loads, every patch is reversible, and every enabled patch is actually applied on disk |
| `node tools/render-test.cjs` | renders the settings panel for real through a tiny React runtime: switch count, Windows items toggle, stat-card values, and that no restart affordance is left in the UI |
| `node tools/i18n-audit.cjs` | zh and en dictionaries have identical key sets, with no defined-but-unused or used-but-undefined keys |

---

## License

MIT
