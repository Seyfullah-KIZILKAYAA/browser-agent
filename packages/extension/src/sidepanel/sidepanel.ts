/**
 * Side panel UI — a minimal chat-style surface (Claude-like): the user types a
 * task, the agent replies with a result, and the step-by-step trace is tucked
 * behind a collapsible "Adımları göster" accordion so the screen stays calm.
 */
import type { BackgroundEvent, PanelCommand } from "../shared/protocol";
import { PANEL_PORT } from "../shared/protocol";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const port = chrome.runtime.connect({ name: PANEL_PORT });
const send = (cmd: PanelCommand): void => port.postMessage(cmd);

const chat = $("chat");
const emptyState = $("empty");
const taskInput = $<HTMLTextAreaElement>("task");
const sendBtn = $<HTMLButtonElement>("send");
const cancelBtn = $<HTMLButtonElement>("cancel");
const approvalSection = $("approval");

let running = false;
/** The agent's turn currently being built (result line + steps list). */
let activeTurn: { result: HTMLElement; steps: HTMLOListElement; meta: HTMLElement } | null = null;

// --- Chat rendering ---

function addUserMessage(text: string): void {
  emptyState.hidden = true;
  const el = document.createElement("div");
  el.className = "msg user";
  el.textContent = text;
  chat.appendChild(el);
  scrollDown();
}

/** Start an agent turn: a status line + an (initially empty, hidden) steps box. */
function beginAgentTurn(): void {
  const wrap = document.createElement("div");
  wrap.className = "msg agent";

  const result = document.createElement("div");
  result.className = "result running";
  result.textContent = "Çalışıyor…";

  const stepsDetails = document.createElement("details");
  stepsDetails.className = "steps";
  stepsDetails.hidden = true; // shown once the first step arrives
  const summary = document.createElement("summary");
  summary.textContent = "Adımları göster";
  const steps = document.createElement("ol");
  stepsDetails.appendChild(summary);
  stepsDetails.appendChild(steps);

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.hidden = true;

  wrap.appendChild(result);
  wrap.appendChild(stepsDetails);
  wrap.appendChild(meta);
  chat.appendChild(wrap);
  activeTurn = { result, steps, meta };
  scrollDown();
}

function addStep(text: string, thought?: string): void {
  if (!activeTurn) return;
  const details = activeTurn.steps.parentElement as HTMLDetailsElement;
  details.hidden = false;
  const li = document.createElement("li");
  li.textContent = text;
  if (thought) {
    const t = document.createElement("div");
    t.className = "thought";
    t.textContent = thought;
    li.appendChild(t);
  }
  activeTurn.steps.appendChild(li);
  scrollDown();
}

function finishAgentTurn(text: string, kind: "ok" | "fail", meta?: string): void {
  if (!activeTurn) return;
  activeTurn.result.className = `result ${kind}`;
  activeTurn.result.textContent = text;
  if (meta) {
    activeTurn.meta.hidden = false;
    activeTurn.meta.textContent = meta;
  }
  // Collapse the steps summary label to reflect it's done.
  const summary = activeTurn.steps.parentElement?.querySelector("summary");
  if (summary && activeTurn.steps.children.length) {
    summary.textContent = `Adımları göster (${activeTurn.steps.children.length})`;
  }
  activeTurn = null;
  scrollDown();
}

function scrollDown(): void {
  chat.scrollTop = chat.scrollHeight;
}

function setRunning(on: boolean): void {
  running = on;
  cancelBtn.hidden = !on;
  sendBtn.hidden = on;
  taskInput.disabled = on;
}

// --- Settings ---
const settingsSection = $("settings");
const providerSel = $<HTMLSelectElement>("provider");
const strongInput = $<HTMLInputElement>("strong-model");
const cheapInput = $<HTMLInputElement>("cheap-model");
const baseUrlLabel = $("baseurl-label");
const keyHint = $("key-hint");

const PROVIDER_INFO: Record<string, { strong: string; cheap: string; key: string; base?: boolean }> = {
  anthropic: { strong: "claude-opus-5", cheap: "claude-sonnet-5", key: "ANTHROPIC_API_KEY" },
  openai: { strong: "gpt-4o", cheap: "gpt-4o-mini", key: "OPENAI_API_KEY" },
  gemini: { strong: "gemini-3.6-flash", cheap: "gemini-3.5-flash-lite", key: "aistudio.google.com/apikey" },
  openrouter: { strong: "anthropic/claude-3.5-sonnet", cheap: "openai/gpt-4o-mini", key: "OpenRouter anahtarı" },
  deepseek: { strong: "deepseek-reasoner", cheap: "deepseek-chat", key: "DeepSeek anahtarı" },
  groq: { strong: "openai/gpt-oss-120b", cheap: "openai/gpt-oss-20b", key: "console.groq.com/keys" },
  ollama: { strong: "llama3.1", cheap: "llama3.1", key: "gerekmez", base: true },
  custom: { strong: "gpt-4o", cheap: "gpt-4o-mini", key: "opsiyonel", base: true },
};
const DEFAULT_INFO = PROVIDER_INFO.anthropic!;

