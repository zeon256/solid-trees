import { afterEach, describe, expect, test } from 'vitest';

import { FileTreeController } from '../src/model/FileTreeController';
import { FILE_TREE_DEFAULT_ITEM_HEIGHT } from '../src/model/virtualization';
import {
  clickItem,
  flushDom,
  getFocusedTreeElement,
  getItemButton,
  getRowSectionOrder,
  getScrollElement,
  getSelectedItemPaths,
  pressKey,
} from './core-interaction-helpers';
import { mountTree, settle } from './helpers';
import type { MountedTree } from './helpers';

let mounted: MountedTree | null = null;
afterEach(() => {
  mounted?.dispose();
  mounted = null;
});

describe('file-tree keyboard and selection (dom)', () => {
  test('keyboard selection hotkeys preserve focus continuity', async () => {
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

    pressKey(firstButton, ' ', { code: 'Space', ctrlKey: true });
    await flushDom();
    expect(getSelectedItemPaths(root)).toEqual(['a.ts']);

    pressKey(firstButton, 'ArrowDown', { shiftKey: true });
    await flushDom();
    expect(getSelectedItemPaths(root)).toEqual(['a.ts', 'b.ts']);
    expect(model.getItem('b.ts')?.isFocused()).toBe(true);

    pressKey(getItemButton(root, 'b.ts'), 'ArrowDown', { shiftKey: true });
    await flushDom();
    expect(getSelectedItemPaths(root)).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(model.getItem('c.ts')?.isFocused()).toBe(true);

    pressKey(getItemButton(root, 'c.ts'), 'ArrowUp', { shiftKey: true });
    await flushDom();
    expect(getSelectedItemPaths(root)).toEqual(['a.ts', 'b.ts']);
    expect(model.getItem('b.ts')?.isFocused()).toBe(true);

    pressKey(getItemButton(root, 'b.ts'), 'a', { ctrlKey: true });
    await flushDom();
    expect(getSelectedItemPaths(root)).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });

  test('renders roving tabindex and baseline accessibility attributes', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: false,
      initialExpansion: 1,
      paths: ['README.md', 'src/index.ts', 'src/lib/util.ts'],
      initialVisibleRowCount: 120 / 30,
    });
    const { root } = mounted;
    await settle();
    const sourceButton = getItemButton(root, 'src/');
    const readmeButton = getItemButton(root, 'README.md');

    expect(root.getAttribute('role')).toBe('tree');
    expect(root.getAttribute('aria-activedescendant')).toBeNull();
    // Upstream asserted an inline `outline: none`; the Solid port declares it
    // in the structural stylesheet instead of an inline style.
    expect(root.style.outline).toBe('');
    expect(
      root.querySelector('style[data-file-tree-structure]')?.textContent
    ).toMatch(/outline:\s*none/);
    expect(sourceButton.getAttribute('role')).toBe('treeitem');
    expect(sourceButton.getAttribute('aria-level')).toBe('1');
    expect(sourceButton.getAttribute('aria-posinset')).toBe('1');
    expect(sourceButton.getAttribute('aria-setsize')).toBe('2');
    expect(sourceButton.getAttribute('aria-expanded')).toBe('true');
    expect(sourceButton.getAttribute('aria-selected')).toBe('false');
    expect(sourceButton.tabIndex).toBe(0);
    expect(sourceButton.dataset.itemFocused).toBeUndefined();
    expect(readmeButton.getAttribute('aria-expanded')).toBeNull();
    expect(readmeButton.tabIndex).toBe(-1);

    // Collapsed directory should render aria-expanded="false"
    const libButton = getItemButton(root, 'src/lib/');
    expect(libButton.getAttribute('aria-expanded')).toBe('false');

    sourceButton.focus();
    await flushDom();
    expect(sourceButton.dataset.itemFocused).toBe('true');
  });

  test('focused rows keep the matching separator line prominent', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: false,
      initialExpandedPaths: ['src/lib/'],
      paths: ['README.md', 'src/index.ts', 'src/lib/util.ts'],
      initialVisibleRowCount: 120 / 30,
    });
    const { root } = mounted;
    await settle();
    const fileButton = getItemButton(root, 'src/lib/util.ts');

    fileButton.focus();
    await flushDom();

    // Upstream injected a `<style data-file-tree-guide-style>` rule; the Solid
    // port marks the matching spacing item with `data-item-guide-focused`.
    const spacingItems = fileButton.querySelectorAll(
      '[data-item-section="spacing-item"]'
    );

    expect(spacingItems[0]?.getAttribute('data-ancestor-path')).toBe('src/');
    expect(spacingItems[1]?.getAttribute('data-ancestor-path')).toBe(
      'src/lib/'
    );
    expect(spacingItems[0]?.getAttribute('data-item-guide-focused')).toBeNull();
    expect(spacingItems[1]?.getAttribute('data-item-guide-focused')).toBe(
      'true'
    );
  });

  test('keyboard navigation matches the baseline tree behavior', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: false,
      initialExpansion: 1,
      paths: ['README.md', 'src/index.ts', 'src/lib/util.ts'],
      initialVisibleRowCount: 120 / 30,
    });
    const { model, root } = mounted;
    await settle();
    getItemButton(root, 'src/').focus();
    await flushDom();

    pressKey(getItemButton(root, 'src/'), 'ArrowDown');
    await flushDom();
    expect(model.getItem('src/lib/')?.isFocused()).toBe(true);

    pressKey(getItemButton(root, 'src/lib/'), 'ArrowRight');
    await flushDom();
    expect(root.innerHTML).toContain('src/lib/util.ts');
    expect(model.getItem('src/lib/')?.isFocused()).toBe(true);

    pressKey(getItemButton(root, 'src/lib/'), 'ArrowRight');
    await flushDom();
    expect(model.getItem('src/lib/util.ts')?.isFocused()).toBe(true);

    pressKey(getItemButton(root, 'src/lib/util.ts'), 'ArrowLeft');
    await flushDom();
    expect(model.getItem('src/lib/')?.isFocused()).toBe(true);

    pressKey(getItemButton(root, 'src/lib/'), 'End');
    await flushDom();
    await flushDom();
    expect(model.getItem('README.md')?.isFocused()).toBe(true);

    pressKey(root, 'Home');
    await flushDom();
    await flushDom();
    expect(model.getItem('src/')?.isFocused()).toBe(true);
  });

  test('ArrowLeft on expanded directory collapses it without moving focus', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: false,
      initialExpandedPaths: ['src/lib/'],
      paths: ['README.md', 'src/index.ts', 'src/lib/util.ts'],
      initialVisibleRowCount: 120 / 30,
    });
    const { model, root } = mounted;
    await settle();

    // src/lib/ is expanded — ArrowLeft should collapse it, not move focus
    getItemButton(root, 'src/lib/').focus();
    await flushDom();
    expect(root.innerHTML).toContain('src/lib/util.ts');

    pressKey(getItemButton(root, 'src/lib/'), 'ArrowLeft');
    await flushDom();
    expect(model.getItem('src/lib/')?.isFocused()).toBe(true);
    expect(root.innerHTML).not.toContain('src/lib/util.ts');

    // Now src/lib/ is collapsed — ArrowLeft should move focus to parent src/
    pressKey(getItemButton(root, 'src/lib/'), 'ArrowLeft');
    await flushDom();
    expect(model.getItem('src/')?.isFocused()).toBe(true);
  });

  test('ArrowLeft at root level is a no-op and ArrowRight on a leaf moves focus forward', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: false,
      initialExpansion: 0,
      paths: ['a.ts', 'b.ts', 'c.ts'],
      initialVisibleRowCount: 120 / 30,
    });
    const { model, root } = mounted;
    await settle();

    // Focus first root-level item — ArrowLeft should be a no-op
    getItemButton(root, 'a.ts').focus();
    await flushDom();
    pressKey(getItemButton(root, 'a.ts'), 'ArrowLeft');
    await flushDom();
    expect(model.getItem('a.ts')?.isFocused()).toBe(true);

    // ArrowRight on a leaf file should move focus to next item
    pressKey(getItemButton(root, 'a.ts'), 'ArrowRight');
    await flushDom();
    expect(model.getItem('b.ts')?.isFocused()).toBe(true);
  });

  test('focus stays clamped at first and last visible items', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: false,
      paths: ['a.ts', 'b.ts', 'c.ts'],
      initialVisibleRowCount: 120 / 30,
    });
    const { model, root } = mounted;
    await settle();

    // ArrowUp at first item stays put
    getItemButton(root, 'a.ts').focus();
    await flushDom();
    pressKey(getItemButton(root, 'a.ts'), 'ArrowUp');
    await flushDom();
    expect(model.getItem('a.ts')?.isFocused()).toBe(true);

    // ArrowDown at last item stays put
    pressKey(getItemButton(root, 'a.ts'), 'End');
    await flushDom();
    await flushDom();
    expect(model.getItem('c.ts')?.isFocused()).toBe(true);

    pressKey(getItemButton(root, 'c.ts'), 'ArrowDown');
    await flushDom();
    expect(model.getItem('c.ts')?.isFocused()).toBe(true);
  });

  test('collapse moves focus to the nearest visible ancestor', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: false,
      initialExpandedPaths: ['src/lib/'],
      paths: ['README.md', 'src/index.ts', 'src/lib/util.ts'],
      initialVisibleRowCount: 120 / 30,
    });
    const { model, root } = mounted;
    await settle();
    getItemButton(root, 'src/lib/util.ts').focus();
    await flushDom();

    const sourceDirectory = model.getItem('src/lib/');
    if (
      sourceDirectory === null ||
      sourceDirectory.isDirectory() !== true ||
      !('collapse' in sourceDirectory)
    ) {
      throw new Error('missing source directory item');
    }

    sourceDirectory.collapse();
    await flushDom();

    expect(model.getItem('src/lib/')?.isFocused()).toBe(true);
    expect(root.innerHTML).not.toContain('src/lib/util.ts');
    expect(getFocusedTreeElement(root)?.dataset.itemPath).toBe('src/lib/');
  });

  test('keyboard navigation survives virtualization when the focused row unmounts', async () => {
    const paths = Array.from(
      { length: 120 },
      (_, index) => `item${String(index).padStart(3, '0')}.ts`
    );
    mounted = mountTree({
      flattenEmptyDirectories: false,
      paths,
      initialVisibleRowCount: 120 / 30,
    });
    const { model, root } = mounted;
    await settle();
    const viewport = getScrollElement(root);

    viewport.scrollTop = 1500;
    viewport.dispatchEvent(new Event('scroll'));
    await flushDom();

    getItemButton(root, 'item050.ts').focus();
    await flushDom();
    expect(model.getItem('item050.ts')?.isFocused()).toBe(true);

    viewport.scrollTop = 3000;
    viewport.dispatchEvent(new Event('scroll'));
    await flushDom();
    await flushDom();

    expect(viewport.scrollTop).toBe(3000);
    expect(root.innerHTML).toContain('item100.ts');
    expect(getItemButton(root, 'item050.ts').dataset.itemParked).toBe('true');
    expect(getFocusedTreeElement(root)?.dataset.itemPath).toBe('item050.ts');

    pressKey(getItemButton(root, 'item050.ts'), 'ArrowDown');
    await flushDom();
    await flushDom();

    expect(model.getItem('item051.ts')?.isFocused()).toBe(true);
    expect(viewport.scrollTop).toBe(51 * FILE_TREE_DEFAULT_ITEM_HEIGHT);
    expect(getItemButton(root, 'item051.ts').dataset.itemFocused).toBe('true');
    expect(getFocusedTreeElement(root)?.dataset.itemPath).toBe('item051.ts');
  });

  test('flattened rows use terminal-directory keyboard semantics', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: true,
      initialExpandedPaths: ['src/'],
      paths: ['src/lib/util.ts'],
      initialVisibleRowCount: 120 / 30,
    });
    const { model, root } = mounted;
    await settle();
    getItemButton(root, 'src/lib/').focus();
    await flushDom();

    pressKey(getItemButton(root, 'src/lib/'), 'ArrowRight');
    await flushDom();
    expect(root.innerHTML).toContain('util.ts');
    expect(model.getItem('src/lib/')?.isFocused()).toBe(true);

    pressKey(getItemButton(root, 'src/lib/'), 'ArrowRight');
    await flushDom();
    expect(model.getItem('src/lib/util.ts')?.isFocused()).toBe(true);
  });

  test('flattened row markup does not wrap separators in extra spans', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: true,
      initialExpandedPaths: ['src/'],
      paths: ['src/lib/util.ts'],
      initialVisibleRowCount: 120 / 30,
    });
    const { root } = mounted;
    await settle();
    const flattenedContainer = root.querySelector(
      '[data-item-flattened-subitems]'
    );

    expect(flattenedContainer?.innerHTML).toContain(' / ');
    expect(
      flattenedContainer?.querySelectorAll(
        ':scope > [data-item-flattened-subitem]'
      ).length
    ).toBe(2);
    expect(
      flattenedContainer?.querySelector(
        ':scope > span:not([data-item-flattened-subitem])'
      )
    ).toBeNull();
  });

  test('flattened rows toggle the terminal directory', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: true,
      initialExpandedPaths: ['src/'],
      paths: ['src/lib/util.ts'],
      initialVisibleRowCount: 120 / 30,
    });
    const { root } = mounted;
    await settle();

    clickItem(root, 'src/lib/');
    await flushDom();

    expect(root.innerHTML).toContain('util.ts');
  });

  test('flattened row selection targets the terminal directory path', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: true,
      initialExpandedPaths: ['src/'],
      paths: ['src/lib/util.ts'],
      initialVisibleRowCount: 120 / 30,
    });
    const { model, root } = mounted;
    await settle();

    clickItem(root, 'src/lib/');
    await flushDom();

    expect(model.getSelectedPaths()).toEqual(['src/lib/']);
    expect(getItemButton(root, 'src/lib/').dataset.itemSelected).toBe('true');
  });

  test('Shift-click range selection works when anchor or target is a flattened row', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: true,
      initialExpandedPaths: ['src/'],
      paths: ['README.md', 'src/lib/util.ts', 'src/lib/helpers.ts'],
      initialVisibleRowCount: 200 / 30,
    });
    const { model, root } = mounted;
    await settle();

    // Click the flattened row (src / lib) to set it as anchor
    clickItem(root, 'src/lib/');
    await flushDom();
    expect(model.getSelectedPaths()).toEqual(['src/lib/']);

    // Shift-click a file below — should produce a range from the flattened
    // row through the target, not fall back to single selection.
    clickItem(root, 'src/lib/helpers.ts', { shiftKey: true });
    await flushDom();
    expect(model.getSelectedPaths()).toContain('src/lib/');
    expect(model.getSelectedPaths()).toContain('src/lib/helpers.ts');

    // Now test the reverse: anchor on a regular file, Shift-click the
    // flattened row.
    clickItem(root, 'src/lib/helpers.ts');
    await flushDom();

    clickItem(root, 'src/lib/', { shiftKey: true });
    await flushDom();
    expect(model.getSelectedPaths()).toContain('src/lib/');
    expect(model.getSelectedPaths()).toContain('src/lib/helpers.ts');
  });

  test('expansion between selected items does not corrupt index-based selection', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: false,
      initialExpansion: 0,
      paths: ['a.ts', 'src/index.ts', 'src/lib/util.ts', 'z.ts'],
      initialVisibleRowCount: 200 / 30,
    });
    const { model, root } = mounted;
    await settle();

    // Select a.ts, then Shift-click z.ts while the collapsed src/ row sits
    // outside the anchored visible range because directories sort ahead of
    // root files in this lane.
    clickItem(root, 'a.ts');
    await flushDom();
    clickItem(root, 'z.ts', { shiftKey: true });
    await flushDom();
    expect(model.getSelectedPaths()).toEqual(['a.ts', 'z.ts']);
    expect(getSelectedItemPaths(root)).toEqual(['a.ts', 'z.ts']);

    // Expand src/ — new children appear but selection stays path-based
    const srcDir = model.getItem('src/');
    if (srcDir === null || !srcDir.isDirectory() || !('expand' in srcDir)) {
      throw new Error('missing src directory');
    }
    srcDir.expand();
    await flushDom();

    // Only the original selected root-file range should remain selected, not
    // the newly visible children.
    expect(model.getSelectedPaths()).toEqual(['a.ts', 'z.ts']);
    expect(
      getItemButton(root, 'src/index.ts').dataset.itemSelected
    ).toBeUndefined();
  });

  test('onSelectionChange does not fire on collapse even when selected items become hidden', async () => {
    const selectionEvents: Array<Array<string>> = [];

    mounted = mountTree({
      flattenEmptyDirectories: false,
      initialExpandedPaths: ['src/'],
      onSelectionChange: (items) => {
        selectionEvents.push([...items]);
      },
      paths: ['src/index.ts', 'src/lib/util.ts'],
      initialVisibleRowCount: 120 / 30,
    });
    const { model, root } = mounted;
    await settle();

    clickItem(root, 'src/index.ts');
    await flushDom();
    expect(selectionEvents.length).toBe(1);

    // Collapse the parent — selected item disappears from DOM but stays
    // in the selection set, so the callback should NOT fire again.
    const srcDir = model.getItem('src/');
    if (srcDir === null || !srcDir.isDirectory() || !('collapse' in srcDir)) {
      throw new Error('missing src directory');
    }
    srcDir.collapse();
    await flushDom();

    expect(selectionEvents.length).toBe(1);
    expect(model.getSelectedPaths()).toEqual(['src/index.ts']);
  });

  test('empty paths array creates a valid tree with no crashes', () => {
    const controller = new FileTreeController({
      flattenEmptyDirectories: false,
      paths: [],
    });

    expect(controller.getVisibleCount()).toBe(0);
    expect(controller.getFocusedPath()).toBeNull();
    expect(controller.getFocusedIndex()).toBe(-1);
    expect(controller.getFocusedItem()).toBeNull();
    expect(controller.getSelectedPaths()).toEqual([]);
    expect(controller.getItem('anything')).toBeNull();

    // Navigation methods should be no-ops, not throw.
    controller.focusNextItem();
    controller.focusPreviousItem();
    controller.focusFirstItem();
    controller.focusLastItem();
    controller.focusParentItem();
    controller.selectAllVisiblePaths();
    controller.extendSelectionFromFocused(1);
    controller.extendSelectionFromFocused(-1);
    controller.selectPathRange('missing.ts', false);
    controller.selectOnlyPath('missing.ts');

    expect(controller.getVisibleCount()).toBe(0);

    controller.destroy();
  });

  test('single item tree handles all navigation and selection gracefully', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: false,
      paths: ['only.ts'],
      initialVisibleRowCount: 120 / 30,
    });
    const { model, root } = mounted;
    await settle();
    const button = getItemButton(root, 'only.ts');
    button.focus();
    await flushDom();

    // ArrowDown/Up at the only item should stay put
    pressKey(button, 'ArrowDown');
    await flushDom();
    expect(model.getItem('only.ts')?.isFocused()).toBe(true);

    pressKey(button, 'ArrowUp');
    await flushDom();
    expect(model.getItem('only.ts')?.isFocused()).toBe(true);

    // Ctrl+A selects the single item
    pressKey(button, 'a', { ctrlKey: true });
    await flushDom();
    expect(getSelectedItemPaths(root)).toEqual(['only.ts']);

    // Shift+ArrowDown at boundary is a no-op
    pressKey(button, 'ArrowDown', { shiftKey: true });
    await flushDom();
    expect(getSelectedItemPaths(root)).toEqual(['only.ts']);
  });

  test('Ctrl-click deselects the anchor then Shift-click still ranges from it', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: false,
      paths: ['a.ts', 'b.ts', 'c.ts', 'd.ts'],
      initialVisibleRowCount: 120 / 30,
    });
    const { root } = mounted;
    await settle();

    // Click b.ts to set it as anchor and select it
    clickItem(root, 'b.ts');
    await flushDom();
    expect(getSelectedItemPaths(root)).toEqual(['b.ts']);

    // Ctrl-click b.ts to deselect it — anchor should remain b.ts
    clickItem(root, 'b.ts', { ctrlKey: true });
    await flushDom();
    expect(getSelectedItemPaths(root)).toEqual([]);

    // Shift-click d.ts — should range from anchor b.ts to d.ts
    clickItem(root, 'd.ts', { shiftKey: true });
    await flushDom();
    expect(getSelectedItemPaths(root)).toEqual(['b.ts', 'c.ts', 'd.ts']);
  });

  test('uses compatible row markup for the implemented focus/navigation and selection pieces', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: true,
      initialExpansion: 'open',
      paths: ['src/lib/index.ts', 'src/lib/utils.ts', 'README.md'],
      initialVisibleRowCount: 120 / 30,
    });
    const { root } = mounted;
    await settle();
    const focusedRow = root.querySelector('[data-item-focused="true"]');

    const flattenedFolderButton = getItemButton(root, 'src/lib/');
    const nestedFileButton = getItemButton(root, 'src/lib/index.ts');
    const rootFileButton = getItemButton(root, 'README.md');

    expect(getRowSectionOrder(flattenedFolderButton)).toEqual([
      'icon',
      'content',
    ]);
    expect(getRowSectionOrder(nestedFileButton)).toEqual([
      'spacing',
      'icon',
      'content',
    ]);
    expect(getRowSectionOrder(rootFileButton)).toEqual(['icon', 'content']);

    expect(
      flattenedFolderButton.querySelector(
        '[data-item-section="icon"] [data-icon-name]'
      )
    ).not.toBeNull();
    expect(
      nestedFileButton.querySelector(
        '[data-item-section="spacing"] [data-item-section="spacing-item"]'
      )
    ).not.toBeNull();
    expect(
      nestedFileButton.querySelector(
        '[data-item-section="icon"] [data-icon-name]'
      )
    ).not.toBeNull();
    expect(
      nestedFileButton.querySelector(
        '[data-item-section="content"] [data-icon-name]'
      )
    ).toBeNull();
    expect(
      nestedFileButton.querySelector(
        '[data-item-section="content"] [data-item-section="spacing-item"]'
      )
    ).toBeNull();
    expect(
      nestedFileButton.querySelector(
        '[data-item-section="content"] [data-truncate-container]'
      )
    ).not.toBeNull();
    expect(focusedRow).toBeNull();
    expect(root.querySelector('[data-item-selected="true"]')).toBeNull();
    expect(root.getAttribute('role')).toBe('tree');
    expect(root.getAttribute('aria-activedescendant')).toBeNull();

    getItemButton(root, 'src/lib/').focus();
    await flushDom();

    const focusedButton = getItemButton(root, 'src/lib/');
    expect(focusedButton.dataset.itemFocused).toBe('true');
    expect(focusedButton.getAttribute('role')).toBe('treeitem');
    expect(focusedButton.getAttribute('aria-selected')).toBe('false');

    clickItem(root, 'README.md');
    await flushDom();

    const selectedButton = getItemButton(root, 'README.md');
    expect(selectedButton.dataset.itemSelected).toBe('true');
    expect(selectedButton.getAttribute('aria-selected')).toBe('true');
    expect(root.querySelector('[data-item-selected="true"]')).not.toBeNull();
  });
});
