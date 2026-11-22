import { render } from '@solidjs/web';
import { createFileTree, FileTree } from 'solid-trees';

const OVERVIEW_PATHS = [
  'README.md',
  'package.json',
  '.gitignore',
  'src/index.ts',
  'src/components/Button.tsx',
  'src/components/Card.tsx',
  'src/components/Header.tsx',
  'src/lib/utils.ts',
  'src/styles/globals.css',
  'public/favicon.ico',
];

function OverviewTree() {
  const tree = createFileTree({
    id: 'docs-overview',
    paths: OVERVIEW_PATHS,
    initialExpandedPaths: ['src', 'src/components'],
  });

  return (
    <FileTree
      model={tree}
      // Follow the docs theme (Fumadocs sets `color-scheme` on <html>), not
      // the OS preference the tree root defaults to.
      style={{
        height: '394px',
        'max-width': '400px',
        'color-scheme': 'inherit',
        'border-width': '1px',
        'border-style': 'solid',
        'border-radius': '8px',
        'padding-block': '16px',
      }}
    />
  );
}

// A custom element instead of an island: the MDX body is one React island and
// Astro's client router swaps pages without rerunning module scripts, so the
// tree mounts and disposes with the element itself.
class OverviewTreeElement extends HTMLElement {
  #dispose: (() => void) | null = null;

  connectedCallback(): void {
    this.#dispose ??= render(() => <OverviewTree />, this);
  }

  disconnectedCallback(): void {
    this.#dispose?.();
    this.#dispose = null;
  }
}

if (customElements.get('docs-overview-tree') === undefined) {
  customElements.define('docs-overview-tree', OverviewTreeElement);
}
