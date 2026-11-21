import solid from '@solidjs/vite-plugin';
import { dts } from 'rolldown-plugin-dts';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

import pkg from './package.json' with { type: 'json' };

// Library build for npm. Runtime dependencies and Solid stay external; the
// private workspace package `@solid-trees/path-store` is not published, so its
// code and declarations are bundled into the output.
const external = Object.keys({
  ...pkg.dependencies,
  ...pkg.peerDependencies,
}).filter((name) => name !== '@solid-trees/path-store');

// `solid-trees/styles.css` is a standalone stylesheet the consumer imports;
// nothing in the JS graph references it, so emit it as-is.
function emitStylesheet(): Plugin {
  return {
    name: 'solid-trees:emit-stylesheet',
    apply: 'build',
    async generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'styles.css',
        source: await this.fs.readFile('src/styles.css'),
      });
    },
  };
}

export default defineConfig({
  plugins: [
    solid(),
    dts({ tsconfig: 'tsconfig.build.json' }),
    emitStylesheet(),
  ],
  // rolldown-plugin-dts emits `*.d.ts` modules into the graph; Vite's TS
  // transform would strip their declarations to nothing.
  oxc: { exclude: [/\.d\.[cm]?ts$/] },
  build: {
    target: 'es2022',
    minify: false,
    copyPublicDir: false,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      // `[name].js` lets the declaration chunk (`index.d`) become `index.d.ts`.
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rolldownOptions: {
      external: (id) =>
        external.some((name) => id === name || id.startsWith(`${name}/`)),
    },
  },
});
