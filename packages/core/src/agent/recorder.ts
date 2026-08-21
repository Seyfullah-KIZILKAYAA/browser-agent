import { parseWorkflow, Step, Target, Workflow, WorkflowInput } from "@ba/shared";
import { RecordedAction } from "./navigator";

/**
 * Converts a live navigator run into a deterministic, replayable workflow.
 * The live run costs LLM tokens once; the resulting workflow.json replays at
 * zero tokens (Stagehand observe→cache pattern, workflow-use converter idea).
 */
export class WorkflowRecorder {
  private steps: Step[] = [];
  private targets: Record<string, Target> = {};
  private stepNo = 0;
  private targetNo = 0;

  constructor(
    private meta: {
      name: string;
      allowedDomains: string[];
      inputs: WorkflowInput[];
    },
  ) {}

  /** Record one executed action from the navigator loop. */
  add(rec: RecordedAction): void {
    const a = rec.action;
    const note = rec.note;
    let target: string | undefined;
    if (rec.target) {
      this.targetNo += 1;
      target = `@t${this.targetNo}`;
      this.targets[target] = rec.target;
    }
    this.stepNo += 1;
    const id = `s${this.stepNo}`;

    switch (a.type) {
      case "navigate":
        this.steps.push({ id, action: "navigate", url: a.value ?? "", risk: rec.risk, note });
        break;
      case "click":
        this.steps.push({ id, action: "click", target, risk: rec.risk, note });
        break;
      case "type":
        this.steps.push({ id, action: "type", target, value: a.value ?? "", clearFirst: true, risk: rec.risk, note });
        break;
      case "select":
        this.steps.push({ id, action: "select", target, value: a.value ?? "", risk: rec.risk, note });
        break;
      case "check":
        this.steps.push({ id, action: "check", target, value: a.value ?? "true", risk: rec.risk, note });
        break;
      case "scroll":
        this.steps.push({ id, action: "scroll", amount: 600, risk: "read", note });
        break;
      case "keypress":
        this.steps.push({ id, action: "keypress", value: a.value ?? "Enter", risk: rec.risk, note });
        break;
      case "wait":
        this.steps.push({
          id,
          action: "waitFor",
          condition: a.text ? { textPresent: a.text } : undefined,
          timeoutMs: 15_000,
          risk: "read",
          note,
        });
        break;
      case "extract":
        this.steps.push({ id, action: "extract", into: `extract_${this.stepNo}`, risk: "read", note });
        break;
      default:
        this.stepNo -= 1; // don't count unknown actions
    }
  }

  /** True when there is something worth saving. */
  get hasSteps(): boolean {
    return this.steps.length > 0;
  }

  /** Replace literal sample values with {{variable}} placeholders (workflow-use style).
   *  mapping: exact sample string → input variable name. */
  parameterize(mapping: Record<string, string>): void {
    for (const step of this.steps) {
      if (step.value && mapping[step.value]) {
        step.value = `{{${mapping[step.value]}}}`;
      }
      if (step.url) {
        for (const [sample, name] of Object.entries(mapping)) {
          if (step.url.includes(sample)) step.url = step.url.split(sample).join(`{{${name}}}`);
        }
      }
    }
  }

  /** Build and validate the final workflow. */
  build(onFailure: Workflow["onFailure"] = "heal"): Workflow {
    return parseWorkflow({
      version: 1,
      name: this.meta.name,
      createdBy: "recorder",
      allowedDomains: this.meta.allowedDomains,
      inputs: this.meta.inputs,
      steps: this.steps,
      targets: this.targets,
      onFailure,
      budget: { maxTokens: 200_000 },
    });
  }
}
