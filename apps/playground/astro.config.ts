import solid from '@solidjs/vite-plugin';
import { defineConfig } from 'astro/config';
import { runInNewContext } from 'node:vm';
import type { Plugin } from 'vite';

// Individual theme modules from @shikijs/themes and @pierre/theme (not their
// index barrels). Each is a self-contained `export default <VS Code theme>`.
const THEME_MODULE =
  /\/node_modules\/@(?:shikijs\/themes|pierre\/theme)\/dist\/(?!index\.)[^/]+\.mjs$/;
const DEFAULT_EXPORT = /^(?:\/\*[^]*?\*\/\s*)?export default ([^]+?);?\s*$/;

// The tree only reads `type` and the workbench `colors` map. tokenColors and
// semanticTokenColors (syntax highlighting) are ~60% of each theme's size.
function stripThemeTokenColors(): Plugin {
  return {
    name: 'playground:strip-theme-token-colors',
    apply: 'build',
    transform(code, id) {
      if (!THEME_MODULE.test(id)) {
        return null;
      }
      // Evaluates the module's default-export expression; its source exists
      // only here. Not `import()`: Astro loads this config through Vite's
      // module runner, which rewrites `import()` and closes after loading.
      const expression = DEFAULT_EXPORT.exec(code)?.[1];
      const theme: unknown =
        expression === undefined
          ? undefined
          : runInNewContext(`(${expression})`, {});
      if (typeof theme !== 'object' || theme === null || !('colors' in theme)) {
        throw new Error(`${id}: expected a default-exported theme with colors`);
      }
      const type = 'type' in theme ? theme.type : undefined;
      return {
        code: `export default ${JSON.stringify({ type, colors: theme.colors })};`,
        map: null,
      };
    },
  };
}

// `@astrojs/solid-js` targets Solid 1, so there are no Solid islands: Astro
// renders the static page and `src/main.tsx` mounts the Solid 2 parts from a
// client `<script>`, compiled by Solid 2's own Vite plugin.
export default defineConfig({
  site: 'https://trees.inve.rs',
  vite: {
    plugins: [stripThemeTokenColors(), solid()],
  },
});
