import { afterEach, describe, expect, test } from 'vitest';

import { isHTMLElementOfTag } from '../src/utils/domGuards';
import {
  flushDom,
  getItemButton,
  getItemRow,
  getScrollElement,
  pressKey,
  setInputValue,
} from './dom-helpers-search-rename-menu';
import { mountTree } from './helpers';
import type { MountedTree } from './helpers';

function getRenameInput(
  root: ParentNode,
  flattened: boolean = false
): HTMLInputElement {
  const selector = flattened
    ? '[data-item-flattened-rename-input]'
    : '[data-item-rename-input]';
  const input = root.querySelector(selector);
  if (!isHTMLElementOfTag(input, 'input')) {
    throw new Error(`Expected rename input for selector ${selector}`);
  }

  return input;
}

function getStickyRowButton(root: ParentNode, path: string): HTMLButtonElement {
  const button = root.querySelector(`[data-file-tree-sticky-path="${path}"]`);
  if (!isHTMLElementOfTag(button, 'button')) {
    throw new Error(`Expected sticky row for ${path}`);
  }

  return button;
}

function getSearchInput(root: ParentNode): HTMLInputElement {
  const input = root.querySelector('input[data-file-tree-search-input]');
  if (!isHTMLElementOfTag(input, 'input')) {
    throw new Error('Expected built-in search input');
  }

  return input;
}

let mounted: MountedTree | null = null;
afterEach(() => {
  mounted?.dispose();
  mounted = null;
});

