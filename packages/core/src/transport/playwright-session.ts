import { chromium, Browser, BrowserContext, Page } from "playwright-core";
import { BrowserSession } from "./session";
import { STEALTH_INIT_SCRIPT, STEALTH_LAUNCH_ARGS } from "../human/stealth";

export interface LaunchOptions {
  headless?: boolean;
  /** Browser channel; defaults to installed Chrome, falls back to Edge. */
  channel?: "chrome" | "msedge";
  /** Inject anti-fingerprint init script + realistic launch args. */
  stealth?: boolean;
  /** Persistent user-data dir → reuse a real logged-in profile (plan §2, C). */
  userDataDir?: string;
}

/** Development/CLI transport: drives an installed Chrome/Edge via playwright-core. */
export class PlaywrightSession implements BrowserSession {
  private constructor(
    private browser: Browser | null,
    private context: BrowserContext,
    private page: Page,
  ) {}

  static async launch(opts: LaunchOptions = {}): Promise<PlaywrightSession> {
    const channels: ("chrome" | "msedge")[] = opts.channel
      ? [opts.channel]
      : ["chrome", "msedge"];
    const args = opts.stealth ? STEALTH_LAUNCH_ARGS : [];
    let lastErr: unknown;
    for (const channel of channels) {
      try {
        // Persistent context keeps the user's real login/cookies across runs.
        if (opts.userDataDir) {
          const context = await chromium.launchPersistentContext(opts.userDataDir, {
            channel,
            headless: opts.headless ?? false,
            viewport: { width: 1280, height: 800 },
            args,
          });
          if (opts.stealth) await context.addInitScript(STEALTH_INIT_SCRIPT);
          const page = context.pages()[0] ?? (await context.newPage());
          return new PlaywrightSession(null, context, page);
        }
        const browser = await chromium.launch({
          channel,
          headless: opts.headless ?? false,
          args,
        });
        const context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
        });
        if (opts.stealth) await context.addInitScript(STEALTH_INIT_SCRIPT);
        const page = await context.newPage();
        return new PlaywrightSession(browser, context, page);
      } catch (err) {
        lastErr = err;
      }
    }
    throw new Error(
      `Could not launch Chrome or Edge. Install Google Chrome, or run: npx playwright install chromium. Cause: ${String(lastErr)}`,
    );
  }

  async navigate(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  }

  async currentUrl(): Promise<string> {
    return this.page.url();
  }

  async goBack(): Promise<void> {
    await this.page.goBack({ waitUntil: "domcontentloaded" });
  }

  async evaluate<T>(pageFunction: string, arg?: unknown): Promise<T> {
    // Playwright does not invoke string expressions with an arg — inline it.
    const expr = `(${pageFunction})(${arg === undefined ? "undefined" : JSON.stringify(arg)})`;
    return this.page.evaluate(expr) as Promise<T>;
  }

  async click(selector: string): Promise<void> {
    await this.page.click(selector, { timeout: 10_000 });
  }

  async fill(selector: string, value: string): Promise<void> {
    await this.page.fill(selector, value, { timeout: 10_000 });
  }

  async selectOption(selector: string, value: string): Promise<void> {
    await this.page.selectOption(selector, value, { timeout: 10_000 });
  }

  async setChecked(selector: string, checked: boolean): Promise<void> {
    await this.page.setChecked(selector, checked, { timeout: 10_000 });
  }

  async hover(selector: string): Promise<void> {
    await this.page.hover(selector, { timeout: 10_000 });
  }

  async press(key: string): Promise<void> {
    await this.page.keyboard.press(key);
  }

  async setInputFiles(selector: string, filePath: string): Promise<void> {
    await this.page.setInputFiles(selector, filePath, { timeout: 10_000 });
  }

  async screenshot(filePath: string): Promise<void> {
    await this.page.screenshot({ path: filePath });
  }

  async waitMs(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  async close(): Promise<void> {
    if (this.browser) await this.browser.close();
    else await this.context.close();
  }

  // --- Human-like, low-level interactions ---

  async moveMouseTo(selector: string, curved: boolean): Promise<void> {
    const el = this.page.locator(selector).first();
    const box = await el.boundingBox();
    if (!box) return;
    const targetX = box.x + box.width / 2;
    const targetY = box.y + box.height / 2;
    if (curved) {
      // A few intermediate points so the path is not a straight teleport.
      const steps = 6;
      const start = { x: targetX - box.width, y: targetY - box.height };
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = start.x + (targetX - start.x) * t;
        const y = start.y + (targetY - start.y) * t;
        await this.page.mouse.move(x, y);
      }
    }
    await this.page.mouse.move(targetX, targetY);
  }

  async clickAtCursor(): Promise<void> {
    await this.page.mouse.down();
    await this.page.mouse.up();
  }

  async focusField(selector: string): Promise<void> {
    await this.page.locator(selector).first().focus();
  }

  async typeChar(char: string): Promise<void> {
    await this.page.keyboard.type(char);
  }

  async clearField(selector: string): Promise<void> {
    const el = this.page.locator(selector).first();
    await el.focus();
    await this.page.keyboard.press("ControlOrMeta+A");
    await this.page.keyboard.press("Delete");
  }

  async screenshotBase64(fullPage: boolean): Promise<string> {
    const buf = await this.page.screenshot({ fullPage, type: "jpeg", quality: 70 });
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  }

  async viewportSize(): Promise<{ width: number; height: number }> {
    return this.page.viewportSize() ?? { width: 1280, height: 800 };
  }

  async clickAt(x: number, y: number): Promise<void> {
    await this.page.mouse.click(x, y);
  }
}
