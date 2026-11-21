// Solid-port equivalents of upstream test/helpers/renderHarness.ts for the
// light-DOM view. Shared by the dom-file-tree-{keyboard-selection,
// row-interactions,virtualization-window} suites.
import { flush } from 'solid-js';

import { computeFileTreeLayout } from '../src/model/layout';
import type { FileTreeLayoutSnapshot } from '../src/model/layout';
import type { FileTreeVisibleRow } from '../src/model/publicTypes';
import {
  FILE_TREE_DEFAULT_ITEM_HEIGHT,
  FILE_TREE_DEFAULT_OVERSCAN,
} from '../src/model/virtualization';
import { isHTMLElement, isHTMLElementOfTag } from '../src/utils/domGuards';
import { settle } from './helpers';

// Upstream `flushDom`: one macrotask hop per call, plus a Solid flush so the
// reactive graph has landed before assertions.
export async function flushDom(times: number = 1): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 0);
    await promise;
    await settle();
  }
}

export function getItemButton(
  root: HTMLElement,
  path: string
): HTMLButtonElement {
  const button = root.querySelector(
    `[data-item-path="${path}"]:not([data-file-tree-sticky-row="true"])`
  );
  if (!isHTMLElementOfTag(button, 'button')) {
    throw new Error(`missing button for ${path}`);
  }
  return button;
}

export function getScrollElement(root: HTMLElement): HTMLElement {
  const scroll = root.querySelector(
    '[data-file-tree-virtualized-scroll="true"]'
  );
  if (!isHTMLElement(scroll)) {
    throw new Error('missing scroll element');
  }
  return scroll;
}

export function getListElement(root: HTMLElement): HTMLDivElement {
  const list = root.querySelector('[data-file-tree-virtualized-list="true"]');
  if (!isHTMLElementOfTag(list, 'div')) {
    throw new Error('missing list element');
  }
  return list;
}

export function getFocusedTreeElement(root: HTMLElement): HTMLElement | null {
  const active = document.activeElement;
  return isHTMLElement(active) && root.contains(active) ? active : null;
}

export function clickItem(
  root: HTMLElement,
  path: string,
  init: MouseEventInit = {}
): void {
  getItemButton(root, path).dispatchEvent(
    new MouseEvent('click', { bubbles: true, ...init })
  );
  flush();
}

export function pressKey(
  target: HTMLElement,
  key: string,
  init: KeyboardEventInit = {}
): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, key, ...init })
  );
  flush();
}

export function getSelectedItemPaths(root: HTMLElement): Array<string> {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      '[data-item-selected="true"]:not([data-file-tree-sticky-row="true"])'
    )
  )
    .filter((element): element is HTMLButtonElement =>
      isHTMLElementOfTag(element, 'button')
    )
    .filter((button) => button.dataset.itemParked !== 'true')
    .map((button) => button.dataset.itemPath)
    .filter((path): path is string => path !== undefined);
}

export function getFocusedItemPath(root: HTMLElement): string | null {
  const button = root.querySelector(
    'button[data-type="item"][tabindex="0"]:not([data-file-tree-sticky-row="true"])'
  );
  return isHTMLElementOfTag(button, 'button')
    ? (button.dataset.itemPath ?? null)
    : null;
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
    .filter((element): element is HTMLButtonElement =>
      isHTMLElementOfTag(element, 'button')
    )
    .filter((button) => button.dataset.itemParked !== 'true')
    .map((button) => button.dataset.itemPath)
    .filter((path): path is string => path !== undefined);
}

// Mirrors the CSS rule that hides the pre-populated sticky overlay at rest.
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

export function clickStickyRow(
  root: HTMLElement,
  path: string,
  init: MouseEventInit = {}
): void {
  getStickyRowButton(root, path).dispatchEvent(
    new MouseEvent('click', { bubbles: true, ...init })
  );
  flush();
}

export interface FileTreeVisibleRowsController {
  getVisibleCount(): number;
  getVisibleRows(start: number, end: number): ReadonlyArray<FileTreeVisibleRow>;
}

export interface ExpectedRenderedWindow {
  layout: FileTreeLayoutSnapshot<FileTreeVisibleRow>;
  mountedPaths: Array<string>;
}

export function getVisibleRowPath(row: FileTreeVisibleRow): string {
  return row.isFlattened
    ? (row.flattenedSegments?.findLast((segment) => segment.isTerminal)?.path ??
        row.path)
    : row.path;
}

export function getVisibleIndexForPath(
  controller: FileTreeVisibleRowsController,
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

export function computeExpectedRenderedWindow(
  controller: FileTreeVisibleRowsController,
  scrollTop: number,
  viewportHeight: number
): ExpectedRenderedWindow {
  const visibleCount = controller.getVisibleCount();
  const rows =
    visibleCount <= 0 ? [] : controller.getVisibleRows(0, visibleCount - 1);
  const layout: FileTreeLayoutSnapshot<FileTreeVisibleRow> =
    computeFileTreeLayout(rows, {
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
