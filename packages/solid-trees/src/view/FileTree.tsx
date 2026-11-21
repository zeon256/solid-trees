import type { JSX } from '@solidjs/web';
import {
  children,
  createEffect,
  createMemo,
  createSignal,
  For,
  omit,
  onCleanup,
  onSettled,
  Show,
} from 'solid-js';

import {
  getBuiltInSpriteSheet,
  isColoredBuiltInIconSet,
} from '../builtInIcons';
import { CONTEXT_MENU_TRIGGER_TYPE } from '../constants';
import { normalizeFileTreeIcons } from '../iconConfig';
import { FILE_TREE_RENAME_VIEW } from '../model/FileTreeController';
import { FILE_TREE_VIEW_STATE } from '../model/FileTreeModel';
import type { FileTreeModel } from '../model/FileTreeModel';
import type {
  FileTreeContextMenuItem,
  FileTreeContextMenuOpenContext,
  FileTreeDropTarget,
  FileTreeVisibleRow,
} from '../model/publicTypes';
import { FILE_TREE_DEFAULT_OVERSCAN } from '../model/virtualization';
import {
  focusElement,
  getActiveTreeElement,
  getCachedViewportHeight,
  getParkedFocusedRowOffset,
  getResizeObserverViewportHeight,
  readMeasuredViewportHeight,
  scrollFocusedRowIntoView,
  scrollFocusedRowToOffset,
  scrollFocusedRowToViewportOffset,
} from '../render/focusHelpers';
import { createFileTreeIconResolver } from '../render/iconResolver';
import { classifyFileTreeRenameHandoff } from '../render/renameHandoff';
import { computeFileTreeRowClickPlan } from '../render/rowClickPlan';
import type { FileTreeRowClickMode } from '../render/rowClickPlan';
import { isHTMLElement, isNode, isShadowRoot } from '../utils/domGuards';
import { FileTreeRow } from './FileTreeRow';
import type {
  FileTreeContextMenuConfig,
  FileTreeRowFrame,
} from './FileTreeRow';
import { Icon } from './Icon';
import { FILE_TREE_STRUCTURAL_CSS } from './structuralStyles';
import {
  BLOCKED_CONTEXT_MENU_NAV_KEYS,
  canKeyUseStickyKeyboardState,
  computeFileTreeViewLayoutState,
  createContextMenuItem,
  createDragPreviewElement,
  focusFirstMenuElement,
  getContextMenuAnchorButton,
  getContextMenuAnchorTop,
  getDragEdgeScrollDelta,
  getFileTreeFocusedRowDomId,
  getFileTreeRootDomId,
  getFileTreeRowPath,
  getMountedStickyRowPaths,
  getPointElement,
  getStickyKeyboardViewportOffset,
  isContextMenuOpenKey,
  isEventInContextMenu,
  isFileTreeDirectoryHandle,
  isSearchOpenSeedKey,
  isSpaceSelectionKey,
  resolveDropTargetFromElement,
  serializeAnchorRect,
  shouldUseCustomPointerDragImage,
  TOUCH_LONG_PRESS_DELAY,
  TOUCH_LONG_PRESS_MOVE_THRESHOLD,
} from './viewHelpers';
import type { FileTreeViewLayoutState } from './viewHelpers';

export type FileTreeRenderContextMenu = (
  item: FileTreeContextMenuItem,
  context: FileTreeContextMenuOpenContext
) => JSX.Element;

export interface FileTreeProps extends Omit<
  JSX.HTMLAttributes<HTMLDivElement>,
  // The root id derives from the model `id` option (`<id>__tree`) and is
  // referenced by the search input's aria-controls.
  'children' | 'style' | 'id' | 'role'
> {
  model: FileTreeModel;
  /** Rendered above the search input and rows. */
  header?: JSX.Element;
  /**
   * Renders the open context menu inside the floating anchor. Providing it
   * enables the context menu. Content portaled elsewhere must carry
   * `data-file-tree-context-menu-root="true"` so clicks inside it are not
   * treated as outside clicks.
   */
  renderContextMenu?: FileTreeRenderContextMenu;
  style?: JSX.CSSProperties;
}

type ContextMenuSource = 'button' | 'keyboard' | 'right-click';

interface ContextMenuState {
  anchorRect: FileTreeContextMenuOpenContext['anchorRect'] | null;
  item: FileTreeContextMenuItem;
  path: string;
  source: ContextMenuSource;
  // Monotonic open-generation token identifying this menu instance. A
  // superseded menu's async close() carries the token it was opened with, so
  // a stale close cannot tear down the menu that replaced it.
  token: number;
}

interface FileTreeDragSessionSnapshot {
  draggedPaths: ReadonlyArray<string>;
  primaryPath: string;
  target: FileTreeDropTarget | null;
}

function areDragSessionsEqual(
  previous: FileTreeDragSessionSnapshot | null,
  next: FileTreeDragSessionSnapshot | null
): boolean {
  if (previous === null || next === null) {
    return previous === next;
  }

  const previousTarget = previous.target;
  const nextTarget = next.target;
  return (
    previous.primaryPath === next.primaryPath &&
    previous.draggedPaths.length === next.draggedPaths.length &&
    previous.draggedPaths.every(
      (path, index) => next.draggedPaths[index] === path
    ) &&
    (previousTarget === nextTarget ||
      (previousTarget !== null &&
        nextTarget !== null &&
        previousTarget.kind === nextTarget.kind &&
        previousTarget.directoryPath === nextTarget.directoryPath &&
        previousTarget.flattenedSegmentPath ===
          nextTarget.flattenedSegmentPath &&
        previousTarget.hoveredPath === nextTarget.hoveredPath))
  );
}

function areContextMenuConfigsEqual(
  previous: FileTreeContextMenuConfig,
  next: FileTreeContextMenuConfig
): boolean {
  return (
    previous.enabled === next.enabled &&
    previous.buttonTriggerEnabled === next.buttonTriggerEnabled &&
    previous.buttonVisibility === next.buttonVisibility &&
    previous.rightClickEnabled === next.rightClickEnabled &&
    previous.triggerMode === next.triggerMode
  );
}

// Only the keys that move the scroll position mark the tree as scrolling;
// otherwise Shift+F10 / ContextMenu would trip the suppression and hide the
// keyboard-opened menu.
const SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
  'Spacebar',
]);

function noop(): void {}

function registerRowButton(
  elements: Map<string, HTMLElement>,
  path: string,
  element: HTMLElement,
  register: boolean
): void {
  if (register) {
    elements.set(path, element);
  } else if (elements.get(path) === element) {
    elements.delete(path);
  }
}

function requestDragAnimationFrame(callback: () => void): number {
  return typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame(() => {
        callback();
      })
    : window.setTimeout(callback, 16);
}

function cancelDragAnimationFrame(handle: number | null): void {
  if (handle === null) {
    return;
  }

  if (typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(handle);
    return;
  }

  window.clearTimeout(handle);
}

function blockEvent(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
}

/**
 * Virtualized, keyboard-navigable file tree bound to a `FileTreeModel`. The
 * root needs a bounded height (e.g. `style={{ height: '320px' }}`); rows are
 * unstyled apart from the layout the virtualizer requires.
 */
export function FileTree(props: FileTreeProps): JSX.Element {
  // Each model gets its own view instance; swapping models remounts.
  return (
    <Show when={props.model} keyed>
      {(model) => <FileTreeView model={model} host={props} />}
    </Show>
  );
}

