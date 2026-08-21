import { Condition, Step, Target, Workflow, substitute, SubstituteOptions } from "@ba/shared";
import { BrowserSession } from "../transport/session";
import { RESOLVED_SELECTOR, resolveTargetWithRetry } from "../locator/resolve";
import {
  PAGE_EXTRACT_FN,
  PAGE_SCROLL_FN,
  PAGE_TEXT_PRESENT_FN,
} from "../perception/page-script";
import { assertDomainAllowed } from "../security/allowlist";
import {
  actionDelay,
  afterNavDelay,
  DEFAULT_HUMAN,
  HumanProfile,
  Rng,
  typingPlan,
} from "../human/behavior";

export interface StepContext {
  session: BrowserSession;
  workflow: Workflow;
  subst: SubstituteOptions;
  /** extract results accumulate here */
  outputs: Record<string, string>;
  /** directory for screenshots; step screenshots are skipped when unset */
  artifactDir?: string;
  /** Human-like pacing profile; defaults to DEFAULT_HUMAN. */
  human?: HumanProfile;
  /** Seeded RNG shared across the run for reproducible timing. */
  rng?: Rng;
}

/** Human-like click: hover with a real cursor move, pause, then click. */
async function humanClick(ctx: StepContext, selector: string): Promise<void> {
  const human = ctx.human ?? DEFAULT_HUMAN;
  const rng = ctx.rng ?? new Rng(1);
  if (!human.enabled) {
    await ctx.session.click(selector);
    return;
  }
  await ctx.session.moveMouseTo(selector, human.mouseJitter);
  await ctx.session.waitMs(actionDelay(human, rng));
  await ctx.session.clickAtCursor();
}

/** Human-like typing: focus, clear, then per-character with jittered cadence. */
async function humanType(
  ctx: StepContext,
  selector: string,
  value: string,
  clearFirst: boolean,
): Promise<void> {
  const human = ctx.human ?? DEFAULT_HUMAN;
  const rng = ctx.rng ?? new Rng(1);
  if (!human.enabled) {
    await ctx.session.fill(selector, value);
    return;
  }
  await ctx.session.focusField(selector);
  if (clearFirst) await ctx.session.clearField(selector);
  await ctx.session.waitMs(actionDelay(human, rng));
  for (const { char, delayMs } of typingPlan(value, human, rng)) {
    await ctx.session.typeChar(char);
    if (delayMs > 0) await ctx.session.waitMs(delayMs);
  }
}

function targetOf(step: Step, wf: Workflow): Target {
  if (!step.target) throw new Error(`Step ${step.id} (${step.action}) has no target`);
  const t = wf.targets[step.target];
  if (!t) throw new Error(`Unknown target ref ${step.target} in step ${step.id}`);
  return t;
}

async function resolveOrFail(ctx: StepContext, step: Step): Promise<void> {
  const t = targetOf(step, ctx.workflow);
  const res = await resolveTargetWithRetry(ctx.session, t, step.timeoutMs ?? 10_000);
  if (!res.found) {
    throw new Error(`Target ${step.target} could not be resolved for step ${step.id}`);
  }
}

async function checkCondition(ctx: StepContext, cond: Condition): Promise<boolean> {
  if (cond.selectorVisible) {
    const ref = cond.selectorVisible;
    if (ref.startsWith("@")) {
      const t = ctx.workflow.targets[ref];
      if (!t) throw new Error(`Unknown target ref in condition: ${ref}`);
      const r = await resolveTargetWithRetry(ctx.session, t, 1);
      if (!r.found) return false;
    } else {
      const visible = await ctx.session.evaluate<boolean>(
        `((sel) => { var el = document.querySelector(sel); if (!el) return false;
           var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })`,
        ref,
      );
      if (!visible) return false;
    }
  }
  if (cond.textPresent) {
    const text = substitute(cond.textPresent, ctx.subst);
    const present = await ctx.session.evaluate<boolean>(PAGE_TEXT_PRESENT_FN, text);
    if (!present) return false;
  }
  if (cond.urlMatches) {
    const url = await ctx.session.currentUrl();
    const pat = cond.urlMatches;
    if (pat.startsWith("/") && pat.endsWith("/")) {
      if (!new RegExp(pat.slice(1, -1)).test(url)) return false;
    } else if (!url.includes(pat)) return false;
  }
  return true;
}

