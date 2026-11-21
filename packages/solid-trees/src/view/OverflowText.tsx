import type { JSX } from '@solidjs/web';
import { createMemo, Match, omit, Show, Switch } from 'solid-js';

// Solid port of upstream's OverflowText (`MiddleTruncate`, `Truncate`,
// `Fruncate`). Each segment renders its text twice: a single-line visible copy
// and an invisible copy that wraps when the text overflows. The wrapping copy
// grows the marker cell past one line, which a container query turns into a
// visible truncation marker. The layout rules live in the structural
// stylesheet; marker paint lives in `styles.css`.

export interface MarkerProps {
  children?: JSX.Element;
}

export type TruncateMode = 'truncate' | 'fruncate';

export type TruncateVariant = 'default' | 'fade';

export interface OverflowTextProps {
  children?: JSX.Element;
  mode?: TruncateMode;
  style?: Omit<JSX.CSSProperties, 'height' | 'overflow'>;
  class?: string;
  marker?: JSX.Element | ((props: MarkerProps) => JSX.Element);
  variant?: TruncateVariant;
}

export type MiddleTruncateProps = Omit<OverflowTextProps, 'mode' | 'children'> &
  AllowableContentGroups & {
    minimumLength?: number;
    priority?: 'start' | 'end' | 'equal';
    split?:
      | 'center'
      | 'extension'
      | 'leaf-path'
      | number
      | SplitOffset
      | CustomSplitFn;
  };

export type MiddleTruncateFilteredProps = Pick<
  MiddleTruncateProps,
  'priority' | 'variant'
> & { splitIndex?: number; splitOffset?: number };

export type CustomSplitFn = (
  contents: string,
  props?: MiddleTruncateFilteredProps
) => [string, string];
export type SplitOffsetType = 'last' | 'first';
export type SplitOffset = [SplitOffsetType, number];

type AllowableContentGroups =
  | {
      children?: never;
      contents: [JSX.Element, JSX.Element];
    }
  | {
      contents?: never;
      children: string;
    };

// When a split boundary lands adjacent to whitespace, the trailing/leading
// space sits at the seam between the two inline segments. Because the visible
// content is rendered with `white-space: nowrap`, the browser collapses that
// boundary whitespace and the name visually loses its space (e.g. "Hello world"
// rendering as "Helloworld"). To keep the space visible, nudge the proposed
// center index to the nearest position where neither side of the seam is
// whitespace, so the space stays interior to one segment. Returns the original
// index when no whitespace-free boundary exists (e.g. all-whitespace input).
const avoidWhitespaceBoundary = (
  contents: string,
  centerIndex: number
): number => {
  const isOnBoundary = (index: number): boolean =>
    /\s/.test(contents[index - 1] ?? '') || /\s/.test(contents[index] ?? '');

  if (!isOnBoundary(centerIndex)) {
    return centerIndex;
  }

  // Search outward from the center for the closest boundary that is not
  // adjacent to whitespace, keeping the two segments as balanced as possible.
  for (let offset = 1; offset < contents.length; offset++) {
    const before = centerIndex - offset;
    if (before > 0 && !isOnBoundary(before)) {
      return before;
    }
    const after = centerIndex + offset;
    if (after < contents.length && !isOnBoundary(after)) {
      return after;
    }
  }

  return centerIndex;
};

const centerSplitIndex = (contents: string): number =>
  avoidWhitespaceBoundary(contents, Math.ceil(contents.length / 2));

const splitAt = (contents: string, index: number): [string, string] => [
  contents.slice(0, index),
  contents.slice(index),
];

// Split the contents into two equal segments
export const splitCenter: CustomSplitFn = (contents) => {
  if (contents.length < 2) {
    return [contents, ''];
  }
  return splitAt(contents, centerSplitIndex(contents));
};

