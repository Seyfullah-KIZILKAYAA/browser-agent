/**
 * Message protocol between the extension's three contexts:
 *   side panel  ──command──▶  background service worker  ──action──▶  content script
 *   side panel  ◀──event───   background service worker  ◀─result──   content script
 *
 * The background runs the core navigator loop; the content script performs the
 * actual DOM reads/interactions inside the real, logged-in page.
 */

/** How the background drives the page. */
export type DriveMode = "cdp" | "content";

/** LLM vendor the extension talks to. */
export type ProviderName =
  | "anthropic" | "openai" | "gemini" | "openrouter" | "deepseek" | "groq" | "ollama" | "custom";

/** An uploaded file the agent can work from. */
export interface AttachedFile {
  name: string;
  mime: string;
  /** Extracted text content (for txt/csv/json/md); truncated for large files. */
  text: string;
}

/** Side panel → background: user commands. */
export type PanelCommand =
  | {
      kind: "start";
      task: string;
      allowedDomains: string[];
      validate: boolean;
      maxSteps: number;
      mode: DriveMode;
      conversationId: string;
      files?: AttachedFile[];
    }
  | { kind: "cancel" }
  | { kind: "reset" }
  | { kind: "approve"; approved: boolean }
  | { kind: "listConversations" }
  | { kind: "loadConversation"; id: string }
  | { kind: "deleteConversation"; id: string }
  | {
      kind: "setProvider";
      provider: ProviderName;
      apiKey: string;
      strongModel?: string;
      cheapModel?: string;
      baseUrl?: string;
    };

/** A persisted conversation summary for the history list. */
export interface ConversationInfo {
  id: string;
  title: string;
  updatedAt: number;
  turnCount: number;
}

/** A single persisted turn (for reopening a conversation). */
export interface PersistedTurn {
  task: string;
  result: string;
  ok: boolean;
}

/** Background → side panel: live progress events. */
export type BackgroundEvent =
  | { kind: "log"; message: string }
  | { kind: "step"; n: number; action: string; thought: string }
  | { kind: "approvalRequest"; description: string }
  | { kind: "done"; ok: boolean; reason: string; message: string; steps: number; tokens: number }
  | { kind: "error"; message: string }
  | { kind: "conversations"; list: ConversationInfo[] }
  | { kind: "conversation"; id: string; turns: PersistedTurn[] }
  | { kind: "tabInfo"; message: string }; // e.g. "yeni sekme açıldı"

/** Background → content: one DOM operation to perform in the page. */
export type ContentRequest =
  | { op: "evaluate"; fn: string; arg?: unknown }
  | { op: "click"; selector: string }
  | { op: "fill"; selector: string; value: string }
  | { op: "selectOption"; selector: string; value: string }
  | { op: "setChecked"; selector: string; checked: boolean }
  | { op: "hover"; selector: string }
  | { op: "press"; key: string }
  | { op: "scrollBy"; amount: number }
  | { op: "currentUrl" };

/** Content → background: result of a DOM operation. */
export type ContentResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

export const PANEL_PORT = "ba-side-panel";
