# Rename, drag, and trigger item actions (/docs/guides/rename-drag-and-trigger-item-actions)

This guide covers the main row-level editing workflows. Rename comes first. Drag
and drop comes second. Optional command surfaces, such as context menus, come
last. Every callback stays path-first.

## Start with direct row actions [#start-with-direct-row-actions]

The core row workflows are:

1. rename in place
2. drag and drop
3. optional context-menu commands

Learn these flows before you use a generic mutation inventory. Users care about
three things. They care about which path moved. They care about which path
changed its name. They care about which row stays focused next.

## Rename items in place [#rename-items-in-place]

Enable `renaming` when users must rename rows inline. The common policy hooks
are:

- `canRename(item)` to block protected files or folders
- `onRename(event)` to respond to the final path change
- `onError(error)` to show invalid rename attempts

The rename event reports three values. It reports the source path. It reports
the destination path. It reports whether the item was a folder.

```tsx title="rename.tsx"
const tree = createFileTree({
  paths,
  renaming: {
    canRename: (item) => item.path !== 'package.json',
    onRename: ({ sourcePath, destinationPath }) => {
      console.log(`Renamed ${sourcePath} -> ${destinationPath}`);
    },
    onError: (message) => {
      console.error(message);
    },
  },
});

tree.startRenaming('src/index.ts');
```

## Move items with drag and drop [#move-items-with-drag-and-drop]

Enable `dragAndDrop` when users must move files or folders directly in the tree.
The practical hooks are:

- `canDrag(paths)` to lock specific paths
- `canDrop(event)` to reject invalid destinations
- `onDropComplete(event)` for persistence or adjacent UI updates
- `onDropError(error, event)` for visible failures

```ts title="drag-and-drop.ts"
const tree = createFileTree({
  paths,
  dragAndDrop: {
    canDrag: (draggedPaths) => draggedPaths.includes('package.json') === false,
    canDrop: ({ target }) => target.directoryPath !== 'dist/',
    onDropComplete: ({ draggedPaths, target }) => {
      console.log(
        'Moved',
        draggedPaths,
        'to',
        target.directoryPath ?? '(root)'
      );
    },
    onDropError: (message) => {
      console.error(message);
    },
  },
});
```

Drop callbacks report the dragged paths and the resolved target shape. They do
not ask you to find the DOM rows yourself.

## Combine rename and drag safely [#combine-rename-and-drag-safely]

A common editable project tree enables both `renaming` and `dragAndDrop`. Then
it adds policy guards for protected paths.

Typical rules include:

- block rename for root config files such as `package.json`
- reject drops into generated directories such as `dist/`
- show rename and drop failures outside the tree; do not fail silently

## Add a context menu as an optional command surface [#add-a-context-menu-as-an-optional-command-surface]

Context menus are secondary command surfaces over the same model. Keep rename
and drag available. Do not require the menu.

Pass `renderContextMenu` to `<FileTree>` and the tree renders the menu content
for you, as Solid JSX. Providing it enables the context menu.
`composition.contextMenu` keeps the behavior flags:

```tsx title="context-menu.tsx"
const tree = createFileTree({
  paths,
  composition: {
    contextMenu: {
      triggerMode: 'both',
      buttonVisibility: 'when-needed',
    },
  },
  renaming: true,
});

<FileTree
  model={tree}
  style={{ height: '320px' }}
  renderContextMenu={(item, context) => (
    <div role="menu" class="tree-menu">
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          context.close({ restoreFocus: false });
          tree.startRenaming(item.path);
        }}
      >
        Rename
      </button>
    </div>
  )}
/>;
```

The menu renders inside the tree's floating anchor. If you portal menu content
elsewhere, mark its root with `data-file-tree-context-menu-root="true"` so that
clicks inside it do not count as outside clicks.

## Lock window scroll while a menu is open [#lock-window-scroll-while-a-menu-is-open]

A user scroll inside the tree pane closes the open menu. But the tree cannot
reach the scroll containers that your page owns. A menu opened with a right
click sits at a fixed point in the viewport, and so does a portaled menu. So the
menu disconnects from its row when the window scrolls. Lock the window scroll
for the menu's lifetime. Release the lock when the menu closes:

```tsx title="window-scroll-lock.tsx"
import { onSettled } from 'solid-js';

// Hide the window scrollbar and compensate for its width so the page
// content does not shift under the already-positioned menu.
function lockWindowScroll(): () => void {
  const { body, documentElement } = document;
  const scrollbarWidth = window.innerWidth - documentElement.clientWidth;
  const previousOverflow = body.style.overflow;
  const previousPaddingRight = body.style.paddingRight;
  body.style.overflow = 'hidden';
  if (scrollbarWidth > 0) {
    body.style.paddingRight = `${scrollbarWidth}px`;
  }
  return () => {
    body.style.overflow = previousOverflow;
    body.style.paddingRight = previousPaddingRight;
  };
}

// Solid: the menu content mounts exactly while the menu is open, so locking
// once it settles and releasing on disposal covers the menu's whole lifetime.
function TreeMenu() {
  onSettled(() => lockWindowScroll());
  return <div role="menu">{/* menu items */}</div>;
}
```

Some menu primitives have a modal mode that locks scroll for you. Apply the
manual lock for a non-modal menu.

## Keep keyboard and focus behavior predictable [#keep-keyboard-and-focus-behavior-predictable]

The focused row is the anchor for rename and keyboard commands. Restore focus in
a predictable way when a menu opens and closes. Keyboard users must reach the
main actions without pointer-only gestures.

## The tree owns the interaction surface. Your app owns persistence. [#the-tree-owns-the-interaction-surface-your-app-owns-persistence]

`solid-trees` emits path-based rename and drop events. Your app decides whether
to save those changes. It can save them to a server, local state, or another
boundary. Keep this separation clear.

To learn the shared terms behind those events, read
[Shared concepts](/docs/reference/shared-concepts#mutation-vocabulary). For API
lookup, read [Solid API](/docs/reference/solid-api) or
[Model API](/docs/reference/model-api).