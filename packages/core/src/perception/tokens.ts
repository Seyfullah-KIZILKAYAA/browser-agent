/** Rough token estimate (~4 chars/token); good enough for budget guards. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
