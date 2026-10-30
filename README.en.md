# dsh-model-tree

Two-level model picker for [the coding assistant (DSH)](https://github.com/deepseek-ai/the coding assistant).

The built-in picker renders every provider's models in one long scrolling list.
With several relay endpoints and multiple accounts, finding a model turns into a
scrolling task. This plugin turns it into a two-level menu:

```
First open                    After picking a provider
┌────────────────────┐        ┌──────────────────────────┐
│ 不眠API      52 个 ›│        │ ‹back   不眠API          │
│ WorkBuddy 1  19 个 ›│   →    │ ┌──────────────────────┐ │
│ Trae         21 个 ›│        │ │ search models…        │ │
│ 书生·端砚    10 个 ›│        │ ├──────────────────────┤ │
└────────────────────┘        │ │ GPT-6.1-Sol        ✓  │ │
                              │ │ GPT-6-Sol             │ │
                              │ │ claude-sonnet-5       │ │
                              │ └──────────────────────┘ │
                              └──────────────────────────┘
```

## What you get

- The trigger shows `provider / model` instead of a bare model name
- Level 1 lists providers with their model counts
- Level 2 lists that provider's models, with a search box
- "‹ back" returns to the provider list
- The current provider and model are both marked

## Install

From your DSH profile directory (the one whose `package.json` lists
`dsh.profile.bundles`):

```sh
pnpm add dsh-model-tree
```

Add the package name to `dsh.profile.bundles`:

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "...",
        "dsh-model-tree"
      ]
    }
  }
}
```

Restart DSH.

## Uninstall

```sh
pnpm remove dsh-model-tree
```

and drop the name from `dsh.profile.bundles`. The built-in picker returns
untouched — this plugin **modifies no shipped file**, so removal is a full revert.

## How it works

DSH's composer exposes a `conversation.input.model` slot declared with
`kind: "single"`. Its contract marks it `replaceRisk: "shadows-shipped-ui"`:
the first live registration wins, so a plugin registering there **replaces** the
shipped selector rather than rendering beside it.

Model data comes from the same sources the shipped picker uses:

- `ctx.remote.session.modelCatalog()` — the catalog
- `ctx.remote.session.selectModel()` — committing a selection
- `session.projections.faceOf('modelSelection')` — the current selection

## Constraints

- Per-session catalog caches, mirroring the built-in behaviour
- Subagent sessions cannot change models (`available: false`, as shipped)
- Changing which providers exist needs a DSH restart (the catalog mechanism, not this plugin)

## Development notes

Two traps this plugin had to work around — keep them in mind if you fork it:

1. **Every React Hook must be called unconditionally at the top of the
   component.** A `return` before a Hook throws React error #321 (conditional
   Hook), which shows up as the selector silently disappearing.
2. **`getSnapshot` must return a stable reference.** Returning a fresh object
   each call makes `useSyncExternalStore` treat the store as unstable and throw.

To diagnose, set `DEBUG = true` at the top of `lib/client.js`; after a restart
the page's lower-left corner shows what the plugin is doing.

## License

MIT
