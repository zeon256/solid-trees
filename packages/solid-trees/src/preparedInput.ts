import { PathStore } from '@solid-trees/path-store';
import type { PathStorePreparedInput } from '@solid-trees/path-store';

import type { FileTreeSortComparator } from './model/publicTypes';

declare const FILE_TREE_PREPARED_INPUT: unique symbol;

// Opaque handle returned by the helper functions below so callers do not hand-roll
// shapes that skip the preparation work PathStore expects.
export interface FileTreePreparedInput {
  readonly [FILE_TREE_PREPARED_INPUT]: true;
  readonly paths: ReadonlyArray<string>;
}

// The brand is type-only: every PathStore-prepared input is a valid handle, so
// this guard exists to narrow without an unchecked assertion.
function isFileTreePreparedInput(
  input: PathStorePreparedInput
): input is FileTreePreparedInput {
  return Array.isArray(input.paths);
}

function toFileTreePreparedInput(
  input: PathStorePreparedInput
): FileTreePreparedInput {
  if (!isFileTreePreparedInput(input)) {
    throw new Error('PathStore returned an invalid prepared input');
  }
  return input;
}

// Precomputes normalized tree input so FileTree can skip repeated parsing work.
export function prepareFileTreeInput(
  paths: ReadonlyArray<string>,
  options: {
    flattenEmptyDirectories?: boolean;
    sort?: 'default' | FileTreeSortComparator;
  } = {}
): FileTreePreparedInput {
  return toFileTreePreparedInput(PathStore.prepareInput(paths, options));
}

// Marks already-sorted input so FileTree can skip both sorting and reparsing work.
export function preparePresortedFileTreeInput(
  paths: ReadonlyArray<string>
): FileTreePreparedInput {
  return toFileTreePreparedInput(PathStore.preparePresortedInput(paths));
}
