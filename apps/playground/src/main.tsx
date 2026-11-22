import pierreDark from '@pierre/theme/pierre-dark';
import pierreLight from '@pierre/theme/pierre-light';
import catppuccinLatte from '@shikijs/themes/catppuccin-latte';
import catppuccinMocha from '@shikijs/themes/catppuccin-mocha';
import dracula from '@shikijs/themes/dracula';
import githubDark from '@shikijs/themes/github-dark';
import githubLight from '@shikijs/themes/github-light';
import nord from '@shikijs/themes/nord';
import oneLight from '@shikijs/themes/one-light';
import slackOchin from '@shikijs/themes/slack-ochin';
import synthwave84 from '@shikijs/themes/synthwave-84';
import vitesseLight from '@shikijs/themes/vitesse-light';
import { render } from '@solidjs/web';
import type { JSX } from '@solidjs/web';
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onSettled,
  Show,
} from 'solid-js';
import {
  createFileTree,
  createFileTreeSearch,
  createFileTreeSelection,
  FILE_TREE_DENSITY_PRESETS,
  FileTree,
  themeToTreeStyles,
} from 'solid-trees';
import type {
  ContextMenuItem,
  ContextMenuOpenContext,
  FileTreeDensityKeyword,
  FileTreeModel,
  GitStatus,
  TreeThemeInput,
} from 'solid-trees';

import {
  APP_ACTIVE_PATH,
  APP_EXPANDED_PATHS,
  APP_GIT_STATUSES,
  APP_PATHS,
  LARGE_PATHS,
  SAMPLE_GIT_EXPANDED_PATHS,
  SAMPLE_GIT_STATUSES,
  SAMPLE_PATHS,
} from './demoData';

type Scheme = 'auto' | 'light' | 'dark';

// Shared by the header toggle and the theme demo, which mount separately.
const [scheme, setScheme] = createSignal<Scheme>('auto');

// --- Shared bits -------------------------------------------------------------

function basename(path: string): string {
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path;
  return trimmed.slice(trimmed.lastIndexOf('/') + 1);
}

function directoryOf(item: ContextMenuItem): string {
  return item.kind === 'directory'
    ? item.path
    : item.path.slice(0, item.path.lastIndexOf('/') + 1);
}

function uniquePath(tree: FileTreeModel, base: string, suffix: string): string {
  let index = 1;
  while (tree.getItem(`${base}${index}${suffix}`) !== null) {
    index += 1;
  }
  return `${base}${index}${suffix}`;
}

// Rendered inline in the tree's context-menu slot and positioned against the
// anchor rect: right-clicks open at the pointer, the trigger button opens the
// menu under the button, right-aligned.
function TreeContextMenu(props: {
  tree: FileTreeModel;
  item: ContextMenuItem;
  context: ContextMenuOpenContext;
}): JSX.Element {
  const position = (): JSX.CSSProperties => {
    const rect = props.context.anchorRect;
    return rect.width === 0 && rect.height === 0
      ? { left: `${rect.left}px`, top: `${rect.top}px` }
      : {
          right: `${document.documentElement.clientWidth - rect.right}px`,
          top: `${rect.bottom + 4}px`,
        };
  };
  const create = (suffix: string) => {
    const path = uniquePath(
      props.tree,
      `${directoryOf(props.item)}untitled-`,
      suffix
    );
    props.context.close({ restoreFocus: false });
    props.tree.add(path);
    props.tree.startRenaming(path);
  };

  return (
    <div role="menu" class="menu" style={position()}>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          create('.ts');
        }}
      >
        New file
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          create('/');
        }}
      >
        New folder
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          props.context.close({ restoreFocus: false });
          props.tree.startRenaming(props.item.path);
        }}
      >
        Rename
      </button>
      <hr />
      <button
        type="button"
        role="menuitem"
        class="danger"
        onClick={() => {
          props.context.close();
          props.tree.remove(props.item.path, { recursive: true });
        }}
      >
        Delete
      </button>
    </div>
  );
}

