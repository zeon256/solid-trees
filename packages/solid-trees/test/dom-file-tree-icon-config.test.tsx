import { afterEach, describe, expect, test } from 'vitest';

import type { FileTreeOptions } from '../src/model/publicTypes';
import { isHTMLElementOfTag } from '../src/utils/domGuards';
import {
  flushDom,
  getIconSymbolName,
  renderFileTree,
} from './dnd-sticky-git-support';
import type { RenderedTree } from './dnd-sticky-git-support';

let rendered: RenderedTree | null = null;

async function render(options: FileTreeOptions): Promise<RenderedTree> {
  rendered = await renderFileTree(options);
  return rendered;
}

afterEach(() => {
  rendered?.cleanup();
  rendered = null;
});

function getItemButton(root: HTMLElement, path: string): HTMLButtonElement {
  const button = root.querySelector(`[data-item-path="${path}"]`);
  if (!isHTMLElementOfTag(button, 'button')) {
    throw new Error(`missing button for ${path}`);
  }
  return button;
}

const GENERIC_FILE_SPRITE =
  '<svg data-icon-sprite aria-hidden="true" width="0" height="0"><symbol id="pst-test-generic-file" viewBox="0 0 16 16"><rect width="16" height="16" fill="currentColor" /></symbol></svg>';
const README_SPRITE =
  '<svg data-icon-sprite aria-hidden="true" width="0" height="0"><symbol id="pst-test-readme" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="currentColor" /></symbol></svg>';

// Two trees whose custom sheets define the same symbol id with different art.
function collidingSpriteOptions(
  shape: string,
  set: 'minimal' | 'complete'
): FileTreeOptions {
  return {
    icons: {
      set,
      byFileName: { 'readme.md': 'pst-test-shared' },
      spriteSheet: `<svg data-icon-sprite aria-hidden="true" width="0" height="0"><symbol id="pst-test-shared" viewBox="0 0 16 16">${shape}</symbol></svg>`,
    },
    initialExpansion: 'open',
    paths: ['README.md', 'src/index.ts'],
    initialVisibleRowCount: 120 / 30,
  };
}

