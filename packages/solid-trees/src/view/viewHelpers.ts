// DOM- and framework-independent helpers for the `<FileTree>` view. Ported
// from @pierre/trees `render/FileTreeView.tsx`.
import { CONTEXT_MENU_TRIGGER_TYPE } from '../constants';
import type { FileTreeController } from '../model/FileTreeController';
import type { FileTreeStickyRowCandidate } from '../model/internalTypes';
import { computeFileTreeLayout, computeStickyRows } from '../model/layout';
import type {
  FileTreeLayoutSnapshot,
  FileTreeLayoutStickyRow,
} from '../model/layout';
import type {
  FileTreeContextMenuItem,
  FileTreeContextMenuOpenContext,
  FileTreeDirectoryHandle,
  FileTreeDropTarget,
  FileTreeItemHandle,
  FileTreeLabels,
  FileTreeRowDecoration,
  FileTreeVisibleRow,
} from '../model/publicTypes';
import type { GitStatus } from '../publicTypes';
import { focusElement } from '../render/focusHelpers';
import type { SVGSpriteNames } from '../sprite';
import { isHTMLElement, isShadowRoot } from '../utils/domGuards';
import { GIT_STATUS_LABEL } from '../utils/gitStatusPresentation';

export function getFileTreeRowPath(row: FileTreeVisibleRow): string {
  return row.isFlattened
    ? (row.flattenedSegments?.findLast((segment) => segment.isTerminal)?.path ??
        row.path)
    : row.path;
}

export function getFileTreeRowAriaLabel(row: FileTreeVisibleRow): string {
  const flattenedSegments = row.flattenedSegments;
  if (flattenedSegments === undefined || flattenedSegments.length === 0) {
    return row.name;
  }

  return flattenedSegments.map((segment) => segment.name).join(' / ');
}

export type FileTreeViewLayoutState = {
  snapshot: FileTreeLayoutSnapshot<FileTreeVisibleRow>;
  // Rows rendered inside the sticky overlay. Usually equal to
  // `snapshot.sticky.rows`, but at scrollTop=0 we keep this populated with
  // what the overlay would contain at scrollTop=1 so the DOM is ready before
  // the first scroll lands (CSS hides the overlay until the user scrolls, so
  // there's no visual impact at rest). Without this, the overlay has to be
  // created in the same frame that the first scroll happens, and the compositor
  // paints the scrolled rows one frame before React can mount it — showing up
  // as a brief upward jump of the first sticky folder.
  overlayRows: ReadonlyArray<FileTreeLayoutStickyRow<FileTreeVisibleRow>>;
  overlayHeight: number;
  visibleRows: ReadonlyArray<FileTreeVisibleRow>;
};

export function computeStickyRowsFromCandidates(
  candidates: ReadonlyArray<FileTreeStickyRowCandidate>,
  scrollTop: number,
  itemHeight: number,
  totalRowCount: number
): ReadonlyArray<FileTreeLayoutStickyRow<FileTreeVisibleRow>> {
  return candidates.flatMap((candidate, slotDepth) => {
    const defaultTop = slotDepth * itemHeight;
    const nextBoundaryIndex = candidate.subtreeEndIndex + 1;
    const top =
      nextBoundaryIndex >= totalRowCount
        ? defaultTop
        : Math.min(
            defaultTop,
            nextBoundaryIndex * itemHeight - scrollTop - itemHeight
          );
    return top + itemHeight > 0 ? [{ row: candidate.row, top }] : [];
  });
}

