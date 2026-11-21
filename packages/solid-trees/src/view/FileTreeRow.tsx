import type { JSX } from '@solidjs/web';
import { createMemo, createRenderEffect, For, onCleanup, Show } from 'solid-js';
import type { Accessor } from 'solid-js';

import type { FileTreeController } from '../model/FileTreeController';
import type { FileTreeGitStatusState } from '../model/gitStatus';
import type {
  FileTreeContextMenuButtonVisibility,
  FileTreeContextMenuOpenContext,
  FileTreeContextMenuTriggerMode,
  FileTreeDropTarget,
  FileTreeLabels,
  FileTreeRowDecoration,
  FileTreeVisibleRow,
} from '../model/publicTypes';
import type { FileTreeResolveIcon } from '../render/iconResolver';
import { computeFileTreeRowElementAttributes } from '../render/rowAttributes';
import type { FileTreeRowClickMode } from '../render/rowClickPlan';
import { Icon } from './Icon';
import { MiddleTruncate, Truncate } from './OverflowText';
import {
  createAnchorRectFromPoint,
  getBuiltInGitStatusDecoration,
  getFileTreeFocusedRowDomId,
  getFileTreeRowAriaLabel,
  getFileTreeRowPath,
  getInheritedIgnoredGitStatus,
  isBuiltInDecorationIconName,
} from './viewHelpers';

export interface FileTreeContextMenuConfig {
  buttonTriggerEnabled: boolean;
  buttonVisibility: FileTreeContextMenuButtonVisibility;
  enabled: boolean;
  rightClickEnabled: boolean;
  triggerMode: FileTreeContextMenuTriggerMode;
}

export interface FileTreeRenameView {
  commit(): void;
  setValue(value: string): void;
}

// Everything a row needs that is shared by all rows of one tree. Values that
// change are accessors so each row tracks exactly what it reads.
export interface FileTreeRowFrame {
  controller: FileTreeController;
  instanceId: string;
  itemHeight: number;
  renameView: FileTreeRenameView;
  renamingPath: Accessor<string | null>;
  renamingValue: Accessor<string>;
  visualFocusPath: Accessor<string | null>;
  contextHoverPath: Accessor<string | null>;
  focusedParentPath: Accessor<string | null>;
  draggedPathSet: Accessor<ReadonlySet<string> | null>;
  dragTarget: Accessor<FileTreeDropTarget | null>;
  dragAndDropEnabled: Accessor<boolean>;
  gitStatusState: Accessor<FileTreeGitStatusState | null>;
  ignoredInheritanceCache: Accessor<Map<string, boolean>>;
  labels: Accessor<FileTreeLabels>;
  contextMenu: Accessor<FileTreeContextMenuConfig>;
  resolveIcon: Accessor<FileTreeResolveIcon>;
  renderDecorationForRow: (
    row: FileTreeVisibleRow,
    targetPath: string
  ) => FileTreeRowDecoration | null;
  shouldSuppressContextMenu: () => boolean;
  handleRowDragStart: (
    event: DragEvent,
    row: FileTreeVisibleRow,
    targetPath: string
  ) => void;
  handleRowDragEnd: () => void;
  handleRowTouchStart: (
    event: TouchEvent,
    row: FileTreeVisibleRow,
    targetPath: string
  ) => void;
  openContextMenuForRow: (
    row: FileTreeVisibleRow,
    targetPath: string,
    options?: {
      anchorRect?: FileTreeContextMenuOpenContext['anchorRect'];
      source?: 'button' | 'keyboard' | 'right-click';
    }
  ) => void;
  onRowClick: (
    event: MouseEvent,
    row: FileTreeVisibleRow,
    targetPath: string,
    mode: FileTreeRowClickMode
  ) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  registerRenameInput: (element: HTMLInputElement | null) => void;
}

export interface FileTreeRowProps {
  frame: FileTreeRowFrame;
  row: FileTreeVisibleRow;
  mode: FileTreeRowClickMode;
  isParked?: boolean;
  style?: JSX.CSSProperties;
  /**
   * Adds (`register: true`) or removes the row element for `path`. Removal is
   * a no-op when another row has since claimed the path.
   */
  registerButton: (
    path: string,
    element: HTMLElement,
    register: boolean
  ) => void;
}

