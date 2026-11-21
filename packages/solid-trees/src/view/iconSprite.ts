import { createContext } from 'solid-js';

// Every tree mounts its sprite sheet in the light DOM, where symbol ids share
// the document's id namespace: two trees with different icon sets or custom
// sprite sheets would otherwise resolve each other's `<use href>`. Each tree
// rewrites the ids in its sheet (and the sheet's internal `url(#…)` / `href`
// references) with its own prefix; icons reference a name through the tree's
// resolver, so names the sheet does not define keep resolving document-wide.

const SPRITE_ID_PATTERN = /(\sid=)(["'])([^"']+)\2/g;
const SPRITE_REFERENCE_PATTERN = /(url\(\s*["']?#|href=["']#)([^"')\s]+)/g;

export interface ScopedSpriteSheet {
  html: string;
  ids: ReadonlySet<string>;
}

export function scopeSpriteSheet(
  html: string,
  prefix: string
): ScopedSpriteSheet {
  const ids = new Set<string>();
  const withScopedIds = html.replaceAll(
    SPRITE_ID_PATTERN,
    (_match: string, attribute: string, quote: string, id: string) => {
      ids.add(id);
      return `${attribute}${quote}${prefix}${id}${quote}`;
    }
  );
  return {
    html: withScopedIds.replaceAll(
      SPRITE_REFERENCE_PATTERN,
      (match: string, lead: string, id: string) =>
        ids.has(id) ? `${lead}${prefix}${id}` : match
    ),
    ids,
  };
}

/** Maps an icon name to the `<use href>` that renders it in this tree. */
export const IconHrefContext = createContext<(name: string) => string>(
  (name) => `#${name.replace(/^#/, '')}`
);
