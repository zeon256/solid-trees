import { PathStore } from '@solid-trees/path-store';
import { afterEach, describe, expect, test } from 'vitest';

import { FileTreeController } from '../src/model/FileTreeController';
import {
  flushDom,
  pressKey,
  setInputValue,
} from './dom-helpers-search-rename-menu';
import { mountTree } from './helpers';
import type { MountedTree } from './helpers';

function requireElement<T extends Element>(element: T | null, name: string): T {
  if (element === null) {
    throw new Error(`Expected ${name}`);
  }

  return element;
}

const FILES = [
  'README.md',
  'package.json',
  'src/index.ts',
  'src/components/Button.tsx',
  'src/components/Card.tsx',
  'src/utils/worker.ts',
  'src/utils/stream.ts',
  'test/index.test.ts',
] as const;

const SEARCH_NAV_FILES = [
  ...FILES,
  'src/utils/worker/index.ts',
  'src/utils/worker/deprecated/old-worker.ts',
] as const;

const LARGE_VISIBLE_FILES = Array.from(
  { length: 700 },
  (_unused, index) => `file-${String(index).padStart(4, '0')}.ts`
);

function getVisiblePaths(controller: FileTreeController): Array<string> {
  return controller
    .getVisibleRows(0, controller.getVisibleCount())
    .map((row) => row.path);
}

let mounted: MountedTree | null = null;
afterEach(() => {
  mounted?.dispose();
  mounted = null;
});

