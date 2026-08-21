import { BrowserSession } from "../transport/session";
import { PAGE_SNAPSHOT_FN } from "./page-script";
import { estimateTokens } from "./tokens";
import { rankElements } from "./rank";

export interface SnapshotElement {
  i: number;
  role: string;
  name: string;
  states: string[];
}

export interface Snapshot {
  url: string;
  title: string;
  scrollY: number;
  scrollMax: number;
  truncated: boolean;
  elements: SnapshotElement[];
}

/** Take a filtered, action-oriented snapshot (perception ladder step K1). */
export async function takeSnapshot(
  session: BrowserSession,
  opts: { maxElements?: number } = {},
): Promise<Snapshot> {
  return session.evaluate<Snapshot>(PAGE_SNAPSHOT_FN, {
    maxElements: opts.maxElements ?? 150,
  });
}

/** Stable identity of an element for cross-snapshot diffing (role + name). */
function elementKey(el: SnapshotElement): string {
  return `${el.role}|${el.name}`;
}

/**
 * Render a snapshot as a compact line-based plain text (not JSON — braces burn
 * tokens). This exact string is what goes into LLM context.
 *
 * When `prev` is given, elements not present in it are prefixed with `*` — the
 * "new since last step" marker (browser-use / nanobrowser convention). It is a
 * cheap, high-value signal of what changed after an action.
 */
export interface RenderOptions {
  /** Previous snapshot; elements new since it get a `*` prefix. */
  prev?: Snapshot;
  /**
   * K3: when the page has more than `rankThreshold` elements, keep only the
   * top-`rankTopK` most relevant to this query (BM25). Held-back count is noted.
   */
  query?: string;
  rankThreshold?: number;
  rankTopK?: number;
}

export function renderSnapshot(snap: Snapshot, optsOrPrev?: RenderOptions | Snapshot): string {
  // Back-compat: second arg used to be `prev`.
  const opts: RenderOptions =
    optsOrPrev && "elements" in optsOrPrev ? { prev: optsOrPrev } : (optsOrPrev ?? {});
  const prevKeys = opts.prev ? new Set(opts.prev.elements.map(elementKey)) : null;

  let elements = snap.elements;
  let heldBack = 0;
  const threshold = opts.rankThreshold ?? 60;
  if (opts.query && snap.elements.length > threshold) {
    const ranked = rankElements(snap.elements, opts.query, opts.rankTopK ?? 30);
    elements = ranked.elements;
    heldBack = ranked.heldBack;
  }

  const lines: string[] = [];
  lines.push(`url: ${snap.url}`);
  lines.push(`title: ${snap.title}`);
  if (snap.scrollMax > 0) lines.push(`scroll: ${snap.scrollY}/${snap.scrollMax}`);
  for (const el of elements) {
    const states = el.states.length ? ` (${el.states.join(", ")})` : "";
    const isNew = prevKeys && !prevKeys.has(elementKey(el)) ? "*" : "";
    lines.push(`${isNew}[${el.i}] ${el.role} "${el.name}"${states}`);
  }
  if (heldBack > 0) {
    lines.push(`(göreve en alakalı ${elements.length} eleman gösteriliyor; ${heldBack} eleman gizlendi — gerekirse daha genel bir sorgu ver)`);
  }
  if (snap.truncated) lines.push("(daha fazla eleman kesildi — gerekirse scroll)");
  return lines.join("\n");
}

/** Rendered snapshot + its token estimate, for budget accounting and debug output. */
export function renderWithTokenCount(
  snap: Snapshot,
  opts?: RenderOptions,
): { text: string; tokens: number } {
  const text = renderSnapshot(snap, opts);
  return { text, tokens: estimateTokens(text) };
}
