import { computeFileTreeLayout } from '../src/model/layout';
import type { FileTreeLayoutSnapshot } from '../src/model/layout';
import type { FileTreeOptions } from '../src/model/publicTypes';
import type { FileTreeVisibleRow } from '../src/model/publicTypes';
import {
  FILE_TREE_DEFAULT_ITEM_HEIGHT,
  FILE_TREE_DEFAULT_OVERSCAN,
} from '../src/model/virtualization';
import { isHTMLElementOfTag } from '../src/utils/domGuards';
// Shared helpers for the dom-file-tree-{drag-and-drop,sticky-rows,git-status,
// icon-config,dynamic-files-mutation-api} ports. Light DOM: queries go straight
// to the tree root instead of a shadow root.
import { mountTree, settle } from './helpers';
import type { MountedTree } from './helpers';

// Upstream awaited a macrotask (`setTimeout(0)`) after every interaction; do the
// same, then drain Solid's queue.
export async function flushDom(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, 0);
  await promise;
  await settle();
}

export interface RenderedTree extends MountedTree {
  cleanup: () => void;
}

export async function renderFileTree(
  options: FileTreeOptions
): Promise<RenderedTree> {
  const mounted = mountTree(options);
  await flushDom();
  return { ...mounted, cleanup: mounted.dispose };
}

export function getItemButton(root: HTMLElement, path: string): HTMLElement {
  const button = root.querySelector<HTMLElement>(
    `[data-item-path="${path}"]:not([data-file-tree-sticky-row="true"])`
  );
  if (!isHTMLElementOfTag(button, 'button')) {
    throw new Error(`missing button for ${path}`);
  }
  return button;
}

export function getStickyRowButton(
  root: HTMLElement,
  path: string
): HTMLButtonElement {
  const button = root.querySelector(`[data-file-tree-sticky-path="${path}"]`);
  if (!isHTMLElementOfTag(button, 'button')) {
    throw new Error(`missing sticky row for ${path}`);
  }
  return button;
}

export function getScrollElement(root: HTMLElement): HTMLElement {
  const scrollElement = root.querySelector<HTMLElement>(
    '[data-file-tree-virtualized-scroll="true"]'
  );
  if (scrollElement === null) {
    throw new Error('missing scroll element');
  }
  return scrollElement;
}

export function scrollTo(scrollElement: HTMLElement, scrollTop: number): void {
  scrollElement.scrollTop = scrollTop;
  scrollElement.dispatchEvent(new Event('scroll'));
}

export function getVirtualList(root: HTMLElement): HTMLElement {
  const list = root.querySelector<HTMLElement>(
    '[data-file-tree-virtualized-list="true"]'
  );
  if (list === null) {
    throw new Error('missing virtualized list');
  }
  return list;
}

export function getVirtualStickyOffset(root: HTMLElement): HTMLElement {
  const offset = root.querySelector<HTMLElement>(
    '[data-file-tree-virtualized-sticky-offset="true"]'
  );
  if (offset === null) {
    throw new Error('missing virtualized sticky offset');
  }
  return offset;
}

export function getVirtualStickyWindow(root: HTMLElement): HTMLElement {
  const windowElement = root.querySelector<HTMLElement>(
    '[data-file-tree-virtualized-sticky="true"]'
  );
  if (windowElement === null) {
    throw new Error('missing virtualized sticky window');
  }
  return windowElement;
}

export function getPixelStyleValue(
  element: HTMLElement,
  property: 'bottom' | 'height' | 'top'
): number {
  const value = element.style.getPropertyValue(property);
  return Number.parseFloat(value === '' ? '0' : value);
}

export function getTranslateYStyleValue(element: HTMLElement): number {
  const match = element.style.transform.match(
    /translateY\((-?\d+(?:\.\d+)?)px\)/
  );
  return Number.parseFloat(match?.[1] ?? '0');
}

export function getNormalizedText(element: Element | null | undefined): string {
  return element?.textContent?.replaceAll(/\s+/g, ' ').trim() ?? '';
}

export function getRowSectionOrder(button: HTMLElement): Array<string> {
  return Array.from(button.children)
    .map((child) => child.getAttribute('data-item-section'))
    .filter((section): section is string => section !== null);
}

