// Layout the virtualizer depends on: fixed-height flex rows, a bounded scroll
// container, the sticky window/overlay, and the context-menu layers. No colors,
// fonts, or spacing. Every rule is scoped under the tree root and lives in a
// cascade layer, so any unlayered author CSS overrides it without !important.
const ROOT = '[data-file-tree-virtualized-root]';

export const FILE_TREE_STRUCTURAL_CSS = `@layer solid-trees.structure {
${ROOT} { position: relative; display: flex; flex-direction: column; overflow: hidden; outline: none; }
${ROOT} [data-file-tree-sprite] { position: absolute; width: 0; height: 0; overflow: hidden; }
${ROOT} [data-type='header-slot'] { display: block; flex: 0 0 auto; }
${ROOT} [data-file-tree-virtualized-scroll] { position: relative; overflow-y: auto; flex: 1 1 0; min-height: 0; }
${ROOT} [data-file-tree-sticky-overlay] { position: sticky; top: 0; height: 0; z-index: 4; overflow: visible; pointer-events: none; }
${ROOT}[data-scroll-at-top='true']:not([data-overlay-reveal]) [data-file-tree-sticky-overlay] { visibility: hidden; }
${ROOT} [data-file-tree-sticky-overlay-content] { position: relative; pointer-events: none; }
${ROOT} [data-file-tree-sticky-row] { pointer-events: auto; }
${ROOT} [data-file-tree-virtualized-list] { position: relative; min-height: 100%; width: 100%; overflow-anchor: none; }
${ROOT} [data-file-tree-virtualized-list][data-is-scrolling] { pointer-events: none; }
${ROOT} [data-file-tree-virtualized-sticky-offset] { contain: layout size; }
${ROOT} [data-file-tree-virtualized-sticky] { position: sticky; top: 0; width: 100%; display: flex; flex-direction: column; isolation: isolate; }
${ROOT} [data-type='item'] { display: flex; align-items: center; box-sizing: border-box; width: 100%; height: var(--trees-item-height); flex: none; text-align: start; white-space: nowrap; }
${ROOT} [data-item-section='spacing'] { display: flex; align-self: stretch; flex: none; }
${ROOT} [data-item-section='spacing-item'] { width: var(--trees-indent, 1em); flex: none; }
${ROOT} [data-item-section='icon'] { display: flex; flex: none; }
${ROOT} [data-item-section='content'] { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
${ROOT} [data-item-section='decoration'], ${ROOT} [data-item-section='git'], ${ROOT} [data-item-section='action'] { display: flex; flex: none; }
${ROOT} [data-type='context-menu-wash'] { position: absolute; inset: 0; z-index: 3; touch-action: none; }
${ROOT} [data-type='context-menu-anchor'] { position: absolute; top: 0; right: 0; z-index: 4; display: none; align-items: center; }
${ROOT} [data-type='context-menu-anchor'][data-visible='true'] { display: flex; }
${ROOT}[data-is-scrolling] [data-type='context-menu-anchor'] { display: none; }
}`;
