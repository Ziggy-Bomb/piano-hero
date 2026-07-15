// Partial-credit scoring. One flubbed-but-recovered note should nudge the
// score, not vaporize a star — effort is rewarded, perfection is the cherry.

export const CREDIT = {
  clean: 1.0,
  afterWrong: 0.6,
  withHint: 0.3,
  missed: 0,
} as const;

export type EventOutcome = keyof typeof CREDIT;

export const STAR_THRESHOLDS = { one: 0.7, two: 0.85, three: 0.95 } as const;

export function creditFor(outcome: EventOutcome): number {
  return CREDIT[outcome];
}

export function starsForAccuracy(accuracy: number): 0 | 1 | 2 | 3 {
  if (accuracy >= STAR_THRESHOLDS.three) return 3;
  if (accuracy >= STAR_THRESHOLDS.two) return 2;
  if (accuracy >= STAR_THRESHOLDS.one) return 1;
  return 0;
}

/** How far to the next star (null when already at 3). */
export function nextStarGap(accuracy: number): {
  stars: 0 | 1 | 2 | 3;
  nextAt: number | null;
  gap: number | null;
} {
  const stars = starsForAccuracy(accuracy);
  const nextAt =
    stars === 0
      ? STAR_THRESHOLDS.one
      : stars === 1
        ? STAR_THRESHOLDS.two
        : stars === 2
          ? STAR_THRESHOLDS.three
          : null;
  return { stars, nextAt, gap: nextAt === null ? null : nextAt - accuracy };
}
