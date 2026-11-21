import solid from '@solidjs/vite-plugin';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

// Individual theme modules from @shikijs/themes and @pierre/theme (not their
// index barrels). Each is a self-contained `export default <VS Code theme>`.
const THEME_MODULE =
  /\/node_modules\/@(?:shikijs\/themes|pierre\/theme)\/dist\/(?!index\.)[^/]+\.mjs$/;

// The tree only reads `type` and the workbench `colors` map. tokenColors and
// semanticTokenColors (syntax highlighting) are ~60% of each theme's size.
function stripThemeTokenColors(): Plugin {
  return {
    name: 'playground:strip-theme-token-colors',
    apply: 'build',
    async transform(code, id) {
      if (!THEME_MODULE.test(id)) {
        return null;
      }
      // Evaluates the module being transformed; its source exists only here.
      const mod: unknown = await import(
        `data:text/javascript,${encodeURIComponent(code)}`
      );
      const theme =
        typeof mod === 'object' && mod !== null && 'default' in mod
          ? mod.default
          : undefined;
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

export default defineConfig({
  plugins: [stripThemeTokenColors(), solid()],
});