function applyProviderInfo(name: string, fillModels: boolean): void {
  const info = PROVIDER_INFO[name] ?? DEFAULT_INFO;
  keyHint.textContent = `(${info.key})`;
  baseUrlLabel.hidden = !info.base;
  if (fillModels) {
    strongInput.value = info.strong;
    cheapInput.value = info.cheap;
  }
  cheapInput.placeholder = info.cheap;
}

providerSel.addEventListener("change", () => applyProviderInfo(providerSel.value, true));
$("settings-toggle").addEventListener("click", () => {
  settingsSection.hidden = !settingsSection.hidden;
});

chrome.storage.local.get(["provider", "apiKey", "strongModel", "cheapModel", "baseUrl"], (s) => {
  const provider = s.provider ?? "anthropic";
  providerSel.value = provider;
  applyProviderInfo(provider, false);
  if (s.apiKey) $<HTMLInputElement>("api-key").value = s.apiKey;
  if (s.baseUrl) $<HTMLInputElement>("base-url").value = s.baseUrl;
  strongInput.value = s.strongModel ?? PROVIDER_INFO[provider]?.strong ?? "";
  cheapInput.value = s.cheapModel ?? PROVIDER_INFO[provider]?.cheap ?? "";
  if (s.apiKey || provider === "ollama") {
    send({ kind: "setProvider", provider, apiKey: s.apiKey ?? "", strongModel: s.strongModel, cheapModel: s.cheapModel, baseUrl: s.baseUrl });
  }
});

$("save-settings").addEventListener("click", () => {
  const provider = providerSel.value as never;
  const apiKey = $<HTMLInputElement>("api-key").value.trim();
  const strongModel = strongInput.value.trim() || undefined;
  const cheapModel = cheapInput.value.trim() || undefined;
  const baseUrl = $<HTMLInputElement>("base-url").value.trim() || undefined;
  chrome.storage.local.set({ provider, apiKey, strongModel, cheapModel, baseUrl });
  send({ kind: "setProvider", provider, apiKey, strongModel, cheapModel, baseUrl });
  settingsSection.hidden = true;
});

// --- Composer / task control ---
function submitTask(): void {
  if (running) return;
  const task = taskInput.value.trim();
  if (!task) return;

  const entered = $<HTMLInputElement>("domains").value
    .split(",")
    .map((d) => d.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/^www\./i, ""))
    .filter(Boolean);
  const domains = entered.length ? entered : ["*"];
  const maxStepsRaw = Number($<HTMLInputElement>("max-steps").value);
  const maxSteps = Number.isFinite(maxStepsRaw) && maxStepsRaw > 0 ? maxStepsRaw : 0;

  addUserMessage(task);
  taskInput.value = "";
  autoGrow();
  beginAgentTurn();
  setRunning(true);
  send({
    kind: "start",
    task,
    allowedDomains: domains,
    validate: $<HTMLInputElement>("validate").checked,
    maxSteps,
    mode: $<HTMLSelectElement>("mode").value === "content" ? "content" : "cdp",
  });
}

sendBtn.addEventListener("click", submitTask);
cancelBtn.addEventListener("click", () => send({ kind: "cancel" }));

// New chat: clear the transcript and the background conversation memory.
$("new-chat").addEventListener("click", () => {
  if (running) return;
  send({ kind: "reset" });
  chat.querySelectorAll(".msg").forEach((el) => el.remove());
  emptyState.hidden = false;
  activeTurn = null;
  taskInput.focus();
});

// Enter sends, Shift+Enter makes a newline.
taskInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    submitTask();
  }
});
function autoGrow(): void {
  taskInput.style.height = "auto";
  taskInput.style.height = Math.min(taskInput.scrollHeight, 120) + "px";
}
taskInput.addEventListener("input", autoGrow);

$("approve-yes").addEventListener("click", () => {
  approvalSection.hidden = true;
  send({ kind: "approve", approved: true });
});
$("approve-no").addEventListener("click", () => {
  approvalSection.hidden = true;
  send({ kind: "approve", approved: false });
});

// --- Event stream ---
let stepNo = 0;
port.onMessage.addListener((ev: BackgroundEvent) => {
  switch (ev.kind) {
    case "log":
      // Only surface warnings/notes as steps; routine logs already show as steps.
      addStep(ev.message);
      break;
    case "step":
      stepNo = ev.n;
      // The <ol> numbers the steps; don't repeat the number in the text.
      addStep(ev.action, ev.thought);
      break;
    case "approvalRequest":
      $("approval-text").textContent = `Onay gerekiyor: ${ev.description}`;
      approvalSection.hidden = false;
      break;
    case "done":
      finishAgentTurn(
        ev.ok ? ev.message : `Tamamlanamadı: ${ev.message}`,
        ev.ok ? "ok" : "fail",
        `${ev.steps} adım · ${ev.tokens} token`,
      );
      setRunning(false);
      stepNo = 0;
      break;
    case "error":
      finishAgentTurn(`Hata: ${ev.message}`, "fail");
      setRunning(false);
      stepNo = 0;
      break;
  }
});
