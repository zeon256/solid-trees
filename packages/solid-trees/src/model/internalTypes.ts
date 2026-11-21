import type { FileTreeScrollOffset, FileTreeVisibleRow } from './publicTypes';

export type FileTreeControllerListener = () => void;

export interface FileTreeStickyRowCandidate {
  row: FileTreeVisibleRow;
  subtreeEndIndex: number;
}

export interface FileTreeViewportMetrics {
  itemCount: number;
  itemHeight: number;
  overscan?: number;
  scrollTop: number;
  viewportHeight: number;
}

export interface FileTreeRange {
  end: number;
  start: number;
}

export interface FileTreeStickyWindowLayout {
  offsetHeight: number;
  stickyInset: number;
  totalHeight: number;
  windowHeight: number;
}

export interface FileTreeScrollRequest {
  id: number;
  offset: FileTreeScrollOffset;
  visibleIndex: number;
}
