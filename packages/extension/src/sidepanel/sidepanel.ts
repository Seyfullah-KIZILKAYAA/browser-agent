/**
 * Side panel UI: collects the task, streams live step events from the
 * background, and surfaces the human-in-the-loop approval dialog.
 */
import type { BackgroundEvent, PanelCommand } from "../shared/protocol";
import { PANEL_PORT } from "../shared/protocol";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const port = chrome.runtime.connect({ name: PANEL_PORT });
const send = (cmd: PanelCommand): void => port.postMessage(cmd);

const logEl = $<HTMLOListElement>("log");
const statusLine = $("status-line");
const tokenLine = $("token-line");
const startBtn = $<HTMLButtonElement>("start");
const cancelBtn = $<HTMLButtonElement>("cancel");
const approvalSection = $("approval");

function addLog(text: string, thought?: string): void {
  const li = document.createElement("li");
  li.textContent = text;
  if (thought) {
    const span = document.createElement("div");
    span.className = "thought";
    span.textContent = thought;
    li.appendChild(span);
  }
  logEl.appendChild(li);
  logEl.scrollTop = logEl.scrollHeight;
}

function setRunning(running: boolean): void {
  startBtn.disabled = running;
  cancelBtn.disabled = !running;
}

// --- Settings ---
const settingsSection = $("settings");
const providerSel = $<HTMLSelectElement>("provider");
const strongInput = $<HTMLInputElement>("strong-model");
const cheapInput = $<HTMLInputElement>("cheap-model");
const baseUrlLabel = $("baseurl-label");
const keyHint = $("key-hint");

/** Per-provider defaults and hints, shown when the vendor changes. */
const PROVIDER_INFO: Record<string, { strong: string; cheap: string; key: string; base?: boolean }> = {
  anthropic: { strong: "claude-opus-5", cheap: "claude-sonnet-5", key: "ANTHROPIC_API_KEY" },
  openai: { strong: "gpt-4o", cheap: "gpt-4o-mini", key: "OPENAI_API_KEY" },
  gemini: { strong: "gemini-3.6-flash", cheap: "gemini-3.5-flash-lite", key: "GEMINI_API_KEY (aistudio.google.com/apikey)" },
  openrouter: { strong: "anthropic/claude-3.5-sonnet", cheap: "openai/gpt-4o-mini", key: "OpenRouter anahtarı" },
  deepseek: { strong: "deepseek-reasoner", cheap: "deepseek-chat", key: "DeepSeek anahtarı" },
  groq: { strong: "openai/gpt-oss-120b", cheap: "openai/gpt-oss-20b", key: "Groq anahtarı (console.groq.com/keys)" },
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
  strongInput.placeholder = info.strong;
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
    send({
      kind: "setProvider",
      provider,
      apiKey: s.apiKey ?? "",
      strongModel: s.strongModel,
      cheapModel: s.cheapModel,
      baseUrl: s.baseUrl,
    });
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

// --- Task control ---
startBtn.addEventListener("click", () => {
  const task = $<HTMLTextAreaElement>("task").value.trim();
  // Accept "https://github.com/foo" and reduce it to the bare host "github.com".
  const entered = $<HTMLInputElement>("domains").value
    .split(",")
    .map((d) => d.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/^www\./i, ""))
    .filter(Boolean);
  // Empty domains = full-browser mode ("*"): any site allowed.
  const domains = entered.length ? entered : ["*"];
  if (!task) return addLog("⚠ Görev boş.");
  if (domains[0] === "*") addLog("⚠ Tüm sitelere izin verildi (sınırsız mod). Yıkıcı aksiyonlarda onay istenir.");
  // 0 (or empty) = unlimited steps; the run then stops on done/ask, budget,
  // repeated failures, or the Durdur button.
  const maxStepsRaw = Number($<HTMLInputElement>("max-steps").value);
  const maxSteps = Number.isFinite(maxStepsRaw) && maxStepsRaw > 0 ? maxStepsRaw : 0;
  if (maxSteps === 0) addLog("⚠ Adım sınırı yok. Gerekirse 'Durdur' ile durdur.");
  logEl.innerHTML = "";
  statusLine.textContent = "Çalışıyor…";
  tokenLine.textContent = "";
  setRunning(true);
  send({
    kind: "start",
    task,
    allowedDomains: domains,
    validate: $<HTMLInputElement>("validate").checked,
    maxSteps,
    mode: $<HTMLSelectElement>("mode").value === "content" ? "content" : "cdp",
  });
});
cancelBtn.addEventListener("click", () => send({ kind: "cancel" }));

$("approve-yes").addEventListener("click", () => {
  approvalSection.hidden = true;
  send({ kind: "approve", approved: true });
});
$("approve-no").addEventListener("click", () => {
  approvalSection.hidden = true;
  send({ kind: "approve", approved: false });
});

// --- Event stream ---
port.onMessage.addListener((ev: BackgroundEvent) => {
  switch (ev.kind) {
    case "log":
      addLog(ev.message);
      break;
    case "step":
      addLog(`${ev.n}. ${ev.action}`, ev.thought);
      break;
    case "approvalRequest":
      $("approval-text").textContent = `Yıkıcı aksiyon onayı gerekiyor: ${ev.description}`;
      approvalSection.hidden = false;
      break;
    case "done":
      statusLine.textContent = ev.ok ? `✓ ${ev.message}` : `✗ (${ev.reason}) ${ev.message}`;
      tokenLine.textContent = `${ev.steps} adım · ${ev.tokens} token`;
      setRunning(false);
      break;
    case "error":
      statusLine.textContent = `Hata: ${ev.message}`;
      setRunning(false);
      break;
  }
});
