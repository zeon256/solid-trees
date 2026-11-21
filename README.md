# solid-trees

SolidJS 2 port of [`@pierre/trees`](https://trees.software) — a virtualized,
path-first file tree. The model layer (path store, controller, focus, selection,
search, rename, drag and drop, git status) is vendored from upstream; the view
is a native Solid 2 rewrite of upstream's Preact `FileTreeView`, rendered into
the light DOM and shipped unstyled.

## Workspace

| Path                   | Contents                                                    |
| ---------------------- | ----------------------------------------------------------- |
| `packages/path-store`  | Upstream `@pierre/path-store`, vendored verbatim (private). |
| `packages/solid-trees` | The library: model, Solid view, primitives.                 |
| `apps/playground`      | Vite demo (`pnpm dev`).                                     |

```sh
pnpm install
pnpm dev        # playground on http://localhost:5173
pnpm test       # vitest + jsdom
pnpm typecheck
```

## Usage

```tsx
import { createFileTree, createFileTreeSelection, FileTree } from 'solid-trees';

function Explorer() {
  const tree = createFileTree({
    paths: ['README.md', 'src/index.ts', 'src/components/Button.tsx'],
    initialExpansion: 'open',
    flattenEmptyDirectories: true,
    stickyFolders: true,
    search: true,
    renaming: true,
    dragAndDrop: true,
  });
  const selected = createFileTreeSelection(tree);

  return (
    <FileTree
      model={tree}
      style={{ height: '320px' }}
      header={<strong>Files</strong>}
      renderContextMenu={(item, menu) => (
        <div role="menu">
          <button
            onClick={() => {
              menu.close({ restoreFocus: false });
              tree.startRenaming(item.path);
            }}
          >
            Rename
          </button>
        </div>
      )}
    />
  );
}
```

- `createFileTree(options)` creates a `FileTreeModel` owned by the current
  reactive owner (cleaned up on dispose). Options are read once; change state
  through model methods (`add`, `move`, `remove`, `batch`, `resetPaths`,
  `setGitStatus`, `applyGitStatusPatch`, `setIcons`, `setLabels`,
  `setComposition`, `openSearch`, `startRenaming`, `scrollToPath`, ...).
- Model getters (`getSelectedPaths`, `getFocusedPath`, `isSearchOpen`, ...)
  track inside Solid scopes and always return current values imperatively.
- `createFileTreeSelector(model, select, isEqual?)`,
  `createFileTreeSelection(model)`, `createFileTreeSearch(model)` derive memos
  from the model.
- `<FileTree>` needs a bounded height. Swapping the `model` prop remounts the
  view.

## Differences from `@pierre/trees`

- No shadow DOM, custom element, SSR/hydration, `unsafeCSS`, or theming.
- Header and context-menu content are Solid JSX (`header`, `renderContextMenu`
  props); `composition.contextMenu` keeps the behavior flags (`enabled`,
  `triggerMode`, `buttonVisibility`) and `onOpen`/`onClose`.
- Unstyled. The DOM keeps upstream's data attributes (`data-type="item"`,
  `data-item-path`, `data-item-selected`, `data-item-focused`,
  `data-item-git-status`, `data-item-section`, `data-file-tree-sticky-row`, ...)
  as styling hooks. Names render as `<span data-item-name>`; the focused row's
  indent guides carry `data-item-guide-focused="true"`.
- Only layout the virtualizer relies on ships, in `@layer solid-trees.structure`
  (fixed-height flex rows, scroll container, sticky window and overlay,
  context-menu layers). Unlayered CSS overrides it. Row height comes from
  `--trees-item-height` (set from `density` / `itemHeight`); indent width from
  `--trees-indent` (default `1em`).
- Middle-truncation of long names (upstream `OverflowText`) is not ported; it is
  a styling concern.

## License

Apache-2.0. Derived from `@pierre/trees` and `@pierre/path-store` by The Pierre
Computer Company; see `packages/*/LICENSE.md` and `NOTICE.md`.