function Icon(props: { path: string }): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d={props.path} fill="currentColor" />
    </svg>
  );
}

const SEARCH_ICON =
  'M7 2a5 5 0 0 1 3.96 8.05l2.75 2.74a.75.75 0 0 1-1.06 1.06l-2.75-2.74A5 5 0 1 1 7 2Zm0 1.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z';
const FILE_PLUS_ICON =
  'M4.5 1h4.38a1.5 1.5 0 0 1 1.06.44l2.62 2.62a1.5 1.5 0 0 1 .44 1.06v1.63a.75.75 0 0 1-1.5 0V6H9.25A1.25 1.25 0 0 1 8 4.75V2.5H4.5a.5.5 0 0 0-.5.5v10a.5.5 0 0 0 .5.5H7A.75.75 0 0 1 7 15H4.5A2 2 0 0 1 2.5 13V3a2 2 0 0 1 2-2Zm7.25 8a.75.75 0 0 1 .75.75v1.5H14a.75.75 0 0 1 0 1.5h-1.5v1.5a.75.75 0 0 1-1.5 0v-1.5H9.5a.75.75 0 0 1 0-1.5H11v-1.5a.75.75 0 0 1 .75-.75Z';
const LOCATE_ICON =
  'M8 1a.75.75 0 0 1 .75.75v.8a5.5 5.5 0 0 1 4.7 4.7h.8a.75.75 0 0 1 0 1.5h-.8a5.5 5.5 0 0 1-4.7 4.7v.8a.75.75 0 0 1-1.5 0v-.8a5.5 5.5 0 0 1-4.7-4.7h-.8a.75.75 0 0 1 0-1.5h.8a5.5 5.5 0 0 1 4.7-4.7v-.8A.75.75 0 0 1 8 1Zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 2.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z';

// --- Hero app ----------------------------------------------------------------

function AppDemo(): JSX.Element {
  const tree = createFileTree({
    paths: APP_PATHS,
    initialExpandedPaths: APP_EXPANDED_PATHS,
    initialSelectedPaths: [APP_ACTIVE_PATH],
    gitStatus: APP_GIT_STATUSES,
    density: 'compact',
    flattenEmptyDirectories: true,
    stickyFolders: true,
    search: true,
    fileTreeSearchMode: 'hide-non-matches',
    renaming: true,
    dragAndDrop: true,
    composition: { contextMenu: { triggerMode: 'both' } },
    initialVisibleRowCount: 720 / FILE_TREE_DENSITY_PRESETS.compact.itemHeight,
  });
  const selection = createFileTreeSelection(tree);
  const search = createFileTreeSearch(tree);
  const [addedCount, setAddedCount] = createSignal(0);
  const activePath = () => selection().at(-1) ?? null;

  return (
    <>
      <FileTree
        model={tree}
        class="app-tree"
        data-demo="hero"
        style={{ height: '720px' }}
        header={
          <div class="app-tree-header">
            <span class="traffic-lights" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <strong>acme-components</strong>
            <span class="app-tree-actions">
              <button
                type="button"
                title="Search"
                onClick={() => {
                  tree.openSearch('');
                }}
              >
                <Icon path={SEARCH_ICON} />
              </button>
              <button
                type="button"
                title="Add file"
                onClick={() => {
                  setAddedCount((count) => count + 1);
                  tree.add(`src/new-file-${addedCount() + 1}.ts`);
                }}
              >
                <Icon path={FILE_PLUS_ICON} />
              </button>
              <button
                type="button"
                title="Scroll to vitest.config.ts"
                onClick={() => {
                  tree.scrollToPath('vitest.config.ts');
                }}
              >
                <Icon path={LOCATE_ICON} />
              </button>
            </span>
          </div>
        }
        renderContextMenu={(item, context) => (
          <TreeContextMenu tree={tree} item={item} context={context} />
        )}
      />
      <section class="app-editor" aria-label="Editor">
        <div class="app-tabs">
          <Show when={activePath()}>
            {(path) => <span class="app-tab">{basename(path())}</span>}
          </Show>
        </div>
        <div class="app-editor-body">
          <dl class="inspector">
            <dt>Selected</dt>
            <dd>
              <code data-testid="selection">
                {selection().join(', ') || '(none)'}
              </code>
            </dd>
            <dt>Search</dt>
            <dd>
              <code>
                {search.state().isOpen
                  ? `"${search.state().value}" (${search.state().matchingPaths.length} matches)`
                  : 'closed'}
              </code>
            </dd>
          </dl>
          <div class="button-row">
            <button
              type="button"
              class="button"
              onClick={() => {
                setAddedCount((count) => count + 1);
                tree.add(`src/new-file-${addedCount() + 1}.ts`);
              }}
            >
              Add file
            </button>
            <button
              type="button"
              class="button"
              onClick={() => {
                tree.openSearch('button');
              }}
            >
              Search &quot;button&quot;
            </button>
            <button
              type="button"
              class="button"
              onClick={() => {
                tree.scrollToPath('vitest.config.ts');
              }}
            >
              Scroll to vitest.config.ts
            </button>
          </div>
          <p class="hint">
            Right-click a row or use its ⋯ button for the context menu (rename,
            new file, delete). Drag rows onto folders to move them. Scroll the
            tree to see sticky folders.
          </p>
        </div>
      </section>
    </>
  );
}

