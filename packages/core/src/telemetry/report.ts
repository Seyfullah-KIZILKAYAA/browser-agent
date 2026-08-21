import * as fs from "node:fs";
import * as path from "node:path";
import { BudgetGuard } from "../llm/budget";

export interface RunReport {
  runId: string;
  workflow: string;
  startedAt: string;
  finishedAt: string;
  rows: { total: number; succeeded: number; failed: number; skipped: number };
  cost: {
    totalTokens: number;
    usd: number;
    cacheHitRate: number;
    perTokenUsd: number;
    phases: Record<string, unknown>;
  };
  healedSteps?: string[];
}

/** Assemble a structured run report from a batch summary + budget. */
export function buildReport(args: {
  runId: string;
  workflow: string;
  startedAt: string;
  finishedAt: string;
  rows: RunReport["rows"];
  budget: BudgetGuard;
  healedSteps?: string[];
}): RunReport {
  const s = args.budget.summary();
  return {
    runId: args.runId,
    workflow: args.workflow,
    startedAt: args.startedAt,
    finishedAt: args.finishedAt,
    rows: args.rows,
    cost: {
      totalTokens: s.total,
      usd: Number(s.usd.toFixed(6)),
      cacheHitRate: Number(s.cacheHitRate.toFixed(3)),
      perTokenUsd: s.total === 0 ? 0 : Number((s.usd / s.total).toFixed(9)),
      phases: s.phases,
    },
    healedSteps: args.healedSteps,
  };
}

/** Write report.json into the run dir and return a human-readable summary. */
export function writeReport(runDir: string, report: RunReport): string {
  fs.writeFileSync(path.join(runDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  const { rows, cost } = report;
  const perRowUsd = rows.succeeded > 0 ? cost.usd / rows.succeeded : 0;
  const lines = [
    `Run raporu: ${report.workflow} (${report.runId})`,
    `  Satırlar: ${rows.succeeded} başarılı, ${rows.failed} hatalı, ${rows.skipped} atlanan / ${rows.total}`,
    `  Token: ${cost.totalTokens}  ·  ~$${cost.usd.toFixed(4)}  ·  cache-hit ${(cost.cacheHitRate * 100).toFixed(0)}%`,
    rows.succeeded > 0 ? `  Satır başına: ~$${perRowUsd.toFixed(5)}` : "",
    report.healedSteps?.length ? `  Heal edilen adımlar: ${report.healedSteps.join(", ")}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}