// Builds one visible-row snapshot so the layout engine and renderer consume the
// same projection, sticky chain, occlusion window, and mounted list slice.
//
// When sticky folders are disabled we skip materializing the full visible-row
// array — the layout engine only needs the total row count for geometry in
// that case, and the renderer can range-fetch the window slice directly from
// the controller. That keeps scroll work O(window) instead of O(total rows).
export function computeFileTreeViewLayoutState({
  controller,
  itemHeight,
  overscan,
  scrollTop,
  stickyFolders,
  viewportHeight,
}: {
  controller: FileTreeController;
  itemHeight: number;
  overscan: number;
  scrollTop: number;
  stickyFolders: boolean;
  viewportHeight: number;
}): FileTreeViewLayoutState {
  const visibleCount = controller.getVisibleCount();
  const stickyCandidates =
    stickyFolders && visibleCount > 0
      ? controller.getStickyRowCandidates(scrollTop, itemHeight)
      : [];
  const visibleRows =
    stickyCandidates === null && stickyFolders && visibleCount > 0
      ? controller.getVisibleRows(0, visibleCount - 1)
      : [];
  const stickyRows =
    stickyCandidates === null
      ? undefined
      : computeStickyRowsFromCandidates(
          stickyCandidates,
          scrollTop,
          itemHeight,
          visibleCount
        );
  const snapshot = computeFileTreeLayout(visibleRows, {
    itemHeight,
    overscan,
    scrollTop,
    stickyRows,
    totalRowCount: visibleCount,
    viewportHeight,
  });

  const previewStickyCandidates =
    stickyFolders && scrollTop <= 0 && visibleCount > 0
      ? controller.getStickyRowCandidates(1, itemHeight)
      : [];
  const overlayRows =
    previewStickyCandidates !== null && scrollTop <= 0
      ? computeStickyRowsFromCandidates(
          previewStickyCandidates,
          1,
          itemHeight,
          visibleCount
        )
      : stickyFolders && scrollTop <= 0 && visibleRows.length > 0
        ? computeStickyRows(visibleRows, 1, itemHeight)
        : snapshot.sticky.rows;
  const overlayHeight = overlayRows.reduce(
    (maxBottom, entry) => Math.max(maxBottom, entry.top + itemHeight),
    0
  );

  return {
    overlayHeight,
    overlayRows,
    snapshot,
    visibleRows,
  };
}

export const TOUCH_LONG_PRESS_DELAY = 400;
export const TOUCH_LONG_PRESS_MOVE_THRESHOLD = 10;
export const DRAG_EDGE_SCROLL_THRESHOLD = 40;
export const DRAG_EDGE_SCROLL_MAX_SPEED = 18;

interface PointRoot {
  elementFromPoint?: (x: number, y: number) => Element | null;
}

export function getPointElement(
  rootNode: Document | ShadowRoot,
  clientX: number,
  clientY: number
): HTMLElement | null {
  const pointRoot: PointRoot = rootNode;
  const documentElementFromPoint =
    document.elementFromPoint?.bind(document) ?? null;
  const element =
    pointRoot.elementFromPoint?.(clientX, clientY) ??
    documentElementFromPoint?.(clientX, clientY) ??
    null;
  if (
    isShadowRoot(rootNode) &&
    (element === null || !rootNode.contains(element))
  ) {
    return getShadowPointElementByGeometry(rootNode, clientX, clientY);
  }

  return isHTMLElement(element) ? element : null;
}

export function getShadowPointElementByGeometry(
  rootNode: ShadowRoot,
  clientX: number,
  clientY: number
): HTMLElement | null {
  const candidates = Array.from(
    rootNode.querySelectorAll<HTMLElement>(
      '[data-type="item"], [data-item-flattened-subitem]'
    )
  );
  for (let index = candidates.length - 1; index >= 0; index--) {
    const candidate = candidates[index];
    const rect = candidate.getBoundingClientRect();
    if (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    ) {
      return candidate;
    }
  }

  return null;
}

export function resolveDropTargetFromElement(
  target: HTMLElement | null
): FileTreeDropTarget | null {
  const rowButton = target?.closest?.('[data-type="item"]');
  if (!isHTMLElement(rowButton)) {
    return null;
  }

  const hoveredPath = rowButton.dataset.itemPath ?? null;
  if (hoveredPath === null) {
    return null;
  }

  const flattenedSegment = target?.closest?.('[data-item-flattened-subitem]');
  const flattenedSegmentPath = isHTMLElement(flattenedSegment)
    ? (flattenedSegment.getAttribute('data-item-flattened-subitem') ?? null)
    : null;
  if (flattenedSegmentPath !== null && flattenedSegmentPath.endsWith('/')) {
    return {
      directoryPath: flattenedSegmentPath,
      flattenedSegmentPath,
      hoveredPath,
      kind: 'directory',
    };
  }

  if (rowButton.dataset.itemType === 'folder') {
    return {
      directoryPath: hoveredPath,
      flattenedSegmentPath: null,
      hoveredPath,
      kind: 'directory',
    };
  }

  const parentPath = rowButton.dataset.itemParentPath ?? null;
  if (parentPath === null || parentPath.length === 0) {
    return {
      directoryPath: null,
      flattenedSegmentPath: null,
      hoveredPath,
      kind: 'root',
    };
  }

  return {
    directoryPath: parentPath,
    flattenedSegmentPath: null,
    hoveredPath,
    kind: 'directory',
  };
}

