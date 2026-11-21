import type { GitStatusEntry } from 'solid-trees';

// Demo data mirrors the trees.software demos (Apache-2.0, The Pierre Computer
// Company) so the playground can be compared against them side by side.

/** The small project used by most trees.software feature demos. */
export const SAMPLE_PATHS: Array<string> = [
  'README.md',
  'package.json',
  'bunfig.toml',
  'stylelint.config.js',
  '.browserslistrc',
  '.oxlintrc.json',
  '.github/workflows/ci.yml',
  'build/index.mjs',
  'build/scripts.js',
  'build/assets/images/social/logo.png',
  'config/project/app.config.json',
  'public/404.html',
  'public/favicon.ico',
  'scripts/deploy.sh',
  'src/components/Button.tsx',
  'src/components/Card.tsx',
  'src/components/Header.tsx',
  'src/components/Sidebar.tsx',
  'src/lib/mdx.tsx',
  'src/lib/utils.ts',
  'src/styles/globals.css',
  'src/utils/stream.ts',
  'src/utils/worker.ts',
  'src/utils/worker/index.ts',
  'src/utils/worker/deprecrated/old-worker.ts',
  'src/index.ts',
  '.gitignore',
  'node_modules/react/package.json',
  'node_modules/react/index.js',
  'node_modules/react-dom/package.json',
  'node_modules/react-dom/index.js',
  'node_modules/typescript/package.json',
];

export const SAMPLE_GIT_EXPANDED_PATHS = ['src', 'src/components'];

export const SAMPLE_GIT_STATUSES: Array<GitStatusEntry> = [
  { path: 'README.md', status: 'untracked' },
  { path: 'package.json', status: 'renamed' },
  { path: 'node_modules/', status: 'ignored' },
  { path: 'src/index.ts', status: 'modified' },
  { path: 'src/components/Button.tsx', status: 'added' },
  { path: '.gitignore', status: 'deleted' },
];

/** The "acme-components" project from the trees.software hero demo. */
export const APP_PATHS: Array<string> = [
  '.gitignore',
  '.env',
  '.editorconfig',
  '.nvmrc',
  '.prettierrc.json',
  'README.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'package.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.ts',
  'vitest.config.ts',
  'tailwind.config.ts',
  'postcss.config.js',
  'eslint.config.js',
  '.github/CODEOWNERS',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/ISSUE_TEMPLATE/bug_report.md',
  '.github/ISSUE_TEMPLATE/feature_request.md',
  '.github/dependabot.yml',
  '.github/workflows/ci.yml',
  '.github/workflows/release.yml',
  '.github/workflows/codeql.yml',
  '.husky/pre-commit',
  'node_modules/cool/cool.ts',
  'node_modules/storage/index.ts',
  'src/index.ts',
  'src/components/Button.tsx',
  'src/components/Card.tsx',
  'src/components/Badge.tsx',
  'src/components/Input.tsx',
  'src/components/Dialog.tsx',
  'src/components/Tooltip.tsx',
  'src/components/Avatar.tsx',
  'src/components/Spinner.tsx',
  'src/components/Tabs.tsx',
  'src/hooks/useMediaQuery.ts',
  'src/hooks/useDebounce.ts',
  'src/hooks/useLocalStorage.ts',
  'src/hooks/useOnClickOutside.ts',
  'src/utils/format.ts',
  'src/utils/cn.ts',
  'src/utils/invariant.ts',
  'src/utils/assertNever.ts',
  'src/styles/tokens.css',
  'src/styles/typography.css',
  'src/styles/globals.css',
  'src/test/setup.ts',
  'src/components/Button.test.tsx',
  'src/components/Card.test.tsx',
  'src/utils/format.test.ts',
  'src/hooks/useDebounce.test.ts',
  'docs/getting-started.md',
  'docs/theming.md',
];

export const APP_EXPANDED_PATHS = [
  'src',
  'src/components',
  'src/hooks',
  'src/styles',
  'src/utils',
];

export const APP_ACTIVE_PATH = 'src/components/Button.tsx';

export const APP_GIT_STATUSES: Array<GitStatusEntry> = [
  { path: '.env', status: 'ignored' },
  { path: 'node_modules/', status: 'ignored' },
  { path: '.github/workflows/ci.yml', status: 'added' },
  { path: '.github/workflows/release.yml', status: 'added' },
  { path: '.github/dependabot.yml', status: 'added' },
  { path: 'src/components/Tabs.tsx', status: 'added' },
  { path: 'src/components/Tooltip.tsx', status: 'added' },
  { path: 'src/hooks/useOnClickOutside.ts', status: 'added' },
  { path: 'src/styles/tokens.css', status: 'added' },
  { path: 'src/styles/typography.css', status: 'added' },
  { path: 'CHANGELOG.md', status: 'modified' },
  { path: 'README.md', status: 'modified' },
  { path: 'package.json', status: 'modified' },
  { path: 'src/index.ts', status: 'modified' },
  { path: 'src/components/Button.tsx', status: 'modified' },
  { path: 'src/styles/globals.css', status: 'modified' },
  { path: 'tailwind.config.ts', status: 'modified' },
  { path: 'src/utils/cn.ts', status: 'renamed' },
  { path: 'docs/theming.md', status: 'untracked' },
];

/** Enough rows to exercise virtualization and sticky folders. */
export const LARGE_PATHS: Array<string> = Array.from(
  { length: 200 },
  (_, pkg) =>
    Array.from(
      { length: 25 },
      (_, file) =>
        `packages/package-${String(pkg).padStart(3, '0')}/src/modules/module-${file}.ts`
    )
).flat();
