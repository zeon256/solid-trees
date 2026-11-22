import react from '@astrojs/react';
import fumadocs from '@fumadocs/astro';
import solid from '@solidjs/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

// Fumadocs UI is React, the tree is Solid 2. Each JSX compiler owns its own
// files: the live demos under `src/solid` and the `solid-trees` sources (the
// workspace package exports its `.tsx` sources).
const SOLID_FILES = [/\/src\/solid\//, /\/packages\/solid-trees\/src\//];

export default defineConfig({
  server: { port: 4322 },
  redirects: { '/': '/docs' },
  integrations: [
    // Fumadocs adds React itself unless it is already configured.
    react({ exclude: SOLID_FILES }),
    fumadocs({
      components: './src/components/mdx.tsx',
      includeProcessedMarkdown: true,
      mdastPlugins: [
        // @fumadocs/astro renames code blocks so Astro's highlighter skips
        // them, which drops the fence meta (`title="..."`) on the way to hast.
        // Fumadocs' highlighter also reads `metastring`, which survives.
        {
          name: 'docs-keep-code-meta',
          code(node, ctx) {
            if (node.meta === undefined || node.meta === null) {
              return;
            }
            ctx.setProperty(node, 'data', {
              ...node.data,
              hProperties: { metastring: node.meta },
            });
          },
        },
      ],
    }),
  ],
  vite: {
    plugins: [tailwindcss(), solid({ include: SOLID_FILES })],
  },
});