/** Execute a single workflow step deterministically (zero LLM calls). */
export async function executeStep(ctx: StepContext, step: Step): Promise<void> {
  const { session } = ctx;
  switch (step.action) {
    case "navigate": {
      if (!step.url) throw new Error(`Step ${step.id}: navigate needs url`);
      const url = substitute(step.url, ctx.subst);
      assertDomainAllowed(url, ctx.workflow.allowedDomains);
      await session.navigate(url);
      await session.waitMs(afterNavDelay(ctx.human ?? DEFAULT_HUMAN, ctx.rng ?? new Rng(1)));
      return;
    }
    case "click": {
      await resolveOrFail(ctx, step);
      await humanClick(ctx, RESOLVED_SELECTOR);
      // navigation guard: clicking may leave the allowlist
      assertDomainAllowed(await session.currentUrl(), ctx.workflow.allowedDomains);
      return;
    }
    case "type": {
      await resolveOrFail(ctx, step);
      const value = substitute(step.value ?? "", ctx.subst);
      await humanType(ctx, RESOLVED_SELECTOR, value, step.clearFirst !== false);
      return;
    }
    case "select": {
      await resolveOrFail(ctx, step);
      await session.selectOption(RESOLVED_SELECTOR, substitute(step.value ?? "", ctx.subst));
      return;
    }
    case "check": {
      await resolveOrFail(ctx, step);
      await session.setChecked(RESOLVED_SELECTOR, step.value !== "false");
      return;
    }
    case "upload": {
      await resolveOrFail(ctx, step);
      await session.setInputFiles(RESOLVED_SELECTOR, substitute(step.value ?? "", ctx.subst));
      return;
    }
    case "hover": {
      await resolveOrFail(ctx, step);
      await session.hover(RESOLVED_SELECTOR);
      return;
    }
    case "keypress": {
      await session.press(step.value ?? "Enter");
      return;
    }
    case "scroll": {
      await session.evaluate(PAGE_SCROLL_FN, step.amount ?? 600);
      await session.waitMs(200);
      return;
    }
    case "waitFor": {
      if (!step.condition) throw new Error(`Step ${step.id}: waitFor needs condition`);
      const deadline = Date.now() + (step.timeoutMs ?? 15_000);
      while (Date.now() < deadline) {
        if (await checkCondition(ctx, step.condition)) return;
        await session.waitMs(300);
      }
      throw new Error(`Step ${step.id}: waitFor timed out`);
    }
    case "assert": {
      if (!step.condition) throw new Error(`Step ${step.id}: assert needs condition`);
      if (!(await checkCondition(ctx, step.condition))) {
        throw new Error(`Step ${step.id}: assertion failed (${JSON.stringify(step.condition)})`);
      }
      return;
    }
    case "extract": {
      let selector: string | undefined;
      if (step.target) {
        await resolveOrFail(ctx, step);
        selector = RESOLVED_SELECTOR;
      }
      const text = await session.evaluate<string>(PAGE_EXTRACT_FN, {
        selector,
        maxChars: 4000,
      });
      ctx.outputs[step.into ?? step.id] = text;
      return;
    }
    case "goBack": {
      await session.goBack();
      return;
    }
    case "screenshot": {
      if (ctx.artifactDir) {
        await session.screenshot(`${ctx.artifactDir}/${step.id}.png`);
      }
      return;
    }
    case "sleep": {
      await session.waitMs(step.timeoutMs ?? 1000);
      return;
    }
    default: {
      const never: never = step.action;
      throw new Error(`Unknown action: ${String(never)}`);
    }
  }
}