export function createDragPreviewElement(
  sourceElement: HTMLElement
): HTMLElement {
  const preview = sourceElement.cloneNode(true);
  if (!isHTMLElement(preview)) {
    throw new Error('Expected cloned drag preview to be an HTMLElement');
  }
  preview.removeAttribute('id');
  preview.dataset.fileTreeDragPreview = 'true';
  preview.setAttribute('aria-hidden', 'true');
  preview.tabIndex = -1;
  Object.assign(preview.style, {
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    left: '0px',
    margin: '0',
    pointerEvents: 'none',
    position: 'fixed',
    top: '0px',
    willChange: 'transform',
    zIndex: '10000',
  });
  return preview;
}

// Safari mis-renders detached custom drag images, so keep its pointer drags on
// the native preview path that the legacy tree already used successfully.
export function shouldUseCustomPointerDragImage(): boolean {
  return navigator.vendor !== 'Apple Computer, Inc.';
}

export function getDragEdgeScrollDelta(
  clientY: number,
  scrollRect: DOMRect
): number {
  const topDistance = clientY - scrollRect.top;
  if (topDistance < DRAG_EDGE_SCROLL_THRESHOLD) {
    const clampedDistance = Math.max(0, topDistance);
    return -Math.ceil(
      ((DRAG_EDGE_SCROLL_THRESHOLD - clampedDistance) /
        DRAG_EDGE_SCROLL_THRESHOLD) *
        DRAG_EDGE_SCROLL_MAX_SPEED
    );
  }

  const bottomDistance = scrollRect.bottom - clientY;
  if (bottomDistance < DRAG_EDGE_SCROLL_THRESHOLD) {
    const clampedDistance = Math.max(0, bottomDistance);
    return Math.ceil(
      ((DRAG_EDGE_SCROLL_THRESHOLD - clampedDistance) /
        DRAG_EDGE_SCROLL_THRESHOLD) *
        DRAG_EDGE_SCROLL_MAX_SPEED
    );
  }

  return 0;
}

// Built-in git decorations now live in their own fixed lane so custom row
// decorations can coexist without borrowing git styling or precedence.
export function getBuiltInGitStatusDecoration(
  gitStatus: GitStatus | null,
  containsGitChange: boolean,
  labels: FileTreeLabels
): FileTreeRowDecoration | null {
  if (gitStatus !== null) {
    const label = GIT_STATUS_LABEL[gitStatus];
    if (label === null) {
      return null;
    }

    return {
      text: label,
      title: labels.gitStatusTitles[gitStatus],
    };
  }

  if (containsGitChange) {
    return {
      icon: { name: 'file-tree-icon-dot', width: 6, height: 6 },
      title: labels.containsGitStatusTitle,
    };
  }

  return null;
}

export function getInheritedIgnoredGitStatus(
  ancestorPaths: ReadonlyArray<string>,
  ignoredDirectoryPaths: ReadonlySet<string> | undefined,
  ignoredInheritanceCache: Map<string, boolean>
): GitStatus | null {
  if (ignoredDirectoryPaths === undefined || ignoredDirectoryPaths.size === 0) {
    return null;
  }

  const visitedAncestors: Array<string> = [];
  for (let index = ancestorPaths.length - 1; index >= 0; index -= 1) {
    const ancestorPath = ancestorPaths[index];
    const cached = ignoredInheritanceCache.get(ancestorPath);
    if (cached !== undefined) {
      for (const visitedAncestor of visitedAncestors) {
        ignoredInheritanceCache.set(visitedAncestor, cached);
      }
      return cached ? 'ignored' : null;
    }

    if (ignoredDirectoryPaths.has(ancestorPath)) {
      ignoredInheritanceCache.set(ancestorPath, true);
      for (const visitedAncestor of visitedAncestors) {
        ignoredInheritanceCache.set(visitedAncestor, true);
      }
      return 'ignored';
    }

    visitedAncestors.push(ancestorPath);
  }

  for (const visitedAncestor of visitedAncestors) {
    ignoredInheritanceCache.set(visitedAncestor, false);
  }

  return null;
}

