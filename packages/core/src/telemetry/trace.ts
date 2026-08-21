import * as fs from "node:fs";
import * as path from "node:path";

export interface TraceEvent {
  ts: string;
  stepId: string;
  action: string;
  url?: string;
  ok: boolean;
  error?: string;
  healed?: boolean;
  durationMs: number;
}

/** Append-only JSONL trace per run — the audit log required by docs/security.md. */
export class TraceWriter {
  constructor(private filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  write(event: TraceEvent): void {
    fs.appendFileSync(this.filePath, JSON.stringify(event) + "\n", "utf8");
  }
}
