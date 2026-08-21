/**
 * Background service worker: hosts the core navigator loop and mediates between
 * the side panel (UI) and the content script (page). Architecture follows
 * nanobrowser: a named port to the panel, command/event messages, a singleton
 * "current run", and cancellation via a shared flag.
 */
import {
  BudgetGuard,
  DEFAULT_HUMAN,
  makeProvider,
  Rng,
  runNavigator,
  type Approver,
  type ProviderConfig,
} from "@ba/core/browser";
import type { BackgroundEvent, PanelCommand, ProviderName } from "../shared/protocol";
import { PANEL_PORT } from "../shared/protocol";
import { ExtensionSession } from "./extension-session";
import { CdpExtensionSession } from "./cdp-session";
import type { BrowserSession } from "@ba/core/browser";

interface RunState {
  cancelled: boolean;
  /** Pending approval resolver, set while an approvalRequest is outstanding. */
  resolveApproval?: (approved: boolean) => void;
}

let providerName: ProviderName = "anthropic";
let apiKey = "";
let strongModel = "claude-opus-5";
let cheapModel = "claude-sonnet-5";
let baseUrl: string | undefined;
let current: RunState | null = null;

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PANEL_PORT) return;
  const post = (ev: BackgroundEvent): void => port.postMessage(ev);

  port.onMessage.addListener((cmd: PanelCommand) => {
    void handleCommand(cmd, post);
  });

  port.onDisconnect.addListener(() => {
    if (current) current.cancelled = true;
  });
});

async function handleCommand(cmd: PanelCommand, post: (ev: BackgroundEvent) => void): Promise<void> {
  switch (cmd.kind) {
    case "setProvider":
      providerName = cmd.provider;
      apiKey = cmd.apiKey;
      if (cmd.strongModel) strongModel = cmd.strongModel;
      if (cmd.cheapModel) cheapModel = cmd.cheapModel;
      baseUrl = cmd.baseUrl;
      post({ kind: "log", message: `Sağlayıcı ayarlandı: ${providerName}` });
      return;
    case "cancel":
      if (current) current.cancelled = true;
      post({ kind: "log", message: "İptal istendi." });
      return;
    case "approve":
      current?.resolveApproval?.(cmd.approved);
      return;
    case "start":
      await startRun(cmd, post);
      return;
  }
}

async function startRun(
  cmd: Extract<PanelCommand, { kind: "start" }>,
  post: (ev: BackgroundEvent) => void,
): Promise<void> {
  if (current) {
    post({ kind: "error", message: "Zaten çalışan bir görev var." });
    return;
  }
  // Ollama and custom local endpoints may not need a key.
  if (!apiKey && providerName !== "ollama" && providerName !== "custom") {
    post({ kind: "error", message: "Önce sağlayıcıyı ve API anahtarını ayarla (⚙)." });
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    post({ kind: "error", message: "Aktif sekme bulunamadı." });
    return;
  }
  if (tab.url?.startsWith("chrome://") || tab.url?.startsWith("edge://")) {
    post({ kind: "error", message: "Tarayıcı iç sayfalarında çalışılamaz. Bir web sitesine geç." });
    return;
  }

  const state: RunState = { cancelled: false };
  current = state;

  // CDP mode drives via chrome.debugger (real OS mouse/coordinate input);
  // content mode uses DOM events. CDP falls back to content on attach failure.
  let session: BrowserSession;
  let usedMode = cmd.mode;
  if (cmd.mode === "cdp") {
    try {
      session = await CdpExtensionSession.attach(tab.id);
      post({ kind: "log", message: "CDP moduna bağlanıldı (gerçek mouse/klavye). 'Debugging' çubuğu normaldir." });
    } catch (err) {
      usedMode = "content";
      session = new ExtensionSession(tab.id);
      post({ kind: "log", message: `CDP bağlanamadı (${err instanceof Error ? err.message : err}); content-script moduna düşüldü.` });
    }
  } else {
    session = new ExtensionSession(tab.id);
  }

  const budget = new BudgetGuard(500_000);
  // Live agent uses the cheap/step model tier through the chosen vendor.
  const providerCfg: ProviderConfig = {
    provider: providerName,
    model: cheapModel,
    apiKey: apiKey || undefined,
    baseUrl,
  };
  const provider = makeProvider(providerCfg);
  void strongModel; // reserved for a future planner call in the extension

  const approver: Approver = (_step, context) =>
    new Promise<boolean>((resolve) => {
      state.resolveApproval = resolve;
      post({ kind: "approvalRequest", description: context });
    });

  try {
    const result = await runNavigator({
      session,
      provider,
      budget,
      task: cmd.task,
      allowedDomains: cmd.allowedDomains,
      approver,
      human: DEFAULT_HUMAN,
      rng: new Rng(42),
      validate: cmd.validate,
      maxSteps: cmd.maxSteps,
      shouldCancel: () => state.cancelled,
      log: (message) => {
        // navigator logs each step as "step N: <action> — <thought>". Split it
        // into a structured step event so the UI can render it cleanly; other
        // lines (failures, notes) go through as plain log messages.
        const m = message.match(/^step (\d+):\s*(.+?)(?:\s+—\s+(.*))?$/);
        if (m) {
          post({ kind: "step", n: Number(m[1]), action: m[2]!.trim(), thought: (m[3] ?? "").trim() });
        } else {
          post({ kind: "log", message: message.trim() });
        }
      },
    });
    void usedMode; // mode is internal; keep the user-facing message clean
    post({
      kind: "done",
      ok: result.done,
      reason: result.reason,
      message: result.message,
      steps: result.steps,
      tokens: budget.total,
    });
  } catch (err) {
    post({ kind: "error", message: err instanceof Error ? err.message : String(err) });
  } finally {
    // Detach the debugger / release the session.
    try {
      await session.close();
    } catch {
      /* ignore */
    }
    current = null;
  }
}

// Keep the service worker alive during a run via a self-ping alarm.
chrome.alarms.create("ba-heartbeat", { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener(() => {
  // No-op: waking the SW is enough to reset its idle timer during long runs.
});
