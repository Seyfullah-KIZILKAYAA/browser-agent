import * as fs from "node:fs";
import * as path from "node:path";
import { ProfileStore, SiteProfileEntry } from "./site-profile";

/**
 * Disk-backed profile store (Node/CLI). One JSON file per domain under baseDir.
 * The extension supplies its own chrome.storage-backed ProfileStore instead.
 */
export class FileProfileStore implements ProfileStore {
  constructor(private baseDir: string) {}

  private fileFor(domain: string): string {
    const safe = domain.replace(/[^a-z0-9.-]/gi, "_");
    return path.join(this.baseDir, `${safe}.json`);
  }

  async load(domain: string): Promise<SiteProfileEntry[]> {
    const file = this.fileFor(domain);
    if (!fs.existsSync(file)) return [];
    try {
      return JSON.parse(fs.readFileSync(file, "utf8")) as SiteProfileEntry[];
    } catch {
      return [];
    }
  }

  async save(domain: string, entries: SiteProfileEntry[]): Promise<void> {
    fs.mkdirSync(this.baseDir, { recursive: true });
    fs.writeFileSync(this.fileFor(domain), JSON.stringify(entries, null, 2), "utf8");
  }
}
