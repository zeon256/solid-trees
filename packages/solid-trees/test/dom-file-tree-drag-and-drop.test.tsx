import { afterEach, describe, expect, test } from 'vitest';

import { FileTreeController } from '../src/model/FileTreeController';
import type {
  FileTreeDropContext,
  FileTreeDropResult,
  FileTreeOptions,
} from '../src/model/publicTypes';
import { isHTMLElement } from '../src/utils/domGuards';
import {
  flushDom,
  getItemButton,
  getScrollElement,
  getStickyRowButton,
  renderFileTree,
  scrollTo,
} from './dnd-sticky-git-support';
import type { RenderedTree } from './dnd-sticky-git-support';

type MockDataTransfer = {
  data: Map<string, string>;
  dropEffect: DataTransfer['dropEffect'];
  effectAllowed: DataTransfer['effectAllowed'];
  getData(type: string): string;
  setData(type: string, value: string): void;
  setDragImage(_element: Element, _x: number, _y: number): void;
};

function createMockDataTransfer(): MockDataTransfer {
  return {
    data: new Map(),
    dropEffect: 'move',
    effectAllowed: 'move',
    getData(type: string): string {
      return this.data.get(type) ?? '';
    },
    setData(type: string, value: string): void {
      this.data.set(type, value);
    },
    setDragImage(): void {},
  };
}

function dispatchDragEvent(
  element: HTMLElement,
  type: string,
  init: {
    clientX?: number;
    clientY?: number;
    dataTransfer?: MockDataTransfer;
    relatedTarget?: EventTarget | null;
  } = {}
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { configurable: true, value: init.clientX ?? 100 },
    clientY: { configurable: true, value: init.clientY ?? 100 },
    dataTransfer: {
      configurable: true,
      value: init.dataTransfer ?? createMockDataTransfer(),
    },
    relatedTarget: { configurable: true, value: init.relatedTarget ?? null },
  });
  element.dispatchEvent(event);
}

function dispatchTouchEvent(
  target: EventTarget,
  type: string,
  init: {
    changedTouches?: ReadonlyArray<{ clientX: number; clientY: number }>;
    touches?: ReadonlyArray<{ clientX: number; clientY: number }>;
  }
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    changedTouches: {
      configurable: true,
      value: init.changedTouches ?? init.touches ?? [],
    },
    touches: { configurable: true, value: init.touches ?? [] },
  });
  target.dispatchEvent(event);
}

function getUniqueItemPaths(elements: Iterable<HTMLElement>): Array<string> {
  return Array.from(
    new Set(
      Array.from(elements)
        .map(
          (element) =>
            element.dataset.fileTreeStickyPath ?? element.dataset.itemPath
        )
        .filter((path): path is string => path !== undefined)
    )
  );
}

function getDraggingPaths(root: HTMLElement): Array<string> {
  return getUniqueItemPaths(
    root.querySelectorAll<HTMLElement>('[data-item-dragging="true"]')
  );
}

function getDragTargetPaths(root: HTMLElement): Array<string> {
  return getUniqueItemPaths(
    root.querySelectorAll<HTMLElement>('[data-item-drag-target="true"]')
  );
}

function getParkedDraggingButton(
  root: HTMLElement,
  path: string
): HTMLElement | null {
  return root.querySelector(
    `[data-item-path="${path}"][data-item-parked="true"][data-item-dragging="true"]`
  );
}

function setElementFromPoint(getElement: () => Element | null): void {
  document.elementFromPoint = getElement;
}

interface RectInit {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
  x: number;
  y: number;
}

function createDomRect(rect: RectInit): DOMRect {
  return { ...rect, toJSON: () => rect };
}

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

function isMutableStringArray(
  value: ReadonlyArray<string>
): value is Array<string> {
  return Array.isArray(value);
}

const BASE_PATHS = [
  'README.md',
  'package.json',
  'docs/guide.md',
  'docs/api.md',
  'src/index.ts',
  'src/lib/utils.ts',
  'src/lib/theme.ts',
  'assets/images/social/logo.png',
  'assets/images/social/banner.png',
] as const;

