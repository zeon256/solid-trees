import { afterEach, describe, expect, test } from 'vitest';

import type { FileTreeLabelsOption } from '../src/model/publicTypes';
import { DEFAULT_FILE_TREE_LABELS } from '../src/utils/fileTreeLabels';
import { flushDom } from './dom-helpers-search-rename-menu';
import { mountTree } from './helpers';
import type { MountedTree } from './helpers';

const FILES = ['README.md', 'src/index.ts', 'src/utils/worker.ts'] as const;

const FRENCH_LABELS: FileTreeLabelsOption = {
  searchPlaceholder: 'Rechercher…',
  gitStatusTitles: {
    modified: 'Statut git : modifie',
    untracked: 'Statut git : non suivi',
  },
  containsGitStatusTitle: 'Contient des modifications git',
};

function getGitTitle(root: ParentNode, path: string): string | null {
  return (
    root
      .querySelector(
        `[data-item-path="${path}"] [data-item-section="git"] > span`
      )
      ?.getAttribute('title') ?? null
  );
}

function getSearchPlaceholder(root: ParentNode): string | null {
  return (
    root
      .querySelector('[data-file-tree-search-input]')
      ?.getAttribute('placeholder') ?? null
  );
}

async function renderTree(labels?: FileTreeLabelsOption): Promise<MountedTree> {
  const tree = mountTree({
    flattenEmptyDirectories: false,
    gitStatus: [
      { path: 'README.md', status: 'untracked' },
      { path: 'src/index.ts', status: 'modified' },
    ],
    initialExpansion: 'open',
    labels,
    paths: FILES,
    search: true,
    initialVisibleRowCount: 180 / 30,
  });
  await flushDom();
  return tree;
}

let mounted: MountedTree | null = null;
afterEach(() => {
  mounted?.dispose();
  mounted = null;
});

describe('file-tree labels', () => {
  test('renders English defaults when no labels are given', async () => {
    mounted = await renderTree();
    const { root } = mounted;

    expect(getSearchPlaceholder(root)).toBe(
      DEFAULT_FILE_TREE_LABELS.searchPlaceholder
    );
    expect(getGitTitle(root, 'src/index.ts')).toBe('Git status: modified');
    expect(getGitTitle(root, 'src/')).toBe('Contains git status items');
  });

  test('renders custom labels and falls back per git status', async () => {
    mounted = await renderTree({
      ...FRENCH_LABELS,
      gitStatusTitles: { modified: 'Statut git : modifie' },
    });
    const { root } = mounted;

    expect(getSearchPlaceholder(root)).toBe('Rechercher…');
    expect(getGitTitle(root, 'src/index.ts')).toBe('Statut git : modifie');
    expect(getGitTitle(root, 'README.md')).toBe('Git status: untracked');
    expect(getGitTitle(root, 'src/')).toBe('Contient des modifications git');
  });

  test('setLabels re-renders the mounted tree and resets omitted labels', async () => {
    mounted = await renderTree();
    const { model, root } = mounted;

    model.setLabels(FRENCH_LABELS);
    await flushDom();

    expect(getSearchPlaceholder(root)).toBe('Rechercher…');
    expect(getGitTitle(root, 'README.md')).toBe('Statut git : non suivi');

    model.setLabels({ searchPlaceholder: 'Suchen…' });
    await flushDom();

    expect(getSearchPlaceholder(root)).toBe('Suchen…');
    expect(getGitTitle(root, 'README.md')).toBe('Git status: untracked');

    model.setLabels(undefined);
    await flushDom();

    expect(getSearchPlaceholder(root)).toBe(
      DEFAULT_FILE_TREE_LABELS.searchPlaceholder
    );
  });

  // Skipped upstream test (dropped feature, SSR): 'preloadFileTree renders
  // custom labels into the SSR markup'.
});