describe('file-tree search', () => {
  test('expand-matches preserves existing expansion and keeps non-matches visible', () => {
    const controller = new FileTreeController({
      fileTreeSearchMode: 'expand-matches',
      flattenEmptyDirectories: false,
      initialExpandedPaths: ['src/components/'],
      initialExpansion: 'closed',
      paths: FILES,
    });

    controller.setSearch('worker');
    const visiblePaths = getVisiblePaths(controller);

    expect(visiblePaths).toContain('README.md');
    expect(visiblePaths).toContain('package.json');
    expect(visiblePaths).toContain('src/utils/worker.ts');
    expect(visiblePaths).toContain('src/components/Button.tsx');

    controller.destroy();
  });

  test('collapse-non-matches expands only ancestors of matches', () => {
    const controller = new FileTreeController({
      fileTreeSearchMode: 'collapse-non-matches',
      flattenEmptyDirectories: false,
      initialExpandedPaths: ['src/components/'],
      initialExpansion: 'closed',
      paths: FILES,
    });

    controller.setSearch('worker');
    const visiblePaths = getVisiblePaths(controller);

    expect(visiblePaths).toContain('src/');
    expect(visiblePaths).toContain('src/utils/');
    expect(visiblePaths).toContain('src/utils/worker.ts');
    expect(visiblePaths).not.toContain('src/components/Button.tsx');

    controller.destroy();
  });

  test('hide-non-matches filters visible rows to matches plus ancestors', () => {
    const controller = new FileTreeController({
      fileTreeSearchMode: 'hide-non-matches',
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      paths: FILES,
    });

    controller.setSearch('worker');
    const visiblePaths = getVisiblePaths(controller);

    expect(visiblePaths).toContain('src/');
    expect(visiblePaths).toContain('src/utils/');
    expect(visiblePaths).toContain('src/utils/worker.ts');
    expect(visiblePaths).not.toContain('README.md');
    expect(visiblePaths).not.toContain('src/components/Button.tsx');

    controller.destroy();
  });

  test('built-in matcher uses case-insensitive full-path substring matching', () => {
    const controller = new FileTreeController({
      fileTreeSearchMode: 'hide-non-matches',
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      paths: FILES,
    });

    controller.setSearch('SRC');
    const matchingPaths = controller.getSearchMatchingPaths();

    expect(matchingPaths).toEqual(
      expect.arrayContaining([
        'src/',
        'src/components/',
        'src/components/Button.tsx',
        'src/components/Card.tsx',
        'src/index.ts',
        'src/utils/',
        'src/utils/stream.ts',
        'src/utils/worker.ts',
      ])
    );
    expect(matchingPaths).not.toContain('README.md');
    expect(matchingPaths).not.toContain('test/index.test.ts');

    controller.destroy();
  });

  test('built-in matcher no longer treats subsequences as matches', () => {
    const controller = new FileTreeController({
      fileTreeSearchMode: 'hide-non-matches',
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      paths: FILES,
    });

    controller.setSearch('srwk');

    expect(controller.getSearchMatchingPaths()).toEqual([]);

    controller.destroy();
  });

  test('focusNearestPath returns the correct visible path during filtered search', () => {
    const controller = new FileTreeController({
      fileTreeSearchMode: 'hide-non-matches',
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      paths: FILES,
    });

    controller.setSearch('worker');

    expect(controller.resolveNearestVisiblePath('src/utils/worker.ts')).toBe(
      'src/utils/worker.ts'
    );
    expect(controller.focusNearestPath('src/utils/worker.ts')).toBe(
      'src/utils/worker.ts'
    );

    controller.destroy();
  });

  test('filtered visible rows fetch only the contiguous runs they need', () => {
    const originalGetVisibleSlice = PathStore.prototype.getVisibleSlice;
    const requestedRanges: Array<[number, number]> = [];
    PathStore.prototype.getVisibleSlice = function getVisibleSlice(start, end) {
      requestedRanges.push([start, end]);
      return originalGetVisibleSlice.call(this, start, end);
    };

    try {
      const controller = new FileTreeController({
        fileTreeSearchMode: 'hide-non-matches',
        flattenEmptyDirectories: false,
        initialExpansion: 'open',
        paths: [
          'a/worker-a.ts',
          ...Array.from({ length: 24 }, (_unused, index) => {
            return `b/fill-${String(index)}.ts`;
          }),
          'm/worker-m.ts',
          ...Array.from({ length: 24 }, (_unused, index) => {
            return `n/fill-${String(index)}.ts`;
          }),
          'z/worker-z.ts',
        ],
      });

      controller.setSearch('worker');
      requestedRanges.length = 0;

      const visiblePaths = controller
        .getVisibleRows(0, 5)
        .map((row) => row.path);

      expect(visiblePaths).toEqual([
        'a/',
        'a/worker-a.ts',
        'm/',
        'm/worker-m.ts',
        'z/',
        'z/worker-z.ts',
      ]);
      expect(requestedRanges).toHaveLength(3);
      expect(requestedRanges.every(([start, end]) => end - start <= 1)).toBe(
        true
      );
      expect(requestedRanges[0]?.[0]).toBeLessThan(
        requestedRanges[1]?.[0] ?? 0
      );
      expect(requestedRanges[1]?.[0]).toBeLessThan(
        requestedRanges[2]?.[0] ?? 0
      );

      controller.destroy();
    } finally {
      PathStore.prototype.getVisibleSlice = originalGetVisibleSlice;
    }
  });

  test('closed-search visible count stays tied to the full store count before full projection expansion', () => {
    const controller = new FileTreeController({
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      paths: LARGE_VISIBLE_FILES,
    });

    expect(controller.getVisibleCount()).toBe(LARGE_VISIBLE_FILES.length);
    expect(controller.getVisibleRows(520, 520)[0]?.path).toBe(
      LARGE_VISIBLE_FILES[520]
    );

    controller.destroy();
  });

  test('focusNextItem can cross the initial partial projection boundary', () => {
    const controller = new FileTreeController({
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      paths: LARGE_VISIBLE_FILES,
    });

    for (let index = 0; index < 520; index += 1) {
      controller.focusNextItem();
    }

    expect(controller.getFocusedPath()).toBe(LARGE_VISIBLE_FILES[520]);

    controller.destroy();
  });

  test('onSearchChange fires for typed input, key-open seeding, and close but not initialSearchQuery', () => {
    const calls: Array<string | null> = [];

    const controller = new FileTreeController({
      fileTreeSearchMode: 'hide-non-matches',
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      initialSearchQuery: 'worker',
      onSearchChange: (value) => {
        calls.push(value);
      },
      paths: FILES,
    });

    expect(calls).toEqual([]);

    controller.openSearch('R');
    controller.setSearch('read');
    controller.closeSearch();

    expect(calls).toEqual(['r', 'read', null]);

    controller.destroy();
  });

  test('search false hides the built-in input while programmatic search still works', async () => {
    mounted = mountTree({
      fileTreeSearchMode: 'hide-non-matches',
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      paths: FILES,
      search: false,
      initialVisibleRowCount: 180 / 30,
    });
    await flushDom();
    const { model, root } = mounted;

    expect(root.querySelector('[data-file-tree-search-input]')).toBeNull();

    model.openSearch('worker');
    await flushDom();

    expect(
      root.querySelector('[data-item-path="src/utils/worker.ts"]')
    ).not.toBeNull();
    expect(root.querySelector('[data-item-path="README.md"]')).toBeNull();
  });

  test('search false keeps the printable-key open hotkey disabled', async () => {
    mounted = mountTree({
      fileTreeSearchMode: 'hide-non-matches',
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      paths: SEARCH_NAV_FILES,
      search: false,
      initialVisibleRowCount: 220 / 30,
    });
    await flushDom();
    const { model, root } = mounted;

    const firstButton = root.querySelector<HTMLButtonElement>(
      'button[data-type="item"]'
    );
    expect(firstButton).not.toBeNull();

    firstButton?.focus();
    pressKey(requireElement(firstButton, 'first button'), 'w');
    await flushDom();

    expect(model.isSearchOpen()).toBe(false);
    expect(model.getSearchValue()).toBe('');
    expect(root.querySelector('[data-file-tree-search-input]')).toBeNull();
    expect(root.querySelector('[data-item-path="README.md"]')).not.toBeNull();
  });

  test('search keeps input focus while ArrowDown updates the focused match', async () => {
    mounted = mountTree({
      fileTreeSearchMode: 'hide-non-matches',
      flattenEmptyDirectories: false,
      id: 'pst-search-focus-test',
      initialExpansion: 'open',
      paths: SEARCH_NAV_FILES,
      search: true,
      initialVisibleRowCount: 220 / 30,
    });
    await flushDom();
    const { root } = mounted;

    const firstButton = root.querySelector<HTMLButtonElement>(
      'button[data-type="item"]'
    );
    expect(firstButton).not.toBeNull();

    firstButton?.focus();
    pressKey(requireElement(firstButton, 'first button'), 'w');
    await flushDom();

    const searchInput = root.querySelector<HTMLInputElement>(
      'input[data-file-tree-search-input]'
    );
    expect(searchInput).not.toBeNull();
    expect(searchInput?.value).toBe('w');
    expect(document.activeElement).toBe(searchInput);

    const initialFocusedRow = root.querySelector<HTMLButtonElement>(
      'button[data-item-focused="true"]'
    );
    const initialActiveDescendant =
      searchInput?.getAttribute('aria-activedescendant') ?? null;
    expect(initialActiveDescendant).not.toBeNull();
    expect(initialFocusedRow?.id).toBe(initialActiveDescendant ?? undefined);

    pressKey(requireElement(searchInput, 'search input'), 'ArrowDown', {
      code: 'ArrowDown',
    });
    await flushDom();

    const nextFocusedRow = root.querySelector<HTMLButtonElement>(
      'button[data-item-focused="true"]'
    );
    const nextActiveDescendant =
      searchInput?.getAttribute('aria-activedescendant') ?? null;

    expect(document.activeElement).toBe(searchInput);
    expect(nextActiveDescendant).not.toBeNull();
    expect(nextFocusedRow?.id).toBe(nextActiveDescendant ?? undefined);
    expect(nextActiveDescendant).not.toBe(initialActiveDescendant);

    pressKey(requireElement(searchInput, 'search input'), 'ArrowUp', {
      code: 'ArrowUp',
    });
    await flushDom();

    const previousFocusedRow = root.querySelector<HTMLButtonElement>(
      'button[data-item-focused="true"]'
    );
    const previousActiveDescendant =
      searchInput?.getAttribute('aria-activedescendant') ?? null;
    expect(document.activeElement).toBe(searchInput);
    expect(previousFocusedRow?.id).toBe(initialActiveDescendant ?? undefined);
    expect(previousActiveDescendant).toBe(initialActiveDescendant);
  });

  test('Enter selects the focused search match and keeps search open', async () => {
    mounted = mountTree({
      fileTreeSearchMode: 'hide-non-matches',
      flattenEmptyDirectories: false,
      id: 'pst-search-submit-test',
      initialExpansion: 'open',
      paths: SEARCH_NAV_FILES,
      search: true,
      initialVisibleRowCount: 220 / 30,
    });
    await flushDom();
    const { model, root } = mounted;

    const firstButton = root.querySelector<HTMLButtonElement>(
      'button[data-type="item"]'
    );
    const searchInput = root.querySelector<HTMLInputElement>(
      'input[data-file-tree-search-input]'
    );
    expect(firstButton).not.toBeNull();
    expect(searchInput).not.toBeNull();

    firstButton?.focus();
    pressKey(requireElement(firstButton, 'first button'), 'w');
    await flushDom();

    setInputValue(requireElement(searchInput, 'search input'), 'worker');
    await flushDom();

    const focusedMatch = root.querySelector<HTMLButtonElement>(
      'button[data-item-focused="true"]'
    );
    const focusedPathBeforeSubmit =
      focusedMatch?.getAttribute('data-item-path') ?? null;
    expect(focusedPathBeforeSubmit).not.toBeNull();

    pressKey(requireElement(searchInput, 'search input'), 'Enter', {
      code: 'Enter',
    });
    await flushDom();

    expect(model.isSearchOpen()).toBe(true);
    expect(model.getSearchValue()).toBe('worker');
    expect(model.getSelectedPaths()).toEqual(
      focusedPathBeforeSubmit === null ? [] : [focusedPathBeforeSubmit]
    );
    const selectedRow = root.querySelector<HTMLButtonElement>(
      'button[data-item-selected="true"]'
    );
    expect(selectedRow?.getAttribute('data-item-path')).toBe(
      focusedPathBeforeSubmit
    );
    // Search stays open. Focus stays in the search input. Focus does not move
    // to the selected tree row.
    expect(document.activeElement).toBe(searchInput);
  });

  test('Enter after ArrowDown selects the navigated match and keeps search open', async () => {
    const manyWorkerFiles = [
      'README.md',
      ...Array.from({ length: 24 }, (_unused, index) => {
        return `src/utils/worker/match-${String(index)}.ts`;
      }),
    ];

    mounted = mountTree({
      fileTreeSearchMode: 'hide-non-matches',
      flattenEmptyDirectories: false,
      id: 'pst-search-enter-race-test',
      initialExpansion: 'open',
      overscan: 0,
      paths: manyWorkerFiles,
      search: true,
      initialVisibleRowCount: 44 / 30,
    });
    await flushDom();
    const { model, root } = mounted;

    const firstButton = root.querySelector<HTMLButtonElement>(
      'button[data-type="item"]'
    );
    const searchInput = root.querySelector<HTMLInputElement>(
      'input[data-file-tree-search-input]'
    );
    expect(firstButton).not.toBeNull();
    expect(searchInput).not.toBeNull();

    firstButton?.focus();
    pressKey(requireElement(firstButton, 'first button'), 'w');
    await flushDom();

    setInputValue(requireElement(searchInput, 'search input'), 'worker');
    await flushDom();

    pressKey(requireElement(searchInput, 'search input'), 'ArrowDown', {
      code: 'ArrowDown',
    });
    pressKey(requireElement(searchInput, 'search input'), 'Enter', {
      code: 'Enter',
    });
    await flushDom();
    await flushDom();

    const selectedRow = root.querySelector<HTMLButtonElement>(
      'button[data-item-selected="true"]'
    );
    expect(model.isSearchOpen()).toBe(true);
    expect(selectedRow).not.toBeNull();
    expect(selectedRow?.getAttribute('data-item-path')).toBe(
      'src/utils/worker/match-1.ts'
    );
    // Search stays open. Focus stays in the search input. Focus does not move
    // to the selected tree row.
    expect(document.activeElement).toBe(searchInput);
  });

  test('searchBlurBehavior retain keeps the initial query when the input blurs pre-interaction', async () => {
    mounted = mountTree({
      fileTreeSearchMode: 'hide-non-matches',
      flattenEmptyDirectories: false,
      id: 'pst-search-retain-test',
      initialExpansion: 'open',
      initialSearchQuery: 'worker',
      paths: FILES,
      search: true,
      searchBlurBehavior: 'retain',
      initialVisibleRowCount: 220 / 30,
    });
    await flushDom();
    const { model, root } = mounted;

    const searchInput = root.querySelector<HTMLInputElement>(
      'input[data-file-tree-search-input]'
    );
    expect(searchInput).not.toBeNull();
    expect(searchInput?.value).toBe('worker');
    expect(model.isSearchOpen()).toBe(true);

    // Simulate a blur that happens before any user interaction (e.g. the
    // sibling tree mount cascade stealing focus). The query must survive.
    searchInput?.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    await flushDom();

    expect(model.isSearchOpen()).toBe(true);
    expect(model.getSearchValue()).toBe('worker');

    // Once the user interacts (focus), a subsequent blur should close the
    // search the same way the default behavior does.
    searchInput?.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    await flushDom();
    searchInput?.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    await flushDom();

    expect(model.isSearchOpen()).toBe(false);
  });

  test('searchFakeFocus renders a synthetic focus attribute that dismisses on interaction', async () => {
    mounted = mountTree({
      fileTreeSearchMode: 'hide-non-matches',
      flattenEmptyDirectories: false,
      id: 'pst-search-fake-focus-test',
      initialExpansion: 'open',
      initialSearchQuery: 'worker',
      paths: FILES,
      search: true,
      searchBlurBehavior: 'retain',
      searchFakeFocus: true,
      initialVisibleRowCount: 220 / 30,
    });
    await flushDom();
    const { root } = mounted;

    const searchInput = root.querySelector<HTMLInputElement>(
      'input[data-file-tree-search-input]'
    );
    expect(searchInput).not.toBeNull();
    expect(
      searchInput?.getAttribute('data-file-tree-search-input-fake-focus')
    ).toBe('true');

    // Pointer-down on the input dismisses the synthetic ring. JSDOM doesn't
    // ship a PointerEvent constructor, so dispatch a generic bubbling event
    // with the right type.
    searchInput?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await flushDom();

    expect(
      searchInput?.getAttribute('data-file-tree-search-input-fake-focus')
    ).toBeNull();
  });
});
