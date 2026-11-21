import { afterEach, describe, expect, test } from 'vitest';

import type { FileTreeContextMenuOpenContext } from '../src/model/publicTypes';
import { flushDom, getItemButton } from './dom-helpers-search-rename-menu';
import { mountTree } from './helpers';
import type { MountedTree } from './helpers';

const MENU_SELECTOR = '[data-type="context-menu-slot"] [data-test-menu]';

let mounted: MountedTree | null = null;
afterEach(() => {
  mounted?.dispose();
  mounted = null;
});

// Regression for #664: right-clicking file B while file A's menu is open must
// re-anchor the menu onto B rather than dismiss it. The failure mode is a
// stale close() from menu A's superseded consumer layer (Radix
// `onOpenChange(false)`) firing asynchronously after menu B has already opened
// and tearing menu B down because the close was not tied to a menu instance.
describe('file-tree sequential right-click context menu', () => {
  test('right-clicking a second row re-anchors the menu instead of closing it', async () => {
    // Capture each opened menu's context keyed by the row it was opened for,
    // so we can later fire the stale close() belonging to menu A.
    const contextByPath = new Map<string, FileTreeContextMenuOpenContext>();

    mounted = mountTree(
      {
        flattenEmptyDirectories: true,
        initialExpansion: 'open',
        paths: ['a.ts', 'b.ts'],
        initialVisibleRowCount: 120 / 30,
      },
      {
        renderContextMenu: (item, context) => {
          contextByPath.set(item.path, context);
          return <div data-test-menu="true" data-item-path={item.path} />;
        },
      }
    );
    await flushDom();
    const { host, root } = mounted;

    // Open menu A via right-click.
    getItemButton(root, 'a.ts').dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        clientX: 10,
        clientY: 10,
      })
    );
    await flushDom();

    let slotted = host.querySelector<HTMLElement>(MENU_SELECTOR);
    expect(slotted).not.toBeNull();
    expect(slotted?.dataset.itemPath).toBe('a.ts');

    // Right-click a different row while menu A is open. Menu B should open
    // anchored to b.ts.
    getItemButton(root, 'b.ts').dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        clientX: 20,
        clientY: 40,
      })
    );
    await flushDom();

    slotted = host.querySelector<HTMLElement>(MENU_SELECTOR);
    expect(slotted).not.toBeNull();
    expect(slotted?.dataset.itemPath).toBe('b.ts');

    // Simulate menu A's superseded consumer layer firing its captured close()
    // asynchronously after menu B has opened.
    const staleCloseA = contextByPath.get('a.ts');
    if (staleCloseA === undefined) {
      throw new Error('expected captured context for a.ts');
    }
    staleCloseA.close();
    await flushDom(2);

    // The menu must still be open and anchored to b.ts.
    slotted = host.querySelector<HTMLElement>(MENU_SELECTOR);
    expect(slotted).not.toBeNull();
    expect(slotted?.dataset.itemPath).toBe('b.ts');
  });

  // Right-clicking the row whose menu is already open keeps the same menu
  // instance (the slot is not re-rendered), so that instance's close() must
  // still be accepted. Before the fix the reopen issued a new token and this
  // close() was ignored as stale, leaving the menu stuck open.
  test('right-clicking the same row again keeps the open menu closable', async () => {
    const contexts: Array<FileTreeContextMenuOpenContext> = [];
    let renderCount = 0;

    mounted = mountTree(
      {
        flattenEmptyDirectories: true,
        initialExpansion: 'open',
        paths: ['a.ts', 'b.ts'],
        initialVisibleRowCount: 120 / 30,
      },
      {
        renderContextMenu: (item, context) => {
          renderCount += 1;
          contexts.push(context);
          return <div data-test-menu="true" data-item-path={item.path} />;
        },
      }
    );
    await flushDom();
    const { host, root } = mounted;

    const rightClickA = (clientY: number): void => {
      getItemButton(root, 'a.ts').dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          clientX: 10,
          clientY,
        })
      );
    };

    rightClickA(10);
    await flushDom();
    rightClickA(14);
    await flushDom();

    // The second right-click reuses the menu that is already open.
    expect(renderCount).toBe(1);
    const slotted = host.querySelector<HTMLElement>(MENU_SELECTOR);
    expect(slotted?.dataset.itemPath).toBe('a.ts');

    // The consumer closes the visible menu with the close() it received.
    const visibleContext = contexts.at(-1);
    if (visibleContext === undefined) {
      throw new Error('expected captured context for a.ts');
    }
    visibleContext.close();
    await flushDom(2);

    expect(host.querySelector(MENU_SELECTOR)).toBeNull();
  });
});
