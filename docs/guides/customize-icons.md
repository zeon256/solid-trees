# Customize icons (/docs/guides/customize-icons)

Start with the built-in icon sets. Then add targeted remaps only where your
product needs them. Most apps do not need to replace the whole icon system.

## Start with the built-in icon sets [#start-with-the-built-in-icon-sets]

`solid-trees` includes three built-in sets:

- `minimal` for low-noise file and folder visuals
- `standard` for common language and file-type recognition
- `complete` for the broadest built-in coverage

Pass the set name directly when you need only a different baseline.

```ts title="icons-basic.ts"
const tree = createFileTree({
  paths,
  icons: 'standard',
});
```

## Adjust color mode before you remap icons [#adjust-color-mode-before-you-remap-icons]

Built-in sets use semantic icon colors by default. Turn the colors off before
you use a sprite sheet. Do this when the product needs a quieter or monochrome
look.

```ts title="icons-colored-off.ts"
const tree = createFileTree({
  paths,
  icons: {
    set: 'complete',
    colored: false,
  },
});
```

Use the styling system for broader appearance control. Do not treat icons as a
parallel theme surface. Read
[Style and theme the tree](/docs/guides/style-and-theme-the-tree).

## Use the object form for targeted remaps [#use-the-object-form-for-targeted-remaps]

Switch to `FileTreeIconConfig` when a plain set name is not enough. The
practical remap surfaces are:

- `remap` for built-in slots such as the generic file icon, chevron, dot, or
  lock
- `byFileName` for exact basenames such as `package.json`
- `byFileExtension` for suffixes such as `ts` or `spec.ts`
- `byFileNameContains` for broader patterns such as `dockerfile`

```ts title="icons-remap.ts"
const tree = createFileTree({
  paths,
  icons: {
    set: 'standard',
    byFileName: {
      'package.json': 'icon-package-json',
    },
    byFileExtension: {
      'spec.ts': 'icon-test-file',
    },
    byFileNameContains: {
      dockerfile: 'icon-dockerfile',
    },
    remap: {
      'file-tree-icon-lock': 'icon-locked',
    },
  },
});
```

This approach keeps the built-in mapping for every icon that you did not change.

## Rule precedence matters [#rule-precedence-matters]

File-specific rules win over broader rules. `solid-trees` resolves icons in this
order:

1. exact basename matches
2. basename-contains matches
3. extension matches, and the more specific suffix wins
4. the chosen built-in set
5. the generic file-slot remap or fallback

For the full lookup contract, read
[Icons](/docs/reference/icons#resolution-order).

## Use a sprite sheet only for advanced cases [#use-a-sprite-sheet-only-for-advanced-cases]

Use `spriteSheet` in two cases. Use it when you already have branded SVG
symbols. Also use it when you need a few custom symbols next to the built-in
set.

```ts title="icons-sprite-sheet.ts"
const tree = createFileTree({
  paths,
  icons: {
    set: 'standard',
    spriteSheet: `
      <svg aria-hidden="true" width="0" height="0">
        <symbol id="icon-package-json" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="7" fill="currentColor" />
        </symbol>
      </svg>
    `,
    byFileName: {
      'package.json': 'icon-package-json',
    },
  },
});
```

Keep the contract simple. Provide `<symbol>` definitions. Then point remap rules
at those symbols. Each tree prefixes the symbol ids of its sprite sheet, so
several trees in one document never resolve each other's icons. Do not make
sprite sheets the default docs path.