import {
  parseWorkflow,
  Step,
  Target,
  Workflow,
  WorkflowInput,
  substitute,
} from "@ba/shared";
import { BrowserSession } from "../transport/session";
import { renderSnapshot, takeSnapshot } from "../perception/snapshot";
import { PAGE_CAPTURE_FN, PAGE_SCROLL_FN, PAGE_TEXT_PRESENT_FN } from "../perception/page-script";
import { assertDomainAllowed } from "../security/allowlist";
import { LLMProvider } from "../llm/provider";
import { BudgetGuard } from "../llm/budget";
import { extractJson } from "./json";
import { COMPILER_SYSTEM, wrapUntrusted } from "./prompts";

interface CompilerDecision {
  done: boolean;
  note?: string;
  risk?: "read" | "write" | "destructive";
  action?: {
    action: string;
    index?: number | null;
    value?: string | null;
    url?: string | null;
    text?: string | null;
  };
}

export interface CompileOptions {
  session: BrowserSession;
  provider: LLMProvider;
  budget: BudgetGuard;
  task: string;
  startUrl: string;
  name: string;
  allowedDomains: string[];
  inputs: WorkflowInput[];
  /** Sample values used to actually drive the page during compilation.
   *  The IR stores the {{placeholder}}, never the sample value. */
  sampleVars: Record<string, string>;
  maxSteps?: number;
  log?: (msg: string) => void;
}

function envSecretResolver(name: string): string | undefined {
  return process.env["BA_SECRET_" + name.toUpperCase().replace(/[^A-Z0-9]/g, "_")];
}

/**
 * COMPILE mode: the model explores the task once; every action is recorded as
 * an IR step with a captured multi-layer locator. Output replays with 0 tokens.
 */
