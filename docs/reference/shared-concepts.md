# Shared concepts (/docs/reference/shared-concepts)

This page owns the shared language for `solid-trees`. Every option, primitive,
and model method uses the same path-first identity model. They use the same
tree-defining inputs. They use the same mutation vocabulary.

## Path-first identity [#path-first-identity]

Canonical path strings are the public identity for tree items. Use paths for:

- selection values
- focused-item lookups
- search matches
- rename and drag-and-drop events
- Git status attachment
- row annotations

Files and directories share the same identity space. The APIs mark the item kind
when that difference matters.

## Input shapes [#input-shapes]

`solid-trees` accepts three related input shapes:

- `paths`: the low-ceremony path for demos, tests, and small static trees
- `preparedInput`: the recommended scale-oriented input shape
- presorted prepared input: the highest-performance prepared-input path when the
  server already knows the final order

Use `prepareFileTreeInput(...)` and `preparePresortedFileTreeInput(...)` from
`solid-trees` to create the prepared forms. Treat prepared input as an opaque
tree-input object. Do not build the shape by hand.

## Shared option groups [#shared-option-groups]

This table lists the meaning of the `createFileTree(...)` options.

| Option                    | Meaning                                                              | Typical use                                                        |
| ------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `paths`                   | Raw canonical path list.                                             | Small demos, tests, very small static trees.                       |
| `preparedInput`           | Pre-shaped tree input created ahead of render.                       | Recommended input for larger trees.                                |
| `id`                      | Stable identity for the tree.                                        | Set a predictable DOM id (`<id>__tree`) on the rendered root.      |
| `initialExpansion`        | Baseline expansion policy for the first render.                      | Start broadly open, broadly closed, or at a specific depth.        |
| `initialExpandedPaths`    | Specific paths that should begin expanded.                           | Keep key folders open on first render.                             |
| `initialSelectedPaths`    | Paths selected on first render.                                      | Seed selection for previews or restored state.                     |
| `flattenEmptyDirectories` | Flattens chains of single-child directories into one visible row.    | Compact repo-style trees.                                          |
| `sort`                    | Client-side ordering for non-presorted input.                        | Secondary path when order must be chosen in the client.            |
| `search`                  | Enables the built-in search surface and model search methods.        | Searchable trees.                                                  |
| `initialSearchQuery`      | Starting search value.                                               | Preloaded filtered views or restored search state.                 |
| `fileTreeSearchMode`      | Controls how matches change the visible tree.                        | Choose between filtering, collapsing, or expanding around matches. |
| `searchBlurBehavior`      | Whether blurring the search input closes the search (`'close'`).     | Keep a filter applied with `'retain'`.                             |
| `onSearchChange`          | Callback for search-value changes.                                   | Sync surrounding controls or analytics.                            |
| `onSelectionChange`       | Callback for selection changes.                                      | Update sibling UI that tracks current selection.                   |
| `dragAndDrop`             | Enables drag and drop plus its policy hooks.                         | Editable trees.                                                    |
| `renaming`                | Enables inline rename plus policy hooks.                             | Rename-in-place workflows.                                         |
| `composition`             | Context-menu behavior flags and lifecycle callbacks.                 | Choose the menu trigger and button visibility.                     |
| `gitStatus`               | Built-in Git-style row signals.                                      | Added, modified, deleted, ignored, renamed, and untracked states.  |
| `icons`                   | Built-in icon set or icon configuration object.                      | Set selection, color mode, remaps, or sprite-sheet extension.      |
| `labels`                  | User-visible text the tree renders.                                  | Localize the search placeholder, accessible names, and tooltips.   |
| `renderRowDecoration`     | Custom non-Git row signal renderer.                                  | Generated-file badges, remote markers, validation hints.           |
| `density`                 | Density preset or custom spacing factor.                             | Tune row height and spacing in one place.                          |
| `itemHeight`              | Explicit row-height override.                                        | Row height that doesn't match a `density` preset.                  |
| `overscan`                | Extra rows rendered outside the visible window.                      | Smooth scrolling tradeoffs.                                        |
| `initialVisibleRowCount`  | Optional first-render row budget before the browser measures height. | Tune first-render work without pinning steady-state size.          |
| `stickyFolders`           | Pins the ancestor folders of the top row while scrolling.            | Keep context visible in deep trees.                                |

