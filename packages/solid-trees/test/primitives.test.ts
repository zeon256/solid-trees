import { createRoot, flush } from 'solid-js';
import { describe, expect, test } from 'vitest';

import {
  createFileTree,
  createFileTreeSearch,
  createFileTreeSelection,
} from '../src/primitives';

describe('Solid primitives', () => {
  test('selection memo follows model changes and only notifies on change', () => {
    createRoot((dispose) => {
      const tree = createFileTree({ paths: ['a.ts', 'b.ts'] });
      const selection = createFileTreeSelection(tree);
      expect(selection()).toEqual([]);

      tree.getItem('a.ts')?.select();
      flush();
      const afterSelect = selection();
      expect(afterSelect).toEqual(['a.ts']);

      tree.focusPath('b.ts');
      flush();
      expect(selection()).toBe(afterSelect);
      dispose();
    });
  });

  test('search state tracks open, value, and matches', () => {
    createRoot((dispose) => {
      const tree = createFileTree({
        paths: ['src/button.ts', 'src/dialog.ts'],
      });
      const search = createFileTreeSearch(tree);
      search.open('butt');
      flush();
      expect(search.state()).toEqual({
        isOpen: true,
        matchingPaths: ['src/button.ts'],
        value: 'butt',
      });
      search.close();
      flush();
      expect(search.state().isOpen).toBe(false);
      dispose();
    });
  });

  test('owner disposal cleans up the model', () => {
    let changes = 0;
    const tree = createRoot((dispose) => {
      const model = createFileTree({ paths: ['a.ts'] });
      model.subscribe(() => {
        changes += 1;
      });
      dispose();
      return model;
    });
    expect(() => tree.add('b.ts')).not.toThrow();
    expect(changes).toBe(0);
  });

  test('onSelectionChange fires once per selection change', () => {
    const calls: Array<ReadonlyArray<string>> = [];
    createRoot((dispose) => {
      const tree = createFileTree({
        paths: ['a.ts', 'b.ts'],
        onSelectionChange: (paths) => calls.push(paths),
      });
      tree.getItem('a.ts')?.select();
      tree.focusPath('b.ts');
      tree.getItem('b.ts')?.select();
      dispose();
    });
    expect(calls).toEqual([['a.ts'], ['a.ts', 'b.ts']]);
  });
});
