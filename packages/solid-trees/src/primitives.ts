import { createMemo, getOwner, onCleanup } from 'solid-js';
import type { Accessor } from 'solid-js';

import { FileTreeModel } from './model/FileTreeModel';
import type { FileTreeOptions } from './model/publicTypes';

/**
 * Creates a model owned by the current reactive owner; it is cleaned up when
 * the owner disposes. Options are read once: later changes go through model
 * methods (`resetPaths`, `setGitStatus`, `setIcons`, ...).
 */
export function createFileTree(options: FileTreeOptions): FileTreeModel {
  const model = new FileTreeModel(options);
  if (getOwner() !== null) {
    onCleanup(() => {
      model.cleanUp();
    });
  }
  return model;
}

export type FileTreeSelector<TSelected> = (model: FileTreeModel) => TSelected;
export type FileTreeSelectorEquality<TSelected> = (
  previous: TSelected,
  next: TSelected
) => boolean;

export function areArraysEqual<TValue>(
  previous: ReadonlyArray<TValue>,
  next: ReadonlyArray<TValue>
): boolean {
  if (previous === next) {
    return true;
  }

  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    if (!Object.is(previous[index], next[index])) {
      return false;
    }
  }

  return true;
}

/**
 * Derives a value from the model that re-evaluates on every model change and
 * only notifies when `isEqual` (default `Object.is`) reports a difference.
 */
export function createFileTreeSelector<TSelected>(
  model: FileTreeModel,
  selector: FileTreeSelector<TSelected>,
  isEqual?: FileTreeSelectorEquality<TSelected>
): Accessor<TSelected> {
  return createMemo(() => selector(model), {
    equals: (previous, next) =>
      Object.is(previous, next) || isEqual?.(previous, next) === true,
  });
}

export function createFileTreeSelection(
  model: FileTreeModel
): Accessor<ReadonlyArray<string>> {
  return createFileTreeSelector(
    model,
    (currentModel) => currentModel.getSelectedPaths(),
    areArraysEqual
  );
}

export interface FileTreeSearchSnapshot {
  isOpen: boolean;
  matchingPaths: ReadonlyArray<string>;
  value: string;
}

export interface FileTreeSearchState {
  state: Accessor<FileTreeSearchSnapshot>;
  close: () => void;
  focusNextMatch: () => void;
  focusPreviousMatch: () => void;
  open: (initialValue?: string) => void;
  setValue: (value: string | null) => void;
}

function areSearchSnapshotsEqual(
  previous: FileTreeSearchSnapshot,
  next: FileTreeSearchSnapshot
): boolean {
  return (
    previous.isOpen === next.isOpen &&
    previous.value === next.value &&
    areArraysEqual(previous.matchingPaths, next.matchingPaths)
  );
}

export function createFileTreeSearch(
  model: FileTreeModel
): FileTreeSearchState {
  const state = createFileTreeSelector(
    model,
    (currentModel): FileTreeSearchSnapshot => ({
      isOpen: currentModel.isSearchOpen(),
      matchingPaths: currentModel.getSearchMatchingPaths(),
      value: currentModel.getSearchValue(),
    }),
    areSearchSnapshotsEqual
  );

  return {
    state,
    close: () => {
      model.closeSearch();
    },
    focusNextMatch: () => {
      model.focusNextSearchMatch();
    },
    focusPreviousMatch: () => {
      model.focusPreviousSearchMatch();
    },
    open: (initialValue?: string) => {
      model.openSearch(initialValue);
    },
    setValue: (value: string | null) => {
      model.setSearch(value);
    },
  };
}