export async function compileWorkflow(opts: CompileOptions): Promise<Workflow> {
  const { session, provider, budget } = opts;
  const steps: Step[] = [];
  const targets: Record<string, Target> = {};
  const history: string[] = [];
  const subst = { vars: opts.sampleVars, resolveSecret: envSecretResolver };
  let stepNo = 0;
  let targetNo = 0;

  const record = (step: Omit<Step, "id" | "risk"> & { risk?: Step["risk"] }): void => {
    stepNo += 1;
    steps.push({ id: `s${stepNo}`, risk: step.risk ?? "read", ...step } as Step);
  };

  // Step 1 is always the parameterized entry navigation.
  const startUrlResolved = substitute(opts.startUrl, subst);
  assertDomainAllowed(startUrlResolved, opts.allowedDomains);
  await session.navigate(startUrlResolved);
  record({ action: "navigate", url: opts.startUrl, note: "open start page" });
  history.push(`s1 navigate ${opts.startUrl}`);

  const inputsDesc =
    opts.inputs.length > 0
      ? opts.inputs.map((i) => `{{${i.name}}} (sample: "${opts.sampleVars[i.name] ?? ""}")`).join(", ")
      : "(none)";

  const maxSteps = opts.maxSteps ?? 25;
  for (let turn = 0; turn < maxSteps; turn++) {
    await session.waitMs(600);
    const snap = await takeSnapshot(session);
    const prompt = [
      `Task: ${opts.task}`,
      `Input variables: ${inputsDesc}`,
      `Steps so far:\n${history.slice(-6).join("\n")}`,
      "",
      "Current page:",
      wrapUntrusted(renderSnapshot(snap)),
    ].join("\n");

    const res = await provider.complete({
      system: COMPILER_SYSTEM,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 400,
    });
    budget.record(res.usage, "compiler");
    const decision = extractJson<CompilerDecision>(res.text);

    if (decision.done) {
      opts.log?.(`compile done: ${decision.note ?? ""} — ${budget.report()}`);
      break;
    }
    const a = decision.action;
    if (!a) throw new Error("Compiler decision has neither done nor action");
    const note = decision.note ?? a.action;
    const risk = decision.risk ?? "read";
    opts.log?.(`compile step: ${a.action} ${a.index ?? a.url ?? a.text ?? ""} — ${note}`);

    const captureTarget = async (index: number): Promise<string> => {
      const t = await session.evaluate<Target | null>(PAGE_CAPTURE_FN, index);
      if (!t) throw new Error(`Cannot capture locator for element [${index}]`);
      targetNo += 1;
      const ref = `@t${targetNo}`;
      targets[ref] = t;
      return ref;
    };
    const indexSelector = (index: number): string => `[data-ba-i="${index}"]`;

    switch (a.action) {
      case "navigate": {
        if (!a.url) throw new Error("navigate without url");
        const url = substitute(a.url, subst);
        assertDomainAllowed(url, opts.allowedDomains);
        await session.navigate(url);
        record({ action: "navigate", url: a.url, note, risk });
        history.push(`s${stepNo} navigate ${a.url}`);
        break;
      }
      case "click": {
        if (a.index == null) throw new Error("click without index");
        const ref = await captureTarget(a.index);
        await session.click(indexSelector(a.index));
        assertDomainAllowed(await session.currentUrl(), opts.allowedDomains);
        record({ action: "click", target: ref, note, risk });
        history.push(`s${stepNo} click "${targets[ref]!.name ?? ""}"`);
        break;
      }
      case "type": {
        if (a.index == null || a.value == null) throw new Error("type without index/value");
        const ref = await captureTarget(a.index);
        await session.fill(indexSelector(a.index), substitute(a.value, subst));
        record({ action: "type", target: ref, value: a.value, clearFirst: true, note, risk });
        history.push(`s${stepNo} type "${targets[ref]!.name ?? ""}" = ${a.value}`);
        break;
      }
      case "select": {
        if (a.index == null || a.value == null) throw new Error("select without index/value");
        const ref = await captureTarget(a.index);
        await session.selectOption(indexSelector(a.index), substitute(a.value, subst));
        record({ action: "select", target: ref, value: a.value, note, risk });
        history.push(`s${stepNo} select ${a.value}`);
        break;
      }
      case "check": {
        if (a.index == null) throw new Error("check without index");
        const ref = await captureTarget(a.index);
        await session.setChecked(indexSelector(a.index), a.value !== "false");
        record({ action: "check", target: ref, value: a.value ?? "true", note, risk });
        history.push(`s${stepNo} check`);
        break;
      }
      case "scroll": {
        await session.evaluate(PAGE_SCROLL_FN, 600);
        record({ action: "scroll", amount: 600, note, risk: "read" });
        history.push(`s${stepNo} scroll`);
        break;
      }
      case "keypress": {
        await session.press(a.value ?? "Enter");
        record({ action: "keypress", value: a.value ?? "Enter", note, risk });
        history.push(`s${stepNo} keypress ${a.value ?? "Enter"}`);
        break;
      }
      case "waitForText": {
        if (!a.text) throw new Error("waitForText without text");
        record({
          action: "waitFor",
          condition: { textPresent: a.text },
          timeoutMs: 15_000,
          note,
          risk: "read",
        });
        const present = await session.evaluate<boolean>(PAGE_TEXT_PRESENT_FN, substitute(a.text, subst));
        history.push(`s${stepNo} waitForText "${a.text}" (${present ? "seen" : "NOT SEEN"})`);
        break;
      }
      case "extract": {
        record({ action: "extract", into: a.value ?? `extract_${stepNo + 1}`, note, risk: "read" });
        history.push(`s${stepNo} extract`);
        break;
      }
      default:
        throw new Error(`Compiler chose unknown action: ${a.action}`);
    }
  }

  if (steps.length <= 1) throw new Error("Compilation produced no actionable steps");

  return parseWorkflow({
    version: 1,
    name: opts.name,
    createdBy: "compile",
    allowedDomains: opts.allowedDomains,
    inputs: opts.inputs,
    steps,
    targets,
    onFailure: "heal",
    budget: { maxTokens: 200_000 },
  });
}
