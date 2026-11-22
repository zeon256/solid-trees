![solid-trees](https://assets.solidjs.com/banner?project=solid-trees&type=Ecosystem&version=2.0)

<p align="left">
	<a href="https://oxc.rs"><img alt="Linted with oxlint" src="https://img.shields.io/badge/linted_with-oxlint-32f3e9?style=flat"></a>
	<a href="https://github.com/zeon256/solid-trees/actions/workflows/build-release.yml"><img alt="CI/CD" src="https://github.com/zeon256/solid-trees/actions/workflows/build-release.yml/badge.svg"></a>
	<a href="./LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-blue?style=flat"></a>
	<img alt="NPM Version" src="https://img.shields.io/npm/v/solid-trees">
	<img alt="GitHub Actions SHA Pinned" src="https://img.shields.io/badge/SHA_Pinned-Actions-blue?style=flat&logo=githubactions">
	<img alt="NPM Provenance" src="https://img.shields.io/badge/NPM-Provenance-blue?style=flat&logo=npm">
</p>

# solid-trees

> Virtualized, path-first file tree for SolidJS 2

SolidJS 2 port of [`@pierre/trees`](https://trees.software). The model layer
(path store, controller, focus, selection, search, rename, drag and drop, git
status) is vendored from upstream; the view is a native Solid 2 rewrite of
upstream's Preact `FileTreeView`, rendered into the light DOM, with upstream's
visual styles shipped as an importable stylesheet.

## Features

- Virtualized rendering, built for large trees
- Path-first model: feed it a list of paths, get a tree
- Focus, multi-selection, and keyboard navigation
- Built-in search, inline rename, and drag and drop
- Git status decorations
- Sticky folders and flattened empty directories
- Custom icons, labels, header, and context menu (Solid JSX)
- Upstream's visual styles, tokens, and layers, themable with Shiki/VS Code
  themes
- Light DOM only: style it with plain page CSS

## Users

- [live-preview.inve.rs](https://live-preview.inve.rs 'live-preview')
  ([solid-markdown-wasm](https://github.com/zeon256/solid-markdown-wasm 'solid-markdown-wasm'))
- Using this project and want your company/project here? Feel free to open a PR!

## Examples

- **Playground (`./apps/playground`)**: Visit
  [trees.inve.rs](https://trees.inve.rs 'playground') to see the deployed Astro
  demo.
- **Docs (`./apps/docs`)**: Visit
  [trees.inve.rs/docs](https://trees.inve.rs/docs 'docs') for guide-first
  documentation, adapted from
  [upstream's docs](https://trees.software/docs 'upstream docs') and built with
  Fumadocs on Astro.

Run them locally from the repository root:

```bash
pnpm dev        # playground
pnpm dev:docs   # docs
```

## Installation

```bash
pnpm add solid-trees solid-js @solidjs/web
```

Requires Solid 2 (`solid-js` and `@solidjs/web` `^2.0.3`).

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

## Security

To report a security vulnerability, **please do not open a public GitHub
issue**. Email <me+security@inve.rs> instead. For the supported versions, scope,
and supply chain hardening, see [SECURITY.md](./SECURITY.md).

## Compiling From Source

You will need [Node.js](https://nodejs.org/ 'nodejs') and
[pnpm](https://pnpm.io/ 'pnpm').

| Path                   | Contents                                                    |
| ---------------------- | ----------------------------------------------------------- |
| `packages/path-store`  | Upstream `@pierre/path-store`, vendored verbatim (private). |
| `packages/solid-trees` | The library: model, Solid view, primitives.                 |
| `apps/playground`      | Astro demo site (`pnpm dev`).                               |
| `apps/docs`            | Fumadocs + Astro docs site (`pnpm dev:docs`).               |

```bash
pnpm install
pnpm dev        # playground on http://localhost:4321
pnpm dev:docs   # docs on http://localhost:4322/docs
pnpm test       # vitest + jsdom
pnpm typecheck
pnpm build      # library to packages/solid-trees/dist, apps to apps/*/dist
```

Pushes to `main` publish `solid-trees` to npm via semantic-release (version from
Conventional Commits, tags `vX.Y.Z`) and deploy the playground to
[trees.inve.rs](https://trees.inve.rs) and the docs to
[trees.inve.rs/docs](https://trees.inve.rs/docs). The published package is the
built `dist/` with `@solid-trees/path-store` bundled in, assembled by
`pnpm release:pack` into `release-package/`; publish manually from there with
`npm publish`, not from the workspace root or `packages/solid-trees`.

## Contributing

Issues and pull requests are welcome. Run `pnpm lint`, `pnpm format:check`,
`pnpm typecheck`, and `pnpm test` before opening a PR, and use
[Conventional Commits](https://www.conventionalcommits.org/ 'conventional commits')
since versions are derived from them.

## Support This Project

If you find `solid-trees` useful and would like to support its development, you
can consider making a donation on wise. Your contribution helps ensure continued
maintenance and improvements.

<img src="./@budisyahiddinb-wisetag.png" width="150">

[Donate on Wise](https://wise.com/pay/me/budisyahiddinb)

Thank you for your support!

## License

`solid-trees` is released under the [Apache License 2.0](./LICENSE). Derived
from `@pierre/trees` and `@pierre/path-store` by The Pierre Computer Company;
see [NOTICE.md](./NOTICE.md) and `packages/*/LICENSE.md`.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in `solid-trees` by you, shall be licensed as Apache-2.0, without
any additional terms or conditions.
