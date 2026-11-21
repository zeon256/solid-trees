import { afterEach, describe, expect, test } from 'vitest';

import { FileTreeController } from '../src/model/FileTreeController';
import { getResizeObserverViewportHeight } from '../src/render/focusHelpers';
import {
  computeExpectedRenderedWindow,
  flushDom,
  getListElement,
  getMountedItemPaths,
  getScrollElement,
  getVisibleIndexForPath,
} from './core-interaction-helpers';
import { mountTree, settle } from './helpers';
import type { MountedTree } from './helpers';

let mounted: MountedTree | null = null;
let outsideButton: HTMLButtonElement | null = null;
afterEach(() => {
  mounted?.dispose();
  mounted = null;
  outsideButton?.remove();
  outsideButton = null;
});

function createItemPaths(count: number): Array<string> {
  return Array.from(
    { length: count },
    (_, index) => `item${String(index).padStart(3, '0')}.ts`
  );
}

// Test entries carry only the fields `getResizeObserverViewportHeight` reads.
function isResizeObserverEntry<T extends object>(
  value: T
): value is T & ResizeObserverEntry {
  return 'borderBoxSize' in value && 'contentRect' in value;
}

function toResizeObserverEntry<T extends object>(
  value: T
): T & ResizeObserverEntry {
  if (!isResizeObserverEntry(value)) {
    throw new Error('expected a ResizeObserverEntry-shaped object');
  }
  return value;
}

function createResizeObserverEntry(
  borderBoxSize: unknown,
  contentRectHeight: number
): ResizeObserverEntry {
  return toResizeObserverEntry({
    borderBoxSize,
    contentRect: { height: contentRectHeight },
  });
}

