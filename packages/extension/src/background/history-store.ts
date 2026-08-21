/**
 * Persistent chat history in chrome.storage.local. Each conversation is a list
 * of turns (task + result); the side panel can list past conversations, reopen
 * one, or start a new one. Survives closing the panel and restarting Chrome.
 */

export interface Turn {
  task: string;
  result: string;
  ok: boolean;
  ts: number;
}

export interface Conversation {
  id: string;
  title: string; // first task, truncated
  turns: Turn[];
  updatedAt: number;
}

const KEY = "ba_conversations";
const MAX_CONVERSATIONS = 50;

async function readAll(): Promise<Conversation[]> {
  const data = await chrome.storage.local.get(KEY);
  return (data[KEY] as Conversation[]) ?? [];
}

async function writeAll(list: Conversation[]): Promise<void> {
  await chrome.storage.local.set({ [KEY]: list.slice(0, MAX_CONVERSATIONS) });
}

function newId(): string {
  // No Date.now() ban here (extension runtime); unique enough for local storage.
  return `c_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

/** Metadata for the conversation list (no turn bodies, keeps it light). */
export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: number;
  turnCount: number;
}

export class HistoryStore {
  /** All conversations, newest first, as lightweight summaries. */
  async list(): Promise<ConversationSummary[]> {
    const all = await readAll();
    return all
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, turnCount: c.turns.length }));
  }

  async get(id: string): Promise<Conversation | undefined> {
    return (await readAll()).find((c) => c.id === id);
  }

  /** Create an empty conversation and return its id. */
  async create(): Promise<string> {
    const all = await readAll();
    const conv: Conversation = { id: newId(), title: "Yeni sohbet", turns: [], updatedAt: Date.now() };
    all.unshift(conv);
    await writeAll(all);
    return conv.id;
  }

  /** Append a turn to a conversation (creating it if missing). */
  async addTurn(id: string, turn: Turn): Promise<void> {
    const all = await readAll();
    let conv = all.find((c) => c.id === id);
    if (!conv) {
      conv = { id, title: turn.task.slice(0, 60), turns: [], updatedAt: Date.now() };
      all.unshift(conv);
    }
    if (conv.turns.length === 0) conv.title = turn.task.slice(0, 60);
    conv.turns.push(turn);
    conv.updatedAt = Date.now();
    await writeAll(all);
  }

  async delete(id: string): Promise<void> {
    await writeAll((await readAll()).filter((c) => c.id !== id));
  }
}
