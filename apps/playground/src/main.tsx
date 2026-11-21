import { render } from '@solidjs/web';
import { createSignal, For, Show } from 'solid-js';
import {
  createFileTree,
  createFileTreeSearch,
  createFileTreeSelection,
  FileTree,
} from 'solid-trees';
import type { GitStatusEntry } from 'solid-trees';

const BASE_PATHS = [
  '.github/workflows/ci.yml',
  'README.md',
  'package.json',
  'tsconfig.json',
  'docs/guide/getting-started.md',
  'docs/guide/configuration.md',
  'src/index.ts',
  'src/components/Button.tsx',
  'src/components/Dialog.tsx',
  'src/components/forms/Input.tsx',
  'src/components/forms/Select.tsx',
  'src/utils/deeply/nested/only/child.ts',
  'src/styles/theme.css',
];

// Enough rows to exercise virtualization and sticky folders.
const GENERATED_PATHS = Array.from({ length: 40 }, (_, group) =>
  Array.from(
    { length: 25 },
    (_, file) => `packages/pkg-${group}/src/module-${file}.ts`
  )
).flat();

const GIT_STATUS: Array<GitStatusEntry> = [
  { path: 'README.md', status: 'modified' },
  { path: 'src/components/Dialog.tsx', status: 'added' },
  { path: 'src/styles/theme.css', status: 'deleted' },
  { path: 'docs/guide/configuration.md', status: 'untracked' },
];

function App() {
  const tree = createFileTree({
    paths: [...BASE_PATHS, ...GENERATED_PATHS],
    initialExpandedPaths: [
      'src',
      'src/components',
      'packages',
      'packages/pkg-0',
    ],
    flattenEmptyDirectories: true,
    stickyFolders: true,
    search: true,
    renaming: true,
    dragAndDrop: true,
    gitStatus: GIT_STATUS,
    composition: { contextMenu: { triggerMode: 'both' } },
  });
  const selection = createFileTreeSelection(tree);
  const search = createFileTreeSearch(tree);
  const [counter, setCounter] = createSignal(0);

  return (
    <main
      style={{
        display: 'flex',
        gap: '24px',
        'font-family': 'system-ui, sans-serif',
      }}
    >
      <FileTree
        model={tree}
        style={{ height: '480px', width: '360px', border: '1px solid #ccc' }}
        header={<strong>Project files</strong>}
        renderContextMenu={(item, context) => (
          <div
            role="menu"
            style={{
              background: 'white',
              border: '1px solid #999',
              padding: '4px',
              display: 'flex',
              'flex-direction': 'column',
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                context.close({ restoreFocus: false });
                tree.startRenaming(item.path);
              }}
            >
              Rename {item.name}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                context.close();
                tree.remove(item.path, { recursive: true });
              }}
            >
              Delete
            </button>
          </div>
        )}
      />
      <section>
        <p>
          Selected:{' '}
          <code data-testid="selection">
            {selection().join(', ') || '(none)'}
          </code>
        </p>
        <p>
          Search:{' '}
          <code>
            {search.state().isOpen
              ? `"${search.state().value}" (${search.state().matchingPaths.length} matches)`
              : 'closed'}
          </code>
        </p>
        <button
          type="button"
          onClick={() => {
            setCounter((value) => value + 1);
            tree.add(`src/new-file-${counter() + 1}.ts`);
          }}
        >
          Add file
        </button>{' '}
        <button type="button" onClick={() => tree.openSearch('button')}>
          Search &quot;button&quot;
        </button>{' '}
        <button
          type="button"
          onClick={() => tree.scrollToPath('packages/pkg-0/src/module-20.ts')}
        >
          Scroll to module-20
        </button>
        <Show when={selection().length > 0}>
          <ul>
            <For each={selection()}>{(path) => <li>{path}</li>}</For>
          </ul>
        </Show>
      </section>
    </main>
  );
}

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Missing #root element');
}

render(() => <App />, rootElement);
