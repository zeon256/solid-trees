import { createSignal } from 'solid-js';

import type { FileTreeIcons } from '../iconConfig';
import { resolveFileTreeLabels } from '../utils/fileTreeLabels';
import { isNullish } from '../utils/isNullish';
import { resolveFileTreeDensity } from './density';
import type { FileTreeDensityPreset } from './density';
import { FileTreeController } from './FileTreeController';
import {
  applyFileTreeGitStatusPatch,
  resolveFileTreeGitStatusState,
} from './gitStatus';
import type { FileTreeGitStatusState } from './gitStatus';
import type {
  FileTreeBatchOperation,
  FileTreeCompositionOptions,
  FileTreeGitStatusPatch,
  FileTreeItemHandle,
  FileTreeLabels,
  FileTreeListener,
  FileTreeMoveOptions,
  FileTreeMutationEventForType,
  FileTreeMutationEventType,
  FileTreeMutationHandle,
  FileTreeOptions,
  FileTreePublicId,
  FileTreeRemoveOptions,
  FileTreeResetOptions,
  FileTreeResetPreparedOptions,
  FileTreeRowDecorationRenderer,
  FileTreeScrollToPathOptions,
  FileTreeSearchBlurBehavior,
  FileTreeSearchSessionHandle,
  FileTreeVisibleRow,
} from './publicTypes';
import {
  FILE_TREE_DEFAULT_ITEM_HEIGHT,
  FILE_TREE_DEFAULT_VIEWPORT_HEIGHT,
} from './virtualization';

let clientInstanceId = 0;

function isPathList(
  value: ReadonlyArray<string> | FileTreeResetPreparedOptions
): value is ReadonlyArray<string> {
  return Array.isArray(value);
}

function createClientId(explicitId?: string): string {
  if (!isNullish(explicitId) && explicitId.length > 0) {
    return explicitId;
  }

  clientInstanceId += 1;
  return `pst_ft_${clientInstanceId}`;
}

// Translates the public row-budget hint into the pixel height used by the first
// render before the DOM can report a measured scroll viewport.
function resolveInitialViewportHeight(
  initialVisibleRowCount: number | undefined,
  itemHeight: number | undefined
): number {
  return isNullish(initialVisibleRowCount)
    ? FILE_TREE_DEFAULT_VIEWPORT_HEIGHT
    : Math.max(0, initialVisibleRowCount) *
        (itemHeight ?? FILE_TREE_DEFAULT_ITEM_HEIGHT);
}

/** @internal Read by the `<FileTree>` view; not part of the public surface. */
export const FILE_TREE_VIEW_STATE: unique symbol = Symbol(
  'FILE_TREE_VIEW_STATE'
);

/** @internal Static view configuration plus tracked accessors for the view. */
export interface FileTreeViewState {
  controller: FileTreeController;
  density: FileTreeDensityPreset;
  id: string;
  initialViewportHeight: number;
  overscan: number | undefined;
  renamingEnabled: boolean;
  renderRowDecoration: FileTreeRowDecorationRenderer | undefined;
  searchBlurBehavior: FileTreeSearchBlurBehavior;
  searchEnabled: boolean;
  searchFakeFocus: boolean;
  stickyFolders: boolean;
  /** Tracks controller emits; call inside a reactive scope. */
  trackController: () => void;
  getGitStatusState: () => FileTreeGitStatusState | null;
  getIcons: () => FileTreeIcons | undefined;
  /** Current composition without tracking, for imperative callbacks. */
  peekComposition: () => FileTreeCompositionOptions | undefined;
  getLabels: () => FileTreeLabels;
}

/**
 * Path-first file tree model. Owns the controller (path store, focus,
 * selection, search, rename, drag and drop) and exposes it to Solid: every
 * getter tracks the relevant state when read inside a reactive scope, while
 * imperative reads always return the current value.
 */
