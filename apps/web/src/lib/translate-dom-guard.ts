/**
 * Browser translation (Chrome's Google Translate) replaces text nodes with
 * <font> wrappers that React does not know about. React's next removeChild or
 * insertBefore against the original node throws NotFoundError and tears the
 * app down. Tolerate the moved node instead of crashing, so non-English users
 * can keep translation on. See https://github.com/facebook/react/issues/11538.
 *
 * Must run before React hydrates.
 */
export function installTranslateDomGuard(): void {
  if (typeof Node !== "function") {
    return;
  }

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function removeChild<T extends Node>(
    this: Node,
    child: T
  ): T {
    if (child.parentNode !== this) {
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function insertBefore<T extends Node>(
    this: Node,
    newNode: T,
    referenceNode: Node | null
  ): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      return originalInsertBefore.call(this, newNode, null) as T;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}
