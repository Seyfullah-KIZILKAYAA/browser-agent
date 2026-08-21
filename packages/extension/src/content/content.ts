/**
 * Content script: runs inside the real page and performs DOM operations on
 * behalf of the background navigator loop. This is the extension's equivalent
 * of Playwright's page driver — but in the user's actual logged-in session.
 *
 * DOM access still flows only through the page-script.ts function strings that
 * the background sends via { op: "evaluate", fn }, keeping the single-source rule.
 */
import type { ContentRequest, ContentResult } from "../shared/protocol";

function findEl(selector: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  return el;
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  // Bypass React's synthetic value tracking so frameworks see the change.
  const proto = Object.getPrototypeOf(el);
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  desc?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

async function handle(req: ContentRequest): Promise<unknown> {
  switch (req.op) {
    case "evaluate": {
      // fn is a self-contained function-expression string from page-script.ts.
      const fn = new Function(`return (${req.fn})`)() as (a: unknown) => unknown;
      return fn(req.arg);
    }
    case "currentUrl":
      return location.href;
    case "click": {
      const el = findEl(req.selector);
      el.scrollIntoView({ block: "center" });
      el.click();
      return null;
    }
    case "fill": {
      const el = findEl(req.selector) as HTMLInputElement;
      el.focus();
      setNativeValue(el, req.value);
      return null;
    }
    case "selectOption": {
      const el = findEl(req.selector) as HTMLSelectElement;
      el.value = req.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return null;
    }
    case "setChecked": {
      const el = findEl(req.selector) as HTMLInputElement;
      if (el.checked !== req.checked) el.click();
      return null;
    }
    case "hover": {
      const el = findEl(req.selector);
      el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      return null;
    }
    case "press": {
      const active = (document.activeElement as HTMLElement) ?? document.body;
      active.dispatchEvent(new KeyboardEvent("keydown", { key: req.key, bubbles: true }));
      active.dispatchEvent(new KeyboardEvent("keyup", { key: req.key, bubbles: true }));
      return null;
    }
    case "scrollBy": {
      window.scrollBy(0, req.amount);
      return null;
    }
    default: {
      const never: never = req;
      throw new Error(`Unknown op: ${JSON.stringify(never)}`);
    }
  }
}

chrome.runtime.onMessage.addListener((req: ContentRequest, _sender, sendResponse) => {
  handle(req)
    .then((value) => sendResponse({ ok: true, value } satisfies ContentResult))
    .catch((err) => sendResponse({ ok: false, error: String(err?.message ?? err) } satisfies ContentResult));
  return true; // async response
});