describe('file-tree renaming', () => {
  test('F2 starts inline rename and Enter commits while preserving focus and selection', async () => {
    const renameEvents: Array<{
      destinationPath: string;
      isFolder: boolean;
      sourcePath: string;
    }> = [];

    mounted = mountTree({
      initialExpansion: 'open',
      paths: ['README.md', 'src/index.ts'],
      initialVisibleRowCount: 240 / 30,
      renaming: {
        onRename: (event) => {
          renameEvents.push(event);
        },
      },
    });
    await flushDom();
    const { model, root } = mounted;

    const readmeButton = getItemButton(root, 'README.md');
    readmeButton.click();
    readmeButton.focus();
    await flushDom();

    pressKey(readmeButton, 'F2');
    await flushDom();

    const renameInput = getRenameInput(root);
    expect(renameInput.value).toBe('README.md');

    setInputValue(renameInput, 'RENAMED.md');
    pressKey(renameInput, 'Enter');
    await flushDom(3);

    expect(renameEvents).toEqual([
      {
        destinationPath: 'RENAMED.md',
        isFolder: false,
        sourcePath: 'README.md',
      },
    ]);
    expect(model.getItem('RENAMED.md')).not.toBeNull();

    const renamedButton = getItemButton(root, 'RENAMED.md');
    expect(renamedButton.dataset.itemSelected).toBe('true');
  });

  test('Escape cancels inline rename and blur commits it', async () => {
    const renameEvents: Array<string> = [];

    mounted = mountTree({
      initialExpansion: 'open',
      paths: ['README.md', 'src/index.ts'],
      initialVisibleRowCount: 240 / 30,
      renaming: {
        onRename: (event) => {
          renameEvents.push(`${event.sourcePath}->${event.destinationPath}`);
        },
      },
    });
    await flushDom();
    const { model, root } = mounted;

    const readmeButton = getItemButton(root, 'README.md');
    readmeButton.click();
    readmeButton.focus();
    await flushDom();
    pressKey(readmeButton, 'F2');
    await flushDom();

    const escapeInput = getRenameInput(root);
    pressKey(escapeInput, 'Escape');
    await flushDom();
    expect(root.querySelector('[data-item-rename-input]')).toBeNull();
    expect(renameEvents).toEqual([]);

    const readmeButtonAfterEscape = getItemButton(root, 'README.md');
    pressKey(readmeButtonAfterEscape, 'F2');
    await flushDom();
    const blurInput = getRenameInput(root);
    setInputValue(blurInput, 'README-BLUR.md');
    blurInput.dispatchEvent(new FocusEvent('blur'));
    await flushDom();

    expect(root.querySelector('[data-item-rename-input]')).toBeNull();
    expect(renameEvents).toEqual(['README.md->README-BLUR.md']);
    expect(model.getItem('README-BLUR.md')).not.toBeNull();
  });

  test('search-open rename handoff closes search and keeps the focused result anchored', async () => {
    const searchChanges: Array<string | null> = [];

    mounted = mountTree({
      fileTreeSearchMode: 'hide-non-matches',
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      onSearchChange: (value) => {
        searchChanges.push(value);
      },
      paths: [
        'README.md',
        'src/index.ts',
        'src/utils/worker.ts',
        'src/utils/stream.ts',
      ],
      renaming: true,
      search: true,
      initialVisibleRowCount: 240 / 30,
    });
    await flushDom();
    const { model, root } = mounted;

    const firstRow = getItemButton(root, 'README.md');
    firstRow.click();
    firstRow.focus();
    await flushDom();
    pressKey(firstRow, 'w');
    await flushDom();

    const searchInput = getSearchInput(root);

    setInputValue(searchInput, 'worker');
    await flushDom();
    expect(root.querySelector('[data-item-path="README.md"]')).toBeNull();
    expect(model.getSelectedPaths()).toEqual(['README.md']);

    pressKey(searchInput, 'F2');
    await flushDom(3);

    const renameInput = getRenameInput(root);
    expect(renameInput.value).toBe('worker.ts');
    expect(searchInput.value).toBe('');
    expect(getItemButton(root, 'README.md')).toBeDefined();
    expect(model.getSelectedPaths()).toEqual(['src/utils/worker.ts']);
    expect(searchChanges).toEqual(['w', 'worker', null]);
  });

  test('context-menu rename closes the menu and focuses the inline input without blur-cancel churn', async () => {
    mounted = mountTree(
      {
        composition: {
          contextMenu: {
            enabled: true,
          },
        },
        initialExpansion: 'open',
        paths: ['README.md', 'src/index.ts'],
        initialVisibleRowCount: 240 / 30,
        renaming: true,
      },
      {
        renderContextMenu: (item, context) => (
          <div data-test-context-menu="true">
            <button
              type="button"
              data-test-menu-rename={item.path}
              onClick={() => {
                context.close({ restoreFocus: false });
                mounted?.model.startRenaming(item.path);
                queueMicrotask(() => {
                  context.close();
                  context.restoreFocus();
                });
              }}
            >
              Rename
            </button>
          </div>
        ),
      }
    );
    await flushDom();
    const { root } = mounted;

    const indexButton = getItemButton(root, 'src/index.ts');
    indexButton.click();
    await flushDom();
    indexButton.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
      })
    );
    await flushDom(3);

    const menuButton = root.querySelector(
      '[data-test-menu-rename="src/index.ts"]'
    );
    if (!isHTMLElementOfTag(menuButton, 'button')) {
      throw new Error('Expected context-menu rename button');
    }

    menuButton.click();
    await flushDom(4);

    expect(root.querySelector('[data-test-context-menu="true"]')).toBeNull();
    const renameInput = getRenameInput(root);
    expect(renameInput.value).toBe('index.ts');
  });

  test('sticky-row rename handoff reveals the canonical row input and focuses it', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: false,
      initialExpandedPaths: ['aaa/', 'bbb/', 'src/lib/'],
      paths: ['aaa/one.ts', 'bbb/two.ts', 'src/index.ts', 'src/lib/util.ts'],
      stickyFolders: true,
      initialVisibleRowCount: 60 / 30,
      renaming: true,
    });
    await flushDom();
    const { model, root } = mounted;

    const scrollElement = getScrollElement(root);

    const utilButton = getItemButton(root, 'src/lib/util.ts');
    utilButton.click();
    utilButton.focus();
    await flushDom();
    expect(model.getSelectedPaths()).toEqual(['src/lib/util.ts']);

    scrollElement.scrollTop = 149;
    scrollElement.dispatchEvent(new Event('scroll'));
    await flushDom();

    const stickyButton = getStickyRowButton(root, 'src/lib/');
    expect(stickyButton.dataset.fileTreeStickyPath).toBe('src/lib/');
    expect(() => getItemButton(root, 'src/lib/')).toThrow();

    expect(model.startRenaming('src/lib/')).toBe(true);
    await flushDom(4);
    expect(scrollElement.scrollTop).toBe(90);
    const renameInput = getRenameInput(root);
    const renameRow = getItemRow(root, 'src/lib/');
    expect(renameInput.value).toBe('lib');
    expect(renameRow.querySelector('[data-item-rename-input]')).toBe(
      renameInput
    );
    expect(renameRow.getAttribute('data-file-tree-sticky-row')).toBeNull();
    expect(document.activeElement).toBe(renameInput);
    expect(renameInput.selectionStart).toBe(0);
    expect(renameInput.selectionEnd).toBe('lib'.length);
    expect(model.getFocusedPath()).toBe('src/lib/');
    expect(model.getSelectedPaths()).toEqual(['src/lib/']);
  });

  test('starting rename on a path under a collapsed ancestor expands the chain so the input can mount', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: false,
      initialExpandedPaths: ['src/'],
      paths: ['src/components/Button.tsx', 'src/index.ts'],
      initialVisibleRowCount: 240 / 30,
      renaming: true,
    });
    const { model, root } = mounted;

    const componentsItem = model.getItem('src/components/');
    if (
      componentsItem === null ||
      componentsItem.isDirectory() !== true ||
      !('isExpanded' in componentsItem)
    ) {
      throw new Error('expected src/components directory item');
    }

    expect(componentsItem.isExpanded()).toBe(false);

    await flushDom();

    model.add('src/components/new.ts');
    expect(model.startRenaming('src/components/new.ts')).toBe(true);
    await flushDom(4);

    // The ancestor directory must be expanded for the new row to render
    // its rename input. Without this, the rename handoff effect would spin
    // trying to reveal a row that can never mount inside a collapsed
    // branch.
    expect(componentsItem.isExpanded()).toBe(true);

    const renameInput = getRenameInput(root);
    expect(renameInput.value).toBe('new.ts');
    const renameRow = getItemRow(root, 'src/components/new.ts');
    expect(renameRow.querySelector('[data-item-rename-input]')).toBe(
      renameInput
    );
    expect(model.getFocusedPath()).toBe('src/components/new.ts');
    expect(model.getSelectedPaths()).toEqual(['src/components/new.ts']);
  });

  test('flattened leaf rename renders input only on the terminal segment and commits a folder rename', async () => {
    const renameEvents: Array<{
      destinationPath: string;
      isFolder: boolean;
      sourcePath: string;
    }> = [];

    mounted = mountTree({
      flattenEmptyDirectories: true,
      initialExpansion: 'open',
      paths: ['src/utils/deep/index.ts'],
      initialVisibleRowCount: 240 / 30,
      renaming: {
        onRename: (event) => {
          renameEvents.push(event);
        },
      },
    });
    await flushDom();
    const { model, root } = mounted;

    const flattenedButton = Array.from(
      root.querySelectorAll('button[data-type="item"][data-item-type="folder"]')
    ).find(
      (button): button is HTMLButtonElement =>
        isHTMLElementOfTag(button, 'button') &&
        button.querySelector('[data-item-flattened-subitems]') !== null
    );
    if (flattenedButton === undefined) {
      throw new Error('Expected flattened folder row');
    }

    flattenedButton.click();
    flattenedButton.focus();
    pressKey(flattenedButton, 'F2');
    await flushDom(3);

    const renameInput = getRenameInput(root, true);
    expect(renameInput.value).toBe('deep');
    const flattenedContainer = renameInput.closest(
      '[data-item-flattened-subitems]'
    );
    if (flattenedContainer === null) {
      throw new Error('Expected flattened segments container');
    }

    const segments = flattenedContainer.querySelectorAll(
      '[data-item-flattened-subitem]'
    );
    expect(segments.length).toBeGreaterThan(1);
    expect(
      segments.item(0)?.querySelector('[data-item-rename-input]')
    ).toBeNull();
    expect(
      segments
        .item(segments.length - 1)
        ?.querySelector('[data-item-rename-input]')
    ).toBe(renameInput);

    setInputValue(renameInput, 'renamed');
    pressKey(renameInput, 'Enter');
    await flushDom(3);

    expect(renameEvents).toEqual([
      {
        destinationPath: 'src/utils/renamed',
        isFolder: true,
        sourcePath: 'src/utils/deep',
      },
    ]);
    expect(model.getItem('src/utils/renamed')).not.toBeNull();
    expect(model.getItem('src/utils/deep')).toBeNull();
  });

  test('collision and invalid-name errors close rename and surface parity errors', async () => {
    const renameErrors: Array<string> = [];

    mounted = mountTree({
      initialExpansion: 'open',
      paths: ['README.md', 'src/index.ts', 'src/utils.ts'],
      initialVisibleRowCount: 240 / 30,
      renaming: {
        onError: (error) => {
          renameErrors.push(error);
        },
      },
    });
    await flushDom();
    const { model, root } = mounted;

    const indexButton = getItemButton(root, 'src/index.ts');
    indexButton.click();
    indexButton.focus();
    await flushDom();
    pressKey(indexButton, 'F2');
    await flushDom();

    const collisionInput = getRenameInput(root);
    setInputValue(collisionInput, 'utils.ts');
    pressKey(collisionInput, 'Enter');
    await flushDom();

    const indexButtonAfterCollision = getItemButton(root, 'src/index.ts');
    pressKey(indexButtonAfterCollision, 'F2');
    await flushDom();
    const invalidInput = getRenameInput(root);
    setInputValue(invalidInput, 'nested/name.ts');
    pressKey(invalidInput, 'Enter');
    await flushDom();

    expect(renameErrors).toEqual([
      '"src/utils.ts" already exists.',
      'Name cannot include "/".',
    ]);
    expect(root.querySelector('[data-item-rename-input]')).toBeNull();
    expect(model.getItem('src/index.ts')).not.toBeNull();
  });

  test('Enter during IME composition confirms the candidate without committing the rename', async () => {
    const renameEvents: Array<{
      destinationPath: string;
      isFolder: boolean;
      sourcePath: string;
    }> = [];

    mounted = mountTree({
      initialExpansion: 'open',
      paths: ['README.md', 'src/index.ts'],
      initialVisibleRowCount: 240 / 30,
      renaming: {
        onRename: (event) => {
          renameEvents.push(event);
        },
      },
    });
    await flushDom();
    const { model, root } = mounted;

    const readmeButton = getItemButton(root, 'README.md');
    readmeButton.click();
    readmeButton.focus();
    await flushDom();

    pressKey(readmeButton, 'F2');
    await flushDom();

    const renameInput = getRenameInput(root);
    // Simulate the input value held mid-composition (e.g. a partial pinyin
    // string) as the IME candidate menu is confirmed with Enter.
    setInputValue(renameInput, 'shu');
    pressKey(renameInput, 'Enter', { isComposing: true });
    await flushDom(3);

    // The IME-confirming Enter must not commit; the rename input stays open.
    expect(renameEvents).toEqual([]);
    expect(root.querySelector('[data-item-rename-input]')).not.toBeNull();

    // Older browsers surface composition via keyCode 229 rather than
    // isComposing; that Enter must be ignored too.
    pressKey(renameInput, 'Enter', { keyCode: 229 });
    await flushDom(3);
    expect(renameEvents).toEqual([]);
    expect(root.querySelector('[data-item-rename-input]')).not.toBeNull();

    // Once composition ends, a real Enter commits the finalized value.
    const finalizedInput = getRenameInput(root);
    setInputValue(finalizedInput, '文档.md');
    pressKey(finalizedInput, 'Enter');
    await flushDom(3);

    expect(renameEvents).toEqual([
      {
        destinationPath: '文档.md',
        isFolder: false,
        sourcePath: 'README.md',
      },
    ]);
    expect(root.querySelector('[data-item-rename-input]')).toBeNull();
    expect(model.getItem('文档.md')).not.toBeNull();
  });
});