export class FileTreeModel
  implements FileTreeMutationHandle, FileTreeSearchSessionHandle
{
  readonly #controller: FileTreeController;
  readonly #density: FileTreeDensityPreset;
  readonly #id: string;
  readonly #viewState: FileTreeViewState;
  // Controller and configuration state live in plain fields so imperative
  // reads never lag a write; these counters only carry reactivity. Writes can
  // originate from controller callbacks that run inside effects or component
  // bodies, so they opt into owned writes.
  readonly #controllerVersion = createSignal(0, { ownedWrite: true });
  readonly #configVersion = createSignal(0, { ownedWrite: true });
  #composition: FileTreeCompositionOptions | undefined;
  #gitStatusState: FileTreeGitStatusState | null;
  #icons: FileTreeIcons | undefined;
  #labels: FileTreeLabels;
  #selectionVersion: number;
  #unsubscribeController: (() => void) | null;

  public constructor(options: FileTreeOptions) {
    const {
      composition,
      density,
      fileTreeSearchMode,
      gitStatus,
      id,
      initialSearchQuery,
      icons,
      itemHeight,
      labels,
      onSearchChange,
      onSelectionChange,
      overscan,
      renderRowDecoration,
      renaming,
      search,
      searchBlurBehavior,
      searchFakeFocus,
      stickyFolders,
      initialVisibleRowCount,
      ...controllerOptions
    } = options;
    this.#composition = composition;
    this.#id = createClientId(id);
    this.#gitStatusState = resolveFileTreeGitStatusState(gitStatus);
    this.#icons = icons;
    this.#labels = resolveFileTreeLabels(labels);
    this.#density = resolveFileTreeDensity(density, itemHeight);
    this.#controller = new FileTreeController({
      ...controllerOptions,
      fileTreeSearchMode,
      initialSearchQuery,
      onSearchChange,
      renaming,
    });
    this.#selectionVersion = this.#controller.getSelectionVersion();

    let hasSeenInitialSnapshot = false;
    this.#unsubscribeController = this.#controller.subscribe(() => {
      // The controller replays its current state on subscribe; that replay is
      // not a change.
      if (!hasSeenInitialSnapshot) {
        hasSeenInitialSnapshot = true;
        return;
      }

      this.#controllerVersion[1]((version) => version + 1);
      if (isNullish(onSelectionChange)) {
        return;
      }
      const nextSelectionVersion = this.#controller.getSelectionVersion();
      if (nextSelectionVersion !== this.#selectionVersion) {
        this.#selectionVersion = nextSelectionVersion;
        onSelectionChange(this.#controller.getSelectedPaths());
      }
    });

    this.#viewState = {
      controller: this.#controller,
      density: this.#density,
      id: this.#id,
      initialViewportHeight: resolveInitialViewportHeight(
        initialVisibleRowCount,
        this.#density.itemHeight
      ),
      overscan,
      renamingEnabled: !isNullish(renaming) && renaming !== false,
      renderRowDecoration,
      searchBlurBehavior: searchBlurBehavior ?? 'close',
      searchEnabled: search === true,
      searchFakeFocus: searchFakeFocus === true,
      stickyFolders: stickyFolders === true,
      trackController: () => {
        this.#trackController();
      },
      getGitStatusState: () => {
        this.#trackConfig();
        return this.#gitStatusState;
      },
      peekComposition: () => this.#composition,
      getIcons: () => {
        this.#trackConfig();
        return this.#icons;
      },
      getLabels: () => {
        this.#trackConfig();
        return this.#labels;
      },
    };
  }

  /** @internal */
  public [FILE_TREE_VIEW_STATE](): FileTreeViewState {
    return this.#viewState;
  }

  /** Disposes the controller. The model is unusable afterwards. */
  public cleanUp(): void {
    this.#unsubscribeController?.();
    this.#unsubscribeController = null;
    this.#controller.destroy();
  }

  public getId(): string {
    return this.#id;
  }

  public getItem(path: string): FileTreeItemHandle | null {
    this.#trackController();
    return this.#controller.getItem(path);
  }

  public getFocusedItem(): FileTreeItemHandle | null {
    this.#trackController();
    return this.#controller.getFocusedItem();
  }

  public getFocusedPath(): string | null {
    this.#trackController();
    return this.#controller.getFocusedPath();
  }

  public getFocusedIndex(): number {
    this.#trackController();
    return this.#controller.getFocusedIndex();
  }

  public getVisibleCount(): number {
    this.#trackController();
    return this.#controller.getVisibleCount();
  }

  public getVisibleRows(
    start: number,
    end: number
  ): ReadonlyArray<FileTreeVisibleRow> {
    this.#trackController();
    return this.#controller.getVisibleRows(start, end);
  }

  public getSelectedPaths(): ReadonlyArray<string> {
    this.#trackController();
    return this.#controller.getSelectedPaths();
  }

  public getComposition(): FileTreeCompositionOptions | undefined {
    this.#trackConfig();
    return this.#composition;
  }

  public getItemHeight(): number {
    return this.#density.itemHeight;
  }

  public getDensityFactor(): number {
    return this.#density.factor;
  }

  /** Listens for controller changes; the current state is not replayed. */
  public subscribe(listener: FileTreeListener): () => void {
    let hasSeenInitialSnapshot = false;

    return this.#controller.subscribe(() => {
      if (!hasSeenInitialSnapshot) {
        hasSeenInitialSnapshot = true;
        return;
      }

      listener();
    });
  }

  public focusPath(path: string): void {
    this.#controller.focusPath(path);
  }

  public focusFirstItem(): void {
    this.#controller.focusFirstItem();
  }

  public focusLastItem(): void {
    this.#controller.focusLastItem();
  }

  public focusNextItem(): void {
    this.#controller.focusNextItem();
  }

  public focusPreviousItem(): void {
    this.#controller.focusPreviousItem();
  }

  public focusParentItem(): void {
    this.#controller.focusParentItem();
  }

  public scrollToPath(
    path: FileTreePublicId,
    options?: FileTreeScrollToPathOptions
  ): void {
    this.#controller.scrollToPath(path, options);
  }

  public focusNearestPath(path: string | null): string | null {
    return this.#controller.focusNearestPath(path);
  }

  public add(path: string): void {
    this.#controller.add(path);
  }

  public batch(operations: ReadonlyArray<FileTreeBatchOperation>): void {
    this.#controller.batch(operations);
  }

  public move(
    fromPath: string,
    toPath: string,
    options?: FileTreeMoveOptions
  ): void {
    this.#controller.move(fromPath, toPath, options);
  }

  public remove(path: string, options?: FileTreeRemoveOptions): void {
    this.#controller.remove(path, options);
  }

  public resetPaths(
    paths: ReadonlyArray<string>,
    options?: FileTreeResetOptions
  ): void;
  public resetPaths(options: FileTreeResetPreparedOptions): void;
  public resetPaths(
    pathsOrOptions: ReadonlyArray<string> | FileTreeResetPreparedOptions,
    options?: FileTreeResetOptions
  ): void {
    if (isPathList(pathsOrOptions)) {
      this.#controller.resetPaths(pathsOrOptions, options);
    } else {
      this.#controller.resetPaths(pathsOrOptions);
    }
  }

  public onMutation<TType extends FileTreeMutationEventType | '*'>(
    type: TType,
    handler: (event: FileTreeMutationEventForType<TType>) => void
  ): () => void {
    return this.#controller.onMutation(type, handler);
  }

  public setSearch(value: string | null): void {
    this.#controller.setSearch(value);
  }

  public openSearch(initialValue?: string): void {
    this.#controller.openSearch(initialValue);
  }

  public closeSearch(): void {
    this.#controller.closeSearch();
  }

  public isSearchOpen(): boolean {
    this.#trackController();
    return this.#controller.isSearchOpen();
  }

  public getSearchValue(): string {
    this.#trackController();
    return this.#controller.getSearchValue();
  }

  public getSearchMatchingPaths(): ReadonlyArray<string> {
    this.#trackController();
    return this.#controller.getSearchMatchingPaths();
  }

  public focusNextSearchMatch(): void {
    this.#controller.focusNextSearchMatch();
  }

  public focusPreviousSearchMatch(): void {
    this.#controller.focusPreviousSearchMatch();
  }

  public startRenaming(
    path?: string,
    options?: { removeIfCanceled?: boolean }
  ): boolean {
    return this.#controller.startRenaming(path, options);
  }

  // Deliberately notifies even when the same object reference is passed
  // again: callers can reuse one composition object while changing its
  // callbacks, so identity alone is not a reliable no-op signal.
  public setComposition(composition?: FileTreeCompositionOptions): void {
    this.#composition = composition;
    this.#bumpConfig();
  }

  public setGitStatus(gitStatus?: FileTreeOptions['gitStatus']): void {
    const nextGitStatusState = resolveFileTreeGitStatusState(
      gitStatus,
      this.#gitStatusState
    );
    if (nextGitStatusState === this.#gitStatusState) {
      return;
    }

    this.#gitStatusState = nextGitStatusState;
    this.#bumpConfig();
  }

  public applyGitStatusPatch(patch: FileTreeGitStatusPatch): void {
    const nextGitStatusState = applyFileTreeGitStatusPatch(
      this.#gitStatusState,
      patch
    );
    if (nextGitStatusState === this.#gitStatusState) {
      return;
    }

    this.#gitStatusState = nextGitStatusState;
    this.#bumpConfig();
  }

  public setIcons(icons?: FileTreeOptions['icons']): void {
    this.#icons = icons;
    this.#bumpConfig();
  }

  // Replaces every label at once. Labels left out fall back to their English
  // defaults rather than keeping a previously set translation.
  public setLabels(labels?: FileTreeOptions['labels']): void {
    this.#labels = resolveFileTreeLabels(labels);
    this.#bumpConfig();
  }

  #trackController(): void {
    this.#controllerVersion[0]();
  }

  #trackConfig(): void {
    this.#configVersion[0]();
  }

  #bumpConfig(): void {
    this.#configVersion[1]((version) => version + 1);
  }
}
