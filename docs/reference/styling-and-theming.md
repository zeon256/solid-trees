# Styling and theming (/docs/reference/styling-and-theming)

This page is the lookup reference for host styling, CSS-variable families,
`themeToTreeStyles(...)`, the stylesheet layers, and page CSS.

## Styling entry points [#styling-entry-points]

Host styling comes first. Use normal host `class` and `style` props on
`<FileTree model={...} />`.

Host styles own width, height, borders, background, and panel placement. CSS
variables control the UI inside that host.

Import the stylesheet once:

```ts title="main.ts"
import 'solid-trees/styles.css';
```

## CSS custom property families [#css-custom-property-families]

The tree styling surface uses variable families, not one flat list.

Core families include:

- panel, background, and foreground tokens
- hover, selection, and focus tokens
- input and search tokens
- Git-status color tokens
- icon color tokens for supported built-in icon sets
- density and spacing tokens

## Fallback precedence [#fallback-precedence]

`solid-trees` resolves styling in this order:

1. explicit override variables such as `--trees-*-override`
2. `--trees-theme-*` variables from theme helpers
3. library defaults

So `themeToTreeStyles(...)` fills the middle layer. Direct overrides still win.

## `themeToTreeStyles(...)` [#themetotreestyles]

`themeToTreeStyles(theme)` maps a VS Code or Shiki-style theme object into host
styles. It also maps the theme to the `--trees-theme-*` variables that the tree
understands.

Input shape:

- `TreeThemeInput`
- key fields: `type`, `colors`

Output shape:

- `TreeThemeStyles`
- keyed by CSS property names (`background-color`, not `backgroundColor`), so it
  works directly as a Solid `style` object

```ts title="theme-to-tree-styles.ts"
import { themeToTreeStyles } from 'solid-trees';

const treeStyles = themeToTreeStyles(theme);
```

The helper covers panel colors, selection colors, focus rings, input colors, and
Git-status colors. Explicit overrides can still replace any derived token later.

## Scoping and layers [#scoping-and-layers]

Every rule sits in `@scope ([data-file-tree-virtualized-root])`. Header and
context-menu content is excluded from the scope; it still inherits color and
font from the root.

The stylesheet uses three cascade layers:
`@layer solid-trees.structure, solid-trees.base, solid-trees.theme`.

- `solid-trees.structure` holds the virtualizer layout, row lanes, and
  truncation mechanics. `<FileTree>` injects it itself, so trees work without
  the stylesheet.
- `solid-trees.base` comes from `solid-trees/styles.css`.
- `solid-trees.theme` is reserved for your theme rules.

Unlayered page CSS overrides every layer.

## Page resets [#page-resets]

The base layer starts with a reset for the tree's own controls, so element rules
from layers declared earlier (for example Tailwind's preflight in `@layer base`)
do not leak into rows. Rules in later layers or unlayered rules still win.
Import `solid-trees/styles.css` after your reset, or declare the order up front:

```css title="layers.css"
@layer theme, base, components, utilities, solid-trees;
```

## Color scheme [#color-scheme]

The root sets `color-scheme: light dark`, so colors follow the OS preference.
Pin it with `style={{ 'color-scheme': 'dark' }}` or CSS.

## Page CSS escape hatch [#page-css-escape-hatch]

The tree renders into the light DOM, so page CSS reaches it. It replaces
upstream's `unsafeCSS`. Use it only when the supported host and variable
surfaces cannot express the customization.

The DOM keeps upstream's data attributes (`data-type="item"`, `data-item-path`,
`data-item-selected`, `data-item-focused`, `data-item-git-status`,
`data-item-section`, `data-file-tree-sticky-row`, ...), so upstream CSS ports
over. The focused row's parent indent guide carries
`data-item-guide-focused="true"`.

Keep it narrow. Do not rebuild the visual system from raw selectors.

## Related pages [#related-pages]

- [Style and theme the tree](/docs/guides/style-and-theme-the-tree) for the
  walkthrough
- [Icons](/docs/reference/icons) for icon-specific configuration
- [Show Git status and row annotations](/docs/guides/show-git-status-and-row-annotations)
  for signal meaning