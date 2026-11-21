import { afterEach, describe, expect, test } from 'vitest';

import {
  applyFileTreeGitStatusPatch,
  resolveFileTreeGitStatusState,
} from '../src/model/gitStatus';
import type { FileTreeOptions } from '../src/model/publicTypes';
import type { GitStatusEntry } from '../src/publicTypes';
import { isHTMLElementOfTag } from '../src/utils/domGuards';
import {
  flushDom,
  getScrollElement,
  renderFileTree,
} from './dnd-sticky-git-support';
import type { RenderedTree } from './dnd-sticky-git-support';

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

function getDecorationLabel(button: HTMLButtonElement): string | null {
  return (
    button
      .querySelector('[data-item-section="decoration"]')
      ?.textContent?.trim() ?? null
  );
}

function getGitLabel(button: HTMLButtonElement): string | null {
  return (
    button
      .querySelector('[data-item-section="git"] > span')
      ?.textContent?.trim() ?? null
  );
}

describe('file-tree git status', () => {
  test('later directory statuses clear stale ignored inheritance', () => {
    const state = resolveFileTreeGitStatusState([
      { path: 'src/', status: 'ignored' },
      { path: 'src/', status: 'modified' },
    ]);

    expect(state).not.toBeNull();
    expect(state?.statusByPath.get('src/')).toBe('modified');
    expect(state?.ignoredDirectoryPaths.has('src/')).toBe(false);
  });

  test('incremental patches update only changed status entries', () => {
    const initialState = resolveFileTreeGitStatusState([
      { path: 'src/index.ts', status: 'modified' },
      { path: 'src/components/Button.tsx', status: 'added' },
    ]);
    if (initialState === null) {
      throw new Error('expected initial git status state');
    }

    const noOpState = applyFileTreeGitStatusPatch(initialState, {
      set: [{ path: 'src/index.ts', status: 'modified' }],
    });
    expect(noOpState).toBe(initialState);

    const oneRemovedState = applyFileTreeGitStatusPatch(initialState, {
      remove: ['src/index.ts'],
    });
    if (oneRemovedState === null) {
      throw new Error('expected remaining git status state');
    }

    expect(oneRemovedState.statusByPath.has('src/index.ts')).toBe(false);
    expect(oneRemovedState.statusByPath.get('src/components/Button.tsx')).toBe(
      'added'
    );
    expect(oneRemovedState.directoriesWithChanges.has('src/')).toBe(true);
    expect(oneRemovedState.directoriesWithChanges.has('src/components/')).toBe(
      true
    );

    const emptyState = applyFileTreeGitStatusPatch(oneRemovedState, {
      remove: ['src/components/Button.tsx'],
    });
    expect(emptyState).toBeNull();
  });

  test('incremental patches update ignored directory status inheritance', () => {
    const initialState = resolveFileTreeGitStatusState([
      { path: 'src/', status: 'ignored' },
    ]);
    if (initialState === null) {
      throw new Error('expected initial git status state');
    }

    expect(initialState.ignoredDirectoryPaths.has('src/')).toBe(true);

    const modifiedState = applyFileTreeGitStatusPatch(initialState, {
      set: [{ path: 'src/', status: 'modified' }],
    });
    if (modifiedState === null) {
      throw new Error('expected modified git status state');
    }

    expect(modifiedState.statusByPath.get('src/')).toBe('modified');
    expect(modifiedState.ignoredDirectoryPaths.has('src/')).toBe(false);
    expect(modifiedState.directoriesWithChanges.has('src/')).toBe(false);

    const emptyState = applyFileTreeGitStatusPatch(modifiedState, {
      remove: ['src/'],
    });
    expect(emptyState).toBeNull();
  });

  test('renders markers for all supported file git statuses and folder change attrs', async () => {
    const { root } = await render({
      flattenEmptyDirectories: false,
      gitStatus: [
        { path: 'README.md', status: 'untracked' },
        { path: 'package.json', status: 'renamed' },
        { path: 'src/index.ts', status: 'modified' },
        { path: 'src/components/Button.tsx', status: 'added' },
        { path: 'src/components/Card.tsx', status: 'ignored' },
        { path: 'test/index.test.ts', status: 'deleted' },
      ],
      initialExpansion: 'open',
      paths: FILES,
      initialVisibleRowCount: 180 / 30,
    });

    const readmeButton = getItemButton(root, 'README.md');
    const packageButton = getItemButton(root, 'package.json');
    const indexButton = getItemButton(root, 'src/index.ts');
    const addedButton = getItemButton(root, 'src/components/Button.tsx');
    const ignoredButton = getItemButton(root, 'src/components/Card.tsx');
    const deletedButton = getItemButton(root, 'test/index.test.ts');
    const srcFolder = getItemButton(root, 'src/');

    expect(readmeButton.getAttribute('data-item-git-status')).toBe('untracked');
    expect(getGitLabel(readmeButton)).toBe('U');
    expect(packageButton.getAttribute('data-item-git-status')).toBe('renamed');
    expect(getGitLabel(packageButton)).toBe('R');
    expect(indexButton.getAttribute('data-item-git-status')).toBe('modified');
    expect(getGitLabel(indexButton)).toBe('M');
    expect(addedButton.getAttribute('data-item-git-status')).toBe('added');
    expect(getGitLabel(addedButton)).toBe('A');
    expect(ignoredButton.getAttribute('data-item-git-status')).toBe('ignored');
    expect(getGitLabel(ignoredButton)).toBeNull();
    expect(deletedButton.getAttribute('data-item-git-status')).toBe('deleted');
    expect(getGitLabel(deletedButton)).toBe('D');

    expect(srcFolder.getAttribute('data-item-contains-git-change')).toBe(
      'true'
    );
    expect(srcFolder.hasAttribute('data-item-git-status')).toBe(false);
    expect(
      srcFolder.querySelector(
        '[data-item-section="git"] [data-icon-name="file-tree-icon-dot"]'
      )
    ).not.toBeNull();
  });

  test('renders explicit ignored directory statuses without a descendant dot', async () => {
    const { root } = await render({
      flattenEmptyDirectories: false,
      gitStatus: [{ path: 'src/', status: 'ignored' }],
      initialExpansion: 'open',
      paths: FILES,
      initialVisibleRowCount: 180 / 30,
    });

    const srcFolder = getItemButton(root, 'src/');
    expect(srcFolder.getAttribute('data-item-git-status')).toBe('ignored');
    expect(srcFolder.getAttribute('data-item-contains-git-change')).toBeNull();
    expect(getGitLabel(srcFolder)).toBeNull();
    expect(
      srcFolder.querySelector(
        '[data-item-section="git"] [data-icon-name="file-tree-icon-dot"]'
      )
    ).toBeNull();
  });

  test('ignored directories tint descendants unless a child has its own status', async () => {
    const { root } = await render({
      flattenEmptyDirectories: false,
      gitStatus: [
        { path: 'src/', status: 'ignored' },
        { path: 'src/index.ts', status: 'modified' },
      ],
      initialExpansion: 'open',
      paths: FILES,
      initialVisibleRowCount: 180 / 30,
    });

    const srcFolder = getItemButton(root, 'src/');
    const cardButton = getItemButton(root, 'src/components/Card.tsx');
    const workerButton = getItemButton(root, 'src/utils/worker.ts');
    const indexButton = getItemButton(root, 'src/index.ts');

    expect(srcFolder.getAttribute('data-item-git-status')).toBe('ignored');
    expect(getGitLabel(srcFolder)).toBeNull();
    expect(cardButton.getAttribute('data-item-git-status')).toBe('ignored');
    expect(getGitLabel(cardButton)).toBeNull();
    expect(workerButton.getAttribute('data-item-git-status')).toBe('ignored');
    expect(getGitLabel(workerButton)).toBeNull();
    expect(indexButton.getAttribute('data-item-git-status')).toBe('modified');
    expect(getGitLabel(indexButton)).toBe('M');
  });

  test('unknown leaf paths still mark known ancestor folders as changed', async () => {
    const { root } = await render({
      flattenEmptyDirectories: false,
      gitStatus: [{ path: 'src/new-file.ts', status: 'added' }],
      initialExpansion: 'open',
      paths: FILES,
      initialVisibleRowCount: 180 / 30,
    });

    const srcFolder = getItemButton(root, 'src/');
    expect(srcFolder.getAttribute('data-item-contains-git-change')).toBe(
      'true'
    );
    expect(
      srcFolder.querySelector(
        '[data-item-section="git"] [data-icon-name="file-tree-icon-dot"]'
      )
    ).not.toBeNull();
  });

  test('flattened rows mark the rendered terminal directory instead of inventing a file status', async () => {
    const { root } = await render({
      flattenEmptyDirectories: true,
      gitStatus: [{ path: 'src/lib/util.ts', status: 'modified' }],
      initialExpandedPaths: ['src/'],
      paths: ['src/lib/util.ts'],
      initialVisibleRowCount: 120 / 30,
    });

    const flattenedFolder = getItemButton(root, 'src/lib/');

    expect(flattenedFolder.getAttribute('data-item-contains-git-change')).toBe(
      'true'
    );
    expect(flattenedFolder.hasAttribute('data-item-git-status')).toBe(false);
    expect(
      flattenedFolder.querySelector(
        '[data-item-section="git"] [data-icon-name="file-tree-icon-dot"]'
      )
    ).not.toBeNull();
  });

  test('folder change dots keep the legacy 6px size and respect dot icon remaps', async () => {
    const { root } = await render({
      flattenEmptyDirectories: false,
      gitStatus: [{ path: 'src/index.ts', status: 'modified' }],
      icons: {
        remap: {
          'file-tree-icon-dot': 'pst-test-dot',
        },
        spriteSheet:
          '<svg data-icon-sprite aria-hidden="true" width="0" height="0"><symbol id="pst-test-dot" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="currentColor" /></symbol></svg>',
      },
      initialExpansion: 'open',
      paths: FILES,
      initialVisibleRowCount: 180 / 30,
    });

    const srcFolder = getItemButton(root, 'src/');
    const dotIcon = srcFolder.querySelector(
      '[data-item-section="git"] [data-icon-name="file-tree-icon-dot"]'
    );
    expect(dotIcon?.getAttribute('width')).toBe('6');
    expect(dotIcon?.getAttribute('height')).toBe('6');
    expect(dotIcon?.querySelector('use')?.getAttribute('href')).toBe(
      '#pst-test-dot'
    );
  });

  // Upstream asserts the `[data-file-tree-virtualized-wrapper]` element is
  // reused; the Solid view has no such wrapper, so the equivalent is that the
  // tree root and the scroll container keep their identity across updates.
  test('setGitStatus refreshes decorations even when the caller reuses the same array reference', async () => {
    const runtimeStatuses: Array<GitStatusEntry> = [
      { path: 'src/index.ts', status: 'modified' },
    ];
    const { model, root } = await render({
      flattenEmptyDirectories: false,
      gitStatus: runtimeStatuses,
      initialExpansion: 'open',
      paths: FILES,
      initialVisibleRowCount: 180 / 30,
    });

    const scrollBefore = getScrollElement(root);
    expect(
      getItemButton(root, 'src/index.ts').getAttribute('data-item-git-status')
    ).toBe('modified');

    runtimeStatuses[0] = { path: 'README.md', status: 'added' };
    model.setGitStatus(runtimeStatuses);
    await flushDom();

    expect(
      root
        .querySelector('[data-item-path="src/index.ts"]')
        ?.getAttribute('data-item-git-status')
    ).toBeNull();
    expect(
      getItemButton(root, 'README.md').getAttribute('data-item-git-status')
    ).toBe('added');
    expect(getScrollElement(root)).toBe(scrollBefore);

    model.setGitStatus(undefined);
    await flushDom();

    expect(root.querySelector('[data-item-git-status]')).toBeNull();
    expect(
      root.querySelector('[data-item-contains-git-change="true"]')
    ).toBeNull();
  });

  test('applyGitStatusPatch refreshes decorations without replacing the tree wrapper', async () => {
    const { model, root, host } = await render({
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      paths: FILES,
      initialVisibleRowCount: 180 / 30,
    });

    const scrollBefore = getScrollElement(root);

    model.applyGitStatusPatch({
      set: [
        { path: 'src/index.ts', status: 'modified' },
        { path: 'src/components/Button.tsx', status: 'added' },
      ],
    });
    await flushDom();

    expect(
      getItemButton(root, 'src/index.ts').getAttribute('data-item-git-status')
    ).toBe('modified');
    expect(
      getItemButton(root, 'src/components/Button.tsx').getAttribute(
        'data-item-git-status'
      )
    ).toBe('added');
    expect(
      getItemButton(root, 'src/').getAttribute('data-item-contains-git-change')
    ).toBe('true');

    model.applyGitStatusPatch({ remove: ['src/index.ts'] });
    await flushDom();

    expect(
      getItemButton(root, 'src/index.ts').getAttribute('data-item-git-status')
    ).toBeNull();
    expect(
      getItemButton(root, 'src/').getAttribute('data-item-contains-git-change')
    ).toBe('true');

    model.applyGitStatusPatch({ remove: ['src/components/Button.tsx'] });
    await flushDom();

    expect(root.querySelector('[data-item-git-status]')).toBeNull();
    expect(
      getItemButton(root, 'src/').getAttribute('data-item-contains-git-change')
    ).toBeNull();
    expect(getScrollElement(root)).toBe(scrollBefore);
    expect(host.querySelector('[role="tree"]')).toBe(root);
  });

  test('custom row decorations and git status render in separate lanes', async () => {
    const { root } = await render({
      flattenEmptyDirectories: false,
      gitStatus: [{ path: 'src/index.ts', status: 'modified' }],
      initialExpansion: 'open',
      paths: FILES,
      renderRowDecoration: ({ item }) =>
        item.path === 'src/index.ts'
          ? { text: 'TS', title: 'TypeScript file' }
          : null,
      initialVisibleRowCount: 180 / 30,
    });

    const indexButton = getItemButton(root, 'src/index.ts');
    expect(indexButton.getAttribute('data-item-git-status')).toBe('modified');
    expect(getDecorationLabel(indexButton)).toBe('TS');
    expect(getGitLabel(indexButton)).toBe('M');
    expect(
      indexButton.querySelector('[data-item-section="decoration"]')
    ).not.toBeNull();
    expect(
      indexButton.querySelector('[data-item-section="git"]')
    ).not.toBeNull();
  });

  // Upstream: "preload and hydrate preserve git-status attrs without
  // duplicating the SSR wrapper". SSR/hydrate are dropped; the client-render
  // equivalent asserts the same attrs render exactly once under an explicit id.
  test('client render with an explicit id renders git-status attrs exactly once', async () => {
    const { root, host } = await render({
      flattenEmptyDirectories: false,
      gitStatus: [{ path: 'src/index.ts', status: 'renamed' as const }],
      id: 'pst-git-status-ssr',
      initialExpansion: 'open' as const,
      paths: FILES,
      initialVisibleRowCount: 180 / 30,
    });

    expect(
      host.querySelectorAll('[data-file-tree-virtualized-root]').length
    ).toBe(1);
    expect(
      root.querySelectorAll('[data-item-path="src/index.ts"]').length
    ).toBe(1);
    expect(
      getItemButton(root, 'src/index.ts').getAttribute('data-item-git-status')
    ).toBe('renamed');
    expect(
      getItemButton(root, 'src/').getAttribute('data-item-contains-git-change')
    ).toBe('true');
  });
});
