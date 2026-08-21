/**
 * Browser abstraction the engine talks to. Everything above this interface is
 * transport-agnostic so the same engine can later run behind an MV3 extension
 * bridge (plan §2, option C) without changes.
 */
export interface BrowserSession {
  navigate(url: string): Promise<void>;
  currentUrl(): Promise<string>;
  goBack(): Promise<void>;
  /** Evaluate a JS expression/function string in the page, return JSON-serializable result. */
  evaluate<T>(pageFunction: string, arg?: unknown): Promise<T>;
  /** Playwright-style interactions against a CSS selector. */
  click(selector: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  selectOption(selector: string, value: string): Promise<void>;
  setChecked(selector: string, checked: boolean): Promise<void>;
  hover(selector: string): Promise<void>;
  press(key: string): Promise<void>;
  setInputFiles(selector: string, filePath: string): Promise<void>;
  screenshot(filePath: string): Promise<void>;
  waitMs(ms: number): Promise<void>;
  close(): Promise<void>;

  // --- Human-like, low-level interactions (used when a HumanProfile is active) ---

  /** Move the real mouse cursor over the element's center (with optional curve). */
  moveMouseTo(selector: string, curved: boolean): Promise<void>;
  /** Physically click at the current mouse position (element already hovered). */
  clickAtCursor(): Promise<void>;
  /** Focus a field and type one character (real keydown/keyup). */
  focusField(selector: string): Promise<void>;
  typeChar(char: string): Promise<void>;
  /** Clear a field's current value before human typing. */
  clearField(selector: string): Promise<void>;
  /** Take a screenshot into a base64 data URL (for vision fallback, no disk write). */
  screenshotBase64(fullPage: boolean): Promise<string>;
  /** Viewport size, for coordinate validation in vision mode. */
  viewportSize(): Promise<{ width: number; height: number }>;
  /** Click raw viewport coordinates (vision/coordinate fallback — last resort). */
  clickAt(x: number, y: number): Promise<void>;
}
