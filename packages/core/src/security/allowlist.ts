/** Domain allowlist — navigation outside workflow.allowedDomains halts the run. */

/**
 * True when hostname equals an allowed domain or is a subdomain of it.
 * A "*" entry allows ALL domains (full-browser mode) — the domain guard is off,
 * so the destructive-action approval gate becomes the only safety net.
 */
export function isDomainAllowed(url: string, allowedDomains: string[]): boolean {
  if (allowedDomains.includes("*")) {
    // Still refuse browser-internal pages, which can't be driven anyway.
    return !/^(chrome|edge|about|chrome-extension|devtools):/i.test(url);
  }
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol === "about:") return true;
    if (u.protocol === "file:") return allowedDomains.includes("file");
    host = u.hostname.toLowerCase();
  } catch {
    return false;
  }
  return allowedDomains.some((d) => {
    const dom = d.toLowerCase();
    return host === dom || host.endsWith("." + dom);
  });
}

export function assertDomainAllowed(url: string, allowedDomains: string[]): void {
  if (!isDomainAllowed(url, allowedDomains)) {
    throw new Error(
      `Domain not in allowlist: ${url} (allowed: ${allowedDomains.join(", ")})`,
    );
  }
}
