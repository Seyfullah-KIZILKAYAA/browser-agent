import { connect, ExtensionTransport } from "puppeteer-core/lib/esm/puppeteer/puppeteer-core-browser.js";
import type { Browser, Page } from "puppeteer-core/lib/esm/puppeteer/puppeteer-core-browser.js";
import type { BrowserSession, TabInfo } from "@ba/core/browser";

/**
 * BrowserSession backed by real CDP inside the extension (ADR 0001 upgrade).
 * puppeteer-core's ExtensionTransport wraps chrome.debugger.attach, so mouse
 * moves/clicks go through Input.dispatchMouseEvent as trusted input — real OS
 * cursor movement and coordinate clicks, which the content-script path cannot do.
 *
 * Requires the "debugger" permission and shows Chrome's "being debugged" banner
 * for the attach lifetime. Cannot attach to chrome:// or Web Store pages.
 */
export class CdpExtensionSession implements BrowserSession {
  private constructor(
    private browser: Browser,
    private page: Page,
    private tabId: number,
  ) {}

  static async attach(tabId: number): Promise<CdpExtensionSession> {
    const { browser, page } = await CdpExtensionSession.connectTab(tabId);
    return new CdpExtensionSession(browser, page, tabId);
  }

  /** Attach a fresh CDP connection to a specific tab. */
  private static async connectTab(tabId: number): Promise<{ browser: Browser; page: Page }> {
    const browser = await connect({
      transport: await ExtensionTransport.connectTab(tabId),
      defaultViewport: null,
      protocol: "cdp",
    });
    const [page] = await browser.pages();
    if (!page) throw new Error("CDP oturumu için sayfa alınamadı");
    return { browser, page };
  }

  // --- Multi-tab: chrome.tabs for topology, re-attach CDP on switch ---

  async listTabs(): Promise<TabInfo[]> {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    return tabs
      .filter((t) => t.id !== undefined && /^https?:/.test(t.url ?? ""))
      .map((t) => ({ id: t.id!, title: t.title ?? "", url: t.url ?? "", active: t.id === this.tabId }));
  }

  async openTab(url?: string): Promise<TabInfo> {
    const tab = await chrome.tabs.create({ url: url ?? "about:blank", active: true });
    if (!tab.id) throw new Error("Yeni sekme açılamadı");
    // Wait for it to have a real page, then attach CDP to it.
    await new Promise((r) => setTimeout(r, 600));
    await this.switchTab(tab.id);
    return { id: tab.id, title: tab.title ?? "", url: tab.url ?? url ?? "", active: true };
  }

  async switchTab(tabId: number): Promise<void> {
    if (tabId === this.tabId) return;
    try {
      await this.browser.disconnect();
    } catch {
      /* already detached */
    }
    await chrome.tabs.update(tabId, { active: true });
    const { browser, page } = await CdpExtensionSession.connectTab(tabId);
    this.browser = browser;
    this.page = page;
    this.tabId = tabId;
  }

  async closeTab(tabId: number): Promise<void> {
    if (tabId === this.tabId) throw new Error("Aktif sekme kapatılamaz; önce başka sekmeye geç");
    await chrome.tabs.remove(tabId);
  }

  async navigate(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await this.waitSettled();
  }
  async currentUrl(): Promise<string> {
    return this.page.url();
  }
  async goBack(): Promise<void> {
    await this.page.goBack({ waitUntil: "domcontentloaded" });
  }

  async evaluate<T>(pageFunction: string, arg?: unknown): Promise<T> {
    const expr = `(${pageFunction})(${arg === undefined ? "undefined" : JSON.stringify(arg)})`;
    try {
      return (await this.page.evaluate(expr)) as T;
    } catch (err) {
      // A mid-navigation eval kills the JS context ("Cannot find context with
      // specified id" / "Execution context was destroyed"). Wait for the page
      // to settle, then retry once.
      const msg = String((err as Error)?.message ?? err);
      if (/context|destroyed|detached/i.test(msg)) {
        await this.waitSettled();
        return (await this.page.evaluate(expr)) as T;
      }
      throw err;
    }
  }

  /** Wait for DOM readiness after a navigation before touching the context. */
  private async waitSettled(): Promise<void> {
    try {
      await this.page.waitForFunction("document.readyState === 'interactive' || document.readyState === 'complete'", {
        timeout: 8000,
      });
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  async click(selector: string): Promise<void> {
    await this.page.click(selector);
    // A click may trigger navigation; give the new page a moment to settle so
    // the next snapshot runs in a live context, not a destroyed one.
    await this.waitSettled();
  }
  async fill(selector: string, value: string): Promise<void> {
    const el = await this.page.$(selector);
    if (!el) throw new Error(`Element not found: ${selector}`);
    await el.click({ clickCount: 3 }); // select existing text
    await el.type(value);
  }
  async selectOption(selector: string, value: string): Promise<void> {
    await this.page.select(selector, value);
  }
  async setChecked(selector: string, checked: boolean): Promise<void> {
    const isChecked = await this.page.$eval(selector, (el) => (el as HTMLInputElement).checked);
    if (isChecked !== checked) await this.page.click(selector);
  }
  async hover(selector: string): Promise<void> {
    await this.page.hover(selector);
  }
  async press(key: string): Promise<void> {
    await this.page.keyboard.press(key as never);
  }
  async setInputFiles(selector: string, filePath: string): Promise<void> {
    const el = await this.page.$(selector);
    if (!el) throw new Error(`Element not found: ${selector}`);
    // Needs an OS-accessible absolute path; the extension sandbox rarely has one.
    await (el as unknown as { uploadFile: (p: string) => Promise<void> }).uploadFile(filePath);
  }
  async screenshot(): Promise<void> {
    // No disk in the extension; use screenshotBase64.
  }
  async waitMs(ms: number): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
  }
  async close(): Promise<void> {
    await this.browser.disconnect(); // chrome.debugger.detach
  }

  // --- Real OS-level input (the whole point of the CDP upgrade) ---
  async moveMouseTo(selector: string, curved: boolean): Promise<void> {
    const el = await this.page.$(selector);
    if (!el) return;
    const box = await el.boundingBox();
    if (!box) return;
    const tx = box.x + box.width / 2;
    const ty = box.y + box.height / 2;
    if (curved) {
      const steps = 6;
      for (let i = 1; i <= steps; i++) {
        await this.page.mouse.move(tx - box.width + (box.width * i) / steps, ty - box.height + (box.height * i) / steps);
      }
    }
    await this.page.mouse.move(tx, ty);
  }
  async clickAtCursor(): Promise<void> {
    await this.page.mouse.down();
    await this.page.mouse.up();
  }
  async focusField(selector: string): Promise<void> {
    await this.page.focus(selector);
  }
  async typeChar(char: string): Promise<void> {
    await this.page.keyboard.type(char);
  }
  async clearField(selector: string): Promise<void> {
    const el = await this.page.$(selector);
    if (!el) return;
    await el.click({ clickCount: 3 });
    await this.page.keyboard.press("Backspace" as never);
  }
  async screenshotBase64(): Promise<string> {
    const b64 = (await this.page.screenshot({ encoding: "base64", type: "jpeg", quality: 70 })) as string;
    return `data:image/jpeg;base64,${b64}`;
  }
  async viewportSize(): Promise<{ width: number; height: number }> {
    return this.page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  }
  async clickAt(x: number, y: number): Promise<void> {
    await this.page.mouse.click(x, y); // real trusted coordinate click (K5)
  }
}