// --- Feature demos -----------------------------------------------------------

function FlattenDemo(): JSX.Element {
  const hierarchical = createFileTree({
    paths: SAMPLE_PATHS,
    initialExpansion: 'closed',
    initialExpandedPaths: [
      'build',
      'build/assets',
      'build/assets/images',
      'build/assets/images/social',
    ],
    initialVisibleRowCount: 626 / 30,
  });
  const flattened = createFileTree({
    paths: SAMPLE_PATHS,
    flattenEmptyDirectories: true,
    initialExpansion: 'closed',
    initialExpandedPaths: ['build', 'build/assets/images/social'],
    initialVisibleRowCount: 566 / 30,
  });

  return (
    <div class="grid grid-2">
      <figure>
        <figcaption>Default expanded</figcaption>
        <FileTree
          model={hierarchical}
          class="tree-panel"
          data-demo="flatten-hierarchical"
          style={{ height: '626px' }}
        />
      </figure>
      <figure>
        <figcaption>Flattened directories</figcaption>
        <FileTree
          model={flattened}
          class="tree-panel"
          data-demo="flatten-flattened"
          style={{ height: '566px' }}
        />
      </figure>
    </div>
  );
}

const GIT_LEGEND: Array<{
  status: GitStatus | 'descendant';
  indicator: string;
  description: string;
}> = [
  {
    status: 'modified',
    indicator: 'M',
    description: 'Tracked file with uncommitted changes',
  },
  {
    status: 'added',
    indicator: 'A',
    description: 'New file staged in the working tree',
  },
  {
    status: 'deleted',
    indicator: 'D',
    description: 'Tracked file removed from the working tree',
  },
  {
    status: 'renamed',
    indicator: 'R',
    description: 'Tracked file moved or renamed',
  },
  {
    status: 'untracked',
    indicator: 'U',
    description: 'New file not yet tracked by Git',
  },
  {
    status: 'ignored',
    indicator: 'None',
    description: 'Excluded by gitignore; inherits muted styling',
  },
  {
    status: 'descendant',
    indicator: '•',
    description: 'Folder contains changed descendants',
  },
];

