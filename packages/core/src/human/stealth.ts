/**
 * Minimal, honest stealth: hides the most obvious automation fingerprints so a
 * human-like session is not trivially flagged. This is NOT for defeating serious
 * anti-bot systems or bypassing protections — it only removes the automation
 * tells that break otherwise-legitimate flows on the user's own accounts.
 */

/** Init script injected into every page before its own scripts run. */
export const STEALTH_INIT_SCRIPT = `
  // navigator.webdriver → undefined
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  // Plausible plugins/languages
  if (!navigator.languages || navigator.languages.length === 0) {
    Object.defineProperty(navigator, 'languages', { get: () => ['tr-TR', 'tr', 'en-US', 'en'] });
  }
  // chrome runtime stub (headless lacks window.chrome)
  if (!window.chrome) { window.chrome = { runtime: {} }; }
  // Permissions query consistency
  try {
    const orig = window.navigator.permissions && window.navigator.permissions.query;
    if (orig) {
      window.navigator.permissions.query = function (params) {
        return params && params.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : orig.call(this, params);
      };
    }
  } catch (e) {}
`;

/** Realistic launch args to avoid the most common headless tells. */
export const STEALTH_LAUNCH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--disable-features=IsolateOrigins,site-per-process",
];
