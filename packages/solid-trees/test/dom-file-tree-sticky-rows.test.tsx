import { afterEach, describe, expect, test } from 'vitest';

import { preparePresortedFileTreeInput } from '../src/index';
import { FileTreeController } from '../src/model/FileTreeController';
import type { FileTreeOptions } from '../src/model/publicTypes';
import {
  computeStickyWindowLayout,
  computeWindowRange,
  FILE_TREE_DEFAULT_ITEM_HEIGHT,
  FILE_TREE_DEFAULT_OVERSCAN,
  FILE_TREE_DEFAULT_VIEWPORT_HEIGHT,
} from '../src/model/virtualization';
import { isHTMLElement } from '../src/utils/domGuards';
import {
  clickItem,
  clickStickyRow,
  computeExpectedRenderedWindow,
  flushDom,
  getFocusedItemPath,
  getItemButton,
  getMountedItemPaths,
  getNormalizedText,
  getPixelStyleValue,
  getRowSectionOrder,
  getScrollElement,
  getStickyRowButton,
  getStickyRowPaths,
  getStickyRowZIndex,
  getTranslateYStyleValue,
  getVirtualList,
  getVirtualStickyOffset,
  getVirtualStickyWindow,
  getVisibleIndexForPath,
  getVisibleRowPath,
  pressKey,
  renderFileTree,
  scrollTo,
} from './dnd-sticky-git-support';
import type { RenderedTree } from './dnd-sticky-git-support';
import linuxSubset from './fixtures/linux-1x-subset.json';

const rendered: Array<RenderedTree> = [];

async function render(options: FileTreeOptions): Promise<RenderedTree> {
  const tree = await renderFileTree(options);
  rendered.push(tree);
  return tree;
}

afterEach(() => {
  for (const tree of rendered.splice(0)) {
    tree.cleanup();
  }
});

function getDirectory(
  model: RenderedTree['model'],
  path: string
): { isExpanded(): boolean } {
  const item = model.getItem(path);
  if (item === null || item.isDirectory() !== true || !('isExpanded' in item)) {
    throw new Error(`expected ${path} directory item`);
  }
  return item;
}

