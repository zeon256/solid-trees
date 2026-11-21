import { FILE_TREE_SCROLLBAR_MEASURE_ATTRIBUTE } from '../constants';

const measuredGutterCache = new WeakMap<Document, number>();

// Measures the scrollbar gutter once per document. The probe opts into the
// same scrollbar selector as the real scroll container and mounts inside a
// tree root, so the stylesheet's scoped scrollbar rules and tokens apply. Trees
// publish the result as `--trees-scrollbar-gutter-measured`, which the scroll
// container's padding formula uses to keep rows centered whatever the
// platform's gutter width.
export function measureScrollbarGutter(root: HTMLElement): number {
  const document = root.ownerDocument;
  const cached = measuredGutterCache.get(document);
  if (cached !== undefined) {
    return cached;
  }

  const probe = document.createElement('div');
  probe.setAttribute(FILE_TREE_SCROLLBAR_MEASURE_ATTRIBUTE, 'true');
  const child = document.createElement('div');
  child.style.position = 'relative';
  child.style.height = '200%';
  probe.append(child);
  root.append(probe);

  const gutter = Math.max(probe.offsetWidth - probe.clientWidth, 0);
  probe.remove();
  measuredGutterCache.set(document, gutter);
  return gutter;
}