## Tree-shape options [#tree-shape-options]

The tree-shape options are `paths`, `preparedInput`, `initialExpansion`,
`initialExpandedPaths`, `flattenEmptyDirectories`, and `sort`.

Use them to answer three questions:

1. where the tree data comes from
2. what the initial visible shape must be
3. whether the client must still shape or sort the data

For the recommended setup, read
[Shape tree data for fast rendering](/docs/guides/shape-tree-data-for-fast-rendering).

## Search mode semantics [#search-mode-semantics]

`solid-trees` supports three search modes:

- `hide-non-matches`: shows only the matches and the ancestor chain that keeps
  them navigable. This is the guide default.
- `collapse-non-matches`: keeps the matching paths and the ancestor chain
  visible. It collapses unrelated branches out of the way.
- `expand-matches`: expands the matching branches into the surrounding tree
  context. It keeps non-matching rows visible.

The built-in search input, `createFileTreeSearch(...)`, and the model search
methods all use the same search modes.

## Selection, focus, and item handles [#selection-focus-and-item-handles]

Selection is path-based. Focus is path-based. Item handles are path-oriented
helpers for a known item.

Common lookup topics are:

- get an item by path
- read the focused and selected state
- focus, select, toggle, or deselect through the model or item handle
- expand, collapse, or toggle directories through a directory handle

Read
[Navigate selection, focus, and search](/docs/guides/navigate-selection-focus-and-search)
for workflows. Read [Solid API](/docs/reference/solid-api) for the reactive
primitives. Read [Model API](/docs/reference/model-api) for direct model
methods.

## Interaction and editing options [#interaction-and-editing-options]

`dragAndDrop`, `renaming`, and `composition` are the editing surfaces. They
share the same path-first event model. Header and context-menu content are Solid
JSX, passed to `<FileTree>` as the `header` and `renderContextMenu` props.

Read
[Rename, drag, and trigger item actions](/docs/guides/rename-drag-and-trigger-item-actions)
for the user-facing workflows that build on those options.

## Appearance and annotation options [#appearance-and-annotation-options]

`gitStatus`, `icons`, and `renderRowDecoration` all affect how rows look. But
they do different jobs:

- `gitStatus` is the built-in Git-style signal lane
- `icons` controls icon sets, remaps, and sprite-sheet extension
- `renderRowDecoration` adds non-Git row metadata

Page CSS is the narrow fallback when public styling surfaces are not enough. For
deeper lookup, read [Styling and theming](/docs/reference/styling-and-theming)
and [Icons](/docs/reference/icons).

## Scale and rendering settings [#scale-and-rendering-settings]

`initialVisibleRowCount`, `density`, `itemHeight`, and `overscan` are rendering
knobs, not onboarding concepts. The rendered container sets the steady-state
height. These options only tune the first-render budget, the visual density, and
the virtualized row window.

For density, use the `density` keyword (`'compact' | 'default' | 'relaxed'`) or
a numeric factor. It sets both the row height and the spacing in one place.
`<FileTree>` paints `--trees-item-height` and `--trees-density-override` for
you. Use `itemHeight` only when you need a row height that does not match a
preset.

Read
[Handle large trees efficiently](/docs/guides/handle-large-trees-efficiently)
when scale becomes the real problem.

## Mutation vocabulary [#mutation-vocabulary]

`solid-trees` exposes semantic tree mutations, not DOM events. The shared
mutation terms are:

- `add`
- `remove`
- `move`
- `batch`
- `resetPaths`
- `onMutation`

Mutation payloads stay path-first. Reset events also report whether prepared
input was involved. Invalidation metadata reports whether the canonical state or
the projected visible state changed.

Use these events to sync adjacent UI, analytics, or persistence layers. Do not
turn them into a filesystem-sync tutorial.