describe('file-tree virtualization windows (dom)', () => {
  test('reads viewport height from ResizeObserver border box entries', () => {
    expect(
      getResizeObserverViewportHeight(
        createResizeObserverEntry([{ blockSize: 123.5, inlineSize: 10 }], 90)
      )
    ).toBe(123.5);

    expect(
      getResizeObserverViewportHeight(
        createResizeObserverEntry({ blockSize: 88.25, inlineSize: 10 }, 90)
      )
    ).toBe(88.25);

    expect(
      getResizeObserverViewportHeight(
        createResizeObserverEntry([{ blockSize: 0, inlineSize: 10 }], 64.5)
      )
    ).toBe(64.5);

    expect(
      getResizeObserverViewportHeight(createResizeObserverEntry(undefined, 0))
    ).toBeNull();
  });

  test('FileTree renders and updates the visible window on scroll', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: false,
      paths: createItemPaths(120),
      initialVisibleRowCount: 120 / 30,
    });
    const { root } = mounted;
    await settle();
    const viewport = getScrollElement(root);

    expect(root.innerHTML).toContain('item000.ts');

    viewport.scrollTop = 1500;
    viewport.dispatchEvent(new Event('scroll'));
    await flushDom();

    expect(root.innerHTML).toContain('item040.ts');
    expect(root.innerHTML).not.toContain('item000.ts');
  });

  test('mounts with the initially selected item in the rendered window', async () => {
    const itemHeight = 30;
    const viewportHeight = 120;
    const targetIndex = 80;
    const targetPath = `item${String(targetIndex).padStart(3, '0')}.ts`;
    mounted = mountTree({
      flattenEmptyDirectories: false,
      initialSelectedPaths: [targetPath],
      paths: createItemPaths(120),
      initialVisibleRowCount: viewportHeight / itemHeight,
    });
    const { model, root } = mounted;
    const scrollElement = getScrollElement(root);

    await flushDom();

    const mountedPaths = getMountedItemPaths(root);
    expect(model.getFocusedPath()).toBe(targetPath);
    expect(scrollElement.scrollTop).toBe(
      (targetIndex + 1) * itemHeight - viewportHeight
    );
    expect(mountedPaths).toContain(targetPath);
    expect(mountedPaths).not.toContain('item000.ts');
  });

  test('scrollToPath scrolls a focused path into view without moving DOM focus', async () => {
    outsideButton = document.createElement('button');
    document.body.append(outsideButton);

    const itemHeight = 30;
    const viewportHeight = 120;
    const targetIndex = 80;
    const targetPath = `item${String(targetIndex).padStart(3, '0')}.ts`;
    mounted = mountTree({
      flattenEmptyDirectories: false,
      paths: createItemPaths(120),
      initialVisibleRowCount: viewportHeight / itemHeight,
    });
    const { model, root } = mounted;
    const scrollElement = getScrollElement(root);

    outsideButton.focus();
    model.focusPath(targetPath);
    await flushDom();
    expect(scrollElement.scrollTop).toBe(0);
    expect(document.activeElement).toBe(outsideButton);

    model.scrollToPath(targetPath, { offset: 'center' });
    await flushDom(2);

    const mountedPaths = getMountedItemPaths(root);
    expect(model.getFocusedPath()).toBe(targetPath);
    expect(scrollElement.scrollTop).toBe(
      targetIndex * itemHeight - (viewportHeight - itemHeight) / 2
    );
    expect(mountedPaths).toContain(targetPath);
    expect(mountedPaths).not.toContain('item000.ts');
    expect(document.activeElement).toBe(outsideButton);
  });

  test('scrollToPath can reveal a path without changing model focus', async () => {
    outsideButton = document.createElement('button');
    document.body.append(outsideButton);

    const itemHeight = 30;
    const viewportHeight = 120;
    const targetIndex = 80;
    const targetPath = `item${String(targetIndex).padStart(3, '0')}.ts`;
    mounted = mountTree({
      flattenEmptyDirectories: false,
      paths: createItemPaths(120),
      initialVisibleRowCount: viewportHeight / itemHeight,
    });
    const { model, root } = mounted;
    const scrollElement = getScrollElement(root);

    await flushDom();
    const initialFocusedPath = model.getFocusedPath();
    outsideButton.focus();

    model.scrollToPath(targetPath, { focus: false, offset: 'center' });
    await flushDom(2);

    const mountedPaths = getMountedItemPaths(root);
    expect(model.getFocusedPath()).toBe(initialFocusedPath);
    expect(scrollElement.scrollTop).toBe(
      targetIndex * itemHeight - (viewportHeight - itemHeight) / 2
    );
    expect(mountedPaths).toContain(targetPath);
    expect(document.activeElement).toBe(outsideButton);
  });

  test('scrollToPath supports top, nearest, and clamped center offsets through the public API', async () => {
    const itemHeight = 30;
    const viewportHeight = 120;
    const paths = createItemPaths(120);
    mounted = mountTree({
      flattenEmptyDirectories: false,
      paths,
      initialVisibleRowCount: viewportHeight / itemHeight,
    });
    const { model, root } = mounted;
    const scrollElement = getScrollElement(root);

    model.scrollToPath('item080.ts', { offset: 'top' });
    await flushDom(2);
    expect(scrollElement.scrollTop).toBe(80 * itemHeight);

    model.scrollToPath('item082.ts', { offset: 'nearest' });
    await flushDom(2);
    expect(scrollElement.scrollTop).toBe(80 * itemHeight);

    model.scrollToPath('item119.ts', { offset: 'center' });
    await flushDom(2);
    expect(scrollElement.scrollTop).toBe(
      paths.length * itemHeight - viewportHeight
    );
    expect(getMountedItemPaths(root)).toContain('item119.ts');
  });

  test('scrollToPath ignores paths that are not in the current visible projection', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: false,
      initialExpansion: 'closed',
      paths: ['src/deep/file.ts', 'README.md'],
      initialVisibleRowCount: 4,
    });
    const { model, root } = mounted;
    const scrollElement = getScrollElement(root);

    await flushDom();
    const initialFocusedPath = model.getFocusedPath();

    model.scrollToPath('src/deep/file.ts', { offset: 'center' });
    await flushDom(2);

    expect(model.getFocusedPath()).toBe(initialFocusedPath);
    expect(scrollElement.scrollTop).toBe(0);
    expect(getMountedItemPaths(root)).not.toContain('src/deep/file.ts');
  });

  test('scrollToPath top offset accounts for sticky ancestor rows', async () => {
    const itemHeight = 30;
    const viewportHeight = 120;
    const targetPath = 'src/components/file020.ts';
    const paths = Array.from(
      { length: 40 },
      (_, index) => `src/components/file${String(index).padStart(3, '0')}.ts`
    );
    const options = {
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      paths,
      stickyFolders: true,
      initialVisibleRowCount: viewportHeight / itemHeight,
    } as const;
    const expectedController = new FileTreeController(options);
    try {
      const targetIndex = getVisibleIndexForPath(
        expectedController,
        targetPath
      );
      const targetRow =
        expectedController.getVisibleRows(targetIndex, targetIndex)[0] ?? null;
      if (targetIndex < 0 || targetRow === null) {
        throw new Error('missing target row');
      }
      const expectedScrollTop =
        targetIndex * itemHeight - targetRow.ancestorPaths.length * itemHeight;

      mounted = mountTree(options);
      const { model, root } = mounted;
      const scrollElement = getScrollElement(root);

      model.scrollToPath(targetPath, { offset: 'top' });
      await flushDom(2);

      expect(scrollElement.scrollTop).toBe(expectedScrollTop);
      expect(getMountedItemPaths(root)).toContain(targetPath);
    } finally {
      expectedController.destroy();
    }
  });

  test('marks the virtualized list as scrolling to suppress hover styles', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: false,
      paths: createItemPaths(120),
      initialVisibleRowCount: 120 / 30,
    });
    const { root } = mounted;
    await settle();
    const viewport = getScrollElement(root);
    const list = getListElement(root);

    expect(list.dataset.isScrolling).toBeUndefined();

    viewport.scrollTop = 1500;
    viewport.dispatchEvent(new Event('scroll'));
    await flushDom();

    expect(list.dataset.isScrolling).toBe('');

    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 60);
    await promise;
    expect(list.dataset.isScrolling).toBeUndefined();
  });

  test('collapse preserves a coherent virtualized window when affected rows move above and below the fold', async () => {
    const topFiles = Array.from(
      { length: 50 },
      (_, index) => `a${String(index).padStart(3, '0')}.ts`
    );
    const sourceFiles = Array.from(
      { length: 80 },
      (_, index) => `src/file${String(index).padStart(3, '0')}.ts`
    );
    const bottomFiles = Array.from(
      { length: 50 },
      (_, index) => `z${String(index).padStart(3, '0')}.ts`
    );
    const options = {
      flattenEmptyDirectories: false,
      initialExpandedPaths: ['src/'],
      paths: [...topFiles, ...sourceFiles, ...bottomFiles],
      stickyFolders: true,
      initialVisibleRowCount: 120 / 30,
    } as const;
    const expectedController = new FileTreeController(options);
    try {
      mounted = mountTree(options);
      const { model, root } = mounted;
      await settle();
      const viewport = getScrollElement(root);

      viewport.scrollTop = (topFiles.length + 11) * 30;
      viewport.dispatchEvent(new Event('scroll'));
      await flushDom();

      const expectedBeforeCollapse = computeExpectedRenderedWindow(
        expectedController,
        viewport.scrollTop,
        120
      );
      expect(getMountedItemPaths(root)).toEqual(
        expectedBeforeCollapse.mountedPaths
      );

      const sourceDirectory = model.getItem('src/');
      const expectedSourceDirectory = expectedController.getItem('src/');
      if (
        sourceDirectory === null ||
        sourceDirectory.isDirectory() !== true ||
        !('collapse' in sourceDirectory) ||
        expectedSourceDirectory === null ||
        expectedSourceDirectory.isDirectory() !== true ||
        !('collapse' in expectedSourceDirectory)
      ) {
        throw new Error('missing source directory item');
      }

      sourceDirectory.collapse();
      expectedSourceDirectory.collapse();
      await flushDom();

      const mountedPathsAfterCollapse = getMountedItemPaths(root);
      const expectedAfterCollapse = computeExpectedRenderedWindow(
        expectedController,
        viewport.scrollTop,
        120
      );
      expect(mountedPathsAfterCollapse).toEqual(
        expectedAfterCollapse.mountedPaths
      );
    } finally {
      expectedController.destroy();
    }
  });
});
