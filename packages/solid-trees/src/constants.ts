/**
 * Prefix used for flattened node IDs.
 * Flattened nodes represent collapsed chains of single-child folders.
 * Example: 'f::src/utils/deep' represents the chain src → utils → deep
 */
export const FLATTENED_PREFIX = 'f::' as const;

export const CONTEXT_MENU_TRIGGER_TYPE = 'context-menu-trigger' as const;

export const FILE_TREE_SCROLLBAR_MEASURE_ATTRIBUTE =
  'data-file-tree-scrollbar-measure' as const;
export const FILE_TREE_SCROLLBAR_GUTTER_MEASURED_PROPERTY =
  '--trees-scrollbar-gutter-measured' as const;