export function isFileTreeDirectoryHandle(
  item: FileTreeItemHandle | null
): item is FileTreeDirectoryHandle {
  return item !== null && 'toggle' in item;
}

export function isSpaceSelectionKey(event: KeyboardEvent): boolean {
  return (
    event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar'
  );
}

export function isSearchOpenSeedKey(event: KeyboardEvent): boolean {
  return (
    event.key.length === 1 &&
    /^[\p{L}\p{N}]$/u.test(event.key) &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  );
}

export function isContextMenuOpenKey(event: KeyboardEvent): boolean {
  return (event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu';
}

// Sticky DOM reads are only needed for keys whose behavior depends on the
// current focused row. This keeps ordinary keydowns out of the query/measure
// path while preserving stale-DOM-focus repair for sticky keyboard actions.
export function canKeyUseStickyKeyboardState(
  event: KeyboardEvent,
  contextMenuEnabled: boolean
): boolean {
  if (contextMenuEnabled && isContextMenuOpenKey(event)) {
    return true;
  }

  if ((event.ctrlKey || event.metaKey) && isSpaceSelectionKey(event)) {
    return true;
  }

  return (
    event.key === 'ArrowDown' ||
    event.key === 'ArrowLeft' ||
    event.key === 'ArrowRight' ||
    event.key === 'ArrowUp'
  );
}

export const BLOCKED_CONTEXT_MENU_NAV_KEYS = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp',
]);

export function isEventInContextMenu(event: Event): boolean {
  for (const entry of event.composedPath()) {
    if (!isHTMLElement(entry)) {
      continue;
    }

    if (entry.dataset.fileTreeContextMenuRoot === 'true') {
      return true;
    }

    if (
      entry.dataset.type === 'context-menu-anchor' ||
      entry.dataset.type === CONTEXT_MENU_TRIGGER_TYPE
    ) {
      return true;
    }
  }

  return false;
}

export function serializeAnchorRect(
  rect: DOMRect
): FileTreeContextMenuOpenContext['anchorRect'] {
  return {
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    width: rect.width,
    x: rect.x,
    y: rect.y,
  };
}

export function createAnchorRectFromPoint(
  x: number,
  y: number
): FileTreeContextMenuOpenContext['anchorRect'] {
  return {
    bottom: y,
    height: 0,
    left: x,
    right: x,
    top: y,
    width: 0,
    x,
    y,
  };
}

// The floating trigger is positioned against the root container, not the
// scrollbox. Using root-relative coordinates keeps sticky rows aligned even
// during the native scroll step before React processes the new layout.
export function getContextMenuAnchorTop(
  rootElement: HTMLElement | null,
  itemElement: HTMLElement
): number {
  if (rootElement === null) {
    return itemElement.offsetTop;
  }

  const itemRect = itemElement.getBoundingClientRect();
  const rootRect = rootElement.getBoundingClientRect();
  return itemRect.top - rootRect.top;
}

export function setButtonRef(
  buttonRefs: Map<string, HTMLElement>,
  path: string,
  element: HTMLElement | null
): void {
  if (element === null) {
    buttonRefs.delete(path);
    return;
  }

  buttonRefs.set(path, element);
}

// Sticky overlay rows are separate DOM mirrors of the real row. Prefer them
// when positioning the floating trigger so it follows the row the user can see.
export function getContextMenuAnchorButton(
  path: string | null,
  stickyButtonRefs: ReadonlyMap<string, HTMLElement>,
  rowButtonRefs: ReadonlyMap<string, HTMLElement>
): HTMLElement | null {
  if (path === null) {
    return null;
  }

  const stickyButton = stickyButtonRefs.get(path) ?? null;
  if (stickyButton !== null) {
    return stickyButton;
  }

  const rowButton = rowButtonRefs.get(path) ?? null;
  return rowButton?.dataset.itemParked === 'true' ? null : rowButton;
}

