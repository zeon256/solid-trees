import { PathStore } from '@solid-trees/path-store';

import type { FileTreePreparedInput } from '../preparedInput';
import { isNullish } from '../utils/isNullish';
import type { FileTreeControllerOptions } from './publicTypes';

function haveMatchingPaths(
  currentPaths: ReadonlyArray<string>,
  preparedPaths: ReadonlyArray<string>
): boolean {
  if (currentPaths === preparedPaths) {
    return true;
  }

  if (currentPaths.length !== preparedPaths.length) {
    return false;
  }

  for (let index = 0; index < currentPaths.length; index += 1) {
    if (currentPaths[index] !== preparedPaths[index]) {
      return false;
    }
  }

  return true;
}

export interface ResolvedFileTreeInput {
  paths: ReadonlyArray<string>;
  preparedInput: FileTreePreparedInput | undefined;
}

// Keeps raw path lists and prepared input aligned so callers cannot silently
// reuse stale prepared data after the tree source changes.
export function resolveFileTreeInput(
  options: Pick<FileTreeControllerOptions, 'paths' | 'preparedInput'>,
  context: 'constructor' | 'resetPaths',
  sort: FileTreeControllerOptions['sort']
): ResolvedFileTreeInput {
  const { paths, preparedInput } = options;
  if (isNullish(preparedInput)) {
    if (isNullish(paths)) {
      throw new Error('FileTree requires paths or preparedInput');
    }

    return {
      paths,
      preparedInput: undefined,
    };
  }

  const preparedPaths = preparedInput.paths;
  if (isNullish(paths)) {
    return {
      paths: preparedPaths,
      preparedInput,
    };
  }

  const comparablePaths = PathStore.preparePaths(
    paths,
    isNullish(sort) ? {} : { sort }
  );
  if (!haveMatchingPaths(comparablePaths, preparedPaths)) {
    throw new Error(
      `FileTree ${context} received paths and preparedInput for different path lists`
    );
  }

  return {
    paths: preparedPaths,
    preparedInput,
  };
}
