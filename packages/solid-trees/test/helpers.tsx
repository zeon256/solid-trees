import { render } from '@solidjs/web';
import { flush } from 'solid-js';

import { FileTreeModel } from '../src/model/FileTreeModel';
import type { FileTreeOptions } from '../src/model/publicTypes';
import { FileTree } from '../src/view/FileTree';
import type { FileTreeProps } from '../src/view/FileTree';

export interface MountedTree {
  model: FileTreeModel;
  root: HTMLElement;
  host: HTMLElement;
  dispose: () => void;
}

export function mountTree(
  options: FileTreeOptions,
  props: Omit<FileTreeProps, 'model'> = {}
): MountedTree {
  const host = document.createElement('div');
  document.body.append(host);
  const model = new FileTreeModel(options);
  const disposeRender = render(
    () => <FileTree model={model} {...props} />,
    host
  );
  flush();
  const root = host.querySelector<HTMLElement>('[role="tree"]');
  if (root === null) {
    throw new Error('tree root did not render');
  }

  return {
    model,
    root,
    host,
    dispose: () => {
      disposeRender();
      model.cleanUp();
      host.remove();
    },
  };
}

// Drains Solid's queue plus anything scheduled from effects (microtasks).
export async function settle(): Promise<void> {
  flush();
  await Promise.resolve();
  flush();
}

export function rowPaths(root: HTMLElement): Array<string> {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      '[data-file-tree-virtualized-sticky] [data-type="item"]:not([data-item-parked])'
    ),
    (element) => element.dataset.itemPath ?? ''
  );
}

export function rowElement(root: HTMLElement, path: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(
    `[data-file-tree-virtualized-sticky] [data-type="item"][data-item-path="${path}"]:not([data-item-parked])`
  );
  if (element === null) {
    throw new Error(`row ${path} is not rendered`);
  }
  return element;
}

export function keyDown(
  target: HTMLElement,
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