// Find the last dot in the contents and split at that index
export const splitExtension: CustomSplitFn = (contents) => {
  if (contents.length < 4) {
    return [contents, ''];
  }
  const lastDotIndex = contents.lastIndexOf('.');
  const extensionIndex = lastDotIndex + 1;
  const impliedExtensionLength = contents.length - extensionIndex;
  const maxExtensionLength = 10;
  const isTooLong = impliedExtensionLength > maxExtensionLength;

  return splitAt(
    contents,
    extensionIndex >= 1 && !isTooLong
      ? extensionIndex
      : centerSplitIndex(contents)
  );
};

export const splitLeafPath: CustomSplitFn = (contents) => {
  if (contents.length < 4) {
    return [contents, ''];
  }
  const lastSlashIndex = contents.lastIndexOf('/');
  const leafPathIndex = lastSlashIndex + 1;
  const impliedLeafPathLength = contents.length - leafPathIndex;
  const maxLeafPathLength = 25;
  const isTooLong = impliedLeafPathLength > maxLeafPathLength;
  return splitAt(
    contents,
    leafPathIndex >= 1 && !isTooLong
      ? leafPathIndex
      : Math.ceil(contents.length / 2)
  );
};

export const splitByIndex: CustomSplitFn = (contents, { splitIndex } = {}) =>
  splitAt(
    contents,
    typeof splitIndex === 'number' ? splitIndex : Math.ceil(contents.length / 2)
  );

const isValidSplitOffset = (
  contents: string,
  splitOffset: number | undefined
): splitOffset is number =>
  typeof splitOffset === 'number' &&
  splitOffset > 0 &&
  splitOffset < contents.length;

export const splitLast: CustomSplitFn = (contents, { splitOffset } = {}) =>
  // Fall back to a center split when the offset is not valid.
  splitAt(
    contents,
    isValidSplitOffset(contents, splitOffset)
      ? contents.length - splitOffset
      : Math.ceil(contents.length / 2)
  );

export const splitFirst: CustomSplitFn = (contents, { splitOffset } = {}) =>
  // Fall back to a center split when the offset is not valid.
  splitAt(
    contents,
    isValidSplitOffset(contents, splitOffset)
      ? splitOffset
      : Math.ceil(contents.length / 2)
  );

function renderMarker(
  marker: OverflowTextProps['marker'],
  variant: TruncateVariant
): JSX.Element {
  if (typeof marker === 'function') {
    return marker({});
  }
  return variant === 'fade' ? <span data-truncate-fade /> : marker;
}

function OverflowMarker(props: {
  marker: OverflowTextProps['marker'];
  variant: TruncateVariant;
}): JSX.Element {
  return (
    <div aria-hidden="true" data-truncate-marker-cell>
      <div data-truncate-marker>
        {renderMarker(props.marker, props.variant)}
      </div>
    </div>
  );
}

function OverflowContent(props: {
  mode: TruncateMode;
  children?: JSX.Element;
}): JSX.Element {
  // The inner span wrapper is only needed to implement the right-aligned
  // internals for fruncate.
  return (
    <div>
      <div data-truncate-content="visible">
        {props.mode === 'fruncate' ? (
          <span>{props.children}</span>
        ) : (
          props.children
        )}
      </div>
      <div data-truncate-content="overflow" aria-hidden="true">
        {props.mode === 'fruncate' ? (
          <span>{props.children}</span>
        ) : (
          props.children
        )}
      </div>
    </div>
  );
}

export function OverflowText(props: OverflowTextProps): JSX.Element {
  const mode = () => props.mode ?? 'truncate';
  const content = () => (
    <OverflowContent mode={mode()}>{props.children}</OverflowContent>
  );
  const marker = () => (
    <OverflowMarker
      marker={props.marker === undefined ? '…' : props.marker}
      variant={props.variant ?? 'default'}
    />
  );

  return (
    <div
      data-truncate-container={mode()}
      data-truncate-variant={props.variant ?? 'default'}
      class={props.class}
      style={props.style}
    >
      <div data-truncate-grid>
        <Show
          when={mode() === 'truncate'}
          fallback={
            <>
              {marker()}
              {content()}
              <div data-truncate-fill />
            </>
          }
        >
          {content()}
          {marker()}
        </Show>
      </div>
    </div>
  );
}

