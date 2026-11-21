import { afterEach, describe, expect, test } from 'vitest';

import { keyDown, mountTree, rowElement, rowPaths, settle } from './helpers';
import type { MountedTree } from './helpers';

let mounted: MountedTree | null = null;
afterEach(() => {
  mounted?.dispose();
  mounted = null;
});

describe('FileTree view', () => {
  test('renders visible rows in order with treeitem semantics', async () => {
    mounted = mountTree({
      initialExpansion: 'open',
      paths: ['README.md', 'src/index.ts', 'src/lib/a.ts'],
    });
    await settle();
    expect(rowPaths(mounted.root)).toEqual([
      'src/',
      'src/lib/',
      'src/lib/a.ts',
      'src/index.ts',
      'README.md',
    ]);
    const src = rowElement(mounted.root, 'src/');
    expect(src.getAttribute('role')).toBe('treeitem');
    expect(src.getAttribute('aria-expanded')).toBe('true');
    expect(src.getAttribute('aria-level')).toBe('1');
    expect(
      rowElement(mounted.root, 'src/lib/a.ts').getAttribute('aria-level')
    ).toBe('3');
  });

  test('clicking a directory toggles it and selects it', async () => {
    mounted = mountTree({
      flattenEmptyDirectories: false,
      initialExpandedPaths: ['src'],
      paths: ['README.md', 'src/index.ts', 'src/lib/util.ts'],
    });
    await settle();
    expect(rowPaths(mounted.root)).toContain('src/index.ts');
    rowElement(mounted.root, 'src/').click();
    await settle();
    expect(rowPaths(mounted.root)).toEqual(['src/', 'README.md']);
    expect(mounted.model.getSelectedPaths()).toEqual(['src/']);
    expect(rowElement(mounted.root, 'src/').getAttribute('aria-selected')).toBe(
      'true'
    );
  });

  test('arrow keys move DOM focus between rows', async () => {
    mounted = mountTree({
      initialExpansion: 'open',
      paths: ['a.ts', 'b.ts', 'c.ts'],
    });
    await settle();
    rowElement(mounted.root, 'a.ts').click();
    rowElement(mounted.root, 'a.ts').focus();
    await settle();
    keyDown(rowElement(mounted.root, 'a.ts'), 'ArrowDown');
    await settle();
    expect(mounted.model.getFocusedPath()).toBe('b.ts');
    expect(document.activeElement).toBe(rowElement(mounted.root, 'b.ts'));
    expect(rowElement(mounted.root, 'b.ts').getAttribute('tabindex')).toBe('0');
    expect(rowElement(mounted.root, 'a.ts').getAttribute('tabindex')).toBe(
      '-1'
    );
  });
});
