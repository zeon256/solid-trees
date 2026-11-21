import cloudflare from '@cloudflare/oxlint-config';
import { defineConfig } from 'oxlint';

// This is a Solid project: React's plugin encodes React semantics (hooks,
// re-rendering components, React's DOM prop names), so drop it entirely.
const isReactRule = (rule: string) => rule.startsWith('react/');

export default defineConfig({
  ...cloudflare,
  plugins: cloudflare.plugins?.filter((plugin) => plugin !== 'react'),
  ignorePatterns: [...(cloudflare.ignorePatterns ?? []), '**/dist/**'],
  rules: Object.fromEntries(
    Object.entries(cloudflare.rules ?? {}).filter(
      ([rule]) => !isReactRule(rule)
    )
  ),
});
