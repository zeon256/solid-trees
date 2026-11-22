# Differences from @pierre/trees (/docs/reference/differences-from-pierre-trees)

`solid-trees` vendors upstream's model layer (path store, controller, focus,
selection, search, rename, drag and drop, Git status). The view is a native
Solid 2 rewrite of upstream's Preact `FileTreeView`, rendered into the light
DOM, with upstream's visual styles shipped as an importable stylesheet.

## Runtimes [#runtimes]

- One runtime: `createFileTree(...)` plus `<FileTree>`. There is no React
  wrapper, vanilla `FileTree` class, `render(...)`, or `hydrate(...)`.
- No SSR or hydration: no `preloadFileTree(...)`, `@pierre/trees/ssr` entry, or
  `preloadedData` prop. The tree renders on the client.

## DOM and styling [#dom-and-styling]

- No shadow DOM, custom element, or `unsafeCSS`; use page CSS.
- The DOM keeps upstream's data attributes (`data-type="item"`,
  `data-item-path`, `data-item-selected`, `data-item-focused`,
  `data-item-git-status`, `data-item-section`, `data-file-tree-sticky-row`, ...)
  and name markup (`MiddleTruncate` / `Truncate`), so upstream CSS ports over.
- `themeToTreeStyles` returns CSS property names (`background-color`), not
  React's camelCase.
- The scrollbar gutter (`--trees-scrollbar-gutter-measured`) is measured once
  per document, not per tree.

## Composition [#composition]

- Header and context-menu content are Solid JSX (`header`, `renderContextMenu`
  props); `composition.contextMenu` keeps the behavior flags (`enabled`,
  `triggerMode`, `buttonVisibility`) and `onOpen`/`onClose`.

## Icons [#icons]

- Each tree prefixes the symbol ids of its sprite sheet (built-in set plus
  `icons.spriteSheet`) so several trees in one document never resolve each
  other's icons; names a sheet does not define resolve document-wide.