// Rewrites a copy of this package's package.json for npm publishing.
//
// In the workspace, `exports` point at `src/` so the playground and tests run
// from source, and the package is private. The published package ships the
// `vite build` output instead, with `@solid-trees/path-store` bundled in.
//
// Usage: node scripts/prepare-package.mjs <release-dir>/package.json

import { readFileSync, writeFileSync } from 'node:fs';

const [packageJsonPath] = process.argv.slice(2);
if (!packageJsonPath) {
  throw new Error('usage: prepare-package.mjs <path/to/package.json>');
}

const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

delete pkg.private;
delete pkg.scripts;
delete pkg.devDependencies;

for (const [name, range] of Object.entries(pkg.dependencies ?? {})) {
  if (range.startsWith('workspace:')) {
    delete pkg.dependencies[name];
  }
}

// npm packs README and LICENSE automatically; Apache-2.0 requires NOTICE too.
pkg.files = ['dist', 'NOTICE.md'];
pkg.types = './dist/index.d.ts';
pkg.module = './dist/index.js';
pkg.exports = {
  '.': {
    types: './dist/index.d.ts',
    default: './dist/index.js',
  },
  './styles.css': './dist/styles.css',
};

writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
