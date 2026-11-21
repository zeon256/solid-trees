export interface PathStoreCompareEntry {
  basename: string;
  depth: number;
  isDirectory: boolean;
  path: string;
  segments: ReadonlyArray<string>;
}

export type PathStorePathComparator = (
  left: PathStoreCompareEntry,
  right: PathStoreCompareEntry
) => number;

export interface PathStoreOptions {
  flattenEmptyDirectories?: boolean;
  sort?: 'default' | PathStorePathComparator;
}

export type PathStoreInitialExpansion = 'closed' | 'open' | number;

export interface PathStorePreparedInput {
  paths: ReadonlyArray<string>;
}

export type PathStoreCleanupMode = 'stable' | 'aggressive';

export interface PathStoreCleanupOptions {
  mode?: PathStoreCleanupMode;
}

export interface PathStoreCleanupResult {
  activeNodeCountAfter: number;
  activeNodeCountBefore: number;
  cachedPathEntryCountAfter: number;
  cachedPathEntryCountBefore: number;
  idsPreserved: boolean;
  loadInfoEntryCountAfter: number;
  loadInfoEntryCountBefore: number;
  mode: PathStoreCleanupMode;
  reclaimedCachedPathEntryCount: number;
  reclaimedLoadInfoEntryCount: number;
  reclaimedNodeSlotCount: number;
  reclaimedSegmentCount: number;
  segmentCountAfter: number;
  segmentCountBefore: number;
  totalNodeSlotCountAfter: number;
  totalNodeSlotCountBefore: number;
}

export type PathStoreDirectoryLoadState =
  | 'unloaded'
  | 'loading'
  | 'loaded'
  | 'error';

export interface PathStoreChildPatch {
  metadata?: {
    knownChildCount?: number;
  };
  operations: ReadonlyArray<PathStoreOperation>;
}

export interface PathStoreLoadAttempt {
  attemptId: number;
  nodeId: number;
  reused: boolean;
}

export interface PathStoreConstructorOptions extends PathStoreOptions {
  initialExpansion?: PathStoreInitialExpansion;
  initialExpandedPaths?: ReadonlyArray<string>;
  paths?: ReadonlyArray<string>;
  preparedInput?: PathStorePreparedInput;
  presorted?: boolean;
  // Opt-in: run the all-directories-open count-only startup sweep over a
  // Struct-of-Arrays mirror of the snapshot (parallel Int32Arrays + a flat CSR
  // child table) instead of the default array-of-objects walk. The SoA sweep is
  // ~3x faster and far leaner on large (~1M node) presorted trees; results are
  // identical and written back into the object-array nodes so the render path is
  // unchanged. Only takes effect when the all-open count fast path is eligible;
  // otherwise it is ignored. Defaults to false (object-array path).
  useSoaCountSweep?: boolean;
}

export interface PathStoreFlattenedRowSegment {
  isTerminal: boolean;
  name: string;
  nodeId: number;
  path: string;
}

export interface PathStorePathInfo {
  depth: number;
  kind: 'directory' | 'file';
  path: string;
}

export interface PathStoreVisibleRow {
  depth: number;
  flattenedSegments?: ReadonlyArray<PathStoreFlattenedRowSegment>;
  hasChildren: boolean;
  id: number;
  isExpanded: boolean;
  isFlattened: boolean;
  isLoading: boolean;
  kind: 'directory' | 'file';
  loadState?: PathStoreDirectoryLoadState;
  name: string;
  path: string;
}

export interface PathStoreVisibleAncestorRow {
  ancestorPaths: ReadonlyArray<string>;
  index: number;
  posInSet: number;
  row: PathStoreVisibleRow;
  setSize: number;
  subtreeEndIndex: number;
}

export interface PathStoreVisibleRowContext {
  ancestorPaths: ReadonlyArray<string>;
  ancestorRows: ReadonlyArray<PathStoreVisibleAncestorRow>;
  index: number;
  posInSet: number;
  row: PathStoreVisibleRow;
  setSize: number;
  subtreeEndIndex: number;
}

export interface PathStoreVisibleTreeProjectionRow {
  index: number;
  parentPath: string | null;
  path: string;
  posInSet: number;
  setSize: number;
}