export function getMountedItemPaths(root: HTMLElement): Array<string> {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      '[data-type="item"]:not([data-file-tree-sticky-row="true"])'
    )
  )
    .filter((button) => button.dataset.itemParked !== 'true')
    .map((button) => button.dataset.itemPath)
    .filter((path): path is string => path !== undefined);
}

export function getFocusedItemPath(root: HTMLElement): string | null {
  const button = root.querySelector<HTMLElement>(
    'button[data-type="item"][tabindex="0"]:not([data-file-tree-sticky-row="true"])'
  );
  return button?.dataset.itemPath ?? null;
}

// Mirrors the CSS rule that hides the pre-populated sticky overlay at the top
// of the scroll range unless an overlay reveal is in flight.
export function getStickyRowPaths(root: HTMLElement): Array<string> {
  const previewHidden =
    root.dataset.scrollAtTop === 'true' &&
    root.dataset.overlayReveal === undefined;
  if (previewHidden) {
    return [];
  }
  return Array.from(
    root.querySelectorAll<HTMLElement>('[data-file-tree-sticky-path]')
  )
    .map((element) => element.dataset.fileTreeStickyPath)
    .filter((path): path is string => path !== undefined);
}

export function getStickyRowZIndex(root: HTMLElement, path: string): number {
  const zIndex = getStickyRowButton(root, path).style.zIndex;
  return Number.parseInt(zIndex === '' ? '0' : zIndex, 10);
}

export function clickStickyRow(
  root: HTMLElement,
  path: string,
  init: MouseEventInit = {}
): void {
  getStickyRowButton(root, path).dispatchEvent(
    new MouseEvent('click', { bubbles: true, ...init })
  );
}

export function clickItem(
  root: HTMLElement,
  path: string,
  init: MouseEventInit = {}
): void {
  getItemButton(root, path).dispatchEvent(
    new MouseEvent('click', { bubbles: true, ...init })
  );
}

export function pressKey(
  target: HTMLElement,
  key: string,
  init: KeyboardEventInit = {}
): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, key, ...init })
  );
}

export function getVisibleRowPath(row: FileTreeVisibleRow): string {
  return row.isFlattened
    ? (row.flattenedSegments?.findLast((segment) => segment.isTerminal)?.path ??
        row.path)
    : row.path;
}

export function getVisibleIndexForPath(
  controller: {
    getVisibleCount(): number;
    getVisibleRows(
      start: number,
      end: number
    ): ReadonlyArray<FileTreeVisibleRow>;
  },
  path: string
): number {
  const visibleCount = controller.getVisibleCount();
  if (visibleCount <= 0) {
    return -1;
  }
  return controller
    .getVisibleRows(0, visibleCount - 1)
    .findIndex((row) => getVisibleRowPath(row) === path);
}

export interface ExpectedRenderedWindow {
  layout: FileTreeLayoutSnapshot<FileTreeVisibleRow>;
  mountedPaths: Array<string>;
}

export function computeExpectedRenderedWindow(
  controller: {
    getVisibleCount(): number;
    getVisibleRows(
      start: number,
      end: number
    ): ReadonlyArray<FileTreeVisibleRow>;
  },
  scrollTop: number,
  viewportHeight: number
): ExpectedRenderedWindow {
  const visibleCount = controller.getVisibleCount();
  const rows =
    visibleCount <= 0 ? [] : controller.getVisibleRows(0, visibleCount - 1);
  const layout = computeFileTreeLayout(rows, {
    itemHeight: FILE_TREE_DEFAULT_ITEM_HEIGHT,
    overscan: FILE_TREE_DEFAULT_OVERSCAN,
    scrollTop,
    viewportHeight,
  });
  const stickyPathSet = new Set(
    layout.sticky.rows.map((entry) => getVisibleRowPath(entry.row))
  );
  const mountedPaths: Array<string> =
    layout.window.startIndex < 0 ||
    layout.window.endIndex < layout.window.startIndex
      ? []
      : rows
          .slice(layout.window.startIndex, layout.window.endIndex + 1)
          .map((row) => getVisibleRowPath(row))
          .filter((path) => !stickyPathSet.has(path));

  return { layout, mountedPaths };
}
