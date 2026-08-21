import { Target } from "@ba/shared";
import { BrowserSession } from "../transport/session";
import { renderSnapshot, Snapshot, takeSnapshot } from "../perception/snapshot";
import { PAGE_CAPTURE_FN, PAGE_SCROLL_FN, PAGE_TEXT_PRESENT_FN } from "../perception/page-script";
import { assertDomainAllowed } from "../security/allowlist";
import { Approver } from "../security/approval";
import { LLMProvider } from "../llm/provider";
import { BudgetGuard } from "../llm/budget";
import { DEFAULT_HUMAN, HumanProfile, Rng } from "../human/behavior";
import { extractJson } from "./json";
import { NAVIGATOR_SYSTEM, VALIDATOR_SYSTEM, wrapUntrusted } from "./prompts";
import { AgentMemory } from "./memory";
import { TraceWriter } from "../telemetry/trace";

interface NavAction {
  type: string;
  index?: number | null;
  value?: string | null;
  text?: string | null;
}
interface NavDecision {
  thought: string;
  action: NavAction;
  risk?: "read" | "write" | "destructive";
}
interface Validation {
  success: boolean;
  reason: string;
  taskComplete: boolean;
}

/** Recorded action, used by the recorder to build a replayable workflow. */
export interface RecordedAction {
  action: NavAction;
  target: Target | null;
  note: string;
  risk: "read" | "write" | "destructive";
}

export interface NavigatorOptions {
  session: BrowserSession;
  provider: LLMProvider;
  budget: BudgetGuard;
  task: string;
  /** Prior turns in this session, so a follow-up task keeps context. */
  history?: { task: string; result: string }[];
  /** Files the user attached; their text is provided to the model as input. */
  files?: { name: string; text: string }[];
  allowedDomains: string[];
  approver?: Approver;
  human?: HumanProfile;
  rng?: Rng;
  /** Independent validator call after each step (catches silent failures). */
  validate?: boolean;
  maxSteps?: number;
  maxConsecutiveFailures?: number;
  trace?: TraceWriter;
  /** Called with each executed action so a recorder can assemble a workflow. */
  onAction?: (rec: RecordedAction) => void;
  /** Return true to stop the loop cleanly at the next step boundary. */
  shouldCancel?: () => boolean;
  /** Per-domain locator cache; successful click/type targets are remembered. */
  profiles?: import("../memory/site-profile").SiteProfileCache;
  log?: (msg: string) => void;
}

export interface NavigatorResult {
  done: boolean;
  /** "done" | "ask" | "budget" | "maxSteps" | "failures" | "error" */
  reason: string;
  message: string;
  steps: number;
}

/** Turn a numbered element index into the CSS selector the snapshot tagged it with. */
function indexSelector(i: number): string {
  return `[data-ba-i="${i}"]`;
}

/**
 * Live autonomous agent: reads the page, decides ONE action, acts like a human,
 * validates against fresh page state, repeats — the OODA/ReAct loop. This is the
 * "someone is sitting at the browser doing the work" mode.
 *
 * It also emits each action via onAction, so a recorder can compile the live run
 * into a zero-token replayable workflow (Stagehand observe→cache pattern).
 */
