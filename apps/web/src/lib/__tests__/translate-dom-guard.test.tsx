/**
 * Chrome's built-in Google Translate swaps text nodes for <font> wrappers
 * behind React's back. React still holds the original text node, so its next
 * removeChild/insertBefore against it throws NotFoundError and unmounts the
 * app (Sentry 7762226578, 7762230140, 7762229824, 7762230954).
 *
 * @vitest-environment jsdom
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { installTranslateDomGuard } from "../translate-dom-guard";

function translatePage(container: HTMLElement) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }
  for (const node of textNodes) {
    const outer = document.createElement("font");
    const inner = document.createElement("font");
    inner.textContent = `translated: ${node.data}`;
    outer.appendChild(inner);
    node.parentNode?.replaceChild(outer, node);
  }
}

describe("installTranslateDomGuard", () => {
  let container: HTMLElement;
  let root: Root;

  beforeAll(() => {
    installTranslateDomGuard();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function mount(element: React.ReactNode) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(element));
  }

  it("survives React removing a text node that Translate replaced", () => {
    const Step = ({ done }: { done: boolean }) => (
      <div>
        <span>Step 1</span>
        {done ? <b>Finished</b> : "Connect your AWS account"}
      </div>
    );
    mount(<Step done={false} />);
    translatePage(container);

    expect(() => act(() => root.render(<Step done />))).not.toThrow();
    expect(container.querySelector("b")?.textContent).toBe("Finished");
  });

  it("survives React inserting before a text node that Translate replaced", () => {
    const Banner = ({ show }: { show: boolean }) => (
      <div>
        {show && <b>New</b>}
        Automations
      </div>
    );
    mount(<Banner show={false} />);
    translatePage(container);

    expect(() => act(() => root.render(<Banner show />))).not.toThrow();
    expect(container.querySelector("b")?.textContent).toBe("New");
  });
});
