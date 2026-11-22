import cloudflare from '@cloudflare/oxlint-config';
import { defineConfig } from 'oxlint';

// React's plugin encodes React semantics (hooks, re-rendering components,
// React's DOM prop names), so it is off for the Solid code and back on for the
// React files of the docs app. The docs' Solid demos stay off it.
const isReactRule = (rule: string) => rule.startsWith('react/');
const allRules = Object.entries(cloudflare.rules ?? {});

export default defineConfig({
  ...cloudflare,
  plugins: cloudflare.plugins?.filter((plugin) => plugin !== 'react'),
  ignorePatterns: [...(cloudflare.ignorePatterns ?? []), '**/dist/**'],
  overrides: [
    ...(cloudflare.overrides ?? []),
    // Astro injects `Astro` into component frontmatter.
    { files: ['**/*.astro'], globals: { Astro: 'readonly' } },
    {
      files: ['apps/docs/**/*.tsx'],
      excludeFiles: ['apps/docs/src/solid/**'],
      plugins: ['react'],
      rules: Object.fromEntries(allRules.filter(([rule]) => isReactRule(rule))),
    },
  ],
  rules: Object.fromEntries(allRules.filter(([rule]) => !isReactRule(rule))),
});