export function Truncate(props: Omit<OverflowTextProps, 'mode'>): JSX.Element {
  return <OverflowText {...props} mode="truncate" />;
}

export function Fruncate(props: Omit<OverflowTextProps, 'mode'>): JSX.Element {
  return <OverflowText {...props} mode="fruncate" />;
}

interface ResolvedSplit {
  splitFn: CustomSplitFn;
  splitIndex?: number;
  splitOffset?: number;
}

function resolveSplit(split: MiddleTruncateProps['split']): ResolvedSplit {
  if (typeof split === 'function') {
    return { splitFn: split };
  }
  if (typeof split === 'number') {
    return { splitFn: splitByIndex, splitIndex: split };
  }
  if (Array.isArray(split)) {
    const [offsetType, splitOffset] = split;
    return {
      splitFn: offsetType === 'last' ? splitLast : splitFirst,
      splitOffset,
    };
  }
  if (split === 'extension') {
    return { splitFn: splitExtension };
  }
  if (split === 'leaf-path') {
    return { splitFn: splitLeafPath };
  }
  // Center is the default and the fallback for anything unrecognized.
  return { splitFn: splitCenter };
}

/**
 * Truncates in the middle: the first segment clips at its end and the second
 * at its start, so both ends of the text stay visible. `contents` renders two
 * prepared segments; string `children` are split by `split`. Strings shorter
 * than `minimumLength` render as one segment that clips at the end opposite
 * `priority`.
 */
export function MiddleTruncate(props: MiddleTruncateProps): JSX.Element {
  const segmentProps = omit(
    props,
    'children',
    'class',
    'contents',
    'minimumLength',
    'priority',
    'split',
    'style'
  );
  const priority = () => props.priority ?? 'end';
  const text = () => props.children ?? '';
  const halves = createMemo(() => {
    const { splitFn, splitIndex, splitOffset } = resolveSplit(
      props.split ?? 'center'
    );
    const [first, second] = splitFn(text(), {
      priority: priority(),
      variant: props.variant,
      splitIndex,
      splitOffset,
    });
    const firstIsLarger = first.length >= second.length;
    // With equal priority the shorter segment never needs a marker.
    return {
      first,
      firstMarker:
        priority() === 'equal' && !firstIsLarger ? '' : segmentProps.marker,
      second,
      secondMarker:
        priority() === 'equal' && firstIsLarger ? '' : segmentProps.marker,
    };
  });
  const group = (first: JSX.Element, second: JSX.Element) => (
    <div
      data-truncate-group-container="middle"
      class={props.class}
      style={props.style}
    >
      <div
        data-truncate-segment-priority={
          priority() === 'start' || priority() === 'equal' ? '1' : '2'
        }
      >
        {first}
      </div>
      <div
        data-truncate-segment-priority={
          priority() === 'end' || priority() === 'equal' ? '1' : '2'
        }
      >
        {second}
      </div>
    </div>
  );

  return (
    <Switch
      fallback={group(
        <Truncate {...segmentProps} marker={halves().firstMarker}>
          {halves().first}
        </Truncate>,
        <Fruncate {...segmentProps} marker={halves().secondMarker}>
          {halves().second}
        </Fruncate>
      )}
    >
      <Match when={props.contents}>
        {(contents) =>
          group(
            <Truncate {...segmentProps}>{contents()[0]}</Truncate>,
            <Fruncate {...segmentProps}>{contents()[1]}</Fruncate>
          )
        }
      </Match>
      {/* Styling may rely on the element being present even when empty. */}
      <Match when={text().length === 0}>
        <div class={props.class} style={props.style} />
      </Match>
      {/* Below the minimum length, clip without splitting. */}
      <Match when={text().length < (props.minimumLength ?? 12)}>
        <Show
          when={priority() === 'end'}
          fallback={
            <Truncate {...segmentProps} class={props.class} style={props.style}>
              {text()}
            </Truncate>
          }
        >
          <Fruncate {...segmentProps} class={props.class} style={props.style}>
            {text()}
          </Fruncate>
        </Show>
      </Match>
    </Switch>
  );
}
