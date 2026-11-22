# solid-trees

SolidJS 2 port of [`@pierre/trees`](https://trees.software) — a virtualized,
path-first file tree. The model layer (path store, controller, focus, selection,
search, rename, drag and drop, git status) is vendored from upstream; the view
is a native Solid 2 rewrite of upstream's Preact `FileTreeView`, rendered into
the light DOM, with upstream's visual styles shipped as an importable
stylesheet.

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
pnpm build      # library to packages/solid-trees/dist, playground to apps/playground/dist
```

Pushes to `main` publish `solid-trees` to npm via semantic-release (version from
Conventional Commits, tags `vX.Y.Z`) and deploy the playground to
[trees.inve.rs](https://trees.inve.rs). The published package is the built
`dist/` with `@solid-trees/path-store` bundled in, assembled by
`pnpm release:pack` into `release-package/`; publish manually from there with
`npm publish`, not from the workspace root or `packages/solid-trees`.

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

## Styling

```ts
import 'solid-trees/styles.css';
```

The stylesheet is a port of upstream's `style.css`: the same `--trees-*` tokens,
the same fallback chain (`--trees-*-override` → `--trees-theme-*` → default),
colored file icons, git status colors, selection/focus/hover states, indent
guides (the focused row's parent guide carries
`data-item-guide-focused="true"`), sticky rows, search input, rename input, drag
states, the context-menu trigger, and middle truncation of long names.

- Scoping: every rule sits in `@scope ([data-file-tree-virtualized-root])`.
  Header and context-menu content is excluded from the scope (it still inherits
  color and font from the root).
- Layers: `@layer solid-trees.structure, solid-trees.base, solid-trees.theme`.
  `<FileTree>` injects `solid-trees.structure` itself (virtualizer layout, row
  lanes, truncation mechanics), so trees work without the import; the import
  adds `solid-trees.base`. `solid-trees.theme` is reserved for your theme rules.
  Unlayered page CSS overrides every layer (it replaces upstream's `unsafeCSS`).
- Page resets: the base layer starts with a reset for the tree's own controls,
  so element rules from layers declared earlier (e.g. Tailwind's preflight in
  `@layer base`) do not leak into rows. Rules in later layers or unlayered rules
  still win; import `solid-trees/styles.css` after your reset or declare the
  order up front (`@layer theme, base, components, utilities, solid-trees;`).
- Color scheme: the root sets `color-scheme: light dark`, so colors follow the
  OS preference. Pin it with `style={{ 'color-scheme': 'dark' }}` or CSS.
- Tokens: set any `--trees-*-override` on the tree (`style`) or an ancestor.
  Density (`--trees-item-height`, `--trees-density-override`) is set inline from
  the `density` / `itemHeight` options.

Shiki/VS Code themes map onto the `--trees-theme-*` tokens with
`themeToTreeStyles` (uses `@pierre/theming`); the result is a Solid `style`
object:

```tsx
import dracula from '@shikijs/themes/dracula';
import { themeToTreeStyles } from 'solid-trees';

<FileTree
  model={tree}
  style={{ height: '320px', ...themeToTreeStyles(dracula) }}
/>;
```

## Differences from `@pierre/trees`

- No shadow DOM, custom element, SSR/hydration, or `unsafeCSS`; use page CSS.
- Header and context-menu content are Solid JSX (`header`, `renderContextMenu`
  props); `composition.contextMenu` keeps the behavior flags (`enabled`,
  `triggerMode`, `buttonVisibility`) and `onOpen`/`onClose`.
- The DOM keeps upstream's data attributes (`data-type="item"`,
  `data-item-path`, `data-item-selected`, `data-item-focused`,
  `data-item-git-status`, `data-item-section`, `data-file-tree-sticky-row`, ...)
  and name markup (`MiddleTruncate` / `Truncate`), so upstream CSS ports over.
- Each tree prefixes the symbol ids of its sprite sheet (built-in set plus
  `icons.spriteSheet`) so several trees in one document never resolve each
  other's icons; names a sheet does not define resolve document-wide.
- The scrollbar gutter (`--trees-scrollbar-gutter-measured`) is measured once
  per document, not per tree.
- `themeToTreeStyles` returns CSS property names (`background-color`), not
  React's camelCase.

## License

Apache-2.0. Derived from `@pierre/trees` and `@pierre/path-store` by The Pierre
Computer Company; see `packages/*/LICENSE.md` and `NOTICE.md`.
