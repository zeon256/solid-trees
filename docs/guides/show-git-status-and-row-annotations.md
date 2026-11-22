# Show Git status and row annotations (/docs/guides/show-git-status-and-row-annotations)

Use built-in `gitStatus` when the signal is Git-like. Use `renderRowDecoration`
when the row needs product-specific metadata that is not Git state.

## Start with built-in `gitStatus` [#start-with-built-in-gitstatus]

`gitStatus` is the default row-signal path. It attaches statuses to canonical
paths. Folders can reflect changed descendants automatically.

`solid-trees` supports these built-in statuses:

- `added`
- `modified`
- `deleted`
- `ignored`
- `renamed`
- `untracked`

```ts title="git-status.ts"
const tree = createFileTree({
  paths,
  gitStatus: [
    { path: 'README.md', status: 'untracked' },
    { path: 'package.json', status: 'renamed' },
    { path: 'src/index.ts', status: 'modified' },
    { path: 'src/components/Button.tsx', status: 'added' },
  ],
});
```

This is the shortest path when the row signal already matches Git semantics.

## Know when `gitStatus` is enough [#know-when-gitstatus-is-enough]

Use `gitStatus` only when the meaning is Git-like. Do not invent fake Git state
only to show a badge. Let `solid-trees` own the built-in status lane. Let the
styling system control how those signals look.

## Update status sets over time [#update-status-sets-over-time]

Replace the current status data directly when the surrounding app changes.
Examples are new commits, branches, comparison views, or status visibility. Use
`applyGitStatusPatch(...)` when only a few paths change.

```ts title="set-git-status.ts"
tree.setGitStatus(nextStatuses);
tree.setGitStatus(undefined);

tree.applyGitStatusPatch({
  set: [{ path: 'src/index.ts', status: 'modified' }],
  remove: ['README.md'],
});
```

This step keeps the runtime accurate. It does not promise a filesystem watcher
or a repo-sync framework.

## Add custom row annotations with `renderRowDecoration` [#add-custom-row-annotations-with-renderrowdecoration]

Use `renderRowDecoration` when the row needs metadata that is not Git-like.

```ts title="render-row-decoration.ts"
const tree = createFileTree({
  paths,
  renderRowDecoration: ({ item }) => {
    if (item.path.endsWith('.generated.ts')) {
      return { text: 'GEN', title: 'Generated file' };
    }

    if (item.path.startsWith('remote/')) {
      return { icon: 'icon-remote', title: 'Remote source' };
    }

    return null;
  },
});
```

Good fits include generated-file markers, remote-storage indicators, validation
markers, and short secondary labels.

## Choose between the two paths [#choose-between-the-two-paths]

Use:

- `gitStatus` when the meaning is Git-like
- `renderRowDecoration` for everything else
- both together when a row needs Git state and one extra product-specific signal

Keep annotations short and easy to read. Give a decoration accessible text or a
tooltip when it affects user decisions.

## Keep styling separate from annotation meaning [#keep-styling-separate-from-annotation-meaning]

Keep Git-status colors and decoration visuals in the same appearance system as
the rest of the tree. Use the styling and theming controls for color. Do not add
a second theme layer for annotations.

For that part of the API, read
[Style and theme the tree](/docs/guides/style-and-theme-the-tree) and
[Styling and theming](/docs/reference/styling-and-theming).