describe('file-tree sticky rows', () => {
  test('sticky folders are opt-in and mirror visible ancestor rows when enabled', async () => {
    const baseOptions = {
      flattenEmptyDirectories: false,
      initialExpandedPaths: ['src/lib/'],
      paths: ['README.md', 'src/index.ts', 'src/lib/util.ts'],
      initialVisibleRowCount: 60 / 30,
    } as const;

    const defaultTree = await render(baseOptions);
    const defaultScrollElement = getScrollElement(defaultTree.root);

    scrollTo(defaultScrollElement, 30);
    await flushDom();

    expect(getStickyRowPaths(defaultTree.root)).toEqual([]);
    expect(
      defaultTree.root.querySelector('[data-file-tree-sticky-overlay="true"]')
    ).toBeNull();

    defaultTree.cleanup();
    rendered.splice(rendered.indexOf(defaultTree), 1);

    const optInTree = await render({ ...baseOptions, stickyFolders: true });
    const scrollElement = getScrollElement(optInTree.root);

    expect(getStickyRowPaths(optInTree.root)).toEqual([]);

    scrollTo(scrollElement, 1);
    await flushDom();

    expect(getStickyRowPaths(optInTree.root)).toEqual(['src/', 'src/lib/']);

    scrollTo(scrollElement, 30);
    await flushDom();

    expect(getStickyRowPaths(optInTree.root)).toEqual(['src/', 'src/lib/']);
  });

  test('sticky folders cascade through every partially occluded leading directory', async () => {
    const { root } = await render({
      flattenEmptyDirectories: false,
      initialExpandedPaths: ['arch/alpha/boot/tools/'],
      paths: [
        'arch/alpha/boot/tools/file.ts',
        ...Array.from({ length: 10 }, (_, index) => `z${index}.ts`),
      ],
      stickyFolders: true,
      initialVisibleRowCount: 180 / 30,
    });
    const scrollElement = getScrollElement(root);

    expect(getStickyRowPaths(root)).toEqual([]);

    scrollTo(scrollElement, 1);
    await flushDom();
    expect(getStickyRowPaths(root)).toEqual([
      'arch/',
      'arch/alpha/',
      'arch/alpha/boot/',
      'arch/alpha/boot/tools/',
    ]);
    expect(getMountedItemPaths(root)).not.toContain('arch/');
    expect(getMountedItemPaths(root)).not.toContain('arch/alpha/');
    expect(getMountedItemPaths(root)).not.toContain('arch/alpha/boot/');
    expect(getMountedItemPaths(root)).not.toContain('arch/alpha/boot/tools/');

    scrollTo(scrollElement, 30);
    await flushDom();
    expect(getStickyRowPaths(root)).toEqual([
      'arch/',
      'arch/alpha/',
      'arch/alpha/boot/',
      'arch/alpha/boot/tools/',
    ]);
  });

  test('sticky folders drop at the exact subtree boundary and keep the renderer aligned to the layout snapshot', async () => {
    const options = {
      flattenEmptyDirectories: false,
      initialExpandedPaths: ['arch/alpha/boot/tools/'],
      paths: [
        'arch/alpha/boot/tools/mkbb.c',
        'arch/alpha/boot/tools/objstrip.c',
        'arch/alpha/boot/bootloader.lds',
        'arch/alpha/boot/bootp.c',
        'arch/alpha/boot/head.S',
        'arch/alpha/boot/main.c',
      ],
      stickyFolders: true,
      initialVisibleRowCount: 180 / 30,
    } as const;
    const expectedController = new FileTreeController(options);
    try {
      const { root } = await render(options);
      const scrollElement = getScrollElement(root);

      scrollTo(scrollElement, 59);
      await flushDom();

      const expectedBefore = computeExpectedRenderedWindow(
        expectedController,
        59,
        180
      );
      expect(getStickyRowPaths(root)).toEqual(
        expectedBefore.layout.sticky.rows.map((entry) =>
          getVisibleRowPath(entry.row)
        )
      );
      expect(
        getPixelStyleValue(
          getStickyRowButton(root, 'arch/alpha/boot/tools/'),
          'top'
        )
      ).toBe(90);
      expect(getMountedItemPaths(root)).toEqual(expectedBefore.mountedPaths);

      scrollTo(scrollElement, 60);
      await flushDom();

      const expectedAtBoundary = computeExpectedRenderedWindow(
        expectedController,
        60,
        180
      );
      expect(getStickyRowPaths(root)).toEqual(
        expectedAtBoundary.layout.sticky.rows.map((entry) =>
          getVisibleRowPath(entry.row)
        )
      );
      expect(
        getPixelStyleValue(
          getStickyRowButton(root, 'arch/alpha/boot/tools/'),
          'top'
        )
      ).toBe(90);
      expect(getMountedItemPaths(root)).toEqual(
        expectedAtBoundary.mountedPaths
      );

      scrollTo(scrollElement, 61);
      await flushDom();

      const expectedAfter = computeExpectedRenderedWindow(
        expectedController,
        61,
        180
      );
      expect(getStickyRowPaths(root)).toEqual(
        expectedAfter.layout.sticky.rows.map((entry) =>
          getVisibleRowPath(entry.row)
        )
      );
      expect(getStickyRowZIndex(root, 'arch/alpha/boot/')).toBeGreaterThan(
        getStickyRowZIndex(root, 'arch/alpha/boot/tools/')
      );
      expect(
        getPixelStyleValue(
          getStickyRowButton(root, 'arch/alpha/boot/tools/'),
          'top'
        )
      ).toBe(89);
      expect(getMountedItemPaths(root)).toEqual(expectedAfter.mountedPaths);
    } finally {
      expectedController.destroy();
    }
  });

  test('collapsed directories do not become sticky', async () => {
    const { root } = await render({
      flattenEmptyDirectories: false,
      initialExpandedPaths: [],
      paths: ['src/lib/util.ts', 'z.ts'],
      stickyFolders: true,
      initialVisibleRowCount: 60 / 30,
    });
    const scrollElement = getScrollElement(root);

    scrollTo(scrollElement, 1);
    await flushDom();

    expect(getStickyRowPaths(root)).toEqual([]);

    scrollTo(scrollElement, 30);
    await flushDom();

    expect(getStickyRowPaths(root)).toEqual([]);
  });

  test('sticky overlay reserves virtual layout space without changing total height or scrollTop', async () => {
    const options = {
      flattenEmptyDirectories: false,
      initialExpandedPaths: ['src/lib/'],
      paths: ['README.md', 'src/index.ts', 'src/lib/util.ts'],
      stickyFolders: true,
      initialVisibleRowCount: 60 / 30,
    } as const;
    const expectedController = new FileTreeController(options);
    try {
      const { root } = await render(options);
      const scrollElement = getScrollElement(root);

      scrollTo(scrollElement, 60);
      await flushDom();

      const expectedAtSixty = computeExpectedRenderedWindow(
        expectedController,
        scrollElement.scrollTop,
        60
      );
      const stickyPaths = getStickyRowPaths(root);
      expect(scrollElement.scrollTop).toBe(60);
      expect(stickyPaths).toEqual(
        expectedAtSixty.layout.sticky.rows.map((entry) =>
          getVisibleRowPath(entry.row)
        )
      );
      expect(expectedAtSixty.layout.visible.startIndex).toBe(
        getVisibleIndexForPath(expectedController, 'src/index.ts')
      );
      expect(getPixelStyleValue(getVirtualList(root), 'height')).toBe(
        expectedAtSixty.layout.physical.totalHeight
      );
      expect(getPixelStyleValue(getVirtualStickyOffset(root), 'height')).toBe(
        expectedAtSixty.layout.window.offsetTop
      );
      expect(getTranslateYStyleValue(getVirtualStickyWindow(root))).toBe(0);
      expect(getMountedItemPaths(root)).toEqual(expectedAtSixty.mountedPaths);

      scrollTo(scrollElement, 30);
      await flushDom();

      const expectedAtThirty = computeExpectedRenderedWindow(
        expectedController,
        scrollElement.scrollTop,
        60
      );
      expect(scrollElement.scrollTop).toBe(30);
      expect(getStickyRowPaths(root)).toEqual(
        expectedAtThirty.layout.sticky.rows.map((entry) =>
          getVisibleRowPath(entry.row)
        )
      );
      expect(getPixelStyleValue(getVirtualStickyOffset(root), 'height')).toBe(
        expectedAtThirty.layout.window.offsetTop
      );
      expect(getTranslateYStyleValue(getVirtualStickyWindow(root))).toBe(0);
      expect(getMountedItemPaths(root)).toEqual(expectedAtThirty.mountedPaths);
      expect(getPixelStyleValue(getVirtualList(root), 'height')).toBe(
        expectedAtThirty.layout.physical.totalHeight
      );
    } finally {
      expectedController.destroy();
    }
  });

  test('sticky virtual window keeps bottom coverage during fast downward scrolls', async () => {
    const paths = [
      ...Array.from(
        { length: 24 },
        (_, index) => `src/lib/deep/file${String(index).padStart(2, '0')}.ts`
      ),
      ...Array.from(
        { length: 12 },
        (_, index) => `z${String(index).padStart(2, '0')}.ts`
      ),
    ];
    const { root } = await render({
      flattenEmptyDirectories: false,
      initialExpandedPaths: ['src/lib/deep/'],
      paths,
      stickyFolders: true,
      initialVisibleRowCount: 180 / FILE_TREE_DEFAULT_ITEM_HEIGHT,
    });
    const scrollElement = getScrollElement(root);

    scrollTo(scrollElement, 90);
    await flushDom();

    const stickyWindow = getVirtualStickyWindow(root);
    const stickyOverlayHeight =
      getStickyRowPaths(root).length * FILE_TREE_DEFAULT_ITEM_HEIGHT;
    const windowHeight = getPixelStyleValue(stickyWindow, 'height');
    const topInset = getPixelStyleValue(stickyWindow, 'top');
    const bottomInset = getPixelStyleValue(stickyWindow, 'bottom');

    expect(stickyOverlayHeight).toBeGreaterThan(0);
    expect(windowHeight + topInset).toBe(180);
    expect(bottomInset).toBe(topInset - stickyOverlayHeight);
  });

  test('keyboard focus scrolling respects sticky overlay height', async () => {
    const { model, root } = await render({
      flattenEmptyDirectories: false,
      initialExpandedPaths: ['src/lib/'],
      paths: ['README.md', 'src/index.ts', 'src/lib/util.ts'],
      stickyFolders: true,
      initialVisibleRowCount: 120 / 30,
    });
    const scrollElement = getScrollElement(root);

    scrollTo(scrollElement, 1);
    await flushDom();
    expect(getStickyRowPaths(root)).toEqual(['src/', 'src/lib/']);

    const fileButton = getItemButton(root, 'src/lib/util.ts');
    fileButton.focus();
    await flushDom();

    pressKey(fileButton, 'ArrowUp');
    await flushDom();
    await flushDom();

    expect(model.getItem('src/lib/')?.isFocused()).toBe(true);
    expect(scrollElement.scrollTop).toBe(0);
    expect(getStickyRowPaths(root)).toEqual([]);
    const activeElement = document.activeElement;
    expect(
      isHTMLElement(activeElement) ? activeElement.dataset.itemPath : undefined
    ).toBe('src/lib/');
  });

  test('modifier-click on a sticky row adds selection without collapsing it', async () => {
    const { model, root } = await render({
      flattenEmptyDirectories: false,
      initialExpandedPaths: ['aaa/', 'bbb/', 'src/lib/'],
      paths: ['aaa/one.ts', 'bbb/two.ts', 'src/index.ts', 'src/lib/util.ts'],
      stickyFolders: true,
      initialVisibleRowCount: 60 / 30,
    });
    const scrollElement = getScrollElement(root);

    clickItem(root, 'src/lib/util.ts');
    await flushDom();
    scrollTo(scrollElement, 149);
    await flushDom();

    clickStickyRow(root, 'src/lib/', { ctrlKey: true });
    await flushDom();
    await flushDom();

    expect(scrollElement.scrollTop).toBe(120);
    expect(getStickyRowPaths(root)).toEqual(['src/', 'src/lib/']);
    expect(getFocusedItemPath(root)).toBe('src/lib/');
    expect([...model.getSelectedPaths()].sort()).toEqual([
      'src/lib/',
      'src/lib/util.ts',
    ]);
    expect(getDirectory(model, 'src/lib/').isExpanded()).toBe(true);
  });

  test('collapsing a sticky row keeps it as the first in-flow row below its sticky parents', async () => {
    const { model, root } = await render({
      flattenEmptyDirectories: false,
      initialExpandedPaths: [
        'arch/',
        'arch/alpha/',
        'arch/alpha/boot/',
        'arch/alpha/configs/',
        'arch/alpha/include/',
        'arch/alpha/include/asm/',
      ],
      paths: [
        'arch/alpha/boot/boot.h',
        'arch/alpha/configs/config.h',
        'arch/alpha/include/asm/bitops.h',
        'arch/alpha/include/linux.h',
        'arch/alpha/include/zeta.h',
      ],
      stickyFolders: true,
      initialVisibleRowCount: 180 / 30,
    });
    const scrollElement = getScrollElement(root);

    scrollTo(scrollElement, 120);
    await flushDom();

    expect(getStickyRowPaths(root)).toEqual([
      'arch/',
      'arch/alpha/',
      'arch/alpha/include/',
      'arch/alpha/include/asm/',
    ]);
    expect(getMountedItemPaths(root)[0]).toBe(
      'arch/alpha/include/asm/bitops.h'
    );

    clickStickyRow(root, 'arch/alpha/include/asm/');
    await flushDom();
    await flushDom();

    expect(scrollElement.scrollTop).toBe(120);
    expect(getStickyRowPaths(root)).toEqual([
      'arch/',
      'arch/alpha/',
      'arch/alpha/include/',
    ]);
    expect(getMountedItemPaths(root)[0]).toBe('arch/alpha/include/asm/');
    expect(getDirectory(model, 'arch/alpha/include/asm/').isExpanded()).toBe(
      false
    );
    expect(getFocusedItemPath(root)).toBe('arch/alpha/include/asm/');
  });

  test('collapsing a sticky row keeps it below its only sticky parent', async () => {
    const { model, root } = await render({
      flattenEmptyDirectories: false,
      initialExpandedPaths: ['src/', 'src/lib/'],
      paths: [
        'docs/readme.md',
        'src/lib/util.ts',
        'src/lib/zeta.ts',
        'zzz.ts',
        'zzzz.ts',
      ],
      stickyFolders: true,
      initialVisibleRowCount: 90 / 30,
    });
    const scrollElement = getScrollElement(root);

    scrollTo(scrollElement, 30);
    await flushDom();

    expect(getStickyRowPaths(root)).toEqual(['src/', 'src/lib/']);
    expect(() => getItemButton(root, 'src/lib/')).toThrow();
    expect(getItemButton(root, 'src/lib/util.ts').dataset.itemPath).toBe(
      'src/lib/util.ts'
    );

    clickStickyRow(root, 'src/lib/');
    await flushDom();
    await flushDom();

    expect(scrollElement.scrollTop).toBe(30);
    expect(getStickyRowPaths(root)).toEqual(['src/']);
    expect(getItemButton(root, 'src/lib/').dataset.itemPath).toBe('src/lib/');
    expect(getDirectory(model, 'src/lib/').isExpanded()).toBe(false);
    expect(getFocusedItemPath(root)).toBe('src/lib/');
  });

  test('collapsing a top-level sticky row removes the overlay and keeps it in place', async () => {
    const { model, root } = await render({
      flattenEmptyDirectories: false,
      initialExpandedPaths: ['src/', 'src/lib/'],
      paths: ['src/lib/util.ts', 'src/lib/zeta.ts', 'zzz.ts', 'zzzz.ts'],
      stickyFolders: true,
      initialVisibleRowCount: 90 / 30,
    });
    const scrollElement = getScrollElement(root);

    scrollTo(scrollElement, 30);
    await flushDom();

    expect(getStickyRowPaths(root)).toEqual(['src/', 'src/lib/']);
    expect(getMountedItemPaths(root)[0]).toBe('src/lib/zeta.ts');

    clickStickyRow(root, 'src/');
    await flushDom();
    await flushDom();

    expect(scrollElement.scrollTop).toBe(0);
    expect(getStickyRowPaths(root)).toEqual([]);
    expect(getMountedItemPaths(root)[0]).toBe('src/');
    expect(getFocusedItemPath(root)).toBe('src/');
    expect(getDirectory(model, 'src/').isExpanded()).toBe(false);
  });

  // Upstream loads the full linux-1x workload from @pierre/tree-test-data; this
  // port uses the first 600 canonical paths (all of arch/alpha plus the start
  // of arch/arm) from test/fixtures/linux-1x-subset.json, which preserves the
  // row order and depth that the assertions depend on.
  test('collapsing linux-1x sticky asm keeps include sticky and leaves asm in place', async () => {
    const { root } = await render({
      fileTreeSearchMode: 'hide-non-matches',
      flattenEmptyDirectories: true,
      initialExpandedPaths: linuxSubset.folders,
      preparedInput: preparePresortedFileTreeInput(linuxSubset.files),
      search: true,
      stickyFolders: true,
      initialVisibleRowCount: 700 / 30,
    });
    await flushDom();
    const scrollElement = getScrollElement(root);

    scrollTo(scrollElement, 540);
    await flushDom();
    await flushDom();

    expect(getStickyRowPaths(root)).toEqual([
      'arch/',
      'arch/alpha/',
      'arch/alpha/include/',
      'arch/alpha/include/asm/',
    ]);
    expect(getMountedItemPaths(root)[0]).toBe(
      'arch/alpha/include/asm/bitops.h'
    );

    clickStickyRow(root, 'arch/alpha/include/asm/');
    await flushDom();
    await flushDom();

    expect(scrollElement.scrollTop).toBe(420);
    expect(getStickyRowPaths(root)).toEqual([
      'arch/',
      'arch/alpha/',
      'arch/alpha/include/',
    ]);
    expect(getMountedItemPaths(root)[0]).toBe('arch/alpha/include/asm/');
    expect(getFocusedItemPath(root)).toBe('arch/alpha/include/asm/');
  });

  test('sticky overlay mirrors flattened row content', async () => {
    const { root } = await render({
      flattenEmptyDirectories: true,
      initialExpandedPaths: ['src/lib/'],
      paths: ['README.md', 'src/lib/util.ts', 'src/lib/helpers.ts'],
      stickyFolders: true,
      initialVisibleRowCount: 60 / 30,
    });
    const scrollElement = getScrollElement(root);
    const expectedContentText = getNormalizedText(
      getItemButton(root, 'src/lib/').querySelector(
        '[data-item-section="content"]'
      )
    );

    scrollTo(scrollElement, 30);
    await flushDom();

    expect(getStickyRowPaths(root)).toEqual(['src/lib/']);
    expect(getMountedItemPaths(root)).not.toContain('src/lib/');
    const stickyRow = root.querySelector(
      '[data-file-tree-sticky-path="src/lib/"] [data-item-section="content"]'
    );
    expect(getNormalizedText(stickyRow)).toBe(expectedContentText);
  });

  test('sticky overlay rows mirror the canonical row lane structure, including action-lane reservation', async () => {
    const { root } = await render({
      composition: {
        contextMenu: {
          enabled: true,
          triggerMode: 'button',
        },
      },
      flattenEmptyDirectories: true,
      initialExpandedPaths: ['src/lib/'],
      paths: ['README.md', 'src/lib/util.ts', 'src/lib/helpers.ts'],
      stickyFolders: true,
      initialVisibleRowCount: 60 / 30,
    });
    const scrollElement = getScrollElement(root);

    const canonicalButton = getItemButton(root, 'src/lib/');
    const expectedSectionOrder = getRowSectionOrder(canonicalButton);

    scrollTo(scrollElement, 30);
    await flushDom();

    const stickyButton = getStickyRowButton(root, 'src/lib/');

    expect(getStickyRowPaths(root)).toEqual(['src/lib/']);
    expect(getMountedItemPaths(root)).not.toContain('src/lib/');
    expect(getRowSectionOrder(stickyButton)).toEqual(expectedSectionOrder);
    expect(
      stickyButton.querySelector('[data-item-section="action"]')
    ).not.toBeNull();
    expect(stickyButton.dataset.itemHasContextMenuActionLane).toBe('true');
    expect(stickyButton.getAttribute('aria-selected')).toBeNull();
    expect(stickyButton.getAttribute('aria-level')).toBeNull();
    expect(stickyButton.getAttribute('aria-posinset')).toBeNull();
    expect(stickyButton.getAttribute('aria-setsize')).toBeNull();
    expect(stickyButton.getAttribute('role')).toBeNull();
    expect(stickyButton.getAttribute('id')).toBeNull();
    expect(stickyButton.tabIndex).toBe(-1);
  });

  test('sticky overlay can fill the viewport for a deep leading folder chain', async () => {
    const deepPaths = [
      'a/b/c/d/e/file.ts',
      ...Array.from({ length: 10 }, (_, index) => `z${index}.ts`),
    ];
    const expectedStickyPaths = [
      'a/',
      'a/b/',
      'a/b/c/',
      'a/b/c/d/',
      'a/b/c/d/e/',
    ];

    const { root } = await render({
      flattenEmptyDirectories: false,
      initialExpandedPaths: ['a/b/c/d/e/'],
      paths: deepPaths,
      stickyFolders: true,
      initialVisibleRowCount: 120 / 30,
    });
    const scrollElement = getScrollElement(root);

    expect(getStickyRowPaths(root)).toEqual([]);

    scrollTo(scrollElement, 1);
    await flushDom();

    expect(getStickyRowPaths(root)).toEqual(expectedStickyPaths);
    const mountedPaths = getMountedItemPaths(root);
    for (const path of expectedStickyPaths) {
      expect(mountedPaths).not.toContain(path);
    }

    const stickyOverlayContent = root.querySelector<HTMLElement>(
      '[data-file-tree-sticky-overlay-content="true"]'
    );
    if (stickyOverlayContent === null) {
      throw new Error('missing sticky overlay content');
    }
    expect(stickyOverlayContent.style.height).toBe('150px');
  });

  test('computes a stable window range and sticky layout', () => {
    const initialRange = computeWindowRange({
      itemCount: 200,
      itemHeight: FILE_TREE_DEFAULT_ITEM_HEIGHT,
      overscan: FILE_TREE_DEFAULT_OVERSCAN,
      scrollTop: 0,
      viewportHeight: FILE_TREE_DEFAULT_VIEWPORT_HEIGHT,
    });
    const scrolledRange = computeWindowRange(
      {
        itemCount: 200,
        itemHeight: FILE_TREE_DEFAULT_ITEM_HEIGHT,
        overscan: FILE_TREE_DEFAULT_OVERSCAN,
        scrollTop: 1800,
        viewportHeight: FILE_TREE_DEFAULT_VIEWPORT_HEIGHT,
      },
      initialRange
    );
    const layout = computeStickyWindowLayout({
      itemCount: 200,
      itemHeight: FILE_TREE_DEFAULT_ITEM_HEIGHT,
      range: scrolledRange,
      viewportHeight: FILE_TREE_DEFAULT_VIEWPORT_HEIGHT,
    });

    expect(initialRange.start).toBe(0);
    expect(scrolledRange.start).toBeGreaterThan(0);
    expect(scrolledRange.end).toBeGreaterThan(scrolledRange.start);
    expect(layout.totalHeight).toBe(200 * FILE_TREE_DEFAULT_ITEM_HEIGHT);
    expect(layout.offsetHeight).toBe(
      scrolledRange.start * FILE_TREE_DEFAULT_ITEM_HEIGHT
    );
  });
});
