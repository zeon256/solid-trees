// Assembles the publishable npm package into a standalone directory.
//
// In the workspace, `exports` point at `src/` so the playground and tests run
// from source, and the package is private. The published package ships the
// `vite build` output instead, with `@solid-trees/path-store` bundled in.
// Run `pnpm --filter solid-trees build` first.
//
// Usage: node packages/solid-trees/scripts/prepare-package.mjs <out-dir>

import {
  cpSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [outArg] = process.argv.slice(2);
if (!outArg) {
  throw new Error('usage: prepare-package.mjs <out-dir>');
}

const packageDir = fileURLToPath(new URL('..', import.meta.url));
const workspaceDir = resolve(packageDir, '../..');
const outDir = resolve(outArg);

if (!existsSync(join(packageDir, 'dist/index.js'))) {
  throw new Error('dist/ is missing; run `pnpm --filter solid-trees build`');
}

rmSync(outDir, { recursive: true, force: true });
cpSync(join(packageDir, 'dist'), join(outDir, 'dist'), { recursive: true });
for (const file of ['LICENSE.md', 'NOTICE.md']) {
  cpSync(join(packageDir, file), join(outDir, file));
}
// semantic-release runs from the output directory and reads its config there.
for (const file of ['README.md', '.releaserc']) {
  cpSync(join(workspaceDir, file), join(outDir, file));
}

const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));

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

writeFileSync(
  join(outDir, 'package.json'),
  `${JSON.stringify(pkg, null, 2)}\n`
);
