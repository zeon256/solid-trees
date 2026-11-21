// Layout the rendered markup depends on, injected by every tree: fixed-height
// flex rows and their lanes, a bounded scroll container, the sticky
// window/overlay, the context-menu layers, the scrollbar measure probe, and
// the OverflowText truncation mechanics (without them every name renders
// twice). No colors, fonts, or spacing; `styles.css` adds those in the next
// layer. Rules are scoped under the tree root and live in a cascade layer, so
// any unlayered author CSS overrides them without !important.
const ROOT = '[data-file-tree-virtualized-root]';

export const FILE_TREE_STRUCTURAL_CSS = `@layer solid-trees.structure, solid-trees.base, solid-trees.theme;
@layer solid-trees.structure {
${ROOT} { position: relative; display: flex; flex-direction: column; overflow: hidden; outline: none; }
${ROOT} [data-file-tree-sprite] { position: absolute; width: 0; height: 0; overflow: hidden; }
${ROOT} [data-type='header-slot'] { display: block; flex: 0 0 auto; }
${ROOT} [data-file-tree-virtualized-scroll] { position: relative; overflow-y: auto; flex: 1 1 0; min-height: 0; }
${ROOT} [data-file-tree-scrollbar-measure] { position: absolute; top: 0; left: 0; width: 100px; height: 100px; overflow-y: auto; visibility: hidden; pointer-events: none; }
${ROOT} [data-file-tree-sticky-overlay] { position: sticky; top: 0; height: 0; z-index: 4; overflow: visible; pointer-events: none; }
${ROOT}[data-scroll-at-top='true']:not([data-overlay-reveal]) [data-file-tree-sticky-overlay] { visibility: hidden; }
${ROOT} [data-file-tree-sticky-overlay-content] { position: relative; pointer-events: none; }
${ROOT} [data-file-tree-sticky-row] { pointer-events: auto; }
${ROOT}[data-is-scrolling] [data-file-tree-sticky-row] { pointer-events: none; }
${ROOT} [data-file-tree-virtualized-list] { position: relative; min-height: 100%; width: 100%; overflow-anchor: none; }
${ROOT} [data-file-tree-virtualized-list][data-is-scrolling] { pointer-events: none; }
${ROOT} [data-file-tree-virtualized-sticky-offset] { contain: layout size; }
${ROOT} [data-file-tree-virtualized-sticky] { position: sticky; top: 0; width: 100%; display: flex; flex-direction: column; isolation: isolate; will-change: transform; }
${ROOT} [data-type='item'] { display: flex; align-items: center; box-sizing: border-box; height: var(--trees-item-height); flex: none; text-align: start; }
${ROOT} [data-item-section='icon'] { display: flex; flex: none; }
${ROOT} [data-item-section='content'] { flex: 0 1 auto; min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
${ROOT} [data-item-flattened-subitems] { display: inline-flex; align-items: center; }
${ROOT} [data-item-section='decoration'] { display: flex; flex: 1 1 0; min-width: 0; justify-content: flex-end; overflow: hidden; }
${ROOT} [data-item-section='decoration'] > span { display: inline-flex; align-items: center; justify-content: flex-end; min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${ROOT} [data-item-section='git'], ${ROOT} [data-item-section='action'] { display: flex; flex: 0 0 auto; align-items: center; justify-content: center; }
${ROOT} [data-item-section='git'] > span, ${ROOT} [data-item-section='action'] > span { display: inline-flex; width: 100%; align-items: center; justify-content: center; }
${ROOT} [data-item-section='action'] { pointer-events: none; }
${ROOT} [data-type='context-menu-wash'] { position: absolute; inset: 0; z-index: 3; touch-action: none; }
${ROOT} [data-type='context-menu-anchor'] { position: absolute; top: 0; right: var(--trees-context-menu-trigger-inline-offset, 0); z-index: 4; display: none; align-items: center; }
${ROOT} [data-type='context-menu-anchor'][data-visible='true'] { display: flex; }
${ROOT}[data-is-scrolling] [data-type='context-menu-anchor'] { display: none; }
${ROOT} [data-type='context-menu-anchor'] > [data-type='context-menu-slot'] { display: block; width: 0; min-width: 0; flex: 0 0 0; overflow: visible; }
${ROOT} [data-truncate-container] { height: 1lh; min-width: 0; overflow: hidden; }
${ROOT} [data-truncate-grid] { display: grid; position: relative; }
${ROOT} [data-truncate-content='visible'] { white-space: nowrap; }
${ROOT} [data-truncate-content='overflow'] { margin-top: -1lh; opacity: 0; pointer-events: none; user-select: none; word-break: break-all; }
${ROOT} [data-truncate-marker-cell] { container: measure / size; overflow: visible; user-select: none; pointer-events: none; }
${ROOT} [data-truncate-marker] { display: flex; position: absolute; height: 1lh; box-sizing: border-box; align-items: center; z-index: 2; opacity: 0; }
@container measure (height > 1lh) { ${ROOT} [data-truncate-marker] { opacity: 1; } }
${ROOT} [data-truncate-container='truncate'] [data-truncate-grid] { grid-template-columns: minmax(0, max-content) 0; }
${ROOT} [data-truncate-container='truncate'] [data-truncate-marker] { right: 0; }
${ROOT} [data-truncate-container='fruncate'] [data-truncate-grid] { grid-template-columns: 0 minmax(0, max-content) auto; }
${ROOT} [data-truncate-container='fruncate'] [data-truncate-content] { direction: rtl; }
${ROOT} [data-truncate-container='fruncate'] [data-truncate-content] > span { unicode-bidi: plaintext; }
${ROOT} [data-truncate-group-container='middle'] { display: flex; min-width: 0; }
${ROOT} [data-truncate-group-container='middle'] > div { min-width: 0; }
${ROOT} [data-truncate-group-container='middle'] > [data-truncate-segment-priority='1'] { flex: 0 1 max-content; }
${ROOT} [data-truncate-group-container='middle'] > [data-truncate-segment-priority='2'] { flex: 0 999999 max-content; }
}`;
