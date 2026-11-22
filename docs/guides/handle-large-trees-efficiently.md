# Handle large trees efficiently (/docs/guides/handle-large-trees-efficiently)

To make large trees fast, first reduce unnecessary client work. Shape and order
the data before it reaches the UI. Then tune rendering only where the visible
window needs help.

## Start with the main recommendation [#start-with-the-main-recommendation]

Use:

- raw `paths` for small demos and low-ceremony cases
- `preparedInput` for larger trees
- `preparePresortedFileTreeInput(...)` when the server already owns the final
  order

This order matters. Do not go straight to the rendering knobs while the client
still does avoidable shape or sort work.

## Prepare input before it reaches the client [#prepare-input-before-it-reaches-the-client]

For larger trees, move the shape work out of the UI. Prepared input is the
scale-oriented public path.

```ts title="load-workspace-tree.ts"
import { preparePresortedFileTreeInput } from 'solid-trees';

export async function loadWorkspaceTree() {
  const sortedPaths = await fetchSortedWorkspacePaths();
  return preparePresortedFileTreeInput(sortedPaths);
}
```

Use `prepareFileTreeInput(...)` instead when you have only an unsorted path
list. In both cases, pass the prepared result into `createFileTree(...)` or
`resetPaths(...)`.

## Keep rendering work small [#keep-rendering-work-small]

`solid-trees` already virtualizes the visible row window. Most apps do not need
custom virtualization primitives.

The main rendering knobs are:

- the host element CSS height, because layout sets the steady-state viewport
  size
- `initialVisibleRowCount`, to budget first-render work before measurement
- `density`, when your design changes the row density enough to matter. Pass
  `'compact' | 'default' | 'relaxed'` or a custom numeric factor. This option
  sets both the row height and the spacing in one place. Use `itemHeight` only
  when you need a row height that does not match a preset.
- `overscan`, to trade a little extra work for smoother scrolling

```ts title="virtualization-knobs.ts"
const tree = createFileTree({
  preparedInput,
  initialVisibleRowCount: 14,
  itemHeight: 30,
  overscan: 8,
});
```

Give the rendered tree host a real CSS height. The row-count hint only shapes
the first render. The browser then measures the actual viewport.

Keep the language outcome-focused. The tree mounts the visible slice and a small
buffer around it.

## Expansion and search still affect scale [#expansion-and-search-still-affect-scale]

Prepared input lowers the cost to shape the data. But expansion and search still
change how many rows stay visible at once. Large expanded trees and broad search
results can widen the mounted window.

This is another reason to start with the input story first. Do not recompute the
tree shape in the client while the visible tree also changes often.

## Swap data in place [#swap-data-in-place]

When the path list changes wholesale, keep the model and call `resetPaths(...)`.
Pass `{ preparedInput }` alone to skip the parse and sort that raw `paths` would
require. Swapping the `model` prop of `<FileTree>` remounts the whole view.

## Common pitfalls [#common-pitfalls]

Avoid these patterns when the tree grows:

- you send only raw `paths` for huge server-known datasets
- you re-sort on the client after the server already chose the order
- you use low-level virtualization ideas as the first fix
- you rebuild the model when `resetPaths(...)` with matching prepared input does
  the job

## What to read next [#what-to-read-next]

- [Shape tree data for fast rendering](/docs/guides/shape-tree-data-for-fast-rendering)
  for the shared input story
- [Shared concepts](/docs/reference/shared-concepts#scale-and-rendering-settings)
  for the rendering knobs
- [Model API](/docs/reference/model-api) for `resetPaths(...)` and the other
  data methods