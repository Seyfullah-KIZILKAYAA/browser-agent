import { Target } from "@ba/shared";

/**
 * Site profile cache: per-domain memory of successful locators, keyed by the
 * agent's intent. Lets the live navigator skip re-discovering elements it has
 * found before on the same site (deepseek plans' "don't re-explore each time",
 * Agent-E skill harvesting). Storage is pluggable so the CLI can persist to
 * disk and the extension to chrome.storage.
 */

export interface SiteProfileEntry {
  /** Normalized intent phrase, e.g. "sepete ekle butonu". */
  intent: string;
  target: Target;
  /** How many times replaying this target succeeded / failed. */
  hits: number;
  misses: number;
  updatedAt: string;
}

export interface ProfileStore {
  load(domain: string): Promise<SiteProfileEntry[]>;
  save(domain: string, entries: SiteProfileEntry[]): Promise<void>;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "unknown";
  }
}

function normIntent(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);
}

/** In-memory + pluggable-backed cache of learned locators per domain. */
export class SiteProfileCache {
  private cache = new Map<string, SiteProfileEntry[]>();

  constructor(private store?: ProfileStore) {}

  private async entries(domain: string): Promise<SiteProfileEntry[]> {
    if (this.cache.has(domain)) return this.cache.get(domain)!;
    const loaded = this.store ? await this.store.load(domain) : [];
    this.cache.set(domain, loaded);
    return loaded;
  }

  /** Best remembered target for an intent on this page's domain, if any. */
  async lookup(url: string, intent: string): Promise<Target | null> {
    const list = await this.entries(domainOf(url));
    const key = normIntent(intent);
    const exact = list.find((e) => e.intent === key);
    if (exact) return exact.target;
    // Loose match: intent contains or is contained by a stored one.
    const loose = list.find((e) => e.intent.includes(key) || key.includes(e.intent));
    return loose?.target ?? null;
  }

  /** Record a successful locator for reuse. */
  async remember(url: string, intent: string, target: Target): Promise<void> {
    const domain = domainOf(url);
    const list = await this.entries(domain);
    const key = normIntent(intent);
    const existing = list.find((e) => e.intent === key);
    if (existing) {
      existing.target = target;
      existing.hits += 1;
      existing.updatedAt = new Date().toISOString();
    } else {
      list.push({ intent: key, target, hits: 1, misses: 0, updatedAt: new Date().toISOString() });
    }
    if (this.store) await this.store.save(domain, list);
  }

  /** Record that a remembered locator failed, so stale entries decay. */
  async penalize(url: string, intent: string): Promise<void> {
    const domain = domainOf(url);
    const list = await this.entries(domain);
    const key = normIntent(intent);
    const entry = list.find((e) => e.intent === key);
    if (!entry) return;
    entry.misses += 1;
    // Drop entries that fail more than they help.
    if (entry.misses > entry.hits + 1) {
      this.cache.set(domain, list.filter((e) => e !== entry));
    }
    if (this.store) await this.store.save(domain, this.cache.get(domain) ?? list);
  }
}