function GitStatusDemo(): JSX.Element {
  const tree = createFileTree({
    paths: SAMPLE_PATHS,
    flattenEmptyDirectories: true,
    gitStatus: SAMPLE_GIT_STATUSES,
    initialExpandedPaths: SAMPLE_GIT_EXPANDED_PATHS,
    initialVisibleRowCount: 720 / 30,
  });

  return (
    <div class="grid grid-2">
      <FileTree
        model={tree}
        class="tree-panel"
        data-demo="git-status"
        style={{ height: '720px' }}
      />
      <table class="legend">
        <thead>
          <tr>
            <th>Indicator</th>
            <th>State</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <For each={GIT_LEGEND}>
            {(entry) => (
              <tr>
                <td>
                  <span class="badge" data-status={entry.status}>
                    {entry.indicator}
                  </span>
                </td>
                <td>
                  <code>{entry.status}</code>
                </td>
                <td>{entry.description}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}

// Theme modules are VS Code/Shiki theme objects; keep only what the tree reads.
function toTreeTheme(theme: unknown): TreeThemeInput {
  if (typeof theme !== 'object' || theme === null) {
    return {};
  }
  const type =
    'type' in theme && (theme.type === 'dark' || theme.type === 'light')
      ? theme.type
      : undefined;
  const colors: Record<string, string> = {};
  if ('colors' in theme && typeof theme.colors === 'object') {
    for (const [key, value] of Object.entries(theme.colors ?? {})) {
      if (typeof value === 'string') {
        colors[key] = value;
      }
    }
  }
  return { type, colors };
}

const LIGHT_THEMES = new Map<string, TreeThemeInput>([
  ['pierre-light', toTreeTheme(pierreLight)],
  ['github-light', toTreeTheme(githubLight)],
  ['one-light', toTreeTheme(oneLight)],
  ['vitesse-light', toTreeTheme(vitesseLight)],
  ['catppuccin-latte', toTreeTheme(catppuccinLatte)],
  ['slack-ochin', toTreeTheme(slackOchin)],
]);

const DARK_THEMES = new Map<string, TreeThemeInput>([
  ['pierre-dark', toTreeTheme(pierreDark)],
  ['github-dark', toTreeTheme(githubDark)],
  ['dracula', toTreeTheme(dracula)],
  ['nord', toTreeTheme(nord)],
  ['catppuccin-mocha', toTreeTheme(catppuccinMocha)],
  ['synthwave-84', toTreeTheme(synthwave84)],
]);

function ThemeSelect(props: {
  label: string;
  themes: ReadonlyMap<string, TreeThemeInput>;
  value: string;
  onChange: (value: string) => void;
}): JSX.Element {
  return (
    <label class="select">
      <span>{props.label}</span>
      <select
        value={props.value}
        onChange={(event) => {
          props.onChange(event.currentTarget.value);
        }}
      >
        <For each={Array.from(props.themes.keys())}>
          {(name) => <option value={name}>{name}</option>}
        </For>
      </select>
    </label>
  );
}

function ThemeDemo(): JSX.Element {
  const [prefersDark, setPrefersDark] = createSignal(false);
  const effectiveScheme = createMemo((): 'light' | 'dark' => {
    const value = scheme();
    if (value !== 'auto') {
      return value;
    }
    return prefersDark() ? 'dark' : 'light';
  });
  onSettled(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      setPrefersDark(query.matches);
    };
    update();
    query.addEventListener('change', update);
    return () => {
      query.removeEventListener('change', update);
    };
  });

  const tree = createFileTree({
    paths: SAMPLE_PATHS,
    flattenEmptyDirectories: true,
    gitStatus: SAMPLE_GIT_STATUSES,
    initialExpandedPaths: SAMPLE_GIT_EXPANDED_PATHS,
    initialSelectedPaths: ['package.json'],
    initialVisibleRowCount: 716 / 30,
  });
  const [lightTheme, setLightTheme] = createSignal('pierre-light');
  const [darkTheme, setDarkTheme] = createSignal('pierre-dark');
  const styles = createMemo(() =>
    themeToTreeStyles(
      effectiveScheme() === 'dark'
        ? (DARK_THEMES.get(darkTheme()) ?? {})
        : (LIGHT_THEMES.get(lightTheme()) ?? {})
    )
  );

  return (
    <>
      <div class="toolbar">
        <ThemeSelect
          label="Light"
          themes={LIGHT_THEMES}
          value={lightTheme()}
          onChange={setLightTheme}
        />
        <ThemeSelect
          label="Dark"
          themes={DARK_THEMES}
          value={darkTheme()}
          onChange={setDarkTheme}
        />
      </div>
      <FileTree
        model={tree}
        class="tree-panel"
        data-demo="themes"
        style={{ height: '716px', ...styles() }}
      />
    </>
  );
}

const STYLED_TREES: Array<{
  id: string;
  title: string;
  selected: string;
  style: JSX.CSSProperties;
}> = [
  {
    id: 'light',
    title: 'Light mode',
    selected: 'package.json',
    style: {
      'color-scheme': 'light',
      '--trees-bg-override': 'oklch(98.5% 0 0)',
      '--trees-fg-override': 'oklch(14.5% 0 0)',
      '--trees-fg-muted-override': 'oklch(45% 0 0)',
      '--trees-bg-muted-override': 'oklch(96% 0 0)',
      '--trees-search-fg-override': 'oklch(30% 0 0)',
      '--trees-search-bg-override': 'oklch(100% 0 0)',
      '--trees-border-color-override': 'oklch(92% 0 0)',
      '--trees-selected-fg-override': 'oklch(20% 0.08 250)',
      '--trees-selected-bg-override': 'oklch(92% 0.06 250)',
      '--trees-selected-focused-border-color-override': 'oklch(55% 0.2 250)',
      '--trees-focus-ring-color-override': 'oklch(50% 0.15 250)',
    },
  },
  {
    id: 'dark',
    title: 'Dark mode',
    selected: 'package.json',
    style: {
      'color-scheme': 'dark',
      '--trees-bg-override': 'oklch(20.5% 0 0)',
      '--trees-fg-override': 'oklch(98.5% 0 0)',
      '--trees-fg-muted-override': 'oklch(75% 0 0)',
      '--trees-bg-muted-override': 'oklch(26.9% 0 0)',
      '--trees-search-fg-override': 'oklch(85% 0 0)',
      '--trees-search-bg-override': 'oklch(20% 0 0)',
      '--trees-border-color-override': 'oklch(100% 0 0 / 0.12)',
      '--trees-selected-fg-override': 'oklch(97% 0.04 250)',
      '--trees-selected-bg-override': 'oklch(35% 0.08 250)',
      '--trees-selected-focused-border-color-override': 'oklch(75% 0.2 250)',
      '--trees-focus-ring-color-override': 'oklch(70% 0.15 250)',
    },
  },
  {
    id: 'synthwave',
    title: "Synthwave '84",
    selected: 'package.json',
    style: {
      'color-scheme': 'dark',
      '--trees-bg-override': 'transparent',
      '--trees-fg-override': 'oklch(91.2% 0.016 294)',
      '--trees-fg-muted-override': 'oklch(75.6% 0.04 310)',
      '--trees-bg-muted-override': 'oklch(76.9% 0.19 339 / 0.12)',
      '--trees-search-fg-override': 'oklch(84.4% 0.04 310)',
      '--trees-search-bg-override': 'oklch(27.2% 0.05 302)',
      '--trees-border-color-override': 'oklch(76.9% 0.19 339 / 0.35)',
      '--trees-selected-fg-override': 'oklch(76.9% 0.19 339)',
      '--trees-selected-bg-override': 'oklch(66.3% 0.26 348 / 0.25)',
      '--trees-selected-focused-border-color-override': 'oklch(76.9% 0.19 339)',
      '--trees-focus-ring-color-override': 'oklch(89.2% 0.14 193)',
    },
  },
];

function StyledTree(props: (typeof STYLED_TREES)[number]): JSX.Element {
  const tree = createFileTree({
    paths: SAMPLE_PATHS,
    flattenEmptyDirectories: true,
    initialSelectedPaths: [props.selected],
    initialVisibleRowCount: 438 / 30,
  });
  return (
    <figure>
      <figcaption>{props.title}</figcaption>
      <FileTree
        model={tree}
        class={['tree-panel', 'styled-panel', `styled-${props.id}`]}
        data-demo={`styled-${props.id}`}
        style={{ ...props.style, height: '438px' }}
      />
    </figure>
  );
}

function StylingDemo(): JSX.Element {
  return (
    <div class="grid grid-3">
      <For each={STYLED_TREES}>{(entry) => <StyledTree {...entry} />}</For>
    </div>
  );
}

const DENSITIES: Array<{
  density: FileTreeDensityKeyword;
  label: string;
  description: string;
  height: number;
}> = [
  {
    density: 'compact',
    label: 'Compact',
    description: '24px rows, 0.8 spacing',
    height: 362,
  },
  {
    density: 'default',
    label: 'Default',
    description: '30px rows, 1.0 spacing',
    height: 446,
  },
  {
    density: 'relaxed',
    label: 'Relaxed',
    description: '36px rows, 1.2 spacing',
    height: 530,
  },
];

function DensityTree(props: (typeof DENSITIES)[number]): JSX.Element {
  const tree = createFileTree({
    paths: SAMPLE_PATHS,
    flattenEmptyDirectories: true,
    density: props.density,
    initialSelectedPaths: ['src/components/Button.tsx'],
    initialVisibleRowCount:
      props.height / FILE_TREE_DENSITY_PRESETS[props.density].itemHeight,
  });
  return (
    <figure>
      <figcaption>
        {props.label} <small>{props.description}</small>
      </figcaption>
      <FileTree
        model={tree}
        class="tree-panel"
        data-demo={`density-${props.density}`}
        style={{ height: `${props.height}px` }}
      />
    </figure>
  );
}

function DensityDemo(): JSX.Element {
  return (
    <div class="grid grid-3 align-start">
      <For each={DENSITIES}>{(entry) => <DensityTree {...entry} />}</For>
    </div>
  );
}

function VirtualizationDemo(): JSX.Element {
  const tree = createFileTree({
    paths: LARGE_PATHS,
    initialExpansion: 'open',
    stickyFolders: true,
    search: true,
    initialVisibleRowCount: 480 / 30,
  });
  return (
    <FileTree
      model={tree}
      class="tree-panel"
      data-demo="virtualization"
      style={{ height: '480px' }}
    />
  );
}

// --- Mounts ------------------------------------------------------------------

// `src/pages/index.astro` renders the static page, including each section's
// heading and lede. `render` appends to a non-empty container, so each part
// lands after the static content of its mount point.

function SchemeToggle(): JSX.Element {
  createEffect(
    () => scheme(),
    (value) => {
      document.documentElement.dataset.scheme = value;
    }
  );

  const options: Array<Scheme> = ['auto', 'light', 'dark'];
  return (
    <div class="segmented" role="radiogroup" aria-label="Color scheme">
      <For each={options}>
        {(option) => (
          <button
            type="button"
            role="radio"
            aria-checked={scheme() === option ? 'true' : 'false'}
            onClick={() => {
              setScheme(option);
            }}
          >
            {option[0].toUpperCase() + option.slice(1)}
          </button>
        )}
      </For>
    </div>
  );
}

function mountPoint(selector: string): Element {
  const element = document.querySelector(selector);
  if (element === null) {
    throw new Error(`Missing mount point ${selector}`);
  }
  return element;
}

render(() => <SchemeToggle />, mountPoint('.site-header nav'));
render(() => <AppDemo />, mountPoint('.app-window'));
render(() => <FlattenDemo />, mountPoint('#flatten'));
render(() => <GitStatusDemo />, mountPoint('#git-status'));
render(() => <ThemeDemo />, mountPoint('#themes'));
render(() => <StylingDemo />, mountPoint('#styling'));
render(() => <DensityDemo />, mountPoint('#density'));
render(() => <VirtualizationDemo />, mountPoint('#virtualization'));