export interface PathStoreVisibleTreeProjection {
  getParentIndex(index: number): number;
  rows: ReadonlyArray<PathStoreVisibleTreeProjectionRow>;
  visibleIndexByPath: Map<string, number>;
}

export interface PathStoreVisibleTreeProjectionData {
  getParentIndex(index: number): number;
  paths: ReadonlyArray<string>;
  posInSetByIndex: Int32Array<ArrayBufferLike>;
  setSizeByIndex: Int32Array<ArrayBufferLike>;
  visibleIndexByPath: Map<string, number>;
}

export interface PathStoreEventInvalidation {
  affectedAncestorIds: ReadonlyArray<number>;
  affectedNodeIds: ReadonlyArray<number>;
  canonicalChanged: boolean;
  projectionChanged: boolean;
  visibleCountDelta: number | null;
}

export interface PathStoreAddEvent extends PathStoreEventInvalidation {
  operation: 'add';
  path: string;
}

export interface PathStoreRemoveEvent extends PathStoreEventInvalidation {
  operation: 'remove';
  path: string;
  recursive: boolean;
}

export interface PathStoreMoveEvent extends PathStoreEventInvalidation {
  from: string;
  operation: 'move';
  to: string;
}

export interface PathStoreExpandEvent extends PathStoreEventInvalidation {
  operation: 'expand';
  path: string;
}

export interface PathStoreCollapseEvent extends PathStoreEventInvalidation {
  operation: 'collapse';
  path: string;
}

export interface PathStoreMarkDirectoryUnloadedEvent extends PathStoreEventInvalidation {
  operation: 'mark-directory-unloaded';
  path: string;
}

export interface PathStoreBeginChildLoadEvent extends PathStoreEventInvalidation {
  attemptId: number;
  operation: 'begin-child-load';
  path: string;
  reused: boolean;
}

export interface PathStoreApplyChildPatchEvent extends PathStoreEventInvalidation {
  attemptId: number;
  childEvents: ReadonlyArray<PathStoreSemanticEvent>;
  operation: 'apply-child-patch';
  path: string;
}

export interface PathStoreCompleteChildLoadEvent extends PathStoreEventInvalidation {
  attemptId: number;
  operation: 'complete-child-load';
  path: string;
  stale: boolean;
}

export interface PathStoreFailChildLoadEvent extends PathStoreEventInvalidation {
  attemptId: number;
  errorMessage?: string;
  operation: 'fail-child-load';
  path: string;
  stale: boolean;
}

export interface PathStoreCleanupEvent
  extends PathStoreEventInvalidation, PathStoreCleanupResult {
  operation: 'cleanup';
}

export type PathStoreSemanticEvent =
  | PathStoreAddEvent
  | PathStoreRemoveEvent
  | PathStoreMoveEvent
  | PathStoreExpandEvent
  | PathStoreCollapseEvent
  | PathStoreMarkDirectoryUnloadedEvent
  | PathStoreBeginChildLoadEvent
  | PathStoreApplyChildPatchEvent
  | PathStoreCompleteChildLoadEvent
  | PathStoreFailChildLoadEvent
  | PathStoreCleanupEvent;

export interface PathStoreBatchEvent extends PathStoreEventInvalidation {
  events: ReadonlyArray<PathStoreSemanticEvent>;
  operation: 'batch';
}

export type PathStoreEvent = PathStoreSemanticEvent | PathStoreBatchEvent;

export type PathStoreEventType =
  | PathStoreSemanticEvent['operation']
  | PathStoreBatchEvent['operation'];

export type PathStoreEventForType<TType extends PathStoreEventType | '*'> =
  TType extends '*'
    ? PathStoreEvent
    : Extract<PathStoreEvent, { operation: TType }>;

export interface PathStoreRemoveOptions {
  recursive?: boolean;
}

export type PathStoreCollisionStrategy = 'error' | 'replace' | 'skip';

export interface PathStoreMoveOptions {
  collision?: PathStoreCollisionStrategy;
}

export type PathStoreOperation =
  | { path: string; type: 'add' }
  | ({ path: string; type: 'remove' } & PathStoreRemoveOptions)
  | ({ from: string; to: string; type: 'move' } & PathStoreMoveOptions);
