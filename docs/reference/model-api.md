# Model API (/docs/reference/model-api)

`FileTreeModel` is the imperative model surface behind every tree. Create it
with `createFileTree(...)`; the class is also exported for type annotations and
for code that must own the lifecycle itself.

## Model-first story [#model-first-story]

Create the model. Then render it with `<FileTree model={...} />`.

```ts title="model.ts"
import { createFileTree } from 'solid-trees';

const tree = createFileTree({
  paths: ['README.md', 'src/index.ts'],
  search: true,
});

tree.focusPath('src/index.ts');
tree.openSearch('index');
```

For shared option meanings, read
[Shared concepts](/docs/reference/shared-concepts#shared-option-groups).

## Lifecycle [#lifecycle]

`createFileTree(options)`

- accepts the shared options surface
- creates the model one time
- expects later updates through model methods; do not rebuild option objects for
  every render

`cleanUp()`

- final teardown: subscription cleanup and model destruction. The owner calls it
  for you when the model came from `createFileTree(...)` inside a reactive
  owner.

`getId()`

- returns the tree's identity from the `id` option

## Read APIs [#read-apis]

Common read methods are:

- `getItem(path)`
- `getFocusedItem()`
- `getFocusedPath()`
- `getFocusedIndex()`
- `getVisibleCount()`
- `getVisibleRows(start, end)`
- `getSelectedPaths()`
- `getComposition()`
- `isSearchOpen()`
- `getSearchValue()`
- `getSearchMatchingPaths()`
- `getItemHeight()` / `getDensityFactor()`

These reads stay path-oriented and model-oriented. They do not ask you to infer
the tree state from DOM order. Inside Solid scopes they track, so JSX and memos
update when the model changes.

## Item handles [#item-handles]

`getItem(path)` returns a file handle, a directory handle, or `null`.

Shared handle actions:

- `getPath()`
- `focus()`
- `select()`
- `toggleSelect()`
- `deselect()`
- `isFocused()` / `isSelected()` / `isDirectory()`

Directory-only actions:

- `expand()`
- `collapse()`
- `toggle()`
- `isExpanded()`

## Write and control APIs [#write-and-control-apis]

Focus and selection control:

- `focusPath(path)`
- `focusNearestPath(path | null)`
- `focusFirstItem()` / `focusLastItem()`
- `focusNextItem()` / `focusPreviousItem()`
- `focusParentItem()`
- `scrollToPath(path, { offset: 'top' | 'center' | 'nearest', focus?: boolean })`
- `startRenaming(path?)`
- item-handle selection and focus methods

`scrollToPath(...)` scrolls the virtualizer without moving DOM focus. It updates
model focus by default. Pass `focus: false` to keep model focus unchanged.

The traversal methods follow the current visible tree, including its active
expansion and search state. `getVisibleRows(start, end)` uses inclusive row
indexes and returns path-first row metadata for building custom navigation.

Search control:

- `setSearch(value)`
- `openSearch(initialValue?)`
- `closeSearch()`
- `focusNextSearchMatch()`
- `focusPreviousSearchMatch()`

Data and mutation control:

- `add(path)`
- `remove(path, options?)`
- `move(fromPath, toPath, options?)`
- `batch(operations)`
- `resetPaths(paths, options?)` or `resetPaths({ preparedInput })`
- `onMutation(type, handler)`

Runtime reconfiguration helpers:

- `setComposition(composition?)`
- `setGitStatus(gitStatus?)`
- `applyGitStatusPatch({ set?, remove? })`
- `setIcons(icons?)`
- `setLabels(labels?)`

To localize the text the tree renders (the search placeholder, accessible names,
and git status tooltips), pass a `labels` option at construction or call
`setLabels(...)` later. Any label you leave out falls back to its English
default from `DEFAULT_FILE_TREE_LABELS`.

## Subscriptions and external systems [#subscriptions-and-external-systems]

Use `subscribe(listener)` when code outside Solid must refresh a derived
snapshot on any tree change. Use `onMutation(...)` when add, remove, move,
reset, or batch intent matters. Both return an unsubscribe function.

This separation keeps model subscriptions for state reads. It keeps mutation
events for semantic side effects.

## Composition surface [#composition-surface]

The composition surface covers:

- header content, through the `header` prop of `<FileTree>`
- context-menu behavior, through `composition.contextMenu`
- context-menu content, through the `renderContextMenu` prop of `<FileTree>`
- runtime updates through `setComposition(...)`

Read
[Rename, drag, and trigger item actions](/docs/guides/rename-drag-and-trigger-item-actions)
for workflow-level guidance.

## Appearance boundary [#appearance-boundary]

This page names the runtime touchpoints such as `setGitStatus(...)` and
`setIcons(...)`. For styling variables and theme helpers, read
[Styling and theming](/docs/reference/styling-and-theming). For icon remaps and
icon-set lookup, read [Icons](/docs/reference/icons).