let rendered: RenderedTree | null = null;

async function render(options: FileTreeOptions): Promise<RenderedTree> {
  rendered = await renderFileTree(options);
  return rendered;
}

afterEach(() => {
  rendered?.cleanup();
  rendered = null;
  // jsdom does not implement elementFromPoint; tests install their own.
  Reflect.deleteProperty(document, 'elementFromPoint');
  for (const preview of document.querySelectorAll(
    '[data-file-tree-drag-preview]'
  )) {
    preview.remove();
  }
});

describe('file-tree drag and drop', () => {
  test('getDragSession returns a snapshot and failed completion clears the session', () => {
    const controller = new FileTreeController({
      dragAndDrop: true,
      flattenEmptyDirectories: true,
      paths: ['README.md'],
    });

    try {
      expect(controller.startDrag('README.md')).toBe(true);
      const dragSession = controller.getDragSession();
      if (dragSession === null) {
        throw new Error('expected drag session');
      }

      const draggedPaths = dragSession.draggedPaths;
      if (!isMutableStringArray(draggedPaths)) {
        throw new Error('expected mutable dragged paths snapshot');
      }
      draggedPaths.push('mutated.ts');
      dragSession.target = {
        directoryPath: 'fake/',
        flattenedSegmentPath: null,
        hoveredPath: 'fake/',
        kind: 'directory',
      };

      expect(controller.getDragSession()).toEqual({
        draggedPaths: ['README.md'],
        primaryPath: 'README.md',
        target: null,
      });
      expect(controller.completeDrag()).toBe(false);
      expect(controller.getDragSession()).toBeNull();
    } finally {
      controller.destroy();
    }
  });

  test('external path mutations abort an in-flight drag session', () => {
    const controller = new FileTreeController({
      dragAndDrop: true,
      flattenEmptyDirectories: true,
      initialExpandedPaths: ['src/'],
      paths: ['README.md', 'src/index.ts'],
    });

    try {
      expect(controller.startDrag('README.md')).toBe(true);
      expect(controller.getDragSession()).toEqual({
        draggedPaths: ['README.md'],
        primaryPath: 'README.md',
        target: null,
      });

      controller.move('src/index.ts', 'src/main.ts');

      expect(controller.getDragSession()).toBeNull();
      expect(controller.getItem('src/main.ts')).not.toBeNull();
      expect(controller.getItem('src/index.ts')).toBeNull();
    } finally {
      controller.destroy();
    }
  });

  test('touch pending drag disables native draggable until the touch ends', async () => {
    const { root } = await render({
      dragAndDrop: true,
      flattenEmptyDirectories: true,
      initialExpandedPaths: ['src/'],
      paths: ['README.md', 'src/index.ts'],
      initialVisibleRowCount: 180 / 30,
    });

    const sourceButton = getItemButton(root, 'README.md');

    dispatchTouchEvent(sourceButton, 'touchstart', {
      touches: [{ clientX: 12, clientY: 12 }],
    });
    await flushDom();
    expect(sourceButton.getAttribute('draggable')).toBe('false');

    dispatchTouchEvent(document, 'touchend', {
      changedTouches: [{ clientX: 12, clientY: 12 }],
    });
    await flushDom();
    expect(sourceButton.getAttribute('draggable')).toBe('true');
  });

  test('touch drag activation keeps native draggable disabled', async () => {
    const { root } = await render({
      dragAndDrop: true,
      flattenEmptyDirectories: true,
      initialExpandedPaths: ['src/'],
      paths: ['README.md', 'src/index.ts'],
      initialVisibleRowCount: 180 / 30,
    });

    const sourceButton = getItemButton(root, 'README.md');
    const draggableWrites: Array<string> = [];
    const setAttribute = sourceButton.setAttribute.bind(sourceButton);
    sourceButton.setAttribute = (name: string, value: string): void => {
      if (name === 'draggable') {
        draggableWrites.push(value);
      }
      setAttribute(name, value);
    };

    dispatchTouchEvent(sourceButton, 'touchstart', {
      touches: [{ clientX: 12, clientY: 12 }],
    });
    await sleep(450);
    await flushDom();

    expect(draggableWrites).not.toContain('true');
    expect(sourceButton.getAttribute('draggable')).toBe('false');
    expect(getDraggingPaths(root)).toEqual(['README.md']);

    dispatchTouchEvent(document, 'touchcancel', {
      changedTouches: [{ clientX: 12, clientY: 12 }],
    });
    await flushDom();
    expect(sourceButton.getAttribute('draggable')).toBe('true');
  });

  // Upstream's variant ("...when shadow hit-testing retargets to the host")
  // exercises the shadow-root geometry fallback, which has no light-DOM
  // equivalent. This port keeps the touch-drag-to-drop flow with
  // `elementFromPoint` resolving the target row directly.
  test('touch drag resolves drop targets from the hit-tested element', async () => {
    const { model, root } = await render({
      dragAndDrop: true,
      flattenEmptyDirectories: true,
      initialExpandedPaths: ['src/'],
      paths: ['README.md', 'src/index.ts'],
      initialVisibleRowCount: 180 / 30,
    });

    const sourceButton = getItemButton(root, 'README.md');
    const targetButton = getItemButton(root, 'src/');
    sourceButton.getBoundingClientRect = () =>
      createDomRect({
        bottom: 30,
        height: 30,
        left: 0,
        right: 240,
        top: 0,
        width: 240,
        x: 0,
        y: 0,
      });
    targetButton.getBoundingClientRect = () =>
      createDomRect({
        bottom: 70,
        height: 30,
        left: 0,
        right: 240,
        top: 40,
        width: 240,
        x: 0,
        y: 40,
      });
    setElementFromPoint(() => targetButton);

    dispatchTouchEvent(sourceButton, 'touchstart', {
      touches: [{ clientX: 12, clientY: 12 }],
    });
    await sleep(450);
    await flushDom();
    dispatchTouchEvent(document, 'touchmove', {
      touches: [{ clientX: 12, clientY: 52 }],
    });
    await flushDom();
    expect(getDragTargetPaths(root)).toEqual(['src/']);

    dispatchTouchEvent(document, 'touchend', {
      changedTouches: [{ clientX: 12, clientY: 52 }],
    });
    await flushDom();

    expect(model.getItem('src/README.md')).not.toBeNull();
    expect(getDraggingPaths(root)).toEqual([]);
    expect(getDragTargetPaths(root)).toEqual([]);
  });

  test('root-level file hover resolves to a root drop and clears drag state after success', async () => {
    const dropResults: Array<FileTreeDropResult> = [];
    const { model, root } = await render({
      dragAndDrop: {
        onDropComplete: (event: FileTreeDropResult) => {
          dropResults.push(event);
        },
      },
      flattenEmptyDirectories: true,
      initialExpandedPaths: ['src/'],
      paths: ['README.md', 'src/index.ts'],
      search: true,
      initialVisibleRowCount: 140 / 30,
    });

    const sourceButton = getItemButton(root, 'src/index.ts');
    const hoveredButton = getItemButton(root, 'README.md');
    const dataTransfer = createMockDataTransfer();
    setElementFromPoint(() => hoveredButton);

    dispatchDragEvent(sourceButton, 'dragstart', { dataTransfer });
    await flushDom();
    dispatchDragEvent(hoveredButton, 'dragover', {
      clientX: 12,
      clientY: 12,
      dataTransfer,
    });
    await flushDom();
    dispatchDragEvent(root, 'drop', {
      clientX: 12,
      clientY: 12,
      dataTransfer,
    });
    await flushDom();

    expect(model.getItem('index.ts')).not.toBeNull();
    expect(model.getItem('src/index.ts')).toBeNull();
    expect(dropResults).toEqual([
      {
        draggedPaths: ['src/index.ts'],
        operation: 'move',
        target: {
          directoryPath: null,
          flattenedSegmentPath: null,
          hoveredPath: 'README.md',
          kind: 'root',
        },
      },
    ]);
    expect(getDraggingPaths(root)).toEqual([]);
    expect(getDragTargetPaths(root)).toEqual([]);
  });

  test('sticky directory hover resolves the same drop target as the canonical folder row', async () => {
    const completed: Array<FileTreeDropResult> = [];
    const { model, root } = await render({
      dragAndDrop: {
        onDropComplete: (event: FileTreeDropResult) => {
          completed.push(event);
        },
      },
      flattenEmptyDirectories: true,
      initialExpandedPaths: ['src/'],
      paths: ['src/index.ts', 'src/utils.ts', 'z.ts'],
      stickyFolders: true,
      initialVisibleRowCount: 180 / 30,
    });

    scrollTo(getScrollElement(root), 1);
    await flushDom();

    const sourceButton = getItemButton(root, 'z.ts');
    const canonicalTarget = getItemButton(root, 'src/');
    const stickyTarget = getStickyRowButton(root, 'src/');
    const dataTransfer = createMockDataTransfer();

    dispatchDragEvent(sourceButton, 'dragstart', { dataTransfer });
    await flushDom();

    setElementFromPoint(() => canonicalTarget);
    dispatchDragEvent(canonicalTarget, 'dragover', { dataTransfer });
    await flushDom();
    expect(getDragTargetPaths(root)).toEqual(['src/']);

    setElementFromPoint(() => stickyTarget);
    dispatchDragEvent(stickyTarget, 'dragover', { dataTransfer });
    await flushDom();
    expect(getDragTargetPaths(root)).toEqual(['src/']);

    dispatchDragEvent(root, 'drop', { dataTransfer });
    await flushDom();

    expect(model.getItem('src/z.ts')).not.toBeNull();
    expect(model.getItem('z.ts')).toBeNull();
    expect(completed).toEqual([
      {
        draggedPaths: ['z.ts'],
        operation: 'move',
        target: {
          directoryPath: 'src/',
          flattenedSegmentPath: null,
          hoveredPath: 'src/',
          kind: 'directory',
        },
      },
    ]);
    expect(getDraggingPaths(root)).toEqual([]);
    expect(getDragTargetPaths(root)).toEqual([]);
  });

  test('sticky rows can act as drag sources for directory moves', async () => {
    const completed: Array<FileTreeDropResult> = [];
    const { model, root } = await render({
      dragAndDrop: {
        onDropComplete: (event: FileTreeDropResult) => {
          completed.push(event);
        },
      },
      flattenEmptyDirectories: true,
      initialExpandedPaths: ['src/', 'target/'],
      paths: ['src/index.ts', 'src/utils.ts', 'target/existing.ts'],
      stickyFolders: true,
      initialVisibleRowCount: 180 / 30,
    });

    scrollTo(getScrollElement(root), 1);
    await flushDom();

    const stickySource = getStickyRowButton(root, 'src/');
    const targetButton = getItemButton(root, 'target/');
    const dataTransfer = createMockDataTransfer();
    setElementFromPoint(() => targetButton);

    dispatchDragEvent(stickySource, 'dragstart', { dataTransfer });
    await flushDom();
    expect(getDraggingPaths(root)).toEqual(['src/']);

    dispatchDragEvent(targetButton, 'dragover', { dataTransfer });
    await flushDom();
    expect(getDragTargetPaths(root)).toEqual(['target/']);

    dispatchDragEvent(root, 'drop', { dataTransfer });
    await flushDom();

    expect(model.getItem('target/src/')).not.toBeNull();
    expect(model.getItem('target/src/index.ts')).not.toBeNull();
    expect(model.getItem('src/')).toBeNull();
    expect(completed).toEqual([
      {
        draggedPaths: ['src/'],
        operation: 'move',
        target: {
          directoryPath: 'target/',
          flattenedSegmentPath: null,
          hoveredPath: 'target/',
          kind: 'directory',
        },
      },
    ]);
    expect(getDraggingPaths(root)).toEqual([]);
    expect(getDragTargetPaths(root)).toEqual([]);
  });

  test('dragging a selected row moves the full selected set', async () => {
    const { model, root } = await render({
      dragAndDrop: true,
      flattenEmptyDirectories: true,
      initialExpandedPaths: ['docs/'],
      paths: BASE_PATHS,
      initialVisibleRowCount: 180 / 30,
    });

    model.getItem('README.md')?.select();
    model.getItem('package.json')?.select();
    await flushDom();

    const sourceButton = getItemButton(root, 'README.md');
    const targetButton = getItemButton(root, 'docs/');
    const dataTransfer = createMockDataTransfer();
    setElementFromPoint(() => targetButton);

    dispatchDragEvent(sourceButton, 'dragstart', { dataTransfer });
    await flushDom();
    dispatchDragEvent(targetButton, 'dragover', { dataTransfer });
    await flushDom();
    dispatchDragEvent(root, 'drop', { dataTransfer });
    await flushDom();

    expect(model.getItem('docs/README.md')).not.toBeNull();
    expect(model.getItem('docs/package.json')).not.toBeNull();
    expect(model.getItem('README.md')).toBeNull();
    expect(model.getItem('package.json')).toBeNull();
  });

  test('dragging an unselected row collapses to a single-item drag and selection', async () => {
    const { model, root } = await render({
      dragAndDrop: true,
      flattenEmptyDirectories: true,
      initialExpandedPaths: ['docs/', 'src/'],
      paths: BASE_PATHS,
      initialVisibleRowCount: 180 / 30,
    });

    model.getItem('README.md')?.select();
    model.getItem('package.json')?.select();
    await flushDom();

    const sourceButton = getItemButton(root, 'src/index.ts');
    const targetButton = getItemButton(root, 'docs/');
    const dataTransfer = createMockDataTransfer();
    setElementFromPoint(() => targetButton);

    dispatchDragEvent(sourceButton, 'dragstart', { dataTransfer });
    await flushDom();
    expect(model.getSelectedPaths()).toEqual(['src/index.ts']);

    dispatchDragEvent(targetButton, 'dragover', { dataTransfer });
    await flushDom();
    dispatchDragEvent(root, 'drop', { dataTransfer });
    await flushDom();

    expect(model.getItem('docs/index.ts')).not.toBeNull();
    expect(model.getItem('README.md')).not.toBeNull();
    expect(model.getItem('package.json')).not.toBeNull();
  });

  test('self and descendant drops are rejected before mutation', async () => {
    const { model, root } = await render({
      dragAndDrop: true,
      flattenEmptyDirectories: true,
      initialExpandedPaths: ['src/', 'src/lib/'],
      paths: ['README.md', 'src/index.ts', 'src/lib/utils.ts'],
      initialVisibleRowCount: 180 / 30,
    });

    const sourceButton = getItemButton(root, 'src/');
    const descendantButton = getItemButton(root, 'src/lib/');
    const dataTransfer = createMockDataTransfer();
    setElementFromPoint(() => descendantButton);

    dispatchDragEvent(sourceButton, 'dragstart', { dataTransfer });
    await flushDom();
    dispatchDragEvent(descendantButton, 'dragover', { dataTransfer });
    await flushDom();
    expect(getDragTargetPaths(root)).toEqual([]);

    dispatchDragEvent(root, 'drop', { dataTransfer });
    await flushDom();
    expect(model.getItem('src/')).not.toBeNull();
    expect(model.getItem('src/lib/utils.ts')).not.toBeNull();
  });

  test('search-active drag blocking matches legacy behavior', async () => {
    const { model, root } = await render({
      dragAndDrop: true,
      fileTreeSearchMode: 'hide-non-matches',
      flattenEmptyDirectories: true,
      initialExpandedPaths: ['src/'],
      paths: BASE_PATHS,
      search: true,
      initialVisibleRowCount: 180 / 30,
    });

    model.setSearch('read');
    await flushDom();

    const sourceButton = getItemButton(root, 'README.md');
    dispatchDragEvent(sourceButton, 'dragstart', {
      dataTransfer: createMockDataTransfer(),
    });
    await flushDom();

    expect(getDraggingPaths(root)).toEqual([]);
    expect(model.getSelectedPaths()).toEqual([]);
  });

  test('flattened segment targets resolve to canonical intermediate folder paths', async () => {
    const { model, root } = await render({
      dragAndDrop: true,
      flattenEmptyDirectories: true,
      initialExpandedPaths: ['assets/images/social/', 'src/'],
      paths: [
        'assets/images/social/logo.png',
        'assets/images/social/banner.png',
        'src/index.ts',
      ],
      initialVisibleRowCount: 180 / 30,
    });

    const sourceButton = getItemButton(root, 'src/index.ts');
    const segmentTarget = root.querySelector(
      '[data-item-flattened-subitem="assets/images/"]'
    );
    if (!isHTMLElement(segmentTarget)) {
      throw new Error('missing flattened segment target for assets/images/');
    }
    const flattenedSegmentTarget = segmentTarget;
    const dataTransfer = createMockDataTransfer();
    setElementFromPoint(() => flattenedSegmentTarget);

    dispatchDragEvent(sourceButton, 'dragstart', { dataTransfer });
    await flushDom();
    dispatchDragEvent(flattenedSegmentTarget, 'dragover', { dataTransfer });
    await flushDom();
    dispatchDragEvent(root, 'drop', { dataTransfer });
    await flushDom();

    expect(model.getItem('assets/images/index.ts')).not.toBeNull();
    expect(model.getItem('assets/images/social/index.ts')).toBeNull();
  });

  test('parked dragged rows survive virtualization ejection during scroll', async () => {
    const paths = Array.from(
      { length: 180 },
      (_, index) => `item${String(index).padStart(3, '0')}.ts`
    );
    const { root } = await render({
      dragAndDrop: true,
      flattenEmptyDirectories: false,
      paths,
      initialVisibleRowCount: 120 / 30,
    });

    const viewport = getScrollElement(root);

    scrollTo(viewport, 1500);
    await flushDom();

    const sourceButton = getItemButton(root, 'item050.ts');
    dispatchDragEvent(sourceButton, 'dragstart', {
      dataTransfer: createMockDataTransfer(),
    });
    await flushDom();

    scrollTo(viewport, 3000);
    await flushDom();

    expect(getParkedDraggingButton(root, 'item050.ts')).not.toBeNull();
  });

  test('path-based canDrag/canDrop hooks gate built-in pointer drops and onDropComplete observes success', async () => {
    const completed: Array<FileTreeDropResult> = [];
    const { model, root } = await render({
      dragAndDrop: {
        canDrag: (paths: ReadonlyArray<string>) => !paths.includes('README.md'),
        canDrop: (event: FileTreeDropContext) =>
          event.target.directoryPath !== 'docs/',
        onDropComplete: (event: FileTreeDropResult) => {
          completed.push(event);
        },
      },
      flattenEmptyDirectories: true,
      initialExpandedPaths: ['docs/', 'src/'],
      paths: ['README.md', 'docs/guide.md', 'package.json', 'src/index.ts'],
      initialVisibleRowCount: 180 / 30,
    });

    const blockedSource = getItemButton(root, 'README.md');
    dispatchDragEvent(blockedSource, 'dragstart', {
      dataTransfer: createMockDataTransfer(),
    });
    await flushDom();
    expect(getDraggingPaths(root)).toEqual([]);

    const allowedSource = getItemButton(root, 'package.json');
    const blockedTarget = getItemButton(root, 'docs/');
    const allowedTarget = getItemButton(root, 'src/');

    const blockedDataTransfer = createMockDataTransfer();
    setElementFromPoint(() => blockedTarget);
    dispatchDragEvent(allowedSource, 'dragstart', {
      dataTransfer: blockedDataTransfer,
    });
    await flushDom();
    dispatchDragEvent(blockedTarget, 'dragover', {
      dataTransfer: blockedDataTransfer,
    });
    await flushDom();
    expect(getDragTargetPaths(root)).toEqual([]);
    dispatchDragEvent(allowedSource, 'dragend', {
      dataTransfer: blockedDataTransfer,
    });
    await flushDom();

    const allowedDataTransfer = createMockDataTransfer();
    setElementFromPoint(() => allowedTarget);
    dispatchDragEvent(allowedSource, 'dragstart', {
      dataTransfer: allowedDataTransfer,
    });
    await flushDom();
    dispatchDragEvent(allowedTarget, 'dragover', {
      dataTransfer: allowedDataTransfer,
    });
    await flushDom();
    dispatchDragEvent(root, 'drop', { dataTransfer: allowedDataTransfer });
    await flushDom();

    expect(completed).toEqual([
      {
        draggedPaths: ['package.json'],
        operation: 'move',
        target: {
          directoryPath: 'src/',
          flattenedSegmentPath: null,
          hoveredPath: 'src/',
          kind: 'directory',
        },
      },
    ]);
    expect(model.getItem('src/package.json')).not.toBeNull();
  });

  test('multi-item collision errors do not partially move earlier paths', async () => {
    const errors: Array<string> = [];
    const { model, root } = await render({
      dragAndDrop: {
        onDropError: (error: string) => {
          errors.push(error);
        },
      },
      flattenEmptyDirectories: true,
      initialExpandedPaths: ['src/'],
      paths: ['README.md', 'package.json', 'src/package.json'],
      initialVisibleRowCount: 180 / 30,
    });

    model.getItem('README.md')?.select();
    model.getItem('package.json')?.select();
    await flushDom();

    const sourceButton = getItemButton(root, 'README.md');
    const targetButton = getItemButton(root, 'src/');
    const dataTransfer = createMockDataTransfer();
    setElementFromPoint(() => targetButton);

    dispatchDragEvent(sourceButton, 'dragstart', { dataTransfer });
    await flushDom();
    dispatchDragEvent(targetButton, 'dragover', { dataTransfer });
    await flushDom();
    dispatchDragEvent(root, 'drop', { dataTransfer });
    await flushDom();

    expect(errors).toEqual(['Destination already exists: "src/package.json"']);
    expect(model.getItem('README.md')).not.toBeNull();
    expect(model.getItem('src/README.md')).toBeNull();
    expect(model.getItem('package.json')).not.toBeNull();
    expect(model.getItem('src/package.json')).not.toBeNull();
  });

  test('onDropError reports collision failures without controlled mode', async () => {
    const errors: Array<string> = [];
    const { model, root } = await render({
      dragAndDrop: {
        onDropError: (error: string) => {
          errors.push(error);
        },
      },
      flattenEmptyDirectories: true,
      initialExpandedPaths: ['src/'],
      paths: ['package.json', 'src/package.json'],
      initialVisibleRowCount: 180 / 30,
    });

    const sourceButton = getItemButton(root, 'package.json');
    const targetButton = getItemButton(root, 'src/');
    const dataTransfer = createMockDataTransfer();
    setElementFromPoint(() => targetButton);

    dispatchDragEvent(sourceButton, 'dragstart', { dataTransfer });
    await flushDom();
    dispatchDragEvent(targetButton, 'dragover', { dataTransfer });
    await flushDom();
    dispatchDragEvent(root, 'drop', { dataTransfer });
    await flushDom();

    expect(errors).toEqual(['Destination already exists: "src/package.json"']);
    expect(model.getItem('package.json')).not.toBeNull();
  });
});
