import { LLMUsage } from "./provider";
import { usageCostUsd } from "./pricing";

/** Which agent role spent the tokens, for per-phase cost attribution. */
export type Phase = "planner" | "navigator" | "validator" | "healer" | "vision" | "compiler" | "other";

interface PhaseTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  usd: number;
}

function emptyTotals(): PhaseTotals {
  return { calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, usd: 0 };
}

/**
 * Hard token budget + cost accounting. Stops the run when the token ceiling is
 * exceeded (plan §1). Also tracks cache reads/writes, USD, and per-phase
 * breakdown so a run can report exactly where the money went.
 */
export class BudgetGuard {
  private totals = emptyTotals();
  private byPhase = new Map<Phase, PhaseTotals>();

  /** maxTokens is the hard ceiling on billable tokens; maxUsd is an optional cost ceiling. */
  constructor(
    private maxTokens: number,
    private maxUsd?: number,
  ) {}

  /** Record one LLM call's usage, attributed to a phase (default "other"). */
  record(usage: LLMUsage, phase: Phase = "other"): void {
    const cacheRead = usage.cacheReadTokens ?? 0;
    const cacheWrite = usage.cacheWriteTokens ?? 0;
    const usd = usageCostUsd(usage);

    const bump = (t: PhaseTotals): void => {
      t.calls += 1;
      t.inputTokens += usage.inputTokens;
      t.outputTokens += usage.outputTokens;
      t.cacheReadTokens += cacheRead;
      t.cacheWriteTokens += cacheWrite;
      t.usd += usd;
    };
    bump(this.totals);
    const p = this.byPhase.get(phase) ?? emptyTotals();
    bump(p);
    this.byPhase.set(phase, p);

    if (this.total > this.maxTokens) {
      throw new Error(`Token budget exceeded: ${this.total} > ${this.maxTokens}. Run stopped.`);
    }
    if (this.maxUsd !== undefined && this.usd > this.maxUsd) {
      throw new Error(`USD budget exceeded: $${this.usd.toFixed(4)} > $${this.maxUsd}. Run stopped.`);
    }
  }

  /** Billable tokens = fresh input + cache read + cache write + output. */
  get total(): number {
    const t = this.totals;
    return t.inputTokens + t.cacheReadTokens + t.cacheWriteTokens + t.outputTokens;
  }

  get usd(): number {
    return this.totals.usd;
  }

  /** Fraction of input tokens served from cache (0..1) — cache effectiveness. */
  get cacheHitRate(): number {
    const t = this.totals;
    const totalInput = t.inputTokens + t.cacheReadTokens;
    return totalInput === 0 ? 0 : t.cacheReadTokens / totalInput;
  }

  /** Structured summary for dashboards / run reports. */
  summary(): {
    total: number;
    usd: number;
    cacheHitRate: number;
    phases: Record<string, PhaseTotals>;
  } {
    const phases: Record<string, PhaseTotals> = {};
    for (const [k, v] of this.byPhase) phases[k] = v;
    return { total: this.total, usd: this.usd, cacheHitRate: this.cacheHitRate, phases };
  }

  report(): string {
    const t = this.totals;
    const cache = t.cacheReadTokens > 0 ? `, cache-read: ${t.cacheReadTokens} (${(this.cacheHitRate * 100).toFixed(0)}%)` : "";
    return `tokens: ${this.total} (in: ${t.inputTokens}, out: ${t.outputTokens}${cache}) · ~$${this.usd.toFixed(4)} / bütçe ${this.maxTokens} tok`;
  }
}
