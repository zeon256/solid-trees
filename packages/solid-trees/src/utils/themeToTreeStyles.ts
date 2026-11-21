import type { ThemeLike } from '@pierre/theming';
import { colorUtils, normalizeThemeColors } from '@pierre/theming/color';

/**
 * Theme-like shape compatible with Shiki/VS Code theme format (e.g. from
 * highlighter.getTheme() or resolveTheme()). No dependency on shiki; use with
 * resolved themes from @pierre/diffs or shiki. Aliased to theming's
 * `ThemeLike` — a structural superset of the keys trees reads.
 */
export type TreeThemeInput = ThemeLike;

/** Theme tokens emitted only when the theme defines them. */
type TreeThemeOptionalToken =
  | '--trees-theme-sidebar-border'
  | '--trees-theme-input-border'
  | '--trees-theme-scrollbar-thumb'
  | '--trees-theme-git-added-fg'
  | '--trees-theme-git-modified-fg'
  | '--trees-theme-git-deleted-fg';

/**
 * CSS custom properties (--trees-theme-*) and surface styles for the tree
 * root. Keys are CSS property names, so the value works directly as a Solid
 * `style` object and feeds the stylesheet's fallback chain.
 */
export type TreeThemeStyles = {
  'color-scheme': 'dark' | 'light';
  'background-color': string;
  color: string;
  'border-color': string;
  '--trees-theme-sidebar-bg': string;
  '--trees-theme-sidebar-fg': string;
  '--trees-theme-sidebar-header-fg': string;
  '--trees-theme-list-active-selection-fg': string;
  '--trees-theme-list-hover-bg': string;
  '--trees-theme-list-active-selection-bg': string;
  '--trees-theme-focus-ring': string;
  '--trees-theme-input-bg': string;
} & Partial<Record<TreeThemeOptionalToken, string>>;

/**
 * Maps a Shiki/VS Code–style theme to CSS for FileTree. The shared
 * fallback/repair work — surface chains, the git-color chain, the
 * transparent-focus repair, and dropping a text-erasing hover background —
 * lives in @pierre/theming's `normalizeThemeColors`, which returns a theme in
 * the same workbench-key vocabulary with those keys resolved. This function
 * reads those resolved keys and maps them onto the `--trees-theme-*`
 * variables, applying the tree's own presentation defaults where a key is
 * absent.
 *
 * The one piece of tree-specific opinion kept here is the selection lookup: a
 * `list.activeSelectionBackground` that matches the sidebar surface is
 * invisible, so the tree prefers `list.focusBackground` in that case.
 * normalizeThemeColors leaves the raw selection keys untouched precisely so
 * this choice stays a tree concern. The stylesheet uses --trees-theme-* in its
 * fallback chain (--trees-*-override → --trees-theme-* → default).
 *
 * Use with a resolved theme from shiki or @pierre/diffs:
 *
 *   const theme = await resolveTheme('dracula');
 *   <FileTree model={model} style={themeToTreeStyles(theme)} />
 */
export function themeToTreeStyles(theme: TreeThemeInput): TreeThemeStyles {
  const colors: Partial<Record<string, string>> =
    normalizeThemeColors(theme).colors ?? {};
  const isDark = theme.type === 'dark';

  // Pull every resolved key into a named local so the mapping below reads as a
  // flat list of tokens rather than inline lookups.
  const sidebarBg = colors['sideBar.background'];
  const sidebarFg = colors['sideBar.foreground'];
  const sectionHeaderFg = colors['sideBarSectionHeader.foreground'];
  const selectionFg = colors['list.activeSelectionForeground'];
  const hoverBg = colors['list.hoverBackground'];
  const focusRing = colors['list.focusOutline'];
  const inputBg = colors['input.background'];
  const sidebarBorder = colors['sideBar.border'];
  const inputBorder = colors['input.border'];
  const scrollbarThumb = colors['scrollbarSlider.background'];
  const addedFg = colors['gitDecoration.addedResourceForeground'];
  const modifiedFg = colors['gitDecoration.modifiedResourceForeground'];
  const deletedFg = colors['gitDecoration.deletedResourceForeground'];

  // Hover fallback is chosen by the ACTUAL sidebar surface luminance, not
  // theme.type — slack-ochin is tagged `light` but ships a dark sidebar.
  const sidebarL = colorUtils.relativeLuminance(sidebarBg);
  const sideBarIsDark = sidebarL !== null ? sidebarL < 0.5 : isDark;

  // Selection opinion (tree-owned): a same-surface selection background is
  // invisible, so prefer list.focusBackground; otherwise use the raw selection.
  // editor.selectionBackground is the shared tail in both branches. The
  // `rawSelectionBg !== undefined` guard stops an absent selection from being
  // treated as "same surface" when sidebarBg is also absent.
  const rawSelectionBg = colors['list.activeSelectionBackground'];
  const focusBackground = colors['list.focusBackground'];
  const editorSelectionBg = colors['editor.selectionBackground'];
  const selectionBg =
    rawSelectionBg !== undefined &&
    rawSelectionBg.toLowerCase() === sidebarBg?.toLowerCase()
      ? (focusBackground ?? editorSelectionBg)
      : (rawSelectionBg ?? editorSelectionBg);

  const result: TreeThemeStyles = {
    'color-scheme': isDark ? 'dark' : 'light',
    'background-color': sidebarBg ?? '',
    color: sidebarFg ?? '',
    'border-color':
      'var(--trees-theme-sidebar-border, light-dark(oklch(0% 0 0 / 0.15), oklch(100% 0 0 / 0.15)))',
    '--trees-theme-sidebar-bg': sidebarBg ?? '',
    '--trees-theme-sidebar-fg': sidebarFg ?? '',
    '--trees-theme-sidebar-header-fg': sectionHeaderFg ?? '',
    '--trees-theme-list-active-selection-fg': selectionFg ?? '',
    '--trees-theme-list-hover-bg':
      hoverBg ??
      (sideBarIsDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
    '--trees-theme-list-active-selection-bg': selectionBg ?? 'transparent',
    '--trees-theme-focus-ring': focusRing ?? sidebarFg ?? '',
    '--trees-theme-input-bg': inputBg ?? '',
  };

  // Expose optional tokens only when the theme defines them. `border-color`
  // above always falls back to the default light/dark value.
  const optionalTokens: ReadonlyArray<
    [TreeThemeOptionalToken, string | undefined]
  > = [
    ['--trees-theme-sidebar-border', sidebarBorder],
    ['--trees-theme-input-border', inputBorder],
    ['--trees-theme-scrollbar-thumb', scrollbarThumb],
    ['--trees-theme-git-added-fg', addedFg],
    ['--trees-theme-git-modified-fg', modifiedFg],
    ['--trees-theme-git-deleted-fg', deletedFg],
  ];
  for (const [token, value] of optionalTokens) {
    if (value !== undefined && value !== '') {
      result[token] = value;
    }
  }

  return result;
}
