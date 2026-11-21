// Public options come from JS callers that may pass `null` where the types only
// allow `undefined`. Upstream treats both identically (`== null`); the lint
// preset forbids loose equality, so this guard keeps that runtime contract.
export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}
