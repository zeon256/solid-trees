export { FileTreeModel } from './model/FileTreeModel';
export {
  FileTree,
  type FileTreeProps,
  type FileTreeRenderContextMenu,
} from './view/FileTree';
export {
  areArraysEqual,
  createFileTree,
  createFileTreeSearch,
  createFileTreeSelection,
  createFileTreeSelector,
  type FileTreeSearchSnapshot,
  type FileTreeSearchState,
  type FileTreeSelector,
  type FileTreeSelectorEquality,
} from './primitives';
export type {
  ContextMenuAnchorRect,
  GitStatus,
  GitStatusEntry,
} from './publicTypes';
export type {
  FileTreeBuiltInIconSet,
  FileTreeIconConfig,
  FileTreeIcons,
  RemappedIcon,
} from './iconConfig';
export { getBuiltInSpriteSheet } from './builtInIcons';
export { createFileTreeIconResolver } from './render/iconResolver';
export type {
  TreeThemeInput,
  TreeThemeStyles,
} from './utils/themeToTreeStyles';
export { themeToTreeStyles } from './utils/themeToTreeStyles';
export { DEFAULT_FILE_TREE_LABELS } from './utils/fileTreeLabels';
export type { FileTreePreparedInput } from './preparedInput';
export {
  prepareFileTreeInput,
  preparePresortedFileTreeInput,
} from './preparedInput';
export { FILE_TREE_DEFAULT_ITEM_HEIGHT } from './model/virtualization';
export {
  FILE_TREE_DENSITY_PRESETS,
  type FileTreeDensity,
  type FileTreeDensityKeyword,
  type FileTreeDensityPreset,
} from './model/density';
export type {
  FileTreeAddEvent,
  FileTreeBatchEvent,
  FileTreeBatchOperation,
  FileTreeCollisionStrategy,
  FileTreeCompositionOptions,
  FileTreeContextMenuButtonVisibility as ContextMenuButtonVisibility,
  FileTreeContextMenuCompositionOptions,
  FileTreeContextMenuItem as ContextMenuItem,
  FileTreeContextMenuOpenContext as ContextMenuOpenContext,
  FileTreeContextMenuTriggerMode as ContextMenuTriggerMode,
  FileTreeDirectoryHandle,
  FileTreeDragAndDropConfig,
  FileTreeDropContext,
  FileTreeDropResult,
  FileTreeDropTarget,
  FileTreeFileHandle,
  FileTreeGitStatusPatch,
  FileTreeInitialExpansion,
  FileTreeItemHandle,
  FileTreeLabels,
  FileTreeLabelsOption,
  FileTreeListener,
  FileTreeMoveEvent,
  FileTreeMoveOptions,
  FileTreeMutationEvent,
  FileTreeMutationEventForType,
  FileTreeMutationEventInvalidation,
  FileTreeMutationEventType,
  FileTreeMutationHandle,
  FileTreeMutationSemanticEvent,
  FileTreeOptions,
  FileTreeRemoveEvent,
  FileTreeRemoveOptions,
  FileTreeRenameEvent,
  FileTreeRenamingConfig,
  FileTreeRenamingItem,
  FileTreeRenderOptions,
  FileTreeResetEvent,
  FileTreeResetOptions,
  FileTreeResetPreparedOptions,
  FileTreeRowDecoration,
  FileTreeRowDecorationContext,
  FileTreeRowDecorationRenderer,
  FileTreeSearchBlurBehavior,
  FileTreeSearchChangeListener,
  FileTreeSearchMode,
  FileTreeSearchSessionHandle,
  FileTreeScrollOffset,
  FileTreeScrollToPathOptions,
  FileTreeSelectionChangeListener,
  FileTreeSortComparator,
  FileTreeSortEntry,
  FileTreeVisibleRow,
} from './model/publicTypes';
