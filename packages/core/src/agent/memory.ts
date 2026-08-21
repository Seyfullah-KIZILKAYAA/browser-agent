/**
 * Compact working memory for the live agent loop. Full step history grows the
 * context quadratically, so we keep the last N raw steps plus a rolling
 * one-line summary of everything older (plan §7 history management).
 */

export interface StepRecord {
  n: number;
  thought: string;
  action: string;
  outcome: string;
}

export class AgentMemory {
  private records: StepRecord[] = [];
  private summary = "";

  constructor(private keepRaw = 3) {}

  add(record: StepRecord): void {
    this.records.push(record);
    // Fold the oldest raw record into the summary once we exceed the window.
    while (this.records.length > this.keepRaw) {
      const old = this.records.shift()!;
      const line = `${old.n}. ${old.action} → ${old.outcome}`;
      this.summary = this.summary ? `${this.summary}\n${line}` : line;
    }
  }

  /** Render memory for the model: compressed summary + recent raw steps. */
  render(): string {
    const parts: string[] = [];
    if (this.summary) parts.push(`Earlier steps (summary):\n${this.summary}`);
    if (this.records.length) {
      parts.push(
        "Recent steps:\n" +
          this.records
            .map((r) => `${r.n}. thought: ${r.thought}\n   action: ${r.action}\n   outcome: ${r.outcome}`)
            .join("\n"),
      );
    }
    return parts.join("\n\n") || "(no steps yet)";
  }

  get count(): number {
    return this.records.length + (this.summary ? this.summary.split("\n").length : 0);
  }
}
