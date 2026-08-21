import type { BrowserSession } from "@ba/core/browser";
import type { ContentRequest, ContentResult } from "../shared/protocol";

/**
 * BrowserSession backed by the extension: DOM operations run in the active tab's
 * content script (the user's real, logged-in page). The core engine (navigator,
 * perception, locator) drives this exactly like the Playwright session.
 *
 * Human-like low-level methods degrade gracefully to their plain equivalents —
 * the DOM path cannot move a real OS cursor, so moveMouseTo/clickAtCursor map
 * onto hover/click. Coordinate clicks (K5) are not available here.
 */
export class ExtensionSession implements BrowserSession {
  constructor(private tabId: number) {}

  private async send(req: ContentRequest): Promise<unknown> {
    // After a navigation the new page's content script may not be injected yet
    // ("Receiving end does not exist"); retry briefly until it's listening.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const res = (await chrome.tabs.sendMessage(this.tabId, req)) as ContentResult | undefined;
        if (!res) throw new Error("Content script did not respond (page not ready?)");
        if (!res.ok) throw new Error(res.error);
        return res.value;
      } catch (err) {
        lastErr = err;
        const msg = String((err as Error)?.message ?? err);
        if (!/Receiving end does not exist|not established|page not ready/i.test(msg)) throw err;
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    throw lastErr;
  }

  async navigate(url: string): Promise<void> {
    await chrome.tabs.update(this.tabId, { url });
    await this.waitForLoad();
  }

  /** Wait until the tab finishes loading (replaces networkidle for MVP). */
  private waitForLoad(timeoutMs = 30_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + timeoutMs;
      const check = (): void => {
        chrome.tabs.get(this.tabId, (tab) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (tab.status === "complete") return resolve();
          if (Date.now() > deadline) return reject(new Error("navigation timeout"));
          setTimeout(check, 200);
        });
      };
      setTimeout(check, 300);
    });
  }

  async currentUrl(): Promise<string> {
    return (await this.send({ op: "currentUrl" })) as string;
  }

  async goBack(): Promise<void> {
    await chrome.tabs.goBack(this.tabId);
    await this.waitForLoad();
  }

  async evaluate<T>(pageFunction: string, arg?: unknown): Promise<T> {
    return (await this.send({ op: "evaluate", fn: pageFunction, arg })) as T;
  }

  async click(selector: string): Promise<void> {
    await this.send({ op: "click", selector });
  }
  async fill(selector: string, value: string): Promise<void> {
    await this.send({ op: "fill", selector, value });
  }
  async selectOption(selector: string, value: string): Promise<void> {
    await this.send({ op: "selectOption", selector, value });
  }
  async setChecked(selector: string, checked: boolean): Promise<void> {
    await this.send({ op: "setChecked", selector, checked });
  }
  async hover(selector: string): Promise<void> {
    await this.send({ op: "hover", selector });
  }
  async press(key: string): Promise<void> {
    await this.send({ op: "press", key });
  }
  async setInputFiles(): Promise<void> {
    throw new Error("File upload is not supported in the extension session yet.");
  }
  async screenshot(): Promise<void> {
    // No disk in an extension; use screenshotBase64 instead.
  }
  async waitMs(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
  }
  async close(): Promise<void> {
    // The tab belongs to the user; do not close it.
  }

  // --- Human-like methods: DOM-level fallbacks ---
  async moveMouseTo(selector: string): Promise<void> {
    await this.hover(selector);
  }
  async clickAtCursor(): Promise<void> {
    // The preceding resolve tagged the element; click it via the resolved selector.
    await this.click("[data-ba-r='1']");
  }
  async focusField(selector: string): Promise<void> {
    await this.send({ op: "evaluate", fn: `((s) => { document.querySelector(s)?.focus(); })`, arg: selector });
  }
  async typeChar(char: string): Promise<void> {
    await this.send({
      op: "evaluate",
      fn: `((c) => {
        var el = document.activeElement;
        if (!el) return;
        var proto = Object.getPrototypeOf(el);
        var desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && desc.set) desc.set.call(el, (el.value || '') + c);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      })`,
      arg: char,
    });
  }
  async clearField(selector: string): Promise<void> {
    await this.fill(selector, "");
  }
  async screenshotBase64(): Promise<string> {
    const dataUrl = await chrome.tabs.captureVisibleTab({ format: "jpeg", quality: 70 });
    return dataUrl;
  }
  async viewportSize(): Promise<{ width: number; height: number }> {
    return (await this.send({
      op: "evaluate",
      fn: `(() => ({ width: window.innerWidth, height: window.innerHeight }))`,
    })) as { width: number; height: number };
  }
  async clickAt(): Promise<void> {
    throw new Error("Coordinate clicks are not available in the extension session.");
  }
}
