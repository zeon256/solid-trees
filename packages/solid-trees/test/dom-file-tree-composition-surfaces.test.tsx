import type { JSX } from '@solidjs/web';
import { afterEach, describe, expect, test } from 'vitest';

import type {
  FileTreeContextMenuItem,
  FileTreeContextMenuOpenContext,
} from '../src/model/publicTypes';
import { isHTMLElementOfTag } from '../src/utils/domGuards';
import {
  delay,
  flushDom,
  getItemButton,
  getScrollElement,
  getTreeRoot,
} from './dom-helpers-search-rename-menu';
import { mountTree } from './helpers';
import type { MountedTree } from './helpers';

// Shape used by the upstream assertions; `FileTreeContextMenuOpenContext`
// carries the same fields.
type CapturedContextMenuOpenContext = FileTreeContextMenuOpenContext;

const MENU_SLOT_SELECTOR = '[data-type="context-menu-slot"]';

function shiftF10(target: HTMLElement): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'F10',
      shiftKey: true,
    })
  );
}

function pointerOver(target: Element): void {
  target.dispatchEvent(new Event('pointerover', { bubbles: true }));
}

function queryButton(root: ParentNode, selector: string): HTMLButtonElement {
  const element = root.querySelector(selector);
  if (!isHTMLElementOfTag(element, 'button')) {
    throw new Error(`expected button for ${selector}`);
  }

  return element;
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

let mounted: MountedTree | null = null;
afterEach(() => {
  mounted?.dispose();
  mounted = null;
});

describe('file-tree composition surfaces', () => {
  // Skipped upstream tests (dropped feature, SSR/preload):
  // - 'preloadFileTree includes header slot and closed context-menu shell
  //   scaffolding'
  // - 'preloadFileTree omits context-menu affordance when the feature is
  //   disabled'
  // - 'hydrates host-managed slot content without duplicating header nodes'
  // Not part of the context-menu/header slice (left to other files):
  // - controller nearest-path fallbacks and icon remap / row decorator tests.

  test('attaches and removes header slot content on the host', async () => {
    mounted = mountTree(
      {
        flattenEmptyDirectories: true,
        initialExpansion: 'open',
        paths: ['README.md', 'src/index.ts'],
        initialVisibleRowCount: 120 / 30,
      },
      {
        header: (
          <button type="button" data-test-header="true">
            Header action
          </button>
        ),
      }
    );
    await flushDom();
    const { host, root } = mounted;

    expect(host.querySelector('[data-type="header-slot"]')).not.toBeNull();
    expect(
      root.querySelector('[data-type="header-slot"] [data-test-header="true"]')
        ?.textContent
    ).toBe('Header action');

    mounted.dispose();
    mounted = null;
    expect(host.querySelector('[data-type="header-slot"]')).toBeNull();
    expect(host.querySelector('[data-test-header="true"]')).toBeNull();
  });

  test('opens and closes a slotted context menu without rename-specific context fields', async () => {
    let capturedContext: CapturedContextMenuOpenContext | null = null;

    mounted = mountTree(
      {
        flattenEmptyDirectories: true,
        initialExpansion: 'open',
        paths: ['README.md', 'src/index.ts'],
        initialVisibleRowCount: 120 / 30,
      },
      {
        renderContextMenu: (_item, context) => {
          capturedContext = context;
          return (
            <div data-test-menu="true">
              <button
                type="button"
                onClick={() => {
                  context.close();
                }}
              >
                Close
              </button>
            </div>
          );
        },
      }
    );
    await flushDom();
    const { host, root } = mounted;

    const button = getItemButton(root, 'README.md');
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    const scrollElement = root.querySelector(
      '[data-file-tree-virtualized-scroll="true"]'
    );
    const treeRoot = getTreeRoot(host);
    const anchorElement = root.querySelector(
      '[data-type="context-menu-anchor"]'
    );
    expect(scrollElement?.contains(anchorElement ?? null)).toBe(false);
    expect(treeRoot.contains(anchorElement ?? null)).toBe(true);
    expect(anchorElement?.getAttribute('data-visible')).toBe('false');
    expect(
      root
        .querySelector('[data-type="context-menu-trigger"]')
        ?.getAttribute('data-visible')
    ).toBe('false');

    button.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        clientX: 24,
        clientY: 36,
      })
    );
    await flushDom();

    expect(
      root.querySelector(
        `[data-type="context-menu-anchor"] > ${MENU_SLOT_SELECTOR}`
      )
    ).not.toBeNull();
    if (capturedContext === null) {
      throw new Error('expected captured context');
    }
    const context = capturedContext as CapturedContextMenuOpenContext;
    expect(context.anchorElement).toBeDefined();
    expect(context.anchorElement.dataset.type).toBe('context-menu-trigger');
    expect(context.anchorRect).toBeDefined();
    expect(typeof context.close).toBe('function');
    expect(typeof context.restoreFocus).toBe('function');
    expect('canRename' in context).toBe(false);
    expect('startRenaming' in context).toBe(false);

    context.close();
    await flushDom();

    expect(root.querySelector(MENU_SLOT_SELECTOR)).toBeNull();
  });

  test('Shift+F10 opens the context menu for the focused row', async () => {
    let capturedContext: CapturedContextMenuOpenContext | null = null;

    mounted = mountTree(
      {
        flattenEmptyDirectories: true,
        initialExpansion: 'open',
        paths: ['README.md'],
        initialVisibleRowCount: 120 / 30,
      },
      {
        renderContextMenu: (_item, context) => {
          capturedContext = context;
          return <div>Context Menu</div>;
        },
      }
    );
    await flushDom();
    const { root } = mounted;

    const itemButton = getItemButton(root, 'README.md');
    itemButton.focus();
    shiftF10(itemButton);
    await flushDom();

    expect(capturedContext).not.toBeNull();
    if (capturedContext === null) {
      throw new Error('expected captured context');
    }
    const openContext: CapturedContextMenuOpenContext = capturedContext;
    expect(openContext.anchorElement.dataset.type).toBe('context-menu-trigger');
    expect(
      root.querySelector(
        `[data-type="context-menu-anchor"] ${MENU_SLOT_SELECTOR}`
      )
    ).not.toBeNull();
  });

  test('keeps the opened row visually focused and restores DOM focus on close', async () => {
    let capturedContext: CapturedContextMenuOpenContext | null = null;

    mounted = mountTree(
      {
        flattenEmptyDirectories: true,
        initialExpansion: 'open',
        paths: ['README.md', 'src/index.ts'],
        initialVisibleRowCount: 120 / 30,
      },
      {
        renderContextMenu: (_item, context) => {
          capturedContext = context;
          return (
            <div>
              <button
                type="button"
                onClick={() => {
                  context.close();
                }}
              >
                Close
              </button>
            </div>
          );
        },
      }
    );
    await flushDom();
    const { root } = mounted;

    const button = getItemButton(root, 'README.md');

    button.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
      })
    );
    await flushDom();

    expect(button.dataset.itemFocused).toBe('true');
    expect(document.activeElement).not.toBe(button);

    if (capturedContext === null) {
      throw new Error('expected captured context');
    }
    (capturedContext as CapturedContextMenuOpenContext).close();
    await flushDom();
    await delay(40);

    expect(document.activeElement).toBe(button);
    expect(button.dataset.itemFocused).toBe('true');
  });

  test('blocks tree keyboard navigation while context menu is open', async () => {
    mounted = mountTree(
      {
        flattenEmptyDirectories: true,
        initialExpansion: 'open',
        paths: ['README.md', 'src/index.ts'],
        initialVisibleRowCount: 120 / 30,
      },
      { renderContextMenu: () => <div>Menu</div> }
    );
    await flushDom();
    const { root } = mounted;

    const itemButton = getItemButton(root, 'README.md');
    itemButton.focus();
    shiftF10(itemButton);
    await flushDom();

    const blockedArrowKey = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'ArrowDown',
    });
    root.dispatchEvent(blockedArrowKey);

    expect(blockedArrowKey.defaultPrevented).toBe(true);
  });

  test('renders an interaction wash and keeps trigger and hover styling while open', async () => {
    mounted = mountTree(
      {
        composition: { contextMenu: { triggerMode: 'button' } },
        flattenEmptyDirectories: true,
        initialExpansion: 'open',
        paths: ['README.md'],
        initialVisibleRowCount: 120 / 30,
      },
      { renderContextMenu: () => <div>Menu</div> }
    );
    await flushDom();
    const { root } = mounted;

    const itemButton = getItemButton(root, 'README.md');
    const trigger = queryButton(root, '[data-type="context-menu-trigger"]');

    itemButton.focus();
    shiftF10(itemButton);
    await flushDom();

    const wash = root.querySelector<HTMLDivElement>(
      '[data-type="context-menu-wash"]'
    );
    expect(wash).not.toBeNull();
    expect(wash?.getAttribute('aria-hidden')).toBe('true');
    expect(trigger.dataset.visible).toBe('true');
    expect(itemButton.dataset.itemContextHover).toBe('true');

    root.dispatchEvent(new Event('pointerleave', { bubbles: true }));
    expect(trigger.dataset.visible).toBe('true');
    expect(itemButton.dataset.itemContextHover).toBe('true');

    const wheelEvent = new Event('wheel', {
      bubbles: true,
      cancelable: true,
    });
    wash?.dispatchEvent(wheelEvent);
    expect(wheelEvent.defaultPrevented).toBe(true);

    const touchStartEvent = new Event('touchstart', {
      bubbles: true,
      cancelable: true,
    });
    wash?.dispatchEvent(touchStartEvent);
    expect(touchStartEvent.defaultPrevented).toBe(true);
  });

  test('document Escape closes the menu and prevents default when focus is in slotted content', async () => {
    mounted = mountTree(
      {
        flattenEmptyDirectories: true,
        initialExpansion: 'open',
        paths: ['README.md'],
        initialVisibleRowCount: 120 / 30,
      },
      {
        renderContextMenu: () => (
          <div>
            <button type="button">Close</button>
          </div>
        ),
      }
    );
    await flushDom();
    const { root } = mounted;

    const itemButton = getItemButton(root, 'README.md');
    itemButton.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
      })
    );
    await flushDom();

    const menuButton = queryButton(root, `${MENU_SLOT_SELECTOR} button`);
    menuButton.focus();

    const escapeEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape',
    });
    menuButton.dispatchEvent(escapeEvent);
    await flushDom();

    expect(escapeEvent.defaultPrevented).toBe(true);
    expect(root.querySelector(MENU_SLOT_SELECTOR)).toBeNull();
  });

  test('keeps row hover when pointer moves from row to options anchor and open menu', async () => {
    mounted = mountTree(
      {
        flattenEmptyDirectories: true,
        initialExpansion: 'open',
        paths: ['README.md'],
        initialVisibleRowCount: 120 / 30,
      },
      { renderContextMenu: () => <div>Menu</div> }
    );
    await flushDom();
    const { root } = mounted;

    const itemButton = getItemButton(root, 'README.md');
    const contextMenuAnchor = root.querySelector(
      '[data-type="context-menu-anchor"]'
    );

    pointerOver(itemButton);
    await flushDom();
    expect(itemButton.dataset.itemContextHover).toBe('true');

    contextMenuAnchor?.dispatchEvent(
      new Event('pointerover', { bubbles: true })
    );
    await flushDom();
    expect(itemButton.dataset.itemContextHover).toBe('true');

    itemButton.focus();
    shiftF10(itemButton);
    await flushDom();

    const contextMenuContent = root.querySelector(MENU_SLOT_SELECTOR);
    expect(contextMenuContent).not.toBeNull();
    contextMenuContent?.dispatchEvent(
      new Event('pointerover', { bubbles: true })
    );
    await flushDom();
    expect(itemButton.dataset.itemContextHover).toBe('true');
  });

  test('keyboard navigation retargets the trigger away from a stale hovered row', async () => {
    const openedPath = { current: null as string | null };
    mounted = mountTree(
      {
        composition: { contextMenu: { triggerMode: 'button' } },
        flattenEmptyDirectories: true,
        initialExpansion: 'open',
        paths: ['README.md', 'src/index.ts', 'src/lib/utils.ts'],
        initialVisibleRowCount: 120 / 30,
      },
      {
        renderContextMenu: (item: FileTreeContextMenuItem): JSX.Element => {
          openedPath.current = item.path;
          return <div />;
        },
      }
    );
    await flushDom();
    const { model, root } = mounted;

    const firstRow = getItemButton(root, 'README.md');
    const secondRow = getItemButton(root, 'src/index.ts');
    const thirdRow = getItemButton(root, 'src/lib/utils.ts');
    const trigger = queryButton(root, '[data-type="context-menu-trigger"]');

    firstRow.focus();
    await flushDom();
    expect(model.getFocusedPath()).toBe('README.md');

    pointerOver(thirdRow);
    await flushDom();
    expect(thirdRow.dataset.itemContextHover).toBe('true');

    model.focusPath('src/index.ts');
    await flushDom();

    const focusedSecondRow = getItemButton(root, 'src/index.ts');
    focusedSecondRow.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        code: 'Space',
        ctrlKey: true,
        key: ' ',
      })
    );
    await flushDom();

    expect(model.getFocusedPath()).toBe('src/index.ts');
    expect(thirdRow.dataset.itemContextHover).toBe('true');
    expect(secondRow.dataset.itemContextHover).toBeUndefined();
    expect(trigger.dataset.visible).toBe('true');

    trigger.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      })
    );
    await flushDom();

    expect(openedPath.current).toBe('src/index.ts');
  });

  test('falls back to the focused row after pointer hover clears during scroll', async () => {
    const openedPath = { current: null as string | null };
    mounted = mountTree(
      {
        composition: { contextMenu: { triggerMode: 'button' } },
        flattenEmptyDirectories: true,
        initialExpansion: 'open',
        paths: ['README.md', 'src/index.ts', 'src/lib/utils.ts'],
        initialVisibleRowCount: 120 / 30,
      },
      {
        renderContextMenu: (item: FileTreeContextMenuItem): JSX.Element => {
          openedPath.current = item.path;
          return <div />;
        },
      }
    );
    await flushDom();
    const { model, root } = mounted;

    const viewport = getScrollElement(root);
    const firstRow = getItemButton(root, 'README.md');
    const secondRow = getItemButton(root, 'src/index.ts');
    const thirdRow = getItemButton(root, 'src/lib/utils.ts');
    const triggerButton = queryButton(
      root,
      '[data-type="context-menu-trigger"]'
    );

    firstRow.focus();
    model.focusPath('src/index.ts');
    await flushDom();

    expect(model.getFocusedPath()).toBe('src/index.ts');
    expect(triggerButton.dataset.visible).toBe('true');

    pointerOver(thirdRow);
    await flushDom();

    expect(triggerButton.dataset.visible).toBe('true');
    expect(thirdRow.dataset.itemContextHover).toBe('true');
    expect(secondRow.dataset.itemContextHover).toBeUndefined();

    viewport.dispatchEvent(new Event('scroll'));
    await flushDom();

    expect(triggerButton.dataset.visible).toBe('true');
    expect(thirdRow.dataset.itemContextHover).toBeUndefined();
    expect(secondRow.dataset.itemContextHover).toBeUndefined();
    expect(model.getFocusedPath()).toBe('src/index.ts');

    triggerButton.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      })
    );
    await flushDom();
    expect(openedPath.current).toBeNull();

    await delay(80);
    await flushDom();

    triggerButton.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      })
    );
    await flushDom();

    expect(openedPath.current).toBe('src/index.ts');
  });

  test('hides the focused trigger when the retained focused row is parked offscreen', async () => {
    mounted = mountTree({
      composition: {
        contextMenu: {
          enabled: true,
          triggerMode: 'button',
        },
      },
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      initialVisibleRowCount: 90 / 30,
      overscan: 0,
      paths: [
        'README.md',
        ...Array.from({ length: 20 }, (_unused, index) => {
          return `src/generated/file-${String(index).padStart(2, '0')}.ts`;
        }),
      ],
      stickyFolders: true,
    });
    await flushDom();
    const { model, root } = mounted;

    const scrollElement = getScrollElement(root);
    const firstRow = queryButton(
      root,
      'button[data-type="item"][data-item-type="file"]'
    );
    const trigger = queryButton(root, '[data-type="context-menu-trigger"]');
    const focusedPath = firstRow.dataset.itemPath;
    if (focusedPath === undefined) {
      throw new Error('expected focused row path');
    }

    firstRow.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      })
    );
    await flushDom();
    expect(model.getFocusedPath()).toBe(focusedPath);
    expect(trigger.dataset.visible).toBe('true');

    scrollElement.scrollTop = 240;
    scrollElement.dispatchEvent(new Event('scroll'));
    await flushDom();
    await delay(60);
    await flushDom();

    const parkedFirstRow = getItemButton(root, focusedPath);
    expect(parkedFirstRow.dataset.itemParked).toBe('true');

    const visibleHoverRow = Array.from(
      root.querySelectorAll('button[data-type="item"]')
    ).find((button) => {
      return (
        isHTMLElementOfTag(button, 'button') &&
        button.dataset.itemParked !== 'true' &&
        button.dataset.fileTreeStickyRow !== 'true' &&
        button.dataset.itemPath !== focusedPath
      );
    });
    if (!isHTMLElementOfTag(visibleHoverRow, 'button')) {
      throw new Error('expected a visible hover row');
    }

    pointerOver(visibleHoverRow);
    await flushDom();
    expect(trigger.dataset.visible).toBe('true');

    root.dispatchEvent(new Event('pointerleave'));
    await flushDom();

    expect(trigger.dataset.visible).toBe('false');
  });

  test('clears visual focus after a null-target blur from a row restored after parking', async () => {
    mounted = mountTree({
      composition: {
        contextMenu: {
          enabled: true,
          triggerMode: 'button',
        },
      },
      flattenEmptyDirectories: false,
      initialExpansion: 'open',
      initialVisibleRowCount: 90 / 30,
      overscan: 0,
      paths: [
        'README.md',
        ...Array.from({ length: 20 }, (_unused, index) => {
          return `src/generated/file-${String(index).padStart(2, '0')}.ts`;
        }),
      ],
      stickyFolders: true,
    });
    await flushDom();
    const { root } = mounted;

    const scrollElement = getScrollElement(root);
    const trigger = queryButton(root, '[data-type="context-menu-trigger"]');
    const firstRow = queryButton(
      root,
      'button[data-type="item"][data-item-type="file"]'
    );
    const focusedPath = firstRow.dataset.itemPath;
    if (focusedPath === undefined) {
      throw new Error('expected focused row path');
    }

    firstRow.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      })
    );
    await flushDom();

    scrollElement.scrollTop = 240;
    scrollElement.dispatchEvent(new Event('scroll'));
    await flushDom();
    expect(getItemButton(root, focusedPath).dataset.itemParked).toBe('true');

    scrollElement.scrollTop = 0;
    scrollElement.dispatchEvent(new Event('scroll'));
    await flushDom();
    await flushDom();

    const restoredFirstRow = getItemButton(root, focusedPath);
    expect(restoredFirstRow.dataset.itemParked).toBeUndefined();
    expect(restoredFirstRow.dataset.itemFocused).toBe('true');
    await delay(60);
    await flushDom();
    expect(trigger.dataset.visible).toBe('true');

    restoredFirstRow.blur();
    await flushDom();
    await flushDom();

    expect(root.querySelector('button[data-item-focused="true"]')).toBeNull();
    expect(trigger.dataset.visible).toBe('false');
  });

  test('button-capable modes reserve the action lane and keep lane attrs stable', async () => {
    mounted = mountTree({
      composition: {
        contextMenu: {
          buttonVisibility: 'always',
          enabled: true,
          triggerMode: 'button',
        },
      },
      flattenEmptyDirectories: true,
      initialExpansion: 'open',
      paths: ['README.md'],
      initialVisibleRowCount: 120 / 30,
    });
    await flushDom();
    const { root } = mounted;

    const treeRoot = root;
    const itemButton = getItemButton(root, 'README.md');
    const decorationLane = itemButton.querySelector(
      '[data-item-section="decoration"]'
    );
    const actionLane = itemButton.querySelector('[data-item-section="action"]');
    const decorativeAffordance = actionLane?.querySelector(
      '[data-item-action-affordance="decorative"]'
    );

    expect(
      treeRoot.getAttribute('data-file-tree-context-menu-trigger-mode')
    ).toBe('button');
    expect(
      treeRoot.getAttribute('data-file-tree-context-menu-button-visibility')
    ).toBe('always');
    expect(
      treeRoot.getAttribute('data-file-tree-has-context-menu-action-lane')
    ).toBe('true');
    expect(itemButton.getAttribute('data-item-context-menu-trigger-mode')).toBe(
      'button'
    );
    expect(
      itemButton.getAttribute('data-item-context-menu-button-visibility')
    ).toBe('always');
    expect(
      itemButton.getAttribute('data-item-has-context-menu-action-lane')
    ).toBe('true');
    expect(decorationLane).not.toBeNull();
    expect(actionLane).not.toBeNull();
    expect(decorativeAffordance?.getAttribute('aria-hidden')).toBe('true');
    expect(actionLane?.querySelector('button')).toBeNull();
    expect(
      root.querySelectorAll('[data-type="context-menu-trigger"]')
    ).toHaveLength(1);

    pointerOver(itemButton);
    await flushDom();

    expect(
      treeRoot.getAttribute('data-file-tree-context-menu-trigger-mode')
    ).toBe('button');
    expect(
      treeRoot.getAttribute('data-file-tree-context-menu-button-visibility')
    ).toBe('always');
    expect(
      itemButton.getAttribute('data-item-context-menu-button-visibility')
    ).toBe('always');
    expect(
      itemButton.getAttribute('data-item-has-context-menu-action-lane')
    ).toBe('true');
  });

  test('button mode defaults to when-needed visibility', async () => {
    mounted = mountTree({
      composition: {
        contextMenu: {
          enabled: true,
          triggerMode: 'button',
        },
      },
      flattenEmptyDirectories: true,
      initialExpansion: 'open',
      paths: ['README.md'],
      initialVisibleRowCount: 120 / 30,
    });
    await flushDom();
    const { root } = mounted;

    const itemButton = getItemButton(root, 'README.md');
    const actionLane = itemButton.querySelector('[data-item-section="action"]');
    const decorativeAffordance = actionLane?.querySelector(
      '[data-item-action-affordance="decorative"]'
    );

    expect(root.getAttribute('data-file-tree-context-menu-trigger-mode')).toBe(
      'button'
    );
    expect(
      root.getAttribute('data-file-tree-context-menu-button-visibility')
    ).toBe('when-needed');
    expect(
      itemButton.getAttribute('data-item-context-menu-button-visibility')
    ).toBe('when-needed');
    expect(
      itemButton.getAttribute('data-item-has-context-menu-action-lane')
    ).toBe('true');
    expect(actionLane).not.toBeNull();
    expect(decorativeAffordance).toBeNull();
  });

  test('focused click reveals the default when-needed context-menu button without hover', async () => {
    mounted = mountTree({
      composition: {
        contextMenu: {
          enabled: true,
          triggerMode: 'button',
        },
      },
      flattenEmptyDirectories: true,
      initialExpansion: 'open',
      paths: ['README.md', 'src/index.ts'],
      initialVisibleRowCount: 120 / 30,
    });
    await flushDom();
    const { model, root } = mounted;

    const secondRow = getItemButton(root, 'src/index.ts');
    const anchor = root.querySelector('[data-type="context-menu-anchor"]');
    const trigger = queryButton(root, '[data-type="context-menu-trigger"]');

    if (!isHTMLElementOfTag(anchor, 'div')) {
      throw new Error('expected context-menu anchor');
    }

    expect(anchor.dataset.visible).toBe('false');
    expect(trigger.dataset.visible).toBe('false');

    secondRow.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      })
    );
    await flushDom();

    const selectedSecondRow = getItemButton(root, 'src/index.ts');
    expect(model.getFocusedPath()).toBe('src/index.ts');
    expect(anchor.dataset.visible).toBe('true');
    expect(trigger.dataset.visible).toBe('true');
    expect(selectedSecondRow.dataset.itemSelected).toBe('true');
    expect(selectedSecondRow.dataset.itemFocused).toBe('true');
    expect(selectedSecondRow.dataset.itemContextHover).toBeUndefined();
  });

  test('right-click-only mode omits the action lane but still opens menus', async () => {
    let capturedContext: CapturedContextMenuOpenContext | null = null;

    mounted = mountTree(
      {
        composition: { contextMenu: { triggerMode: 'right-click' } },
        flattenEmptyDirectories: true,
        initialExpansion: 'open',
        paths: ['README.md'],
        initialVisibleRowCount: 120 / 30,
      },
      {
        renderContextMenu: (_item, context) => {
          capturedContext = context;
          return <div data-test-menu="true" />;
        },
      }
    );
    await flushDom();
    const { root } = mounted;

    const itemButton = getItemButton(root, 'README.md');
    expect(root.getAttribute('data-file-tree-context-menu-trigger-mode')).toBe(
      'right-click'
    );
    expect(
      root.getAttribute('data-file-tree-has-context-menu-action-lane')
    ).toBeNull();
    expect(
      itemButton.getAttribute('data-item-has-context-menu-action-lane')
    ).toBeNull();
    expect(itemButton.querySelector('[data-item-section="action"]')).toBeNull();

    itemButton.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        clientX: 24,
        clientY: 36,
      })
    );
    await flushDom();

    expect(capturedContext).not.toBeNull();
    expect(
      root.querySelector(
        `[data-type="context-menu-anchor"] ${MENU_SLOT_SELECTOR}`
      )
    ).not.toBeNull();
  });

  test('right-click-only mode still anchors keyboard-opened menus to the focused row', async () => {
    mounted = mountTree(
      {
        composition: { contextMenu: { triggerMode: 'right-click' } },
        flattenEmptyDirectories: true,
        initialExpansion: 'open',
        paths: ['README.md'],
        initialVisibleRowCount: 120 / 30,
      },
      { renderContextMenu: () => <div data-test-menu="true" /> }
    );
    await flushDom();
    const { root } = mounted;

    const itemButton = getItemButton(root, 'README.md');
    const scrollElement = getScrollElement(root);
    const anchor = root.querySelector<HTMLDivElement>(
      '[data-type="context-menu-anchor"]'
    );

    itemButton.getBoundingClientRect = () =>
      createDomRect({
        bottom: 68,
        height: 20,
        left: 0,
        right: 120,
        top: 48,
        width: 120,
        x: 0,
        y: 48,
      });
    scrollElement.getBoundingClientRect = () =>
      createDomRect({
        bottom: 200,
        height: 200,
        left: 0,
        right: 240,
        top: 8,
        width: 240,
        x: 0,
        y: 8,
      });

    itemButton.focus();
    shiftF10(itemButton);
    await flushDom();

    expect(anchor?.style.top).toBe('48px');
    expect(root.querySelector(MENU_SLOT_SELECTOR)).not.toBeNull();
  });

  test('adds aria-haspopup=menu only when context menu is enabled', async () => {
    const disabled = mountTree({
      flattenEmptyDirectories: true,
      initialExpansion: 'open',
      paths: ['README.md'],
      initialVisibleRowCount: 120 / 30,
    });
    const enabled = mountTree({
      composition: {
        contextMenu: {
          enabled: true,
        },
      },
      flattenEmptyDirectories: true,
      initialExpansion: 'open',
      paths: ['README.md'],
      initialVisibleRowCount: 120 / 30,
    });
    try {
      await flushDom();

      const disabledItem = getItemButton(disabled.root, 'README.md');
      expect(disabledItem.getAttribute('aria-haspopup')).toBeNull();
      expect(
        disabled.root.querySelector('[data-type="context-menu-trigger"]')
      ).toBeNull();

      const enabledItem = getItemButton(enabled.root, 'README.md');
      expect(enabledItem.getAttribute('aria-haspopup')).toBe('menu');
      expect(
        enabled.root.querySelector('[data-type="context-menu-trigger"]')
      ).not.toBeNull();
      expect(
        enabled.root.getAttribute('data-file-tree-context-menu-trigger-mode')
      ).toBe('right-click');
      expect(
        enabled.root.getAttribute('data-file-tree-has-context-menu-action-lane')
      ).toBeNull();
      expect(
        enabledItem.getAttribute('data-item-has-context-menu-action-lane')
      ).toBeNull();
    } finally {
      disabled.dispose();
      enabled.dispose();
    }
  });
});
