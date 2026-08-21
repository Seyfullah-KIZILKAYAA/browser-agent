/**
 * Human-like interaction timing. A real person does not fill a field instantly
 * or click the microsecond a page loads. These helpers add bounded, varied
 * delays and per-character typing so automation reads as a human session.
 *
 * Determinism note: randomness is seeded per-run so traces stay reproducible.
 */

export interface HumanProfile {
  /** Enable human-like pacing at all. When false, everything runs at full speed. */
  enabled: boolean;
  /** Milliseconds per character when typing (base; jittered ±40%). */
  typeMsPerChar: number;
  /** Pause before an action, ms range [min, max]. */
  actionDelayMs: [number, number];
  /** Extra pause after navigation settles, ms range. */
  afterNavMs: [number, number];
  /** Occasionally overshoot then correct on click (moveMouse only). */
  mouseJitter: boolean;
}

export const DEFAULT_HUMAN: HumanProfile = {
  enabled: true,
  typeMsPerChar: 55,
  actionDelayMs: [180, 520],
  afterNavMs: [400, 1100],
  mouseJitter: true,
};

export const FAST_ROBOT: HumanProfile = {
  enabled: false,
  typeMsPerChar: 0,
  actionDelayMs: [0, 0],
  afterNavMs: [0, 0],
  mouseJitter: false,
};

/** Small seeded PRNG (mulberry32) so runs are reproducible given a seed. */
export class Rng {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(min + this.next() * (max - min + 1));
  }
  /** Value jittered by ±fraction (e.g. 0.4 → ±40%). */
  jitter(base: number, fraction: number): number {
    return Math.round(base * (1 + (this.next() * 2 - 1) * fraction));
  }
}

/** Compute a human-like delay before an action. */
export function actionDelay(profile: HumanProfile, rng: Rng): number {
  if (!profile.enabled) return 0;
  return rng.int(profile.actionDelayMs[0], profile.actionDelayMs[1]);
}

export function afterNavDelay(profile: HumanProfile, rng: Rng): number {
  if (!profile.enabled) return 0;
  return rng.int(profile.afterNavMs[0], profile.afterNavMs[1]);
}

/** Split a string into per-keystroke delays for realistic typing cadence. */
export function typingPlan(
  text: string,
  profile: HumanProfile,
  rng: Rng,
): { char: string; delayMs: number }[] {
  if (!profile.enabled || profile.typeMsPerChar === 0) {
    return [...text].map((char) => ({ char, delayMs: 0 }));
  }
  return [...text].map((char) => {
    let delay = rng.jitter(profile.typeMsPerChar, 0.4);
    // Longer pause after spaces and punctuation, like real typing rhythm.
    if (char === " ") delay += rng.int(20, 90);
    if (".,!?@".includes(char)) delay += rng.int(40, 140);
    return { char, delayMs: delay };
  });
}
