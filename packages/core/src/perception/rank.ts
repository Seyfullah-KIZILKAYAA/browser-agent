import { SnapshotElement } from "./snapshot";

/**
 * BM25 ranking of snapshot elements against a query (perception ladder K3).
 * On a 200-element page, this surfaces the ~top-k elements relevant to the
 * agent's current goal instead of dumping everything — the caveman-browse
 * "top matches + keep the rest recoverable" idea, applied to our element list.
 *
 * Elements are never dropped silently: rankElements returns the ranked subset
 * plus how many were held back, so the caller can report the truncation.
 */

const K1 = 1.5;
const B = 0.75;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1);
}

function docText(el: SnapshotElement): string {
  return `${el.role} ${el.name} ${el.states.join(" ")}`;
}

export interface RankResult {
  elements: SnapshotElement[];
  heldBack: number;
}

/**
 * Return the top-k elements by BM25 relevance to the query, always keeping a
 * few always-useful controls (submit/search/next) even if unmatched.
 */
export function rankElements(
  elements: SnapshotElement[],
  query: string,
  topK: number,
): RankResult {
  if (elements.length <= topK) return { elements, heldBack: 0 };

  const qTerms = tokenize(query);
  if (qTerms.length === 0) {
    return { elements: elements.slice(0, topK), heldBack: elements.length - topK };
  }

  const docs = elements.map((el) => tokenize(docText(el)));
  const avgLen = docs.reduce((s, d) => s + d.length, 0) / docs.length;

  // Stem-aware match: query term matches a doc term on a shared prefix ≥4 chars.
  // This handles Turkish suffixes ("sepet" ~ "sepete", "fiyat" ~ "fiyatı").
  const matches = (qTerm: string, docTerm: string): boolean => {
    if (qTerm === docTerm) return true;
    const min = Math.min(qTerm.length, docTerm.length);
    if (min < 4) return false;
    const prefix = Math.min(qTerm.length, docTerm.length, Math.max(4, min - 2));
    return qTerm.slice(0, prefix) === docTerm.slice(0, prefix);
  };
  const stemTf = (doc: string[], qTerm: string): number =>
    doc.filter((t) => matches(qTerm, t)).length;

  // Document frequency per query term (stem-aware).
  const df = new Map<string, number>();
  for (const term of new Set(qTerms)) {
    df.set(term, docs.filter((d) => stemTf(d, term) > 0).length);
  }
  const N = docs.length;
  const idf = (term: string): number => {
    const n = df.get(term) ?? 0;
    return Math.log(1 + (N - n + 0.5) / (n + 0.5));
  };

  const scored = elements.map((el, i) => {
    const doc = docs[i]!;
    let score = 0;
    for (const term of qTerms) {
      const tf = stemTf(doc, term);
      if (tf === 0) continue;
      const denom = tf + K1 * (1 - B + (B * doc.length) / avgLen);
      score += idf(term) * ((tf * (K1 + 1)) / denom);
    }
    return { el, score, i };
  });

  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  const top = scored.slice(0, topK);
  // Keep the original DOM order within the selected subset for stable indices.
  const selected = new Set(top.map((s) => s.i));
  const ordered = elements.filter((_, i) => selected.has(i));
  return { elements: ordered, heldBack: elements.length - ordered.length };
}
