// Structural DOM guards. `instanceof` checks fail across realms (iframes,
// separate JSDOM windows) and the lint preset forbids them; these narrow by
// node type and namespace instead.
const XHTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const ELEMENT_NODE = 1;
const DOCUMENT_FRAGMENT_NODE = 11;

export function isNode(value: unknown): value is Node {
  return (
    typeof value === 'object' &&
    value !== null &&
    'nodeType' in value &&
    typeof value.nodeType === 'number'
  );
}

export function isHTMLElement(value: unknown): value is HTMLElement {
  return (
    isNode(value) &&
    value.nodeType === ELEMENT_NODE &&
    'namespaceURI' in value &&
    value.namespaceURI === XHTML_NAMESPACE
  );
}

export function isHTMLElementOfTag<K extends keyof HTMLElementTagNameMap>(
  value: unknown,
  tagName: K
): value is HTMLElementTagNameMap[K] {
  return isHTMLElement(value) && value.localName === tagName;
}

export function isShadowRoot(value: unknown): value is ShadowRoot {
  return (
    isNode(value) &&
    value.nodeType === DOCUMENT_FRAGMENT_NODE &&
    'host' in value &&
    isNode(value.host)
  );
}