export async function runNavigator(opts: NavigatorOptions): Promise<NavigatorResult> {
  const { session, provider, budget } = opts;
  const human = opts.human ?? DEFAULT_HUMAN;
  const rng = opts.rng ?? new Rng(1);
  const memory = new AgentMemory(3);
  // maxSteps <= 0 means unlimited: the run then stops only on done/ask, the
  // token/USD budget, consecutive failures, or user cancel — no step ceiling.
  const maxSteps = opts.maxSteps ?? 30;
  const unlimited = maxSteps <= 0;
  const maxFailures = opts.maxConsecutiveFailures ?? 3;
  let consecutiveFailures = 0;
  let prevSnap: Snapshot | undefined;

  for (let step = 1; unlimited || step <= maxSteps; step++) {
    if (opts.shouldCancel?.()) {
      return { done: false, reason: "cancelled", message: "Kullanici iptal etti", steps: step - 1 };
    }
    if (human.enabled) await session.waitMs(rng.int(300, 700));
    const snap = await takeSnapshot(session);

    // Prior turns give a follow-up ("also search other sites") the context of
    // what was already done, so it continues instead of starting over.
    const priorContext =
      opts.history && opts.history.length
        ? "Earlier in this conversation:\n" +
          opts.history.map((h, i) => `${i + 1}. Task: ${h.task}\n   Result: ${h.result}`).join("\n") +
          "\n\n"
        : "";

    // Attached files (trusted user input) are shown once per turn, truncated.
    const fileContext =
      opts.files && opts.files.length
        ? "Attached files:\n" +
          opts.files.map((f) => `--- ${f.name} ---\n${f.text.slice(0, 4000)}`).join("\n\n") +
          "\n\n"
        : "";

    const prompt = [
      priorContext + fileContext + `Current task: ${opts.task}`,
      "",
      `Memory (this task's steps):\n${memory.render()}`,
      "",
      "Current page (a * marks elements new since your last step):",
      // K3: on large pages, rank elements by relevance to the task to cut tokens.
      wrapUntrusted(renderSnapshot(snap, { prev: prevSnap, query: opts.task })),
    ].join("\n");
    prevSnap = snap;

    const res = await provider.complete({
      system: NAVIGATOR_SYSTEM,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 500,
    });
    budget.record(res.usage, "navigator");
    const decision = extractJson<NavDecision>(res.text);
    const a = decision.action;
    const risk = decision.risk ?? "read";
    opts.log?.(`step ${step}: ${a.type} ${a.index ?? a.value ?? ""} — ${decision.thought}`);

    if (a.type === "done") {
      return { done: true, reason: "done", message: a.text ?? "Tamamlandi", steps: step };
    }
    if (a.type === "ask") {
      return { done: false, reason: "ask", message: a.text ?? "Kullanici girdisi gerekli", steps: step };
    }

    // Destructive gate before executing.
    if (risk === "destructive") {
      if (!opts.approver) {
        return { done: false, reason: "error", message: `Onaysiz yikici aksiyon reddedildi (${a.type})`, steps: step };
      }
      const ok = await opts.approver(
        { id: `nav${step}`, action: "click", risk: "destructive" } as never,
        `gorev "${opts.task}": ${decision.thought}`,
      );
      if (!ok) return { done: false, reason: "ask", message: "Kullanici yikici aksiyonu reddetti", steps: step };
    }

    let target: Target | null = null;
    let expected = "";
    try {
      switch (a.type) {
        case "navigate": {
          if (!a.value) throw new Error("navigate without url");
          assertDomainAllowed(a.value, opts.allowedDomains);
          await session.navigate(a.value);
          expected = `page at ${a.value} loaded`;
          break;
        }
        case "click": {
          if (a.index == null) throw new Error("click without index");
          target = await session.evaluate<Target | null>(PAGE_CAPTURE_FN, a.index);
          await session.click(indexSelector(a.index));
          assertDomainAllowed(await session.currentUrl(), opts.allowedDomains);
          expected = `clicked "${target?.name ?? a.index}"`;
          break;
        }
        case "type": {
          if (a.index == null || a.value == null) throw new Error("type without index/value");
          target = await session.evaluate<Target | null>(PAGE_CAPTURE_FN, a.index);
          await session.fill(indexSelector(a.index), a.value);
          expected = `typed into "${target?.name ?? a.index}"`;
          break;
        }
        case "select": {
          if (a.index == null || a.value == null) throw new Error("select without index/value");
          target = await session.evaluate<Target | null>(PAGE_CAPTURE_FN, a.index);
          await session.selectOption(indexSelector(a.index), a.value);
          expected = `selected ${a.value}`;
          break;
        }
        case "check": {
          if (a.index == null) throw new Error("check without index");
          target = await session.evaluate<Target | null>(PAGE_CAPTURE_FN, a.index);
          await session.setChecked(indexSelector(a.index), a.value !== "false");
          expected = "toggled checkbox";
          break;
        }
        case "scroll": {
          await session.evaluate(PAGE_SCROLL_FN, 600);
          expected = "scrolled down";
          break;
        }
        case "keypress": {
          await session.press(a.value ?? "Enter");
          expected = `pressed ${a.value ?? "Enter"}`;
          break;
        }
        case "wait": {
          const deadline = Date.now() + 10_000;
          let seen = false;
          while (Date.now() < deadline) {
            if (a.text && (await session.evaluate<boolean>(PAGE_TEXT_PRESENT_FN, a.text))) {
              seen = true;
              break;
            }
            await session.waitMs(400);
          }
          expected = a.text ? `text "${a.text}" ${seen ? "appeared" : "did NOT appear"}` : "waited";
          break;
        }
        case "extract": {
          expected = "extracted page text";
          break;
        }
        case "listTabs": {
          if (!session.listTabs) throw new Error("Bu oturum çoklu sekme desteklemiyor");
          const tabs = await session.listTabs();
          expected =
            "open tabs:\n" +
            tabs.map((t) => `  #${t.id}${t.active ? " (aktif)" : ""}: ${t.title} — ${t.url}`).join("\n");
          break;
        }
        case "newTab": {
          if (!session.openTab) throw new Error("Bu oturum çoklu sekme desteklemiyor");
          const url = a.value || undefined;
          if (url) assertDomainAllowed(url, opts.allowedDomains);
          const tab = await session.openTab(url);
          expected = `opened new tab #${tab.id}${url ? ` at ${url}` : ""}`;
          break;
        }
        case "switchTab": {
          if (!session.switchTab) throw new Error("Bu oturum çoklu sekme desteklemiyor");
          const id = Number(a.value ?? a.index);
          if (!Number.isFinite(id)) throw new Error("switchTab needs a tab id in value");
          await session.switchTab(id);
          expected = `switched to tab #${id}`;
          break;
        }
        default:
          throw new Error(`Unknown action type: ${a.type}`);
      }
      opts.onAction?.({ action: a, target, note: decision.thought, risk });
      // Switching/opening a tab changes the page entirely; the new-element diff
      // from the previous tab no longer applies.
      if (a.type === "switchTab" || a.type === "newTab") prevSnap = undefined;
      const nowUrl = await session.currentUrl();
      // Remember successful element locators per domain for future reuse.
      if (opts.profiles && target && (a.type === "click" || a.type === "type")) {
        await opts.profiles.remember(nowUrl, decision.thought, target);
      }
      opts.trace?.write({
        ts: new Date().toISOString(),
        stepId: `nav${step}`,
        action: a.type,
        url: nowUrl,
        ok: true,
        durationMs: 0,
      });
      consecutiveFailures = 0;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      memory.add({ n: step, thought: decision.thought, action: a.type, outcome: `FAILED: ${msg} — try a different element or approach, do not repeat` });
      opts.log?.(`  step ${step} failed: ${msg}`);
      opts.trace?.write({
        ts: new Date().toISOString(),
        stepId: `nav${step}`,
        action: a.type,
        ok: false,
        error: msg,
        durationMs: 0,
      });
      if (++consecutiveFailures >= maxFailures) {
        return { done: false, reason: "failures", message: `${maxFailures} ardisik hata: ${msg}`, steps: step };
      }
      prevSnap = undefined; // force a fresh full read next turn
      continue;
    }

    // Optional independent validation grounded in fresh page state (Skyvern pattern).
    let outcome = expected;
    if (opts.validate) {
      await session.waitMs(400);
      const after = await takeSnapshot(session);
      const vRes = await provider.complete({
        system: VALIDATOR_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              `Task: ${opts.task}`,
              `Action taken: ${a.type} (${decision.thought})`,
              `Expected: ${expected}`,
              "Page after:",
              wrapUntrusted(renderSnapshot(after)),
            ].join("\n"),
          },
        ],
        maxTokens: 150,
      });
      budget.record(vRes.usage, "validator");
      const v = extractJson<Validation>(vRes.text);
      outcome = `${expected} — ${v.success ? "OK" : "NOT OK"}: ${v.reason}`;
      prevSnap = after;
      if (v.taskComplete) {
        memory.add({ n: step, thought: decision.thought, action: a.type, outcome });
        return { done: true, reason: "done", message: v.reason, steps: step };
      }
    }
    memory.add({ n: step, thought: decision.thought, action: a.type, outcome });
  }

  return { done: false, reason: "maxSteps", message: `${maxSteps} adim asildi`, steps: maxSteps };
}