describe('file-tree icon config', () => {
  // Upstream: "preloadFileTree includes custom sprite sheets and colored icon
  // attrs". preloadFileTree is dropped; the client-render equivalent asserts the
  // same markup (custom sprite sheet + colored-icons attr on the tree root).
  test('rendered tree includes custom sprite sheets and colored icon attrs', async () => {
    const { root } = await render({
      flattenEmptyDirectories: true,
      icons: {
        set: 'complete',
        colored: true,
        spriteSheet: README_SPRITE,
      },
      initialExpansion: 'open',
      paths: ['README.md', 'src/index.ts'],
      initialVisibleRowCount: 120 / 30,
    });

    expect(root.innerHTML).toContain('pst-test-readme');
    expect(root.getAttribute('data-file-tree-colored-icons')).toBe('true');
  });

  test('renders file icon remaps by file name', async () => {
    const { root } = await render({
      flattenEmptyDirectories: true,
      icons: {
        byFileName: {
          'readme.md': 'pst-test-readme',
        },
        spriteSheet: README_SPRITE,
      },
      initialExpansion: 'open',
      paths: ['README.md', 'src/index.ts'],
      initialVisibleRowCount: 120 / 30,
    });

    const readmeButton = getItemButton(root, 'README.md');

    expect(getIconSymbolName(root, readmeButton)).toBe('pst-test-readme');
  });

  test('falls back to built-in file icon tiers when overrides are absent', async () => {
    const { root } = await render({
      flattenEmptyDirectories: true,
      initialExpansion: 'open',
      paths: ['README.md', 'src/index.ts'],
      initialVisibleRowCount: 120 / 30,
    });

    const readmeButton = getItemButton(root, 'README.md');
    const symbolName = getIconSymbolName(root, readmeButton) ?? '';

    expect(symbolName.startsWith('file-tree-builtin-')).toBe(true);
  });

  test('remap[file-tree-icon-file] overrides the default built-in fallback when set is complete', async () => {
    const { root } = await render({
      flattenEmptyDirectories: true,
      icons: {
        set: 'complete',
        spriteSheet: GENERIC_FILE_SPRITE,
        remap: {
          'file-tree-icon-file': 'pst-test-generic-file',
        },
      },
      initialExpansion: 'open',
      paths: ['unknown.xyz', 'src/index.ts'],
      initialVisibleRowCount: 120 / 30,
    });

    // Unknown extension has no specific built-in token — remap should win
    // over the generic 'default' fallback.
    const unknownButton = getItemButton(root, 'unknown.xyz');
    expect(getIconSymbolName(root, unknownButton)).toBe(
      'pst-test-generic-file'
    );

    // Known extension has a specific built-in token — remap must not
    // override it.
    const tsButton = getItemButton(root, 'src/index.ts');
    expect(getIconSymbolName(root, tsButton)).toBe(
      'file-tree-builtin-typescript'
    );
  });

  test('remap[file-tree-icon-file] overrides the default built-in fallback when set is standard', async () => {
    const { root } = await render({
      flattenEmptyDirectories: true,
      icons: {
        set: 'standard',
        spriteSheet: GENERIC_FILE_SPRITE,
        remap: {
          'file-tree-icon-file': 'pst-test-generic-file',
        },
      },
      initialExpansion: 'open',
      paths: ['unknown.xyz', 'src/index.ts'],
      initialVisibleRowCount: 120 / 30,
    });

    // Unknown extension resolves to the generic 'default' token in the
    // standard tier as well — remap must win over that placeholder.
    const unknownButton = getItemButton(root, 'unknown.xyz');
    expect(getIconSymbolName(root, unknownButton)).toBe(
      'pst-test-generic-file'
    );

    // A known standard-tier extension keeps its specific built-in token.
    const tsButton = getItemButton(root, 'src/index.ts');
    expect(getIconSymbolName(root, tsButton)).toBe(
      'file-tree-builtin-typescript'
    );
  });

  test('remap[file-tree-icon-file] remains the fallback when set is minimal', async () => {
    const { root } = await render({
      flattenEmptyDirectories: true,
      icons: {
        set: 'minimal',
        spriteSheet: GENERIC_FILE_SPRITE,
        remap: {
          'file-tree-icon-file': 'pst-test-generic-file',
        },
      },
      initialExpansion: 'open',
      paths: ['unknown.xyz', 'src/index.ts'],
      initialVisibleRowCount: 120 / 30,
    });

    // The minimal set never resolves a built-in file token, so every file
    // falls through to remap['file-tree-icon-file'].
    const unknownButton = getItemButton(root, 'unknown.xyz');
    expect(getIconSymbolName(root, unknownButton)).toBe(
      'pst-test-generic-file'
    );

    const tsButton = getItemButton(root, 'src/index.ts');
    expect(getIconSymbolName(root, tsButton)).toBe('pst-test-generic-file');
  });

  test('setIcons swaps icon modes without resetting expanded state', async () => {
    const { model, root } = await render({
      flattenEmptyDirectories: false,
      icons: 'complete',
      initialExpansion: 'open',
      paths: ['README.md', 'src/index.ts', 'src/lib/utils.ts'],
      initialVisibleRowCount: 120 / 30,
    });

    const directoryItem = model.getItem('src');
    if (
      directoryItem === null ||
      directoryItem.isDirectory() !== true ||
      !('collapse' in directoryItem)
    ) {
      throw new Error('expected src directory handle');
    }

    directoryItem.collapse();
    await flushDom();

    expect(root.querySelector('[data-item-path="src/index.ts"]')).toBeNull();

    model.setIcons({
      byFileName: {
        'readme.md': 'pst-test-readme',
      },
      spriteSheet: README_SPRITE,
    });
    await flushDom();

    expect(root.querySelector('[data-item-path="src/index.ts"]')).toBeNull();

    const readmeButton = getItemButton(root, 'README.md');
    expect(getIconSymbolName(root, readmeButton)).toBe('pst-test-readme');
  });

  // Upstream: "hydrate reuses the existing SSR wrapper when the tree id
  // matches". Hydration is dropped; the client-render equivalent asserts that a
  // tree mounted with an explicit id renders a single root and a single row.
  test('client render with an explicit id renders one root and one row per path', async () => {
    const { host, root } = await render({
      flattenEmptyDirectories: true,
      icons: 'complete',
      id: 'pst-hydrate-icons',
      initialExpansion: 'open',
      paths: ['README.md', 'src/index.ts', 'src/lib/utils.ts'],
      initialVisibleRowCount: 120 / 30,
    });

    expect(
      host.querySelectorAll('[data-file-tree-virtualized-root]').length
    ).toBe(1);
    expect(root.querySelectorAll('[data-item-path="README.md"]').length).toBe(
      1
    );
  });

  // Light DOM: every tree mounts its sprite into the same document id
  // namespace, so trees with different sheets must not share symbol ids.
  test('trees with conflicting sprite sheets resolve their own symbols', async () => {
    const first = await render(
      collidingSpriteOptions('<rect width="16" height="16" />', 'minimal')
    );
    const second = await renderFileTree(
      collidingSpriteOptions('<circle cx="8" cy="8" r="7" />', 'complete')
    );

    try {
      for (const [tree, shape] of [
        [first, 'rect'],
        [second, 'circle'],
      ] as const) {
        const href =
          getItemButton(tree.root, 'README.md')
            .querySelector('use')
            ?.getAttribute('href') ?? '';
        const symbol = document.getElementById(href.slice(1));
        expect(symbol?.closest('[data-file-tree-virtualized-root]')).toBe(
          tree.root
        );
        expect(symbol?.querySelector(shape)).not.toBeNull();
        expect(
          getIconSymbolName(tree.root, getItemButton(tree.root, 'README.md'))
        ).toBe('pst-test-shared');
      }

      const symbolIds = Array.from(
        document.querySelectorAll('[data-file-tree-sprite] symbol'),
        (symbol) => symbol.getAttribute('id')
      );
      expect(new Set(symbolIds).size).toBe(symbolIds.length);
    } finally {
      second.cleanup();
    }
  });
});
