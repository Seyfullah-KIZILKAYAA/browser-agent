import { Step, Workflow, containsSecret } from "@ba/shared";
import { BrowserSession } from "../transport/session";
import { executeStep, StepContext } from "../actions/execute-step";
import { Approver, checkApproval } from "../security/approval";
import { TraceWriter } from "../telemetry/trace";
import { DEFAULT_HUMAN, HumanProfile, Rng } from "../human/behavior";

export interface RunOptions {
  session: BrowserSession;
  vars: Record<string, string | number | boolean>;
  approver?: Approver;
  /** Called when a step fails and workflow.onFailure === "heal". Should patch
   *  workflow.targets in place and return true to retry the step once. */
  healer?: (workflow: Workflow, step: Step, error: Error) => Promise<boolean>;
  trace?: TraceWriter;
  artifactDir?: string;
  /** Human-like pacing; defaults to DEFAULT_HUMAN. Pass FAST_ROBOT for full speed. */
  human?: HumanProfile;
  /** Seed for reproducible timing jitter. */
  seed?: number;
  log?: (msg: string) => void;
}

export interface RunResult {
  ok: boolean;
  failedStepId?: string;
  error?: string;
  outputs: Record<string, string>;
  healedSteps: string[];
}

/** Resolve {{secret:name}} from environment: BA_SECRET_<NAME_UPPERCASED>. */
function envSecretResolver(name: string): string | undefined {
  return process.env["BA_SECRET_" + name.toUpperCase().replace(/[^A-Z0-9]/g, "_")];
}

/** EXECUTE mode: play a compiled workflow deterministically for one row. Zero LLM calls. */
export async function runWorkflow(workflow: Workflow, opts: RunOptions): Promise<RunResult> {
  const outputs: Record<string, string> = {};
  const healedSteps: string[] = [];
  const ctx: StepContext = {
    session: opts.session,
    workflow,
    subst: { vars: opts.vars, resolveSecret: envSecretResolver },
    outputs,
    artifactDir: opts.artifactDir,
    human: opts.human ?? DEFAULT_HUMAN,
    rng: new Rng(opts.seed ?? 1),
  };

  for (const step of workflow.steps) {
    const started = Date.now();
    const logValue = step.value !== undefined && containsSecret(step.value) ? "***" : step.value;
    opts.log?.(`  step ${step.id}: ${step.action}${logValue ? ` (${logValue})` : ""}`);
    try {
      await checkApproval(step, opts.approver, `workflow "${workflow.name}"`);
      try {
        await executeStep(ctx, step);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (workflow.onFailure === "heal" && opts.healer && step.target) {
          opts.log?.(`  step ${step.id} failed (${error.message}) — trying to heal`);
          const patched = await opts.healer(workflow, step, error);
          if (!patched) throw error;
          await executeStep(ctx, step); // retry once with patched locator
          healedSteps.push(step.id);
        } else {
          throw error;
        }
      }
      opts.trace?.write({
        ts: new Date().toISOString(),
        stepId: step.id,
        action: step.action,
        url: await opts.session.currentUrl(),
        ok: true,
        healed: healedSteps.includes(step.id),
        durationMs: Date.now() - started,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      opts.trace?.write({
        ts: new Date().toISOString(),
        stepId: step.id,
        action: step.action,
        ok: false,
        error: message,
        durationMs: Date.now() - started,
      });
      return { ok: false, failedStepId: step.id, error: message, outputs, healedSteps };
    }
  }
  return { ok: true, outputs, healedSteps };
}
