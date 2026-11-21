import { describe, expect, test } from 'vitest';

import { splitCenter, splitExtension } from '../src/view/OverflowText';

// A split boundary that lands adjacent to whitespace causes the boundary space
// to collapse under `white-space: nowrap`, making the name visually lose its
// space (issue #744 — "Hello world" rendered as "Helloworld"). These tests
// assert the boundary is never adjacent to whitespace when a clean boundary
// exists, so the space stays interior to one rendered segment.
function boundaryIsWhitespaceFree([first, second]: [string, string]): boolean {
  return !/\s/.test(first.at(-1) ?? '') && !/\s/.test(second.at(0) ?? '');
}

describe('splitExtension whitespace boundary (issue #744)', () => {
  test('dotless name with a mid-string space does not split on the space', () => {
    // "Hello world" is 11 chars; the naive center split is index 6, which
    // leaves "Hello " with a trailing space that collapses on render.
    const result = splitExtension('Hello world');
    expect(result.join('')).toBe('Hello world');
    expect(boundaryIsWhitespaceFree(result)).toBe(true);
  });

  test('shorter dotless name with a space keeps the space interior', () => {
    const result = splitExtension('my file');
    expect(result.join('')).toBe('my file');
    expect(boundaryIsWhitespaceFree(result)).toBe(true);
  });

  test('multi-word dotless name avoids a whitespace boundary', () => {
    const result = splitExtension('Hello world wide web');
    expect(result.join('')).toBe('Hello world wide web');
    expect(boundaryIsWhitespaceFree(result)).toBe(true);
  });

  test('name with a dot still splits at the extension', () => {
    // Splits after the final dot, and the dot boundary is not whitespace.
    const result = splitExtension('my file.txt');
    expect(result).toEqual(['my file.', 'txt']);
    expect(boundaryIsWhitespaceFree(result)).toBe(true);
  });

  test('name with multiple dots splits at the last dot', () => {
    expect(splitExtension('archive.tar.gz')).toEqual(['archive.tar.', 'gz']);
  });

  test('round-trips the original contents for spaced names', () => {
    for (const name of ['Hello world', 'a quick brown fox', 'one two']) {
      expect(splitExtension(name).join('')).toBe(name);
    }
  });
});

describe('splitCenter whitespace boundary (issue #744)', () => {
  test('dotless spaced name does not split on the space', () => {
    const result = splitCenter('Hello world');
    expect(result.join('')).toBe('Hello world');
    expect(boundaryIsWhitespaceFree(result)).toBe(true);
  });

  test('name without spaces still splits near the center', () => {
    expect(splitCenter('abcdef')).toEqual(['abc', 'def']);
  });
});
