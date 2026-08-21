import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { Workflow } from "@ba/shared";
import { BrowserSession } from "../transport/session";
import { Approver } from "../security/approval";
import { TraceWriter } from "../telemetry/trace";
import { mapRowToVars, Row } from "../data/parse";
import { runWorkflow, RunOptions } from "./runtime";

export interface BatchOptions {
  session: BrowserSession;
  runsDir: string;
  /** Reuse a previous runId to resume after a crash/kill. */
  runId?: string;
  approver?: Approver;
  healer?: RunOptions["healer"];
  /** Extra variables merged under every row's variables (e.g. CLI --var). */
  extraVars?: Record<string, string>;
  human?: RunOptions["human"];
  /** Shared budget for any heal calls; passed through so cost is reported. */
  budget?: import("../llm/budget").BudgetGuard;
  onRowDone?: (index: number, ok: boolean) => void;
  log?: (msg: string) => void;
}

export interface BatchSummary {
  runId: string;
  runDir: string;
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  resultsCsv: string;
}

interface BatchState {
  workflowName: string;
  doneRowKeys: string[];
}

/** Idempotency key: same row content is never processed twice within a run. */
function rowKey(row: Row): string {
  return crypto.createHash("sha1").update(JSON.stringify(row)).digest("hex").slice(0, 16);
}

function csvEscape(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Run a compiled workflow over every data row. Zero LLM tokens.
 * Checkpoints state.json after each row; kill → resume with the same runId.
 */
export async function runBatch(
  workflow: Workflow,
  rows: Row[],
  opts: BatchOptions,
): Promise<BatchSummary> {
  const runId = opts.runId ?? new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = path.join(opts.runsDir, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const statePath = path.join(runDir, "state.json");
  const resultsPath = path.join(runDir, "results.csv");
  const trace = new TraceWriter(path.join(runDir, "trace.jsonl"));

  let state: BatchState = { workflowName: workflow.name, doneRowKeys: [] };
  if (fs.existsSync(statePath)) {
    state = JSON.parse(fs.readFileSync(statePath, "utf8")) as BatchState;
    opts.log?.(`Resuming run ${runId}: ${state.doneRowKeys.length} rows already done`);
  }
  if (!fs.existsSync(resultsPath)) {
    fs.writeFileSync(resultsPath, "row,key,status,error,outputs\n", "utf8");
  }

  const done = new Set(state.doneRowKeys);
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const key = rowKey(row);
    if (done.has(key)) {
      skipped++;
      continue;
    }
    opts.log?.(`row ${i + 1}/${rows.length} (${key})`);
    let status = "ok";
    let error = "";
    let outputs = "";
    try {
      const vars = { ...opts.extraVars, ...mapRowToVars(workflow, row) };
      const result = await runWorkflow(workflow, {
        session: opts.session,
        vars,
        approver: opts.approver,
        healer: opts.healer,
        human: opts.human,
        seed: i + 1,
        trace,
        artifactDir: runDir,
        log: opts.log,
      });
      if (result.ok) {
        succeeded++;
        outputs = JSON.stringify(result.outputs);
      } else {
        failed++;
        status = "failed";
        error = `${result.failedStepId}: ${result.error}`;
        if (workflow.onFailure === "abort") {
          appendResult(resultsPath, i, key, status, error, outputs);
          persistState(statePath, state);
          throw new Error(`Run aborted at row ${i + 1}: ${error}`);
        }
      }
    } catch (err) {
      failed++;
      status = "error";
      error = err instanceof Error ? err.message : String(err);
      if (workflow.onFailure === "abort") {
        appendResult(resultsPath, i, key, status, error, outputs);
        persistState(statePath, state);
        throw err;
      }
    }
    appendResult(resultsPath, i, key, status, error, outputs);
    done.add(key);
    state.doneRowKeys = [...done];
    persistState(statePath, state);
    opts.onRowDone?.(i, status === "ok");
  }

  return { runId, runDir, total: rows.length, succeeded, failed, skipped, resultsCsv: resultsPath };
}

function appendResult(
  resultsPath: string,
  index: number,
  key: string,
  status: string,
  error: string,
  outputs: string,
): void {
  fs.appendFileSync(
    resultsPath,
    [index + 1, key, status, csvEscape(error), csvEscape(outputs)].join(",") + "\n",
    "utf8",
  );
}

function persistState(statePath: string, state: BatchState): void {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
}