function FileTreeView(props: {
  model: FileTreeModel;
  host: FileTreeProps;
}): JSX.Element {
  const model = props.model;
  const viewState = model[FILE_TREE_VIEW_STATE]();
  const {
    controller,
    density,
    initialViewportHeight,
    renamingEnabled,
    searchBlurBehavior,
    searchEnabled,
    searchFakeFocus,
    stickyFolders,
  } = viewState;
  const instanceId = viewState.id;
  const itemHeight = density.itemHeight;
  const overscan = viewState.overscan ?? FILE_TREE_DEFAULT_OVERSCAN;
  const renameView = controller[FILE_TREE_RENAME_VIEW]();
  const treeDomId = getFileTreeRootDomId(instanceId);
  const hostProps = omit(
    props.host,
    'model',
    'header',
    'renderContextMenu',
    'style'
  );
  const header = children(() => props.host.header);

  let rootElement: HTMLDivElement | undefined;
  let scrollElement: HTMLDivElement | undefined;
  let listElement: HTMLDivElement | undefined;
  let searchInputElement: HTMLInputElement | undefined;
  let renameInputElement: HTMLInputElement | null = null;
  let contextMenuAnchorElement: HTMLDivElement | undefined;
  let contextMenuTriggerElement: HTMLButtonElement | undefined;
  let contextMenuContentElement: HTMLDivElement | undefined;
  const rowButtonElements = new Map<string, HTMLElement>();
  const stickyRowButtonElements = new Map<string, HTMLElement>();
  let isScrolling = false;
  let updateViewport: () => void = noop;
  let measuredViewportHeight: number | null = null;
  let processedScrollRequestId = 0;
  let domFocusOwner = false;
  let previousFocusedPath: string | null = null;
  let previousRenamingPath: string | null = null;
  let restoreTreeFocusAfterSearchClose = false;
  let restoreTreeFocusViewportOffset: number | null = null;
  let dragAutoScrollFrame: number | null = null;
  let dragHoverOpenKey: string | null = null;
  let dragHoverOpenTimer: ReturnType<typeof setTimeout> | null = null;
  let dragPoint: { clientX: number; clientY: number } | null = null;
  let dragPreview: HTMLElement | null = null;
  let dragRowSnapshot: FileTreeVisibleRow | null = null;
  let touchCleanup: (() => void) | null = null;
  let touchDragActive = false;
  let touchPreviewOffset: { x: number; y: number } | null = null;
  let touchSourceElement: HTMLElement | null = null;
  let touchStartPoint: { clientX: number; clientY: number } | null = null;
  let touchLongPressTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingStickyFocusPath: string | null = null;
  let pendingStickyKeyboardFocusPath: string | null = null;
  let pendingStickyKeyboardViewportOffset: {
    path: string;
    viewportOffset: number;
  } | null = null;
  let pendingStickyKeyboardScrollTop: {
    path: string;
    scrollTop: number;
  } | null = null;
  let shouldRestoreContextMenuFocus = true;
  let contextMenuOpenToken = 0;
  // Trees that mount with an already-open search session should not steal
  // focus from sibling trees during mount when the consumer opted into
  // `'retain'` blur behavior.
  let skipInitialSearchAutoFocus =
    searchBlurBehavior === 'retain' && controller.isSearchOpen();
  // With `searchBlurBehavior: 'retain'` the initial query survives mount-time
  // focus churn; once the user interacts, blur-to-close resumes.
  let searchInputUserInteracted = false;

  // Local render tick for interactions whose controller change does not alter
  // anything the memos below compare (focus-only moves still need the DOM
  // focus sync to re-run).
  const [tick, setTick] = createSignal(0, { ownedWrite: true });
  const bumpRevision = () => setTick((value) => value + 1);
  const trackRevision = () => {
    viewState.trackController();
    tick();
  };

  const [activeItemPath, setActiveItemPath] = createSignal<string | null>(null);
  const [contextHoverPath, setContextHoverPath] = createSignal<string | null>(
    null
  );
  // Always notifies: visibility derives from the (non-reactive) row element
  // registry, so a re-measure at the same top must still re-evaluate it.
  const [contextMenuAnchorTop, setContextMenuAnchorTop] = createSignal<
    number | null
  >(null, { equals: false });
  const [lastContextMenuInteraction, setLastContextMenuInteraction] =
    createSignal<'focus' | 'pointer' | null>(null);
  const [scrollSettledRevision, setScrollSettledRevision] = createSignal(0);
  const [fakeSearchFocusActive, setFakeSearchFocusActive] =
    createSignal(searchFakeFocus);
  // `currentContextMenuState` is the synchronous source of truth for handlers;
  // the signal drives rendering after the next flush.
  let currentContextMenuState: ContextMenuState | null = null;
  const [contextMenuState, setContextMenuStateSignal] =
    createSignal<ContextMenuState | null>(null);
  const setContextMenuState = (next: ContextMenuState | null) => {
    currentContextMenuState = next;
    setContextMenuStateSignal(next);
  };
  const [layoutState, setLayoutState] = createSignal<FileTreeViewLayoutState>(
    computeFileTreeViewLayoutState({
      controller,
      itemHeight,
      overscan,
      scrollTop: 0,
      stickyFolders,
      viewportHeight: initialViewportHeight,
    }),
    { ownedWrite: true }
  );

  const renamingPath = createMemo(() => {
    trackRevision();
    return renameView.getPath();
  });
  const renamingValue = createMemo(() => {
    trackRevision();
    return renameView.getValue();
  });
  const isSearchOpen = createMemo(() => {
    trackRevision();
    return controller.isSearchOpen();
  });
  const searchValue = createMemo(() => {
    trackRevision();
    return controller.getSearchValue();
  });
  const focusedPath = createMemo(() => {
    trackRevision();
    return controller.getFocusedPath();
  });
  const focusedIndex = createMemo(() => {
    trackRevision();
    return controller.getFocusedIndex();
  });
  const scrollRequest = createMemo(() => {
    trackRevision();
    return controller.getScrollRequest();
  });
  const dragAndDropEnabled = createMemo(() => {
    trackRevision();
    return controller.isDragAndDropEnabled();
  });
  const dragSession = createMemo(
    () => {
      trackRevision();
      return controller.getDragSession();
    },
    { equals: areDragSessionsEqual }
  );
  const draggedPathSet = createMemo(() => {
    const session = dragSession();
    return session === null ? null : new Set(session.draggedPaths);
  });
  const dragTarget = createMemo(() => dragSession()?.target ?? null);

  const contextMenu = createMemo<FileTreeContextMenuConfig>(
    () => {
      const options = model.getComposition()?.contextMenu;
      const enabled =
        props.host.renderContextMenu !== undefined ||
        options?.enabled === true ||
        options?.onOpen !== undefined ||
        options?.onClose !== undefined;
      const triggerMode =
        options?.triggerMode ?? (enabled ? 'right-click' : 'both');
      return {
        buttonTriggerEnabled:
          triggerMode === 'both' || triggerMode === 'button',
        buttonVisibility: options?.buttonVisibility ?? 'when-needed',
        enabled,
        rightClickEnabled:
          triggerMode === 'both' || triggerMode === 'right-click',
        triggerMode,
      };
    },
    { equals: areContextMenuConfigsEqual }
  );
  const labels = createMemo(() => viewState.getLabels());
  const gitStatusState = createMemo(() => viewState.getGitStatusState());
  // Ancestor lookups are cached per git status snapshot.
  const ignoredInheritanceCache = createMemo(() => {
    gitStatusState();
    return new Map<string, boolean>();
  });
  const icons = createMemo(() => viewState.getIcons());
  const normalizedIcons = createMemo(() => normalizeFileTreeIcons(icons()));
  const resolveIcon = createMemo(
    () => createFileTreeIconResolver(icons()).resolveIcon
  );
  const spriteSheetHtml = createMemo(
    () =>
      `${getBuiltInSpriteSheet(normalizedIcons().set)}${normalizedIcons().spriteSheet?.trim() ?? ''}`
  );

  const layoutSnapshot = () => layoutState().snapshot;
  const range = createMemo(
    () => ({
      end: layoutSnapshot().window.endIndex,
      start: layoutSnapshot().window.startIndex,
    }),
    {
      equals: (previous, next) =>
        previous.start === next.start && previous.end === next.end,
    }
  );
  const resolvedViewportHeight = () => layoutSnapshot().physical.viewportHeight;
  const totalScrollableHeight = () => layoutSnapshot().physical.totalHeight;
  const stickyOverlayHeight = () => layoutSnapshot().sticky.height;
  // The overlay mirrors `overlayRows` (which includes the scrollTop=0
  // preview); the flow list hides only rows the overlay actually covers.
  const stickyRows = () => layoutState().overlayRows;
  const stickyRowPathSet = createMemo(
    () =>
      new Set(
        layoutSnapshot().sticky.rows.map((entry) =>
          getFileTreeRowPath(entry.row)
        )
      )
  );
  const focusedRowIsMounted = () =>
    focusedIndex() >= 0 &&
    focusedIndex() >= range().start &&
    focusedIndex() <= range().end;
  const focusedVisibleRow = createMemo(() => {
    trackRevision();
    const index = focusedIndex();
    return index >= 0
      ? (layoutState().visibleRows[index] ??
          controller.getVisibleRows(index, index)[0] ??
          null)
      : null;
  });

  const markSearchInputInteracted = () => {
    searchInputUserInteracted = true;
    setFakeSearchFocusActive(false);
  };

  const getTriggerAnchorButton = (path: string | null): HTMLElement | null =>
    getContextMenuAnchorButton(
      path,
      stickyRowButtonElements,
      rowButtonElements
    );

  const restoreContextMenuFocus = (restorePath: string | null): boolean => {
    const focusedButton =
      restorePath === null
        ? null
        : (rowButtonElements.get(restorePath) ?? null);
    if (focusElement(focusedButton)) {
      return true;
    }

    return focusElement(rootElement ?? null);
  };
  const restoreFocusToTree = (path: string | null): void => {
    restoreContextMenuFocus(controller.focusNearestPath(path));
  };
  const closeContextMenu = (
    restoreFocus: boolean = true,
    expectedToken?: number
  ): void => {
    const state = currentContextMenuState;
    if (state === null) {
      return;
    }

    // Ignore a close() issued by a superseded menu instance.
    if (expectedToken !== undefined && expectedToken !== state.token) {
      return;
    }

    shouldRestoreContextMenuFocus =
      shouldRestoreContextMenuFocus && restoreFocus;
    setContextMenuState(null);
    viewState.peekComposition()?.contextMenu?.onClose?.();
    if (shouldRestoreContextMenuFocus) {
      restoreFocusToTree(state.path);
    }
  };
  // Reopening the row that already has the menu open from the same source
  // keeps its token so the rendered menu's close() stays valid.
  const nextContextMenuToken = (
    path: string,
    source: ContextMenuSource
  ): number => {
    const state = currentContextMenuState;
    if (state !== null && state.path === path && state.source === source) {
      return state.token;
    }
    contextMenuOpenToken += 1;
    return contextMenuOpenToken;
  };
  const updateTriggerPosition = (itemButton: HTMLElement | null): void => {
    setContextMenuAnchorTop(
      itemButton === null
        ? null
        : getContextMenuAnchorTop(rootElement ?? null, itemButton)
    );
  };

  // Keep the coupled sticky-keyboard state moving together so each transition
  // leaves exactly one preservation mode active.
  const clearPendingStickyKeyboardState = (): void => {
    pendingStickyKeyboardFocusPath = null;
    pendingStickyKeyboardViewportOffset = null;
    pendingStickyKeyboardScrollTop = null;
  };
  const preserveStickyKeyboardFocusAtScrollTop = (
    path: string,
    scrollTop: number | null
  ): void => {
    pendingStickyKeyboardFocusPath = path;
    pendingStickyKeyboardViewportOffset = null;
    pendingStickyKeyboardScrollTop =
      scrollTop === null ? null : { path, scrollTop };
  };
  const restoreStickyKeyboardViewportOffset = (
    path: string,
    viewportOffset: number
  ): void => {
    pendingStickyKeyboardFocusPath = null;
    pendingStickyKeyboardViewportOffset = { path, viewportOffset };
    pendingStickyKeyboardScrollTop = null;
  };

  const openContextMenuForRow = (
    row: FileTreeVisibleRow,
    targetPath: string,
    options?: {
      anchorRect?: FileTreeContextMenuOpenContext['anchorRect'];
      source?: ContextMenuSource;
    }
  ): void => {
    const item = controller.getItem(targetPath);
    if (item === null) {
      return;
    }

    const anchorButton = getTriggerAnchorButton(targetPath);
    if (anchorButton?.dataset.fileTreeStickyRow === 'true') {
      preserveStickyKeyboardFocusAtScrollTop(
        targetPath,
        scrollElement?.scrollTop ?? null
      );
      domFocusOwner = true;
      setActiveItemPath(targetPath);
    }
    // Item focus is controller focus, not DOM focus; it stays scroll-neutral
    // so a sticky anchor is not revealed before the focus sync restores it.
    item.focus();
    updateTriggerPosition(anchorButton);
    shouldRestoreContextMenuFocus = true;
    const source = options?.source ?? 'keyboard';
    setContextMenuState({
      anchorRect: options?.anchorRect ?? null,
      item: createContextMenuItem(row, targetPath),
      path: targetPath,
      source,
      token: nextContextMenuToken(targetPath, source),
    });
  };

  const startRenameFromPath = (path?: string): void => {
    if (!renamingEnabled) {
      return;
    }

    if (controller.isSearchOpen()) {
      const viewportHeight = readMeasuredViewportHeight(
        scrollElement ?? null,
        resolvedViewportHeight()
      );
      const currentFocusedIndex = controller.getFocusedIndex();
      restoreTreeFocusViewportOffset =
        currentFocusedIndex < 0 || scrollElement === undefined
          ? null
          : Math.max(
              0,
              Math.min(
                currentFocusedIndex * itemHeight - scrollElement.scrollTop,
                Math.max(0, viewportHeight - itemHeight)
              )
            );
      restoreTreeFocusAfterSearchClose = true;
    }

    if (!controller.startRenaming(path)) {
      return;
    }

    setLastContextMenuInteraction('focus');
    bumpRevision();
  };

  // Sticky overlay clicks land on the canonical row so rename inputs and
  // roving focus stay owned by the in-flow treeitem, not the aria-hidden
  // mirror.
  const revealCanonicalRowAtStickyOffset = (
    path: string,
    {
      restoreTreeFocus = true,
      targetOffset = 'live-overlay',
    }: {
      restoreTreeFocus?: boolean;
      targetOffset?: 'live-overlay' | 'sticky-parents';
    } = {}
  ): boolean => {
    if (scrollElement === undefined) {
      return false;
    }

    controller.focusPath(path);
    const visibleIndex = controller.getFocusedIndex();
    if (visibleIndex < 0) {
      return false;
    }

    const focusedRow =
      controller.getVisibleRows(visibleIndex, visibleIndex)[0] ?? null;
    if (focusedRow === null) {
      return false;
    }

    // Also runs from the rename-handoff effect, so read the same cached height
    // the layout snapshot was built from rather than the reactive snapshot.
    const liveViewportHeight = readMeasuredViewportHeight(
      scrollElement,
      getCachedViewportHeight(measuredViewportHeight, initialViewportHeight)
    );
    const liveTotalHeight = controller.getVisibleCount() * itemHeight;
    const targetViewportOffset =
      targetOffset === 'sticky-parents'
        ? focusedRow.ancestorPaths.length * itemHeight
        : computeFileTreeViewLayoutState({
            controller,
            itemHeight,
            overscan,
            scrollTop: scrollElement.scrollTop,
            stickyFolders,
            viewportHeight: liveViewportHeight,
          }).snapshot.sticky.height;

    // Collapsing the interacted sticky row leaves only its parents pinned,
    // while rename handoff keeps using the live overlay geometry.
    domFocusOwner = true;
    scrollFocusedRowToViewportOffset(
      scrollElement,
      visibleIndex,
      itemHeight,
      liveViewportHeight,
      liveTotalHeight,
      targetViewportOffset
    );
    updateViewport();
    pendingStickyFocusPath = restoreTreeFocus ? path : null;
    return true;
  };

  const shouldSuppressContextMenu = (): boolean =>
    isScrolling || touchLongPressTimer !== null || touchDragActive;

  const clearDragHoverOpen = (): void => {
    if (dragHoverOpenTimer !== null) {
      clearTimeout(dragHoverOpenTimer);
      dragHoverOpenTimer = null;
    }
    dragHoverOpenKey = null;
  };

  const clearDragPreview = (): void => {
    dragPreview?.remove();
    dragPreview = null;
  };

  const stopDragAutoScroll = (): void => {
    cancelDragAnimationFrame(dragAutoScrollFrame);
    dragAutoScrollFrame = null;
    dragPoint = null;
  };

  const mountDragPreview = (preview: HTMLElement): void => {
    const rootNode = rootElement?.getRootNode();
    if (isShadowRoot(rootNode)) {
      rootNode.append(preview);
      return;
    }

    document.body.append(preview);
  };

  const clearTouchDragResources = (): void => {
    touchCleanup?.();
    touchCleanup = null;
    if (touchLongPressTimer !== null) {
      clearTimeout(touchLongPressTimer);
      touchLongPressTimer = null;
    }
    touchDragActive = false;
    touchPreviewOffset = null;
    touchStartPoint = null;
    if (touchSourceElement !== null) {
      touchSourceElement.setAttribute('draggable', 'true');
      touchSourceElement.style.removeProperty('touch-action');
      touchSourceElement = null;
    }
    clearDragPreview();
    clearDragHoverOpen();
    stopDragAutoScroll();
    dragRowSnapshot = null;
  };

  const syncDropTargetFromPoint = (
    clientX: number,
    clientY: number
  ): FileTreeDropTarget | null => {
    const rootNode = rootElement?.getRootNode();
    const pointRoot = isShadowRoot(rootNode) ? rootNode : document;
    const pointElement = getPointElement(pointRoot, clientX, clientY);
    controller.setDragTarget(resolveDropTargetFromElement(pointElement));
    return controller.getDragSession()?.target ?? null;
  };

  const scheduleDragHoverOpen = (
    nextTarget: FileTreeDropTarget | null
  ): void => {
    const openDelay = controller.getDragAndDropConfig()?.openOnDropDelay ?? 800;
    if (
      nextTarget === null ||
      nextTarget.kind !== 'directory' ||
      nextTarget.directoryPath === null ||
      openDelay <= 0
    ) {
      clearDragHoverOpen();
      return;
    }

    const targetItem = controller.getItem(nextTarget.directoryPath);
    const directoryItem = isFileTreeDirectoryHandle(targetItem)
      ? targetItem
      : null;
    if (directoryItem === null || directoryItem.isExpanded()) {
      clearDragHoverOpen();
      return;
    }

    const nextKey = `${nextTarget.directoryPath}::${nextTarget.flattenedSegmentPath ?? ''}`;
    if (dragHoverOpenKey === nextKey) {
      return;
    }

    clearDragHoverOpen();
    dragHoverOpenKey = nextKey;
    dragHoverOpenTimer = setTimeout(() => {
      const currentTarget = controller.getDragSession()?.target;
      if (
        currentTarget?.kind !== 'directory' ||
        currentTarget.directoryPath !== nextTarget.directoryPath ||
        currentTarget.flattenedSegmentPath !== nextTarget.flattenedSegmentPath
      ) {
        return;
      }

      directoryItem.expand();
    }, openDelay);
  };

  const runDragAutoScroll = (): void => {
    dragAutoScrollFrame = null;
    const point = dragPoint;
    if (
      point === null ||
      scrollElement === undefined ||
      controller.getDragSession() === null
    ) {
      return;
    }

    const scrollDelta = getDragEdgeScrollDelta(
      point.clientY,
      scrollElement.getBoundingClientRect()
    );
    if (scrollDelta === 0) {
      return;
    }

    const maxScrollTop = Math.max(
      0,
      scrollElement.scrollHeight - scrollElement.clientHeight
    );
    const boundedScrollTop = Math.max(
      0,
      Math.min(maxScrollTop, scrollElement.scrollTop + scrollDelta)
    );
    if (boundedScrollTop !== scrollElement.scrollTop) {
      scrollElement.scrollTop = boundedScrollTop;
      updateViewport();
    }

    scheduleDragHoverOpen(
      syncDropTargetFromPoint(point.clientX, point.clientY)
    );
    dragAutoScrollFrame = requestDragAnimationFrame(runDragAutoScroll);
  };

  const updateDragPoint = (clientX: number, clientY: number): void => {
    dragPoint = { clientX, clientY };
    dragAutoScrollFrame ??= requestDragAnimationFrame(runDragAutoScroll);
  };

  const handleRowDragStart = (
    event: DragEvent,
    row: FileTreeVisibleRow,
    targetPath: string
  ): void => {
    const dragSource = isHTMLElement(event.currentTarget)
      ? event.currentTarget
      : null;
    if (dragSource === null) {
      return;
    }

    clearTouchDragResources();
    clearDragPreview();
    clearDragHoverOpen();
    stopDragAutoScroll();
    if (!controller.startDrag(targetPath)) {
      event.preventDefault();
      return;
    }

    dragRowSnapshot = row;
    if (event.dataTransfer !== null) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.dropEffect = 'move';
      event.dataTransfer.setData('text/plain', targetPath);

      if (shouldUseCustomPointerDragImage()) {
        const preview = createDragPreviewElement(dragSource);
        const rect = dragSource.getBoundingClientRect();
        Object.assign(preview.style, {
          height: `${rect.height}px`,
          opacity: '0.85',
          transform: 'translate3d(-9999px, 0px, 0)',
          width: `${rect.width}px`,
        });
        mountDragPreview(preview);
        dragPreview = preview;
        event.dataTransfer.setDragImage(
          preview,
          Math.max(0, event.clientX - rect.left),
          Math.max(0, event.clientY - rect.top)
        );
      }
    }
  };

  const handleRowDragEnd = (): void => {
    clearDragPreview();
    clearDragHoverOpen();
    stopDragAutoScroll();
    dragRowSnapshot = null;
    controller.cancelDrag();
  };

  const handleRowTouchStart = (
    event: TouchEvent,
    row: FileTreeVisibleRow,
    targetPath: string
  ): void => {
    if (touchLongPressTimer !== null || touchDragActive) {
      return;
    }

    const touch = event.touches[0];
    const dragSource = isHTMLElement(event.currentTarget)
      ? event.currentTarget
      : null;
    if (touch === undefined || dragSource === null) {
      return;
    }

    touchStartPoint = { clientX: touch.clientX, clientY: touch.clientY };
    touchSourceElement = dragSource;
    dragSource.setAttribute('draggable', 'false');

    const clearPendingTouchStart = (
      options: { restoreNativeDraggable?: boolean } = {}
    ): void => {
      const restoreNativeDraggable =
        options.restoreNativeDraggable ?? !touchDragActive;
      if (touchLongPressTimer !== null) {
        clearTimeout(touchLongPressTimer);
        touchLongPressTimer = null;
      }
      document.removeEventListener('touchmove', handlePendingTouchMove);
      document.removeEventListener('touchend', handlePendingTouchEnd);
      document.removeEventListener('touchcancel', handlePendingTouchEnd);
      if (touchCleanup === clearPendingTouchStart) {
        touchCleanup = null;
      }
      if (restoreNativeDraggable) {
        dragSource.setAttribute('draggable', 'true');
        if (touchSourceElement === dragSource) {
          touchSourceElement = null;
        }
        touchStartPoint = null;
      }
    };

    const handlePendingTouchMove = (moveEvent: TouchEvent): void => {
      const moveTouch = moveEvent.touches[0];
      const startPoint = touchStartPoint;
      if (moveTouch === undefined || startPoint === null) {
        return;
      }

      const deltaX = moveTouch.clientX - startPoint.clientX;
      const deltaY = moveTouch.clientY - startPoint.clientY;
      if (
        deltaX * deltaX + deltaY * deltaY <=
        TOUCH_LONG_PRESS_MOVE_THRESHOLD * TOUCH_LONG_PRESS_MOVE_THRESHOLD
      ) {
        return;
      }

      clearPendingTouchStart();
    };

    const handlePendingTouchEnd = (): void => {
      clearPendingTouchStart();
    };

    document.addEventListener('touchmove', handlePendingTouchMove, {
      passive: true,
    });
    document.addEventListener('touchend', handlePendingTouchEnd);
    document.addEventListener('touchcancel', handlePendingTouchEnd);
    touchCleanup = clearPendingTouchStart;
    touchLongPressTimer = setTimeout(() => {
      // Keep native draggable disabled while the custom touch drag activates;
      // iOS Safari can otherwise promote the same long press into a native
      // HTML drag before the touch listeners take over.
      clearPendingTouchStart({ restoreNativeDraggable: false });
      if (!controller.startDrag(targetPath)) {
        dragSource.setAttribute('draggable', 'true');
        if (touchSourceElement === dragSource) {
          touchSourceElement = null;
        }
        touchStartPoint = null;
        return;
      }

      touchDragActive = true;
      touchSourceElement = dragSource;
      dragSource.setAttribute('draggable', 'false');
      dragSource.style.setProperty('touch-action', 'none');
      dragRowSnapshot = row;
      const rect = dragSource.getBoundingClientRect();
      const preview = createDragPreviewElement(dragSource);
      Object.assign(preview.style, {
        height: `${rect.height}px`,
        opacity: '0.85',
        transform: `translate3d(${rect.left}px, ${rect.top}px, 0)`,
        width: `${rect.width}px`,
      });
      mountDragPreview(preview);
      dragPreview = preview;
      touchPreviewOffset = {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };

      const handleActiveTouchMove = (moveEvent: TouchEvent): void => {
        const moveTouch = moveEvent.touches[0];
        if (moveTouch === undefined) {
          return;
        }

        moveEvent.preventDefault();
        const previewOffset = touchPreviewOffset;
        if (previewOffset !== null && dragPreview !== null) {
          dragPreview.style.transform = `translate3d(${moveTouch.clientX - previewOffset.x}px, ${moveTouch.clientY - previewOffset.y}px, 0)`;
        }

        scheduleDragHoverOpen(
          syncDropTargetFromPoint(moveTouch.clientX, moveTouch.clientY)
        );
        updateDragPoint(moveTouch.clientX, moveTouch.clientY);
      };

      const handleActiveTouchEnd = (endEvent: TouchEvent): void => {
        const endTouch = endEvent.changedTouches[0];
        if (endTouch !== undefined) {
          syncDropTargetFromPoint(endTouch.clientX, endTouch.clientY);
        }

        controller.completeDrag();
        clearTouchDragResources();
      };

      const handleActiveTouchCancel = (): void => {
        controller.cancelDrag();
        clearTouchDragResources();
      };

      touchCleanup = () => {
        document.removeEventListener('touchmove', handleActiveTouchMove);
        document.removeEventListener('touchend', handleActiveTouchEnd);
        document.removeEventListener('touchcancel', handleActiveTouchCancel);
      };
      document.addEventListener('touchmove', handleActiveTouchMove, {
        passive: false,
      });
      document.addEventListener('touchend', handleActiveTouchEnd);
      document.addEventListener('touchcancel', handleActiveTouchCancel);
    }, TOUCH_LONG_PRESS_DELAY);
  };

  // Solid delegates key events to `document`, so a native listener on the
  // scroll element would see every key before the tree handles it. Mark
  // scrolling here instead, only for scroll keys the tree let propagate
  // (handled keys stop propagation, as upstream's row handler did).
  let markKeyboardPreScroll: () => void = noop;
  const handleTreeKeyDown = (event: KeyboardEvent): void => {
    dispatchTreeKeyDown(event);
    if (
      !event.cancelBubble &&
      SCROLL_KEYS.has(event.key) &&
      isNode(event.target) &&
      scrollElement?.contains(event.target) === true
    ) {
      markKeyboardPreScroll();
    }
  };
  const dispatchTreeKeyDown = (event: KeyboardEvent): void => {
    if (currentContextMenuState !== null) {
      if (event.key === 'Escape') {
        closeContextMenu();
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (BLOCKED_CONTEXT_MENU_NAV_KEYS.has(event.key)) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    if (renameView.isActive()) {
      // Leave keys to an in-flight IME composition; committing or cancelling
      // here would truncate the candidate.
      if (event.isComposing || event.keyCode === 229) {
        return;
      }

      if (event.key === 'Escape') {
        renameView.cancel();
      } else if (event.key === 'Enter') {
        renameView.commit();
      } else {
        return;
      }

      setLastContextMenuInteraction('focus');
      bumpRevision();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (renamingEnabled && event.key === 'F2') {
      startRenameFromPath(controller.getFocusedPath() ?? undefined);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (controller.isSearchOpen()) {
      if (event.key === 'Escape') {
        restoreTreeFocusAfterSearchClose = false;
        restoreTreeFocusViewportOffset = null;
        controller.closeSearch();
      } else if (event.key === 'Enter') {
        // Enter selects the focused match and keeps the search open.
        const currentFocusedPath = controller.getFocusedPath();
        if (currentFocusedPath !== null) {
          controller.selectOnlyPath(currentFocusedPath);
        }
      } else if (event.key === 'ArrowDown') {
        controller.focusNextSearchMatch();
      } else if (event.key === 'ArrowUp') {
        controller.focusPreviousSearchMatch();
      } else {
        return;
      }

      setLastContextMenuInteraction('focus');
      bumpRevision();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (searchEnabled && isSearchOpenSeedKey(event)) {
      controller.openSearch(event.key);
      bumpRevision();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const contextMenuEnabled = contextMenu().enabled;
    const renderedFocusedPath = focusedPath();
    const isKeyboardContextMenuRequest =
      contextMenuEnabled && isContextMenuOpenKey(event);
    const shouldInspectStickyKeyboardState = canKeyUseStickyKeyboardState(
      event,
      contextMenuEnabled
    );
    const activeTreeElement =
      shouldInspectStickyKeyboardState && rootElement !== undefined
        ? getActiveTreeElement(rootElement)
        : null;
    const mountedStickyRowPathSet = shouldInspectStickyKeyboardState
      ? new Set(getMountedStickyRowPaths(rootElement ?? null))
      : new Set<string>();
    const activeStickyFocusPath =
      activeTreeElement?.dataset.fileTreeStickyPath ?? null;
    const activeStickyRowOwnsFocus =
      activeTreeElement?.dataset.fileTreeStickyRow === 'true' &&
      activeStickyFocusPath !== null;
    if (
      activeStickyRowOwnsFocus &&
      activeStickyFocusPath !== renderedFocusedPath &&
      mountedStickyRowPathSet.has(activeStickyFocusPath)
    ) {
      // Syncing controller focus to a sticky DOM mirror can otherwise reveal
      // the offscreen canonical row before the key action decides what to do.
      preserveStickyKeyboardFocusAtScrollTop(
        activeStickyFocusPath,
        scrollElement?.scrollTop ?? null
      );
      controller.focusPath(activeStickyFocusPath);
    }

    const effectiveFocusedPath = controller.getFocusedPath();
    const effectiveFocusedIndex = controller.getFocusedIndex();
    const focusedItem = controller.getFocusedItem();
    if (focusedItem === null) {
      return;
    }

    const focusedDirectoryItem = isFileTreeDirectoryHandle(focusedItem)
      ? focusedItem
      : null;
    const currentStickyRowPathSet = stickyRowPathSet();
    const startedFromStickyRow =
      effectiveFocusedPath !== null &&
      (currentStickyRowPathSet.has(effectiveFocusedPath) ||
        (activeStickyRowOwnsFocus &&
          activeStickyFocusPath === effectiveFocusedPath &&
          mountedStickyRowPathSet.has(effectiveFocusedPath)));
    const shouldPreserveLocalStickyFocusMove =
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp' ||
      (event.key === 'ArrowRight' &&
        focusedDirectoryItem !== null &&
        focusedDirectoryItem.isExpanded());
    const shouldRestoreCollapsedStickyFocusViewport =
      event.key === 'ArrowLeft' &&
      startedFromStickyRow &&
      focusedDirectoryItem !== null &&
      focusedDirectoryItem.isExpanded();
    let handled = true;
    if (event.shiftKey && event.key === 'ArrowDown') {
      controller.extendSelectionFromFocused(1);
    } else if (event.shiftKey && event.key === 'ArrowUp') {
      controller.extendSelectionFromFocused(-1);
    } else if (
      isKeyboardContextMenuRequest &&
      effectiveFocusedPath !== null &&
      effectiveFocusedIndex >= 0
    ) {
      const focusedRow =
        controller.getVisibleRows(
          effectiveFocusedIndex,
          effectiveFocusedIndex
        )[0] ?? null;
      const focusedButton = getTriggerAnchorButton(effectiveFocusedPath);
      if (focusedRow === null || focusedButton === null) {
        handled = false;
      } else {
        openContextMenuForRow(focusedRow, effectiveFocusedPath);
      }
    } else if ((event.ctrlKey || event.metaKey) && isSpaceSelectionKey(event)) {
      controller.toggleFocusedSelection();
    } else if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === 'a'
    ) {
      controller.selectAllVisiblePaths();
    } else {
      switch (event.key) {
        case 'ArrowDown':
          controller.focusNextItem();
          break;
        case 'ArrowUp':
          controller.focusPreviousItem();
          break;
        case 'ArrowRight':
          if (
            focusedDirectoryItem === null ||
            focusedDirectoryItem.isExpanded()
          ) {
            controller.focusNextItem();
          } else {
            focusedDirectoryItem.expand();
          }
          break;
        case 'ArrowLeft':
          if (
            focusedDirectoryItem !== null &&
            focusedDirectoryItem.isExpanded()
          ) {
            focusedDirectoryItem.collapse();
          } else {
            controller.focusParentItem();
          }
          break;
        case 'Home':
          controller.focusFirstItem();
          break;
        case 'End':
          controller.focusLastItem();
          break;
        default:
          handled = false;
      }
    }

    if (!handled) {
      return;
    }

    setLastContextMenuInteraction('focus');
    const nextFocusedPath = controller.getFocusedPath();
    const nextFocusedPathIsMountedSticky =
      nextFocusedPath !== null &&
      (currentStickyRowPathSet.has(nextFocusedPath) ||
        mountedStickyRowPathSet.has(nextFocusedPath));
    const stickyKeyboardMoveLandsOnDifferentStickyRow =
      shouldPreserveLocalStickyFocusMove &&
      nextFocusedPath !== effectiveFocusedPath;
    const stickyKeyboardMenuStaysOnStickyRow =
      isKeyboardContextMenuRequest &&
      activeStickyRowOwnsFocus &&
      activeStickyFocusPath === effectiveFocusedPath &&
      nextFocusedPath === effectiveFocusedPath;
    const shouldPreserveStickyKeyboardFocusPath =
      (stickyKeyboardMoveLandsOnDifferentStickyRow &&
        nextFocusedPathIsMountedSticky) ||
      stickyKeyboardMenuStaysOnStickyRow;
    if (
      (startedFromStickyRow || stickyKeyboardMenuStaysOnStickyRow) &&
      nextFocusedPath !== null &&
      shouldPreserveStickyKeyboardFocusPath
    ) {
      preserveStickyKeyboardFocusAtScrollTop(
        nextFocusedPath,
        scrollElement?.scrollTop ?? null
      );
      domFocusOwner = true;
      setActiveItemPath(nextFocusedPath);
    } else {
      const stickyArrowUpExitsStack =
        event.key === 'ArrowUp' &&
        startedFromStickyRow &&
        nextFocusedPath !== effectiveFocusedPath;
      const stickyCollapseStaysOnRow =
        shouldRestoreCollapsedStickyFocusViewport &&
        nextFocusedPath === effectiveFocusedPath;
      if (
        nextFocusedPath !== null &&
        (stickyArrowUpExitsStack || stickyCollapseStaysOnRow)
      ) {
        restoreStickyKeyboardViewportOffset(
          nextFocusedPath,
          getStickyKeyboardViewportOffset(
            rootElement ?? null,
            scrollElement ?? null,
            activeTreeElement,
            effectiveFocusedPath,
            itemHeight,
            stickyOverlayHeight(),
            resolvedViewportHeight()
          )
        );
        domFocusOwner = true;
        setActiveItemPath(nextFocusedPath);
      } else {
        clearPendingStickyKeyboardState();
      }
    }

    // Focus-only and selection-only updates do not change the window, so
    // force a tick before the DOM focus sync runs.
    bumpRevision();
    event.preventDefault();
    event.stopPropagation();
  };

  const handleRowClick = (
    event: MouseEvent,
    row: FileTreeVisibleRow,
    targetPath: string,
    mode: FileTreeRowClickMode
  ): void => {
    const plan = computeFileTreeRowClickPlan({
      event: {
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      },
      isDirectory: row.kind === 'directory',
      isSearchOpen: controller.isSearchOpen(),
      mode,
    });

    const shouldToggleDirectory =
      plan.toggleDirectory && row.kind === 'directory';
    const mountedDirectoryPath = shouldToggleDirectory
      ? controller.resolveMountedDirectoryPathFromInput(targetPath)
      : null;
    if (shouldToggleDirectory && mountedDirectoryPath === null) {
      return;
    }
    const actionTargetPath = mountedDirectoryPath ?? targetPath;

    switch (plan.selection.kind) {
      case 'range':
        controller.selectPathRange(actionTargetPath, plan.selection.additive);
        break;
      case 'toggle':
        controller.togglePathSelectionFromInput(actionTargetPath);
        break;
      case 'single':
        controller.selectOnlyMountedPathFromInput(actionTargetPath);
        break;
    }

    const clickedElement = isHTMLElement(event.currentTarget)
      ? event.currentTarget
      : null;
    const visible = layoutSnapshot().visible;
    const clickedRowIsVisible =
      row.index >= visible.startIndex && row.index <= visible.endIndex;
    const shouldExposeFocusedTrigger =
      mode === 'flow' &&
      clickedRowIsVisible &&
      clickedElement !== null &&
      clickedElement.dataset.itemParked !== 'true';

    controller.focusMountedPathFromInput(actionTargetPath);
    if (shouldExposeFocusedTrigger) {
      domFocusOwner = true;
      setActiveItemPath(actionTargetPath);
      setLastContextMenuInteraction('focus');
    }
    if (shouldToggleDirectory) {
      controller.toggleMountedDirectoryFromInput(actionTargetPath);
    }
    if (plan.closeSearch) {
      controller.closeSearch();
    }
    if (plan.revealCanonical) {
      revealCanonicalRowAtStickyOffset(actionTargetPath, {
        targetOffset: 'sticky-parents',
      });
    }
  };

  const handleTreePointerOver = (event: PointerEvent): void => {
    if (!contextMenu().enabled || isScrolling || isEventInContextMenu(event)) {
      return;
    }

    const target = event.target;
    if (!isHTMLElement(target)) {
      return;
    }

    if (target.closest(`[data-type="${CONTEXT_MENU_TRIGGER_TYPE}"]`) !== null) {
      return;
    }

    const stickyRowButton = target.closest(
      '[data-file-tree-sticky-row="true"]'
    );
    const rowButton = target.closest('[data-type="item"]');
    const nextPath = isHTMLElement(stickyRowButton)
      ? (stickyRowButton.dataset.fileTreeStickyPath ?? null)
      : isHTMLElement(rowButton)
        ? (rowButton.dataset.itemPath ?? null)
        : null;

    if (nextPath !== null) {
      setLastContextMenuInteraction('pointer');
    }
    setContextHoverPath(nextPath);
  };

  const isDragEventForTree = (): boolean =>
    dragAndDropEnabled() &&
    controller.getDragSession() !== null &&
    !touchDragActive;

  const handleTreeDragOver = (event: DragEvent): void => {
    if (!isDragEventForTree()) {
      return;
    }

    controller.setDragTarget(
      resolveDropTargetFromElement(
        isHTMLElement(event.target) ? event.target : null
      )
    );
    scheduleDragHoverOpen(controller.getDragSession()?.target ?? null);
    updateDragPoint(event.clientX, event.clientY);
    if (event.dataTransfer !== null) {
      event.dataTransfer.dropEffect = 'move';
    }
    event.preventDefault();
  };

  const handleTreeDragLeave = (event: DragEvent): void => {
    if (!isDragEventForTree()) {
      return;
    }

    const nextTarget = event.relatedTarget;
    if (isNode(nextTarget) && rootElement?.contains(nextTarget)) {
      return;
    }

    clearDragHoverOpen();
    stopDragAutoScroll();
    controller.setDragTarget(null);
  };

  const handleTreeDrop = (event: DragEvent): void => {
    if (!isDragEventForTree()) {
      return;
    }
    event.preventDefault();
    syncDropTargetFromPoint(event.clientX, event.clientY);
    controller.completeDrag();
    clearDragPreview();
    clearDragHoverOpen();
    stopDragAutoScroll();
    dragRowSnapshot = null;
  };

  // Viewport wiring: scroll, resize, and controller changes all recompute the
  // layout snapshot from the live scroll position.
  onSettled(() => {
    const scroll = scrollElement;
    const root = rootElement;
    const list = listElement;
    if (scroll === undefined || root === undefined) {
      return;
    }

    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    let overlayRevealTimer: ReturnType<typeof setTimeout> | null = null;
    measuredViewportHeight = readMeasuredViewportHeight(
      scroll,
      initialViewportHeight
    );

    const update = (): void => {
      const nextViewportHeight = getCachedViewportHeight(
        measuredViewportHeight,
        initialViewportHeight
      );
      const maxScrollTop = Math.max(
        0,
        controller.getVisibleCount() * itemHeight - nextViewportHeight
      );
      // Collapse can shrink total height under the current scroll position.
      if (scroll.scrollTop > maxScrollTop) {
        scroll.scrollTop = maxScrollTop;
      }

      setLayoutState(
        computeFileTreeViewLayoutState({
          controller,
          itemHeight,
          overscan,
          scrollTop: Math.min(scroll.scrollTop, maxScrollTop),
          stickyFolders,
          viewportHeight: nextViewportHeight,
        })
      );
    };

    // Seed the scroll position from the initial focus so an initially
    // focused row mounts inside the virtualized window.
    const initialFocusedIndex = controller.getFocusedIndex();
    if (initialFocusedIndex >= 0) {
      const viewportHeight = getCachedViewportHeight(
        measuredViewportHeight,
        initialViewportHeight
      );
      const initialFocusedRow =
        controller.getVisibleRows(
          initialFocusedIndex,
          initialFocusedIndex
        )[0] ?? null;
      const initialTopInset =
        stickyFolders && initialFocusedRow !== null
          ? Math.max(
              0,
              Math.min(
                initialFocusedRow.ancestorPaths.length * itemHeight,
                Math.max(0, viewportHeight - itemHeight)
              )
            )
          : 0;
      scrollFocusedRowIntoView(
        scroll,
        initialFocusedIndex,
        itemHeight,
        viewportHeight,
        initialTopInset
      );
    }

    updateViewport = update;
    // `subscribe` replays immediately, which performs the first measured
    // layout pass.
    const unsubscribe = controller.subscribe(update);

    // Plain DOM attributes (not signals) so CSS can react before the
    // compositor paints the next scrolled frame.
    const markScrolling = (): void => {
      if (list !== undefined) {
        list.dataset.isScrolling ??= '';
      }
      root.dataset.isScrolling ??= '';
      isScrolling = true;
      clearTimeout(scrollTimer ?? undefined);
      scrollTimer = setTimeout(() => {
        if (list !== undefined) {
          delete list.dataset.isScrolling;
        }
        delete root.dataset.isScrolling;
        isScrolling = false;
        setScrollSettledRevision((revision) => revision + 1);
        scrollTimer = null;
      }, 50);
    };

    // Set only when the user starts scrolling from the very top, so the
    // pre-mounted sticky overlay is visible through the first scrolled frame.
    const clearOverlayReveal = (): void => {
      delete root.dataset.overlayReveal;
      if (overlayRevealTimer !== null) {
        clearTimeout(overlayRevealTimer);
        overlayRevealTimer = null;
      }
    };
    const markOverlayReveal = (): void => {
      if (scroll.scrollTop > 0) {
        return;
      }
      root.dataset.overlayReveal = 'true';
      clearTimeout(overlayRevealTimer ?? undefined);
      overlayRevealTimer = setTimeout(clearOverlayReveal, 200);
    };

    const onScroll = (): void => {
      update();
      if (scroll.scrollTop > 0) {
        clearOverlayReveal();
      }
      // Only a user-driven scroll dismisses the context menu; programmatic
      // scrolls (focus moving into the menu, tests scrolling into view) must
      // not close the menu being used.
      if (currentContextMenuState !== null && isScrolling) {
        closeContextMenu();
      }
      setContextHoverPath(null);
      markScrolling();
    };

    // `wheel` / `touchmove` fire before the compositor commits the scroll, so
    // the scrolling flag hides the floating trigger in the same frame.
    const onPreScroll = (): void => {
      markScrolling();
      markOverlayReveal();
    };

    scroll.addEventListener('scroll', onScroll, { passive: true });
    scroll.addEventListener('wheel', onPreScroll, { passive: true });
    scroll.addEventListener('touchmove', onPreScroll, { passive: true });
    markKeyboardPreScroll = onPreScroll;
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver((entries) => {
            const observedViewportHeight =
              entries[0] === undefined
                ? null
                : getResizeObserverViewportHeight(entries[0]);
            measuredViewportHeight =
              observedViewportHeight ??
              readMeasuredViewportHeight(scroll, initialViewportHeight);
            update();
          })
        : null;
    resizeObserver?.observe(scroll);

    let nullFocusOutTimer: ReturnType<typeof setTimeout> | null = null;
    const clearNullFocusOutTimer = (): void => {
      if (nullFocusOutTimer !== null) {
        clearTimeout(nullFocusOutTimer);
        nullFocusOutTimer = null;
      }
    };
    const updateActiveItemPath = (): void => {
      setActiveItemPath(getActiveTreeElement(root)?.dataset.itemPath ?? null);
    };
    const onFocusIn = (): void => {
      clearNullFocusOutTimer();
      domFocusOwner = true;
      updateActiveItemPath();
    };
    const onFocusOut = (event: FocusEvent): void => {
      const nextTarget = event.relatedTarget;
      if (nextTarget === null) {
        // Virtualization can swap the focused row between rendered and
        // parked states before the replacement receives focus; defer the
        // ownership check so a real blur still clears visual focus.
        clearNullFocusOutTimer();
        nullFocusOutTimer = setTimeout(() => {
          nullFocusOutTimer = null;
          if (getActiveTreeElement(root) !== null) {
            updateActiveItemPath();
            return;
          }

          domFocusOwner = false;
          setActiveItemPath(null);
        }, 0);
        return;
      }

      if (!isNode(nextTarget) || !root.contains(nextTarget)) {
        clearNullFocusOutTimer();
        domFocusOwner = false;
        setActiveItemPath(null);
        return;
      }

      setActiveItemPath(
        isHTMLElement(nextTarget) ? (nextTarget.dataset.itemPath ?? null) : null
      );
    };
    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('focusout', onFocusOut);

    return () => {
      updateViewport = noop;
      markKeyboardPreScroll = noop;
      unsubscribe();
      scroll.removeEventListener('scroll', onScroll);
      scroll.removeEventListener('wheel', onPreScroll);
      scroll.removeEventListener('touchmove', onPreScroll);
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', onFocusOut);
      clearNullFocusOutTimer();
      clearTimeout(scrollTimer ?? undefined);
      clearTimeout(overlayRevealTimer ?? undefined);
      isScrolling = false;
      measuredViewportHeight = null;
      resizeObserver?.disconnect();
    };
  });

  createEffect(
    () => searchEnabled && isSearchOpen(),
    (shouldFocusSearch) => {
      if (!shouldFocusSearch) {
        return;
      }

      if (skipInitialSearchAutoFocus) {
        skipInitialSearchAutoFocus = false;
        return;
      }

      focusElement(searchInputElement ?? null);
    }
  );

  // Re-runs on window and sticky changes so that once a sticky reveal lands
  // the canonical row inside the window, the rendered input takes focus.
  createEffect(
    () => {
      range();
      stickyRowPathSet();
      return renamingPath();
    },
    (currentRenamingPath) => {
      const input = renameInputElement;
      const action = classifyFileTreeRenameHandoff({
        hasRenderedInput: input !== null,
        previousRenamingPath,
        renamingPath: currentRenamingPath,
      });

      switch (action) {
        case 'reset':
          previousRenamingPath = null;
          return;
        case 'reveal-canonical':
          if (currentRenamingPath !== null) {
            revealCanonicalRowAtStickyOffset(currentRenamingPath, {
              restoreTreeFocus: false,
              targetOffset: 'live-overlay',
            });
          }
          return;
        case 'ignore':
          return;
        case 'focus-input':
          if (input !== null) {
            pendingStickyFocusPath = null;
            previousRenamingPath = currentRenamingPath;
            focusElement(input);
            input.select();
          }
          return;
      }
    }
  );

  // Mirror `scrollTop <= 0` onto the root so CSS hides the pre-populated
  // sticky overlay at rest. Driven by the layout snapshot because
  // programmatic scrolls do not reliably fire `scroll` events.
  createEffect(
    () => layoutSnapshot().physical.scrollTop <= 0,
    (atTop) => {
      if (rootElement === undefined) {
        return;
      }
      if (atTop) {
        rootElement.dataset.scrollAtTop = 'true';
      } else {
        delete rootElement.dataset.scrollAtTop;
      }
    }
  );

  createEffect(
    () => !contextMenu().enabled && contextMenuState() !== null,
    (shouldClose) => {
      if (shouldClose) {
        closeContextMenu(false);
      }
    }
  );

  createEffect(
    () => {
      trackRevision();
      const state = contextMenuState();
      return state !== null && controller.getItem(state.path) === null;
    },
    (itemRemoved) => {
      if (itemRemoved) {
        closeContextMenu();
      }
    }
  );

  const onDocumentPointerDown = (event: MouseEvent): void => {
    const target = event.target;
    if (!isNode(target) || isEventInContextMenu(event)) {
      return;
    }

    if (
      contextMenuAnchorElement?.contains(target) === true ||
      rootElement?.contains(target) === true
    ) {
      return;
    }

    closeContextMenu();
  };
  const onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeContextMenu();
    }
  };

  createEffect(
    () => contextMenuState() !== null,
    (isOpen) => {
      if (!isOpen) {
        return;
      }

      document.addEventListener('mousedown', onDocumentPointerDown, true);
      document.addEventListener('keydown', onDocumentKeyDown, true);
      return () => {
        document.removeEventListener('mousedown', onDocumentPointerDown, true);
        document.removeEventListener('keydown', onDocumentKeyDown, true);
      };
    }
  );

  // Keeps DOM focus, scroll position, and controller focus in agreement after
  // every controller or layout change.
  createEffect(
    () => {
      trackRevision();
      return {
        focusedIndex: focusedIndex(),
        focusedPath: focusedPath(),
        isRenaming: renamingPath() !== null,
        isSearchOpen: isSearchOpen(),
        layout: layoutState(),
        scrollRequest: scrollRequest(),
      };
    },
    ({
      focusedIndex: currentFocusedIndex,
      focusedPath: currentFocusedPath,
      isRenaming,
      isSearchOpen: currentIsSearchOpen,
      layout,
      scrollRequest: currentScrollRequest,
    }) => {
      const scroll = scrollElement;
      const root = rootElement;
      if (scroll === undefined || root === undefined) {
        previousFocusedPath = currentFocusedPath;
        return;
      }

      const viewportHeight = layout.snapshot.physical.viewportHeight;
      const totalHeight = layout.snapshot.physical.totalHeight;
      const overlayHeight = layout.snapshot.sticky.height;
      const focusedButton =
        currentFocusedPath === null
          ? null
          : (rowButtonElements.get(currentFocusedPath) ?? null);
      const activeTreeElement = getActiveTreeElement(root);
      const activeTreeElementPath = activeTreeElement?.dataset.itemPath ?? null;
      const renameInputOwnsFocus =
        isRenaming && renameInputElement === activeTreeElement;
      const searchInputOwnsFocus =
        searchEnabled && searchInputElement === activeTreeElement;
      const shouldRestoreTreeFocusAfterSearchClose =
        restoreTreeFocusAfterSearchClose && !currentIsSearchOpen;
      const preservedViewportOffset = restoreTreeFocusViewportOffset ?? 0;
      const stickyFocusPath = pendingStickyFocusPath;
      const stickyKeyboardFocusPath = pendingStickyKeyboardFocusPath;
      const stickyKeyboardViewportOffset = pendingStickyKeyboardViewportOffset;
      const stickyKeyboardScrollTop = pendingStickyKeyboardScrollTop;
      const shouldOwnDomFocus = domFocusOwner || activeTreeElement !== null;
      const focusedPathChanged = previousFocusedPath !== currentFocusedPath;
      const shouldPreserveStickyKeyboardFocusViewport =
        stickyKeyboardFocusPath !== null &&
        stickyKeyboardFocusPath === currentFocusedPath &&
        currentFocusedPath !== null;
      let shouldSuppressDomFocusForScrollRequest = false;
      let shouldUpdateViewportForScrollRequest = false;
      if (
        currentScrollRequest !== null &&
        currentScrollRequest.id !== processedScrollRequestId
      ) {
        processedScrollRequestId = currentScrollRequest.id;
        const scrollRequestIndex = currentScrollRequest.visibleIndex;
        const scrollRequestRow =
          controller.getVisibleRows(
            scrollRequestIndex,
            scrollRequestIndex
          )[0] ?? null;
        if (scrollRequestRow !== null) {
          const scrollRequestTopInset = stickyFolders
            ? Math.max(
                0,
                Math.min(
                  scrollRequestRow.ancestorPaths.length * itemHeight,
                  Math.max(0, viewportHeight - itemHeight)
                )
              )
            : overlayHeight;
          shouldSuppressDomFocusForScrollRequest = true;
          shouldUpdateViewportForScrollRequest = scrollFocusedRowToOffset(
            scroll,
            scrollRequestIndex,
            itemHeight,
            viewportHeight,
            totalHeight,
            currentScrollRequest.offset,
            scrollRequestTopInset
          );
        }
        controller.clearScrollRequest(currentScrollRequest.id);
      }

      const shouldRestoreFocusedRowViewportOffset =
        !shouldSuppressDomFocusForScrollRequest &&
        shouldRestoreTreeFocusAfterSearchClose &&
        scrollFocusedRowToViewportOffset(
          scroll,
          currentFocusedIndex,
          itemHeight,
          viewportHeight,
          totalHeight,
          preservedViewportOffset
        );
      const shouldRestoreStickyFocusedRowViewportOffset =
        !shouldSuppressDomFocusForScrollRequest &&
        stickyFocusPath !== null &&
        stickyFocusPath === currentFocusedPath &&
        scrollFocusedRowToViewportOffset(
          scroll,
          currentFocusedIndex,
          itemHeight,
          viewportHeight,
          totalHeight,
          overlayHeight
        );
      const shouldRestoreStickyKeyboardViewportOffset =
        !shouldSuppressDomFocusForScrollRequest &&
        stickyKeyboardViewportOffset !== null &&
        stickyKeyboardViewportOffset.path === currentFocusedPath &&
        scrollFocusedRowToViewportOffset(
          scroll,
          currentFocusedIndex,
          itemHeight,
          viewportHeight,
          totalHeight,
          stickyKeyboardViewportOffset.viewportOffset
        );
      const shouldRestoreStickyKeyboardScrollTop =
        !shouldSuppressDomFocusForScrollRequest &&
        stickyKeyboardScrollTop !== null &&
        stickyKeyboardScrollTop.path === currentFocusedPath &&
        scroll.scrollTop !== stickyKeyboardScrollTop.scrollTop;
      if (shouldRestoreStickyKeyboardScrollTop) {
        scroll.scrollTop = stickyKeyboardScrollTop.scrollTop;
      }

      if (
        shouldRestoreStickyKeyboardScrollTop ||
        shouldUpdateViewportForScrollRequest ||
        shouldRestoreStickyFocusedRowViewportOffset ||
        shouldRestoreStickyKeyboardViewportOffset ||
        shouldRestoreFocusedRowViewportOffset ||
        (shouldOwnDomFocus &&
          focusedPathChanged &&
          stickyFocusPath !== currentFocusedPath &&
          !shouldPreserveStickyKeyboardFocusViewport &&
          scrollFocusedRowIntoView(
            scroll,
            currentFocusedIndex,
            itemHeight,
            viewportHeight,
            overlayHeight
          ))
      ) {
        updateViewport();
      }

      if (
        shouldSuppressDomFocusForScrollRequest ||
        !shouldOwnDomFocus ||
        renameInputOwnsFocus ||
        (searchInputOwnsFocus && !shouldRestoreTreeFocusAfterSearchClose)
      ) {
        previousFocusedPath = currentFocusedPath;
        return;
      }

      if (focusedButton === null) {
        if (
          shouldRestoreTreeFocusAfterSearchClose &&
          currentFocusedIndex >= 0
        ) {
          scrollFocusedRowToViewportOffset(
            scroll,
            currentFocusedIndex,
            itemHeight,
            viewportHeight,
            totalHeight,
            preservedViewportOffset
          );
          updateViewport();
        }
        previousFocusedPath = currentFocusedPath;
        return;
      }

      if (
        focusedPathChanged ||
        shouldRestoreTreeFocusAfterSearchClose ||
        stickyFocusPath === currentFocusedPath ||
        stickyKeyboardFocusPath === currentFocusedPath ||
        stickyKeyboardViewportOffset?.path === currentFocusedPath ||
        stickyKeyboardScrollTop?.path === currentFocusedPath ||
        activeTreeElementPath === null ||
        activeTreeElementPath !== currentFocusedPath
      ) {
        focusElement(focusedButton);
        if (stickyFocusPath === currentFocusedPath) {
          pendingStickyFocusPath = null;
        }
        if (stickyKeyboardFocusPath === currentFocusedPath) {
          pendingStickyKeyboardFocusPath = null;
        }
        if (stickyKeyboardViewportOffset?.path === currentFocusedPath) {
          pendingStickyKeyboardViewportOffset = null;
        }
        if (stickyKeyboardScrollTop?.path === currentFocusedPath) {
          pendingStickyKeyboardScrollTop = null;
        }
        restoreTreeFocusAfterSearchClose = false;
        restoreTreeFocusViewportOffset = null;
      }
      previousFocusedPath = currentFocusedPath;
    }
  );

  const triggerPath = createMemo(() => {
    const index = focusedIndex();
    const path = focusedPath();
    const visible = layoutSnapshot().visible;
    const focusedRowIsVisible =
      index >= 0 && index >= visible.startIndex && index <= visible.endIndex;
    const focusedRowIsSticky =
      path !== null &&
      stickyRows().some((entry) => getFileTreeRowPath(entry.row) === path);
    // `domFocusOwner` is plain state; this memo re-reads it whenever focus,
    // layout, or the active row changes.
    activeItemPath();
    const focusTriggerPath =
      contextMenu().buttonTriggerEnabled &&
      domFocusOwner &&
      (focusedRowIsVisible || focusedRowIsSticky)
        ? path
        : null;
    const pointerTriggerPath =
      lastContextMenuInteraction() === 'pointer' ? contextHoverPath() : null;
    return (
      contextMenuState()?.path ??
      pointerTriggerPath ??
      focusTriggerPath ??
      contextHoverPath()
    );
  });

  createEffect(
    () => {
      contextMenuState();
      range();
      layoutState();
      scrollSettledRevision();
      return triggerPath();
    },
    (path) => {
      if (isScrolling && currentContextMenuState === null) {
        return;
      }

      updateTriggerPosition(getTriggerAnchorButton(path));
    }
  );

  const handleWindowDragEnd = (): void => {
    clearTouchDragResources();
    controller.cancelDrag();
  };

  createEffect(
    () => dragAndDropEnabled(),
    (enabled) => {
      if (!enabled) {
        return;
      }

      window.addEventListener('dragend', handleWindowDragEnd);
      return () => {
        window.removeEventListener('dragend', handleWindowDragEnd);
        clearTouchDragResources();
        controller.cancelDrag();
      };
    }
  );

  // Builds the consumer-facing context once per logical open (path + source).
  // Rebuilding on unrelated state changes would remount the consumer's menu
  // and detach anything it was about to interact with.
  const activeContextMenuKey = createMemo(() => {
    const state = contextMenuState();
    return state === null ? null : `${state.path}::${state.source}`;
  });
  const openContextMenu = createMemo(() => {
    if (activeContextMenuKey() === null) {
      return null;
    }

    const state = currentContextMenuState;
    const anchorElement = contextMenuTriggerElement ?? contextMenuAnchorElement;
    if (state === null || anchorElement === undefined) {
      return null;
    }

    const context: FileTreeContextMenuOpenContext = {
      anchorElement,
      anchorRect:
        state.anchorRect ??
        serializeAnchorRect(anchorElement.getBoundingClientRect()),
      close: (options) => {
        closeContextMenu(options?.restoreFocus ?? true, state.token);
      },
      restoreFocus: () => {
        if (shouldRestoreContextMenuFocus) {
          restoreFocusToTree(currentContextMenuState?.path ?? null);
        }
      },
    };
    return { context, item: state.item };
  });

  createEffect(
    () => openContextMenu(),
    (menu) => {
      if (menu === null) {
        return;
      }

      viewState
        .peekComposition()
        ?.contextMenu?.onOpen?.(menu.item, menu.context);
      const menuContent = contextMenuContentElement ?? null;
      focusFirstMenuElement(menuContent);
      queueMicrotask(() => {
        if (
          menuContent !== null &&
          menuContent.isConnected &&
          document.activeElement === menuContent
        ) {
          focusFirstMenuElement(menuContent);
        }
      });
    }
  );

  onCleanup(() => {
    clearTouchDragResources();
  });

  const windowRows = createMemo(() => {
    trackRevision();
    const currentRange = range();
    if (currentRange.end < currentRange.start) {
      return [];
    }

    const hiddenRowPaths = stickyRowPathSet();
    // Rows are keyed by viewport slot rather than path so rebasing the
    // overscanned window does not move still-visible rows to new DOM nodes.
    return controller
      .getVisibleRows(currentRange.start, currentRange.end)
      .filter((row) => !hiddenRowPaths.has(getFileTreeRowPath(row)))
      .map((row, slotIndex) => ({ key: currentRange.start + slotIndex, row }));
  });
  const stickyOverlayRows = createMemo(() => {
    trackRevision();
    return stickyRows();
  });

  const parkedFocusedRow = createMemo(() => {
    const path = focusedPath();
    const index = focusedIndex();
    const shouldRender =
      activeItemPath() === path || restoreTreeFocusAfterSearchClose;
    if (path === null || !shouldRender || focusedRowIsMounted() || index < 0) {
      return null;
    }

    const row = focusedVisibleRow();
    const offset =
      row === null
        ? null
        : getParkedFocusedRowOffset(
            index,
            itemHeight,
            range(),
            layoutSnapshot().window.height
          );
    return row === null || offset === null ? null : { offset, row };
  });
  const parkedDraggedRow = createMemo(() => {
    const primaryPath = dragSession()?.primaryPath ?? null;
    const snapshot = dragRowSnapshot;
    const currentRange = range();
    if (
      primaryPath === null ||
      snapshot === null ||
      snapshot.path !== primaryPath ||
      (snapshot.index >= currentRange.start &&
        snapshot.index <= currentRange.end) ||
      snapshot.path === parkedFocusedRow()?.row.path
    ) {
      return null;
    }

    const offset = getParkedFocusedRowOffset(
      snapshot.index,
      itemHeight,
      currentRange,
      layoutSnapshot().window.height
    );
    return offset === null ? null : { offset, row: snapshot };
  });

  const activeDescendantId = () => {
    const path = focusedPath();
    return isSearchOpen() && path !== null
      ? getFileTreeFocusedRowDomId(instanceId, path, !focusedRowIsMounted())
      : undefined;
  };
  const triggerButtonVisible = createMemo(() => {
    const menu = contextMenu();
    const state = contextMenuState();
    contextMenuAnchorTop();
    return (
      menu.enabled &&
      menu.buttonTriggerEnabled &&
      state?.source !== 'right-click' &&
      renamingPath() === null &&
      triggerPath() !== null &&
      contextMenuAnchorTop() !== null &&
      getTriggerAnchorButton(triggerPath()) !== null
    );
  });
  const contextMenuAnchorStyle = (): JSX.CSSProperties | undefined => {
    const state = contextMenuState();
    const pointerAnchorRect = state?.anchorRect;
    if (pointerAnchorRect !== null && pointerAnchorRect !== undefined) {
      return {
        left: `${pointerAnchorRect.left}px`,
        position: 'fixed',
        right: 'auto',
        top: `${pointerAnchorRect.top}px`,
      };
    }

    const anchorTop = contextMenuAnchorTop();
    return anchorTop !== null &&
      getTriggerAnchorButton(triggerPath()) !== null &&
      (state !== null || triggerButtonVisible())
      ? { top: `${anchorTop}px` }
      : undefined;
  };

  const openMenuFromTrigger = (): void => {
    if (isScrolling || !contextMenu().buttonTriggerEnabled) {
      return;
    }

    const path = triggerPath();
    const triggerButton = getTriggerAnchorButton(path);
    if (path === null || triggerButton === null) {
      return;
    }

    const triggerItem = controller.getItem(path);
    if (triggerItem === null) {
      return;
    }

    updateTriggerPosition(triggerButton);
    shouldRestoreContextMenuFocus = true;
    const triggerItemPath = triggerItem.getPath();
    setContextMenuState({
      anchorRect: null,
      item: {
        kind: triggerItem.isDirectory() ? 'directory' : 'file',
        name: triggerButton.getAttribute('aria-label') ?? path,
        path: triggerItemPath,
      },
      path: triggerItemPath,
      source: 'button',
      token: nextContextMenuToken(triggerItemPath, 'button'),
    });
  };

  const visualFocusPath = createMemo(
    () =>
      contextMenuState()?.path ??
      (isSearchOpen() ? focusedPath() : activeItemPath())
  );
  const frame: FileTreeRowFrame = {
    controller,
    instanceId,
    itemHeight,
    renameView,
    renamingPath,
    renamingValue,
    visualFocusPath,
    contextHoverPath: () => contextMenuState()?.path ?? contextHoverPath(),
    focusedParentPath: () => focusedVisibleRow()?.ancestorPaths.at(-1) ?? null,
    draggedPathSet,
    dragTarget,
    dragAndDropEnabled,
    gitStatusState,
    ignoredInheritanceCache,
    labels,
    contextMenu,
    resolveIcon,
    renderDecorationForRow: (row, targetPath) =>
      viewState.renderRowDecoration?.({
        item: createContextMenuItem(row, targetPath),
        row,
      }) ?? null,
    shouldSuppressContextMenu,
    handleRowDragStart,
    handleRowDragEnd,
    handleRowTouchStart,
    openContextMenuForRow,
    onRowClick: handleRowClick,
    onKeyDown: handleTreeKeyDown,
    registerRenameInput: (element) => {
      renameInputElement = element;
    },
  };
  const registerFlowRow = (
    path: string,
    element: HTMLElement,
    register: boolean
  ) => {
    registerRowButton(rowButtonElements, path, element, register);
  };
  const registerStickyRow = (
    path: string,
    element: HTMLElement,
    register: boolean
  ) => {
    registerRowButton(stickyRowButtonElements, path, element, register);
  };

  return (
    <div
      {...hostProps}
      ref={(element) => {
        rootElement = element;
      }}
      id={treeDomId}
      role="tree"
      tabindex={-1}
      style={{
        '--trees-item-height': `${itemHeight}px`,
        '--trees-density-override': String(density.factor),
        ...props.host.style,
      }}
      data-file-tree-virtualized-root="true"
      data-file-tree-colored-icons={
        normalizedIcons().colored &&
        isColoredBuiltInIconSet(normalizedIcons().set)
          ? 'true'
          : undefined
      }
      data-file-tree-context-menu-button-visibility={
        contextMenu().enabled && contextMenu().buttonTriggerEnabled
          ? contextMenu().buttonVisibility
          : undefined
      }
      data-file-tree-context-menu-trigger-mode={
        contextMenu().enabled ? contextMenu().triggerMode : undefined
      }
      data-file-tree-has-context-menu-action-lane={
        contextMenu().enabled && contextMenu().buttonTriggerEnabled
          ? 'true'
          : undefined
      }
      data-file-tree-has-git-lane={
        gitStatusState() !== null ? 'true' : undefined
      }
      onKeyDown={handleTreeKeyDown}
      onPointerOver={handleTreePointerOver}
      onPointerLeave={() => {
        setContextHoverPath(null);
      }}
      onDragOver={handleTreeDragOver}
      onDragLeave={handleTreeDragLeave}
      onDrop={handleTreeDrop}
    >
      <style data-file-tree-structure>{FILE_TREE_STRUCTURAL_CSS}</style>
      <div
        data-file-tree-sprite
        aria-hidden="true"
        innerHTML={spriteSheetHtml()}
      />
      <Show when={header.toArray().length > 0}>
        <div data-type="header-slot">{header()}</div>
      </Show>
      <Show when={searchEnabled}>
        <div
          data-file-tree-search-container
          data-open={isSearchOpen() ? 'true' : 'false'}
        >
          <input
            ref={(element) => {
              searchInputElement = element;
            }}
            aria-activedescendant={activeDescendantId()}
            aria-controls={treeDomId}
            placeholder={labels().searchPlaceholder}
            data-file-tree-search-input
            data-file-tree-search-input-fake-focus={
              fakeSearchFocusActive() ? 'true' : undefined
            }
            value={searchValue()}
            onBlur={() => {
              // With `retain`, ignore blurs before the user engaged with the
              // input (typically mount-time focus churn between trees).
              if (
                searchBlurBehavior === 'retain' &&
                !searchInputUserInteracted
              ) {
                return;
              }
              controller.closeSearch();
            }}
            onFocus={markSearchInputInteracted}
            onPointerDown={markSearchInputInteracted}
            onInput={(event) => {
              markSearchInputInteracted();
              controller.setSearch(event.currentTarget.value);
            }}
          />
        </div>
      </Show>
      <div
        ref={(element) => {
          scrollElement = element;
        }}
        data-file-tree-virtualized-scroll="true"
      >
        <Show when={stickyFolders && stickyOverlayRows().length > 0}>
          <div aria-hidden="true" data-file-tree-sticky-overlay="true">
            <div
              data-file-tree-sticky-overlay-content="true"
              style={{ height: `${layoutState().overlayHeight}px` }}
            >
              <For
                each={stickyOverlayRows()}
                keyed={(entry) => getFileTreeRowPath(entry.row)}
              >
                {(entry, index) => (
                  <FileTreeRow
                    frame={frame}
                    row={entry().row}
                    mode="sticky"
                    registerButton={registerStickyRow}
                    style={{
                      left: '0',
                      position: 'absolute',
                      right: '0',
                      top: `${entry().top}px`,
                      'z-index': `${stickyOverlayRows().length - index()}`,
                    }}
                  />
                )}
              </For>
            </div>
          </div>
        </Show>
        <div
          ref={(element) => {
            listElement = element;
          }}
          data-file-tree-virtualized-list="true"
          style={{ height: `${totalScrollableHeight()}px` }}
        >
          <div
            data-file-tree-virtualized-sticky-offset="true"
            aria-hidden="true"
            style={{ height: `${layoutSnapshot().window.offsetTop}px` }}
          />
          <div
            data-file-tree-virtualized-sticky="true"
            style={{
              height: `${layoutSnapshot().window.height}px`,
              // A negative inset lets the overscanned window hang past the
              // viewport without pinning during normal scrolling, while still
              // catching it when rendering falls behind a fast scroll. The
              // bottom edge allows for the sticky overlay height.
              top: `${Math.min(0, resolvedViewportHeight() - layoutSnapshot().window.height)}px`,
              bottom: `${Math.min(0, resolvedViewportHeight() - layoutSnapshot().window.height - stickyOverlayHeight())}px`,
            }}
          >
            <For each={windowRows()} keyed={(entry) => entry.key}>
              {(entry) => (
                <FileTreeRow
                  frame={frame}
                  row={entry().row}
                  mode="flow"
                  registerButton={registerFlowRow}
                />
              )}
            </For>
            <Show when={parkedFocusedRow()}>
              {(parked) => (
                <FileTreeRow
                  frame={frame}
                  row={parked().row}
                  mode="flow"
                  isParked
                  registerButton={registerFlowRow}
                  style={{
                    left: '0',
                    opacity: '0',
                    'pointer-events':
                      dragSession()?.primaryPath === parked().row.path
                        ? 'none'
                        : undefined,
                    position: 'absolute',
                    right: '0',
                    top: `${parked().offset}px`,
                  }}
                />
              )}
            </Show>
            <Show when={parkedDraggedRow()}>
              {(parked) => (
                <FileTreeRow
                  frame={frame}
                  row={parked().row}
                  mode="flow"
                  isParked
                  registerButton={registerFlowRow}
                  style={{
                    left: '0',
                    opacity: '0',
                    'pointer-events': 'none',
                    position: 'absolute',
                    right: '0',
                    top: `${parked().offset}px`,
                  }}
                />
              )}
            </Show>
          </div>
        </div>
      </div>
      <Show when={contextMenu().enabled}>
        <div
          ref={(element) => {
            contextMenuAnchorElement = element;
          }}
          data-type="context-menu-anchor"
          data-visible={
            triggerButtonVisible() || contextMenuState() !== null
              ? 'true'
              : 'false'
          }
          style={contextMenuAnchorStyle()}
        >
          <button
            ref={(element) => {
              contextMenuTriggerElement = element;
            }}
            type="button"
            data-type={CONTEXT_MENU_TRIGGER_TYPE}
            aria-label={labels().contextMenuTrigger}
            aria-haspopup="menu"
            aria-expanded={contextMenuState() !== null ? 'true' : 'false'}
            data-visible={triggerButtonVisible() ? 'true' : 'false'}
            tabindex={-1}
            style={
              contextMenuState()?.source === 'right-click'
                ? { opacity: '0' }
                : undefined
            }
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (currentContextMenuState !== null) {
                closeContextMenu();
                return;
              }

              openMenuFromTrigger();
            }}
          >
            <Icon {...resolveIcon()('file-tree-icon-ellipsis')} />
          </button>
          <Show when={openContextMenu()} keyed>
            {(menu) => (
              <div
                ref={(element) => {
                  contextMenuContentElement = element;
                }}
                data-type="context-menu-slot"
              >
                {props.host.renderContextMenu?.(menu.item, menu.context)}
              </div>
            )}
          </Show>
        </div>
      </Show>
      <Show when={contextMenuState() !== null}>
        <div
          data-type="context-menu-wash"
          aria-hidden="true"
          ref={(element) => {
            element.addEventListener('mousedown', (event) => {
              event.preventDefault();
              closeContextMenu();
            });
            element.addEventListener(
              'touchstart',
              (event) => {
                blockEvent(event);
                closeContextMenu();
              },
              { passive: false }
            );
            element.addEventListener('touchmove', blockEvent, {
              passive: false,
            });
            element.addEventListener('wheel', blockEvent, { passive: false });
          }}
        />
      </Show>
    </div>
  );
}
