import type { JSX } from '@solidjs/web';

const DEFAULT_SIZE = 16;

export interface IconProps {
  name: string;
  remappedFrom?: string;
  token?: string;
  width?: number;
  height?: number;
  viewBox?: string;
  label?: string;
}

// Renders a sprite reference. Symbols come from the sprite sheet the tree
// mounts next to its rows (built-in set plus `icons.spriteSheet`).
export function Icon(props: IconProps): JSX.Element {
  return (
    <svg
      data-icon-name={props.remappedFrom ?? props.name}
      data-icon-token={props.token}
      aria-label={props.label}
      aria-hidden={props.label === undefined ? 'true' : undefined}
      role={props.label !== undefined ? 'img' : undefined}
      viewBox={props.viewBox ?? `0 0 ${DEFAULT_SIZE} ${DEFAULT_SIZE}`}
      width={props.width ?? DEFAULT_SIZE}
      height={props.height ?? DEFAULT_SIZE}
    >
      <use href={`#${props.name.replace(/^#/, '')}`} />
    </svg>
  );
}