// Sticky keyboard handling runs during the browser event that follows a scroll.
// Reading the mounted overlay mirrors keeps that event aligned with the row the
// user can currently focus, even if the React layout snapshot is one frame old.
export function getMountedStickyRowPaths(
  rootElement: HTMLElement | null
): Array<string> {
  if (rootElement === null) {
    return [];
  }

  const paths: Array<string> = [];
  for (const element of rootElement.querySelectorAll(
    'button[data-file-tree-sticky-row="true"]'
  )) {
    if (!isHTMLElement(element)) {
      continue;
    }

    const path = element.dataset.fileTreeStickyPath;
    if (path !== undefined) {
      paths.push(path);
    }
  }

  return paths;
}

export function getFocusedParkedRowElement(
  rootElement: HTMLElement | null,
  path: string | null
): HTMLElement | null {
  if (rootElement === null || path === null) {
    return null;
  }

  for (const element of rootElement.querySelectorAll(
    'button[data-item-focused="true"][data-item-parked="true"]'
  )) {
    if (isHTMLElement(element) && element.dataset.itemPath === path) {
      return element;
    }
  }

  return null;
}

// Sticky keyboard exits use the focused sticky mirror as a proxy for where the
// canonical row should remain after focus moves or the row collapses. Keeping
// the layout reads here avoids measuring DOM for ordinary key handling.
export function getStickyKeyboardViewportOffset(
  rootElement: HTMLElement | null,
  scrollElement: HTMLElement | null,
  activeTreeElement: HTMLElement | null,
  path: string | null,
  itemHeight: number,
  stickyOverlayHeight: number,
  viewportHeight: number
): number {
  const minimumStickyKeyboardViewportOffset = Math.max(
    0,
    stickyOverlayHeight - itemHeight
  );
  const scrollElementRect = scrollElement?.getBoundingClientRect() ?? null;
  const activeElementTopWithinViewport =
    scrollElementRect === null || activeTreeElement === null
      ? null
      : activeTreeElement.getBoundingClientRect().top - scrollElementRect.top;
  const focusedParkedRowElement = getFocusedParkedRowElement(rootElement, path);
  const parkedElementTopWithinViewport =
    scrollElementRect === null || focusedParkedRowElement === null
      ? null
      : focusedParkedRowElement.getBoundingClientRect().top -
        scrollElementRect.top;

  return Math.max(
    0,
    Math.min(
      parkedElementTopWithinViewport ??
        Math.max(
          activeElementTopWithinViewport ?? 0,
          minimumStickyKeyboardViewportOffset
        ),
      Math.max(0, viewportHeight - itemHeight)
    )
  );
}

export function createContextMenuItem(
  row: FileTreeVisibleRow,
  path: string
): FileTreeContextMenuItem {
  return {
    kind: row.kind,
    name: getFileTreeRowAriaLabel(row),
    path,
  };
}

export function getFileTreeRootDomId(
  instanceId: string | undefined
): string | undefined {
  return instanceId === undefined ? undefined : `${instanceId}__tree`;
}

// Search keeps DOM focus on the built-in input, so the focused row still needs
// a stable DOM id for aria-activedescendant and visual-focus parity.
export function getFileTreeFocusedRowDomId(
  instanceId: string | undefined,
  path: string,
  parked: boolean
): string | undefined {
  if (instanceId === undefined) {
    return undefined;
  }

  return `${instanceId}__focused-item-${encodeURIComponent(path)}${parked ? '__parked' : ''}`;
}

export function isBuiltInDecorationIconName(
  name: string
): name is SVGSpriteNames {
  return (
    name === 'file-tree-icon-chevron' ||
    name === 'file-tree-icon-dot' ||
    name === 'file-tree-icon-file' ||
    name === 'file-tree-icon-lock'
  );
}

export function focusFirstMenuElement(menuElement: HTMLElement | null): void {
  if (menuElement === null) {
    return;
  }

  const focusable = menuElement.querySelector<HTMLElement>(
    [
      'button:not([disabled])',
      '[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ')
  );

  focusElement(focusable ?? menuElement);
}
