import { afterEach, describe, expect, test } from 'vitest';

import {
  prepareFileTreeInput,
  preparePresortedFileTreeInput,
} from '../src/index';
import { FileTreeController } from '../src/model/FileTreeController';
import type { FileTreeOptions } from '../src/model/publicTypes';
import { isHTMLElementOfTag } from '../src/utils/domGuards';
import { flushDom, renderFileTree } from './dnd-sticky-git-support';
import type { RenderedTree } from './dnd-sticky-git-support';
import { mountTree } from './helpers';
import type { MountedTree } from './helpers';

let rendered: RenderedTree | null = null;
let mounted: MountedTree | null = null;

async function render(options: FileTreeOptions): Promise<RenderedTree> {
  rendered = await renderFileTree(options);
  return rendered;
}

afterEach(() => {
  rendered?.cleanup();
  rendered = null;
  mounted?.dispose();
  mounted = null;
});

function getItemButton(root: HTMLElement, path: string): HTMLButtonElement {
  const button = root.querySelector(`[data-item-path="${path}"]`);
  if (!isHTMLElementOfTag(button, 'button')) {
    throw new Error(`missing button for ${path}`);
  }
  return button;
}

describe('file-tree dynamic files / mutation API', () => {
  test('controller emits add, move, batch, and reset mutation events', () => {
    const controller = new FileTreeController({
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      paths: ['README.md', 'src/index.ts'],
    });
    const events: Array<{
      events?: ReadonlyArray<{ operation: string }>;
      operation: string;
    }> = [];
    const unsubscribe = controller.onMutation('*', (event) => {
      events.push(event);
    });

    controller.add('src/utils.ts');
    controller.move('src/utils.ts', 'src/helpers.ts');
    controller.batch([
      { path: 'src/lib/', type: 'add' },
      { path: 'src/lib/theme.ts', type: 'add' },
    ]);
    controller.resetPaths(['README.md'], {
      preparedInput: prepareFileTreeInput(['README.md']),
    });

    expect(events.map((event) => event.operation)).toEqual([
      'add',
      'move',
      'batch',
      'reset',
    ]);
    expect(events[2]).toMatchObject({ operation: 'batch' });
    expect(events[2]?.events?.map((event) => event.operation)).toEqual([
      'add',
      'add',
    ]);
    expect(events[3]).toMatchObject({
      operation: 'reset',
      pathCountBefore: 4,
      pathCountAfter: 1,
      usedPreparedInput: true,
    });

    unsubscribe();
    controller.destroy();
  });

  test('file-tree renders from preparedInput without duplicate raw paths', async () => {
    const { root } = await render({
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      preparedInput: prepareFileTreeInput(['README.md', 'src/index.ts']),
      initialVisibleRowCount: 140 / 30,
    });

    expect(getItemButton(root, 'README.md')).not.toBeNull();
    expect(root.querySelectorAll('[data-item-path="README.md"]').length).toBe(
      1
    );
  });

  test('resetPaths rejects mismatched preparedInput', () => {
    const controller = new FileTreeController({
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      paths: ['README.md', 'src/index.ts'],
    });

    expect(() =>
      controller.resetPaths(['README.md'], {
        preparedInput: prepareFileTreeInput(['src/index.ts']),
      })
    ).toThrow(
      'FileTree resetPaths received paths and preparedInput for different path lists'
    );

    controller.destroy();
  });

  test('resetPaths accepts preparedInput generated from the same unsorted raw path list', () => {
    const rawPaths = ['src/index.ts', 'README.md'] as const;
    const controller = new FileTreeController({
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      paths: ['README.md'],
    });

    controller.resetPaths([...rawPaths], {
      preparedInput: prepareFileTreeInput(rawPaths),
    });

    expect(controller.getVisibleRows(0, 3).map((row) => row.path)).toEqual([
      'src/',
      'src/index.ts',
      'README.md',
    ]);

    controller.destroy();
  });

  test('resetPaths accepts a preparedInput-only call with no raw paths', () => {
    // Server-canonical (already sorted) folder paths, the scale-oriented input
    // that preparePresortedFileTreeInput exists to fast-path.
    const folderPaths = ['src/', 'src/index.ts', 'README.md'] as const;
    const controller = new FileTreeController({
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      paths: ['README.md'],
    });

    // The preparedInput-only overload: no dummy `paths` argument required.
    controller.resetPaths({
      preparedInput: preparePresortedFileTreeInput([...folderPaths]),
    });

    expect(controller.getVisibleRows(0, 3).map((row) => row.path)).toEqual([
      'src/',
      'src/index.ts',
      'README.md',
    ]);

    controller.destroy();
  });

  test('resetPaths overloads type-check as documented (compile-only assertions)', () => {
    const controller = new FileTreeController({
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      paths: ['README.md'],
    });

    const assertOverloadTyping = (): void => {
      // Passing only preparedInput type-checks: `paths` is no longer required.
      controller.resetPaths({
        preparedInput: prepareFileTreeInput(['README.md']),
      });

      // Passing only raw paths still type-checks.
      controller.resetPaths(['README.md']);

      // @ts-expect-error neither paths nor preparedInput is supplied
      controller.resetPaths({});

      // @ts-expect-error neither paths nor preparedInput is supplied
      controller.resetPaths();
    };
    void assertOverloadTyping;

    controller.destroy();
  });

  test('typed onMutation listeners stay filtered while subscribe still tracks non-mutation rerenders', () => {
    const controller = new FileTreeController({
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      paths: ['README.md', 'src/index.ts'],
    });
    const subscribeNotifications: Array<number> = [];
    const addEvents: Array<string> = [];
    const removeEvents: Array<{ path: string; recursive: boolean }> = [];

    const unsubscribeRerender = controller.subscribe(() => {
      subscribeNotifications.push(controller.getVisibleCount());
    });
    const unsubscribeAdd = controller.onMutation('add', (event) => {
      addEvents.push(event.path);
    });
    const unsubscribeRemove = controller.onMutation('remove', (event) => {
      removeEvents.push({
        path: event.path,
        recursive: event.recursive,
      });
    });

    const subscribeCountBeforeCollapse = subscribeNotifications.length;
    const srcDirectory = controller.getItem('src/');
    if (
      srcDirectory === null ||
      srcDirectory.isDirectory() !== true ||
      !('collapse' in srcDirectory)
    ) {
      throw new Error('expected src/ directory handle');
    }
    srcDirectory.collapse();

    expect(subscribeNotifications.length).toBeGreaterThan(
      subscribeCountBeforeCollapse
    );
    expect(addEvents).toEqual([]);
    expect(removeEvents).toEqual([]);

    controller.add('src/utils.ts');
    controller.remove('README.md');

    expect(addEvents).toEqual(['src/utils.ts']);
    expect(removeEvents).toEqual([
      {
        path: 'README.md',
        recursive: false,
      },
    ]);

    unsubscribeRemove();
    unsubscribeAdd();
    unsubscribeRerender();
    controller.destroy();
  });

  test('controller keeps focus and selection aligned to moved paths', () => {
    const controller = new FileTreeController({
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      paths: ['docs/readme.md', 'src/index.ts'],
    });

    controller.focusPath('docs/readme.md');
    controller.selectOnlyPath('docs/readme.md');
    controller.move('docs/readme.md', 'src/readme.md');

    expect(controller.getFocusedPath()).toBe('src/readme.md');
    expect(controller.getSelectedPaths()).toEqual(['src/readme.md']);

    controller.remove('src/readme.md');

    expect(controller.getSelectedPaths()).toEqual([]);
    expect(controller.getFocusedPath()).toBe('src/');

    controller.destroy();
  });

  test('directory moves remap focused selections and range anchors', () => {
    const controller = new FileTreeController({
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      paths: ['README.md', 'src/index.ts', 'src/utils.ts'],
    });

    controller.focusPath('src/index.ts');
    controller.selectOnlyPath('src/index.ts');
    controller.move('src/', 'lib/');

    expect(controller.getFocusedPath()).toBe('lib/index.ts');
    expect(controller.getSelectedPaths()).toEqual(['lib/index.ts']);

    controller.selectPathRange('lib/utils.ts', false);

    expect(controller.getSelectedPaths()).toEqual([
      'lib/index.ts',
      'lib/utils.ts',
    ]);

    controller.destroy();
  });

  test('directory lookup-path moves still remap focused descendants', () => {
    const controller = new FileTreeController({
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      paths: ['README.md', 'src/index.ts', 'src/utils.ts'],
    });

    controller.focusPath('src/index.ts');
    controller.selectOnlyPath('src/index.ts');
    controller.selectPath('src/utils.ts');
    controller.move('src', 'lib/');

    expect(controller.getFocusedPath()).toBe('lib/index.ts');
    expect(controller.getSelectedPaths()).toEqual([
      'lib/index.ts',
      'lib/utils.ts',
    ]);

    controller.destroy();
  });

  test('recursive directory removal falls focus back to the nearest surviving row', () => {
    const controller = new FileTreeController({
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      paths: ['README.md', 'src/index.ts', 'src/utils.ts'],
    });

    controller.focusPath('src/index.ts');
    controller.remove('src/', { recursive: true });

    expect(controller.getFocusedPath()).toBe('README.md');
    expect(controller.getItem('src/')).toBeNull();

    controller.destroy();
  });

  test('directory lookup-path removals clear descendant selections and focused paths', () => {
    const controller = new FileTreeController({
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      paths: ['README.md', 'src/index.ts', 'src/utils.ts'],
    });

    controller.focusPath('src/index.ts');
    controller.selectOnlyPath('src/index.ts');
    controller.selectPath('src/utils.ts');
    controller.remove('src', { recursive: true });

    expect(controller.getSelectedPaths()).toEqual([]);
    expect(controller.getFocusedPath()).toBe('README.md');

    controller.destroy();
  });

  test('batch supports mixed add, move, and remove operations', () => {
    const controller = new FileTreeController({
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      paths: ['README.md', 'src/old.ts'],
    });
    const batchEvents: Array<ReadonlyArray<string>> = [];
    const unsubscribe = controller.onMutation('batch', (event) => {
      batchEvents.push(event.events.map((entry) => entry.operation));
    });

    controller.batch([
      { path: 'src/new.ts', type: 'add' },
      { from: 'src/new.ts', to: 'src/renamed.ts', type: 'move' },
      { path: 'src/old.ts', type: 'remove' },
    ]);

    expect(batchEvents).toEqual([['add', 'move', 'remove']]);
    expect(controller.getItem('src/old.ts')).toBeNull();
    expect(controller.getItem('src/renamed.ts')).not.toBeNull();

    unsubscribe();
    controller.destroy();
  });

  test('file-tree delegates the shared mutation handle and rerenders after resetPaths', async () => {
    const events: Array<string> = [];

    const { model, root } = await render({
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      paths: ['README.md', 'src/index.ts'],
      initialVisibleRowCount: 140 / 30,
    });
    const unsubscribe = model.onMutation('*', (event) => {
      events.push(event.operation);
    });

    model.add('src/utils.ts');
    await flushDom();

    expect(getItemButton(root, 'src/utils.ts')).not.toBeNull();

    model.resetPaths(['README.md'], {
      preparedInput: prepareFileTreeInput(['README.md']),
    });
    await flushDom();

    expect(getItemButton(root, 'README.md')).not.toBeNull();
    expect(root.querySelector('[data-item-path="src/index.ts"]')).toBeNull();
    expect(events).toEqual(['add', 'reset']);

    unsubscribe();
  });

  test('empty directories render as folders even before they gain children', async () => {
    const { root } = await render({
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      paths: ['docs/'],
      initialVisibleRowCount: 120 / 30,
    });

    const docsButton = getItemButton(root, 'docs/');

    expect(docsButton.dataset.itemType).toBe('folder');
    expect(docsButton.getAttribute('aria-expanded')).toBe('true');
  });

  test('getItem returns fresh handles after move and remove mutations', () => {
    const controller = new FileTreeController({
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      paths: ['README.md', 'lib/', 'src/foo.ts'],
    });

    const movedHandleBefore = controller.getItem('src/foo.ts');
    expect(movedHandleBefore).not.toBeNull();

    controller.move('src/foo.ts', 'lib/foo.ts');

    expect(controller.getItem('src/foo.ts')).toBeNull();
    const movedHandleAfter = controller.getItem('lib/foo.ts');
    expect(movedHandleAfter).not.toBeNull();
    expect(movedHandleAfter?.getPath()).toBe('lib/foo.ts');
    expect(movedHandleAfter?.isDirectory()).toBe(false);

    controller.remove('lib/foo.ts');

    expect(controller.getItem('lib/foo.ts')).toBeNull();

    controller.destroy();
  });

  test('adding under a collapsed directory keeps the directory collapsed until re-expanded', () => {
    const controller = new FileTreeController({
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      paths: ['README.md', 'src/index.ts'],
    });

    const srcDirectory = controller.getItem('src/');
    if (
      srcDirectory === null ||
      srcDirectory.isDirectory() !== true ||
      !('collapse' in srcDirectory) ||
      !('expand' in srcDirectory)
    ) {
      throw new Error('expected src/ directory handle');
    }

    srcDirectory.collapse();
    controller.add('src/utils.ts');

    expect(
      controller.getVisibleRows(0, controller.getVisibleCount())
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'src/utils.ts',
        }),
      ])
    );

    srcDirectory.expand();

    expect(controller.getVisibleRows(0, controller.getVisibleCount())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'src/utils.ts',
        }),
      ])
    );

    controller.destroy();
  });

  test('shared mutation handle intentionally omits raw-store callback batching', () => {
    const controller = new FileTreeController({
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      paths: ['README.md'],
    });

    const assertBatchCallbackIsRejected = (): void => {
      // @ts-expect-error raw PathStore callback batching is intentionally not exposed on the shared trees handle
      controller.batch((store: { add(path: string): void }) => {
        store.add('src/index.ts');
      });
    };
    void assertBatchCallbackIsRejected;

    controller.destroy();
  });

  // Upstream renders the menu through `composition.contextMenu.render` into a
  // `slot="context-menu"` light-DOM child of the custom element. The Solid view
  // takes the menu from the `renderContextMenu` prop and renders it inside
  // `[data-type="context-menu-slot"]`.
  test('context-menu delete proof removes the item and restores focus coherently', async () => {
    mounted = mountTree(
      {
        composition: {
          contextMenu: {
            enabled: true,
          },
        },
        flattenEmptyDirectories: true,
        initialExpansion: 'open',
        paths: ['README.md', 'src/index.ts'],
        initialVisibleRowCount: 120 / 30,
      },
      {
        renderContextMenu: (item, context) => (
          <div>
            <button
              type="button"
              onClick={() => {
                mounted?.model.remove(
                  item.path,
                  item.kind === 'directory' ? { recursive: true } : undefined
                );
                context.close();
              }}
            >
              Delete
            </button>
          </div>
        ),
      }
    );
    await flushDom();

    const { host, root } = mounted;
    const readmeButton = getItemButton(root, 'README.md');
    readmeButton.focus();
    readmeButton.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        clientX: 24,
        clientY: 36,
      })
    );
    await flushDom();

    const deleteButton = host.querySelector(
      '[data-type="context-menu-slot"] button'
    );
    if (!isHTMLElementOfTag(deleteButton, 'button')) {
      throw new Error('expected context menu delete button');
    }
    deleteButton.click();
    await flushDom();

    expect(root.querySelector('[data-item-path="README.md"]')).toBeNull();
    expect(host.querySelector('[data-type="context-menu-slot"]')).toBeNull();
    expect(
      root.querySelector('button[data-type="item"][data-item-focused="true"]')
    ).not.toBeNull();
  });
});
