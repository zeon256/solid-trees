// Shared helpers for the ported upstream DOM tests (search, renaming, labels,
// context menu). The Solid view renders into the light DOM, so queries run
// against the tree root instead of a shadow root.
import { isHTMLElement, isHTMLElementOfTag } from '../src/utils/domGuards';
import { settle } from './helpers';

export const CANONICAL_ITEM_SELECTOR =
  '[data-type="item"]:not([data-file-tree-sticky-row="true"])';

export function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

// Upstream used `setTimeout(0)` turns; the Solid view additionally needs its
// reactive queue drained after each turn.
export async function flushDom(times: number = 1): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await delay(0);
    await settle();
  }
}

export function pressKey(
  target: Element,
  key: string,
  init: KeyboardEventInit = {}
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

export function setInputValue(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(
    new Event('input', {
      bubbles: true,
      cancelable: true,
    })
  );
}

export function getItemRow(root: ParentNode, path: string): HTMLElement {
  const row = root.querySelector(
    `${CANONICAL_ITEM_SELECTOR}[data-item-path="${path}"]`
  );
  if (!isHTMLElement(row)) {
    throw new Error(`Expected canonical item row for ${path}`);
  }

  return row;
}

export function getItemButton(
  root: ParentNode,
  path: string
): HTMLButtonElement {
  const button = getItemRow(root, path);
  if (!isHTMLElementOfTag(button, 'button')) {
    throw new Error(`Expected item button for ${path}`);
  }

  return button;
}

export function getTreeRoot(host: ParentNode): HTMLElement {
  const root = host.querySelector('[role="tree"]');
  if (!isHTMLElement(root)) {
    throw new Error('missing tree root');
  }

  return root;
}

export function getScrollElement(root: ParentNode): HTMLElement {
  const scrollElement = root.querySelector(
    '[data-file-tree-virtualized-scroll="true"]'
  );
  if (!isHTMLElement(scrollElement)) {
    throw new Error('Expected virtualized scroll element');
  }

  return scrollElement;
}