function RowDecoration(props: {
  decoration: FileTreeRowDecoration;
  resolveIcon: FileTreeResolveIcon;
}): JSX.Element {
  const icon = createMemo(() => {
    const decoration = props.decoration;
    if ('text' in decoration) {
      return null;
    }

    if (typeof decoration.icon === 'string') {
      return isBuiltInDecorationIconName(decoration.icon)
        ? props.resolveIcon(decoration.icon)
        : { name: decoration.icon };
    }

    if (isBuiltInDecorationIconName(decoration.icon.name)) {
      const { name, ...iconOverrides } = decoration.icon;
      return { ...props.resolveIcon(name), ...iconOverrides };
    }

    return decoration.icon;
  });

  return (
    <span title={props.decoration.title}>
      <Show
        when={icon()}
        fallback={
          <Show
            when={'text' in props.decoration && props.decoration.parts}
            fallback={'text' in props.decoration ? props.decoration.text : ''}
          >
            {(parts) => (
              <For each={parts()}>
                {(part) => (
                  <span style={{ color: part.color }}>{part.text}</span>
                )}
              </For>
            )}
          </Show>
        }
      >
        {(resolved) => <Icon {...resolved()} />}
      </Show>
    </span>
  );
}

function RenameInput(props: {
  ariaLabel: string;
  isFlattened: boolean;
  value: string;
  onCommit: () => void;
  onValue: (value: string) => void;
  register: (element: HTMLInputElement | null) => void;
}): JSX.Element {
  let input: HTMLInputElement | undefined;
  onCleanup(() => {
    if (input !== undefined) {
      props.register(null);
    }
  });

  return (
    <input
      ref={(element) => {
        input = element;
        props.register(element);
      }}
      data-item-rename-input
      data-item-flattened-rename-input={props.isFlattened ? 'true' : undefined}
      aria-label={props.ariaLabel}
      value={props.value}
      onBlur={() => {
        props.onCommit();
      }}
      onInput={(event) => {
        props.onValue(event.currentTarget.value);
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    />
  );
}

// One tree row. The same component renders flow rows, parked rows, and the
// sticky overlay mirrors so pointer behavior, row metadata, and lane structure
// stay in sync across all three.
export function FileTreeRow(props: FileTreeRowProps): JSX.Element {
  const view = createMemo(() => {
    const frame = props.frame;
    const row = props.row;
    const isSticky = props.mode === 'sticky';
    const isParked = props.isParked === true;
    const targetPath = getFileTreeRowPath(row);
    const gitStatusState = frame.gitStatusState();
    const ownGitStatus = gitStatusState?.statusByPath.get(targetPath) ?? null;
    const effectiveGitStatus =
      ownGitStatus ??
      getInheritedIgnoredGitStatus(
        row.ancestorPaths,
        gitStatusState?.ignoredDirectoryPaths,
        frame.ignoredInheritanceCache()
      );
    const containsGitChange =
      row.kind === 'directory' &&
      (gitStatusState?.directoriesWithChanges.has(targetPath) ?? false);
    const labels = frame.labels();
    const customDecoration = frame.renderDecorationForRow(row, targetPath);
    const gitDecoration = getBuiltInGitStatusDecoration(
      effectiveGitStatus,
      containsGitChange,
      labels
    );
    const contextMenu = frame.contextMenu();
    const gitLaneActive = gitStatusState !== null;
    const actionLaneEnabled =
      contextMenu.enabled && contextMenu.buttonTriggerEnabled;
    const ariaLabel = getFileTreeRowAriaLabel(row);
    const isRenamingRow = frame.renamingPath() === targetPath;
    const dragTarget = frame.dragTarget();
    const attributes = computeFileTreeRowElementAttributes({
      ariaLabel,
      domId: row.isFocused
        ? getFileTreeFocusedRowDomId(frame.instanceId, targetPath, isParked)
        : undefined,
      extraStyle: props.style,
      features: {
        actionLaneEnabled,
        contextMenuButtonVisibility: actionLaneEnabled
          ? contextMenu.buttonVisibility
          : null,
        contextMenuEnabled: contextMenu.enabled,
        contextMenuTriggerMode: contextMenu.enabled
          ? contextMenu.triggerMode
          : null,
        gitLaneActive,
      },
      isParked,
      itemHeight: frame.itemHeight,
      mode: props.mode,
      row,
      state: {
        containsGitChange,
        effectiveGitStatus,
        isContextHovered: frame.contextHoverPath() === targetPath,
        isDragTarget:
          dragTarget?.kind === 'directory' &&
          dragTarget.directoryPath === targetPath,
        isDragging: frame.draggedPathSet()?.has(targetPath) === true,
        isFocusRinged: row.isFocused && frame.visualFocusPath() === targetPath,
      },
      targetPath,
    });

    return {
      actionLaneEnabled,
      ariaLabel,
      attributes,
      customDecoration,
      decorationLaneEnabled:
        customDecoration !== null || gitLaneActive || actionLaneEnabled,
      dragTargetFlattenedSegmentPath: dragTarget?.flattenedSegmentPath ?? null,
      gitDecoration,
      gitLaneActive,
      isDraggable: frame.dragAndDropEnabled() && !isParked,
      isSticky,
      // Sticky mirrors never host the rename input; the canonical row does.
      showRenameInput: !isSticky && isRenamingRow,
      showDecorativeActionAffordance:
        actionLaneEnabled && contextMenu.buttonVisibility === 'always',
      targetPath,
    };
  });
  const spacingAncestors = createMemo(() =>
    Array.from(
      { length: props.row.depth },
      (_, index) => props.row.ancestorPaths[index] ?? ''
    )
  );
  const fileIcon = createMemo(() =>
    props.row.kind === 'directory'
      ? props.frame.resolveIcon()('file-tree-icon-chevron')
      : props.frame.resolveIcon()('file-tree-icon-file', view().targetPath)
  );

  // Rows are reused by viewport slot, so one element shows different paths
  // over time and the button may swap for a rename container. Keep the
  // path -> element registry pointing at whatever this row currently renders.
  let element: HTMLElement | undefined;
  let currentPath: string | null = null;
  let registered: { path: string; element: HTMLElement } | null = null;
  const register = () => {
    if (
      registered !== null &&
      (registered.path !== currentPath || registered.element !== element)
    ) {
      props.registerButton(registered.path, registered.element, false);
      registered = null;
    }
    if (element !== undefined && currentPath !== null) {
      registered = { element, path: currentPath };
      props.registerButton(currentPath, element, true);
    }
  };
  const setElement = (nextElement: HTMLElement) => {
    element = nextElement;
    register();
  };
  createRenderEffect(
    () => view().targetPath,
    (path) => {
      currentPath = path;
      register();
    }
  );
  onCleanup(() => {
    if (registered !== null) {
      props.registerButton(registered.path, registered.element, false);
    }
  });

  const handleContextMenu = (event: MouseEvent) => {
    const frame = props.frame;
    const contextMenu = frame.contextMenu();
    if (!contextMenu.enabled && !frame.dragAndDropEnabled()) {
      return;
    }

    if (frame.shouldSuppressContextMenu()) {
      event.preventDefault();
      return;
    }

    if (!contextMenu.enabled) {
      return;
    }

    event.preventDefault();
    if (!contextMenu.rightClickEnabled) {
      return;
    }
    const targetPath = view().targetPath;
    frame.controller.focusMountedPathFromInput(targetPath);
    frame.openContextMenuForRow(props.row, targetPath, {
      anchorRect: createAnchorRectFromPoint(event.clientX, event.clientY),
      source: 'right-click',
    });
  };
  const handleFocus = () => {
    if (props.mode !== 'sticky') {
      props.frame.controller.focusMountedPathFromInput(view().targetPath);
    }
  };
  const handleKeyDown = (event: KeyboardEvent) => {
    if (props.mode !== 'sticky') {
      props.frame.onKeyDown(event);
    }
  };

  const flattenedSegments = () => props.row.flattenedSegments ?? [];
  const renameInput = () => (
    <RenameInput
      ariaLabel={props.frame.labels().renameItem(view().ariaLabel)}
      isFlattened={props.row.isFlattened}
      value={props.frame.renamingValue()}
      onCommit={() => {
        props.frame.renameView.commit();
      }}
      onValue={(value) => {
        props.frame.renameView.setValue(value);
      }}
      register={props.frame.registerRenameInput}
    />
  );
  const name = () => (
    <Show
      when={view().showRenameInput}
      fallback={
        <MiddleTruncate minimumLength={5} split="extension">
          {props.row.name}
        </MiddleTruncate>
      }
    >
      {renameInput()}
    </Show>
  );
  const content = () => (
    <>
      <Show when={props.row.depth > 0}>
        <div data-item-section="spacing">
          <For each={spacingAncestors()} keyed={false}>
            {(ancestorPath) => (
              <div
                data-item-section="spacing-item"
                data-ancestor-path={ancestorPath()}
                data-item-guide-focused={
                  props.frame.focusedParentPath() === ancestorPath()
                    ? 'true'
                    : undefined
                }
              />
            )}
          </For>
        </div>
      </Show>
      <div data-item-section="icon">
        <Icon {...fileIcon()} />
      </div>
      <div data-item-section="content">
        <Show
          when={props.row.isFlattened && flattenedSegments().length > 0}
          fallback={name()}
        >
          <span data-item-flattened-subitems>
            {/* Controller emits rebuild segment objects; key by path so the
                spans (drag targets) survive updates. */}
            <For each={flattenedSegments()} keyed={(segment) => segment.path}>
              {(segment, index) => (
                <>
                  <span
                    data-item-flattened-subitem={segment().path}
                    data-item-flattened-subitem-drag-target={
                      view().dragTargetFlattenedSegmentPath === segment().path
                        ? 'true'
                        : undefined
                    }
                  >
                    <Show
                      when={
                        index() === flattenedSegments().length - 1 &&
                        view().showRenameInput
                      }
                      fallback={<Truncate>{segment().name}</Truncate>}
                    >
                      {renameInput()}
                    </Show>
                  </span>
                  {index() < flattenedSegments().length - 1 ? ' / ' : ''}
                </>
              )}
            </For>
          </span>
        </Show>
      </div>
      <Show when={view().decorationLaneEnabled}>
        <div data-item-section="decoration">
          <Show when={view().customDecoration}>
            {(decoration) => (
              <RowDecoration
                decoration={decoration()}
                resolveIcon={props.frame.resolveIcon()}
              />
            )}
          </Show>
        </div>
      </Show>
      <Show when={view().gitLaneActive}>
        <div data-item-section="git">
          <Show when={view().gitDecoration}>
            {(decoration) => (
              <RowDecoration
                decoration={decoration()}
                resolveIcon={props.frame.resolveIcon()}
              />
            )}
          </Show>
        </div>
      </Show>
      <Show when={view().actionLaneEnabled}>
        <div data-item-section="action">
          <Show when={view().showDecorativeActionAffordance}>
            <span aria-hidden="true" data-item-action-affordance="decorative">
              <Icon {...props.frame.resolveIcon()('file-tree-icon-ellipsis')} />
            </span>
          </Show>
        </div>
      </Show>
    </>
  );

  return (
    <Show
      when={view().showRenameInput}
      fallback={
        <button
          {...view().attributes}
          ref={setElement}
          type="button"
          draggable={view().isDraggable ? 'true' : undefined}
          onContextMenu={handleContextMenu}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          onDragStart={(event) => {
            if (view().isDraggable) {
              props.frame.handleRowDragStart(
                event,
                props.row,
                view().targetPath
              );
            }
          }}
          onDragEnd={() => {
            if (view().isDraggable) {
              props.frame.handleRowDragEnd();
            }
          }}
          onMouseDown={(event) => {
            if (props.mode === 'sticky') {
              event.preventDefault();
              return;
            }

            if (props.frame.controller.isSearchOpen()) {
              event.preventDefault();
            }
          }}
          onTouchStart={(event) => {
            if (view().isDraggable) {
              props.frame.handleRowTouchStart(
                event,
                props.row,
                view().targetPath
              );
            }
          }}
          onClick={(event) => {
            props.frame.onRowClick(
              event,
              props.row,
              view().targetPath,
              props.mode
            );
          }}
        >
          {content()}
        </button>
      }
    >
      <div
        {...view().attributes}
        ref={setElement}
        onContextMenu={handleContextMenu}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
      >
        {content()}
      </div>
    </Show>
  );
}
