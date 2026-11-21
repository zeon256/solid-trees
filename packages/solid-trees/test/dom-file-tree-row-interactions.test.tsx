import { afterEach, describe, expect, test } from 'vitest';

import { FileTreeController } from '../src/model/FileTreeController';
import { FILE_TREE_DEFAULT_ITEM_HEIGHT } from '../src/model/virtualization';
import {
  clickItem,
  clickStickyRow,
  flushDom,
  getFocusedItemPath,
  getFocusedTreeElement,
  getItemButton,
  getScrollElement,
  getSelectedItemPaths,
  getStickyRowButton,
  getStickyRowPaths,
  getVisibleIndexForPath,
  pressKey,
} from './core-interaction-helpers';
import { mountTree, settle } from './helpers';
import type { MountedTree } from './helpers';

let mounted: MountedTree | null = null;
afterEach(() => {
  mounted?.dispose();
  mounted = null;
});

describe('file-tree row interactions (dom)', () => {
  test('directory row collapses on the first click when initialExpandedPaths uses bare directory paths', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: false,
      initialExpandedPaths: ['src'],
      paths: ['README.md', 'src/index.ts', 'src/lib/util.ts'],
      initialVisibleRowCount: 120 / 30,
    });
    const { root } = mounted;
    await settle();

    expect(root.innerHTML).toContain('src/index.ts');
    clickItem(root, 'src/');
    await flushDom();

    expect(root.innerHTML).not.toContain('src/index.ts');
  });

  test('stale directory row clicks after path reset are ignored', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: false,
      initialExpandedPaths: ['src'],
      paths: ['README.md', 'src/index.ts'],
      initialVisibleRowCount: 120 / 30,
    });
    const { model, root } = mounted;
    await settle();
    const staleSrcButton = getItemButton(root, 'src/');

    model.resetPaths(['README.md']);
    expect(model.getItem('src/')).toBeNull();

    staleSrcButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushDom();

    expect(model.getSelectedPaths()).toEqual([]);
    expect(model.getItem('src/')).toBeNull();
  });

  test('rapid double-click toggles against live directory state', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: false,
      initialExpandedPaths: ['src'],
      paths: ['README.md', 'src/index.ts', 'src/lib/util.ts'],
      initialVisibleRowCount: 120 / 30,
    });
    const { model, root } = mounted;
    await settle();
    const srcDirectory = model.getItem('src/');
    if (
      srcDirectory === null ||
      srcDirectory.isDirectory() !== true ||
      !('isExpanded' in srcDirectory)
    ) {
      throw new Error('expected src directory item');
    }

    clickItem(root, 'src/');
    clickItem(root, 'src/');
    await flushDom();

    expect(srcDirectory.isExpanded()).toBe(true);
    expect(root.innerHTML).toContain('src/index.ts');
  });

  test('flattened directory row clicks select and toggle the terminal path', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: true,
      initialExpandedPaths: ['root/', 'root/branch/leaf/'],
      paths: [
        'root/branch/leaf/file.ts',
        'root/branch/leaf/other.ts',
        'root/sibling.ts',
      ],
      initialVisibleRowCount: 180 / 30,
    });
    const { model, root } = mounted;
    await settle();
    const leafDirectory = model.getItem('root/branch/leaf/');
    if (
      leafDirectory === null ||
      leafDirectory.isDirectory() !== true ||
      !('isExpanded' in leafDirectory)
    ) {
      throw new Error('expected flattened leaf directory item');
    }

    expect(getItemButton(root, 'root/branch/leaf/')).toBeTruthy();
    expect(root.innerHTML).toContain('file.ts');

    clickItem(root, 'root/branch/leaf/');
    await flushDom();

    expect(leafDirectory.isExpanded()).toBe(false);
    expect(model.getSelectedPaths()).toEqual(['root/branch/leaf/']);
    expect(model.getFocusedPath()).toBe('root/branch/leaf/');
    expect(root.innerHTML).not.toContain('file.ts');
  });

  test('modified clicks recreate the baseline selection semantics in spirit', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: false,
      paths: ['a.ts', 'b.ts', 'c.ts', 'd.ts'],
      initialVisibleRowCount: 120 / 30,
    });
    const { model, root } = mounted;
    await settle();

    clickItem(root, 'b.ts');
    await flushDom();
    expect(getSelectedItemPaths(root)).toEqual(['b.ts']);

    clickItem(root, 'd.ts', { shiftKey: true });
    await flushDom();
    expect(getSelectedItemPaths(root)).toEqual(['b.ts', 'c.ts', 'd.ts']);

    clickItem(root, 'a.ts', { metaKey: true, shiftKey: true });
    await flushDom();
    expect(getSelectedItemPaths(root)).toEqual([
      'a.ts',
      'b.ts',
      'c.ts',
      'd.ts',
    ]);

    clickItem(root, 'c.ts', { ctrlKey: true });
    await flushDom();
    expect(getSelectedItemPaths(root)).toEqual(['a.ts', 'b.ts', 'd.ts']);
    expect(model.getItem('c.ts')?.isFocused()).toBe(true);
  });

  test('Shift+Arrow from an unselected focused row selects only the next row', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: false,
      paths: ['a.ts', 'b.ts', 'c.ts'],
      initialVisibleRowCount: 120 / 30,
    });
    const { model, root } = mounted;
    await settle();
    const firstButton = getItemButton(root, 'a.ts');
    firstButton.focus();
    await flushDom();

    pressKey(firstButton, 'ArrowDown', { shiftKey: true });
    await flushDom();

    expect(getSelectedItemPaths(root)).toEqual(['b.ts']);
    expect(model.getItem('b.ts')?.isFocused()).toBe(true);
  });

  test('Ctrl+Space seeds the range anchor for a later Shift-click', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: false,
      paths: ['a.ts', 'b.ts', 'c.ts', 'd.ts'],
      initialVisibleRowCount: 120 / 30,
    });
    const { root } = mounted;
    await settle();
    const firstButton = getItemButton(root, 'a.ts');
    firstButton.focus();
    await flushDom();

    pressKey(firstButton, ' ', { code: 'Space', ctrlKey: true });
    await flushDom();
    expect(getSelectedItemPaths(root)).toEqual(['a.ts']);

    clickItem(root, 'd.ts', { shiftKey: true });
    await flushDom();
    expect(getSelectedItemPaths(root)).toEqual([
      'a.ts',
      'b.ts',
      'c.ts',
      'd.ts',
    ]);
  });

  test('Shift-click without an existing anchor falls back to single selection', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: false,
      paths: ['a.ts', 'b.ts', 'c.ts'],
      initialVisibleRowCount: 120 / 30,
    });
    const { root } = mounted;
    await settle();

    clickItem(root, 'c.ts', { shiftKey: true });
    await flushDom();

    expect(getSelectedItemPaths(root)).toEqual(['c.ts']);
  });

  test('sticky row clicks match canonical folder row selection, focus, and toggle semantics', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: false,
      initialExpandedPaths: ['aaa/', 'bbb/', 'src/lib/'],
      paths: ['aaa/one.ts', 'bbb/two.ts', 'src/index.ts', 'src/lib/util.ts'],
      stickyFolders: true,
      initialVisibleRowCount: 60 / 30,
    });
    const { model, root } = mounted;
    await flushDom();
    const scrollElement = getScrollElement(root);

    clickItem(root, 'src/lib/util.ts');
    await flushDom();
    expect(getSelectedItemPaths(root)).toEqual(['src/lib/util.ts']);

    scrollElement.scrollTop = 149;
    scrollElement.dispatchEvent(new Event('scroll'));
    await flushDom();

    const stickyButton = getStickyRowButton(root, 'src/lib/');
    expect(getStickyRowPaths(root)).toEqual(['src/', 'src/lib/']);
    expect(model.getSelectedPaths()).toEqual(['src/lib/util.ts']);

    clickStickyRow(root, 'src/lib/');
    await flushDom();
    await flushDom();

    expect(scrollElement.scrollTop).toBeLessThan(149);
    const libDirectory = model.getItem('src/lib/');
    if (
      libDirectory === null ||
      libDirectory.isDirectory() !== true ||
      !('isExpanded' in libDirectory)
    ) {
      throw new Error('expected src/lib directory item');
    }
    expect(libDirectory.isExpanded()).toBe(false);
    expect(getSelectedItemPaths(root)).toEqual(['src/lib/']);
    expect(getFocusedItemPath(root)).toBe('src/lib/');
    expect(getFocusedTreeElement(root)?.dataset.itemPath).toBe('src/lib/');
    expect(getItemButton(root, 'src/lib/').dataset.itemSelected).toBe('true');
    expect(getItemButton(root, 'src/lib/').dataset.itemFocused).toBe('true');
    expect(stickyButton.getAttribute('aria-selected')).toBeNull();
  });

  test('flattened sticky row clicks target the flattened row only', async () => {
    const clickOptions = {
      flattenEmptyDirectories: true,
      initialExpandedPaths: ['aaa/', 'src/lib/'],
      paths: ['aaa/one.ts', 'src/lib/util.ts', 'src/lib/helpers.ts'],
      stickyFolders: true,
      initialVisibleRowCount: 60 / 30,
    } as const;
    const expectedController = new FileTreeController(clickOptions);
    const expectedScrollTop = Math.max(
      0,
      getVisibleIndexForPath(expectedController, 'src/lib/') *
        FILE_TREE_DEFAULT_ITEM_HEIGHT -
        FILE_TREE_DEFAULT_ITEM_HEIGHT
    );
    expectedController.destroy();

    mounted = mountTree(clickOptions);
    const { model, root } = mounted;
    await flushDom();
    const scrollElement = getScrollElement(root);

    clickItem(root, 'src/lib/util.ts');
    await flushDom();
    expect(model.getSelectedPaths()).toEqual(['src/lib/util.ts']);

    scrollElement.scrollTop = 90;
    scrollElement.dispatchEvent(new Event('scroll'));
    await flushDom();

    expect(getStickyRowPaths(root)).toEqual(['src/lib/']);

    clickStickyRow(root, 'src/lib/');
    await flushDom();
    await flushDom();

    expect(scrollElement.scrollTop).toBe(expectedScrollTop);
    expect(getFocusedItemPath(root)).toBe('src/lib/');
    expect(getFocusedTreeElement(root)?.dataset.itemPath).toBe('src/lib/');
    const libDirectory = model.getItem('src/lib/');
    if (
      libDirectory === null ||
      libDirectory.isDirectory() !== true ||
      !('isExpanded' in libDirectory)
    ) {
      throw new Error('expected src/lib directory item');
    }
    expect(libDirectory.isExpanded()).toBe(false);
    expect(model.getSelectedPaths()).toEqual(['src/lib/']);
  });

  test('directory row clicks preserve plain-click toggle behavior while modifier clicks stay selection-only', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: false,
      paths: ['README.md', 'src/index.ts', 'src/lib/util.ts'],
      initialVisibleRowCount: 120 / 30,
    });
    const { root } = mounted;
    await settle();

    clickItem(root, 'README.md');
    await flushDom();
    expect(root.innerHTML).not.toContain('src/index.ts');
    expect(getSelectedItemPaths(root)).toEqual(['README.md']);

    clickItem(root, 'src/');
    await flushDom();
    expect(root.innerHTML).toContain('src/index.ts');
    expect(getSelectedItemPaths(root)).toEqual(['src/']);

    clickItem(root, 'src/', { ctrlKey: true });
    await flushDom();
    expect(root.innerHTML).toContain('src/index.ts');
    expect(getSelectedItemPaths(root)).toEqual([]);

    clickItem(root, 'src/');
    await flushDom();
    expect(root.innerHTML).not.toContain('src/index.ts');
    expect(getSelectedItemPaths(root)).toEqual(['src/']);
  });
});
