import { describe, it, expect } from "vitest";
import {
  CREDIT,
  creditFor,
  starsForAccuracy,
  nextStarGap,
} from "../src/practice/scoring";

describe("partial credit", () => {
  it("credit table", () => {
    expect(creditFor("clean")).toBe(1.0);
    expect(creditFor("afterWrong")).toBe(0.6);
    expect(creditFor("withHint")).toBe(0.3);
    expect(creditFor("missed")).toBe(0);
  });

  it("the demoralization case: 29 clean + 1 recovered flub → 3 stars", () => {
    const creditSum = 29 * CREDIT.clean + CREDIT.afterWrong;
    const accuracy = creditSum / 30;
    expect(accuracy).toBeGreaterThan(0.95);
    expect(starsForAccuracy(accuracy)).toBe(3);
  });
});

describe("star thresholds", () => {
  it("boundaries", () => {
    expect(starsForAccuracy(0.6999)).toBe(0);
    expect(starsForAccuracy(0.7)).toBe(1);
    expect(starsForAccuracy(0.8499)).toBe(1);
    expect(starsForAccuracy(0.85)).toBe(2);
    expect(starsForAccuracy(0.9499)).toBe(2);
    expect(starsForAccuracy(0.95)).toBe(3);
    expect(starsForAccuracy(1)).toBe(3);
  });
});

describe("nextStarGap", () => {
  it("reports the distance to the next star", () => {
    expect(nextStarGap(0.93)).toEqual({ stars: 2, nextAt: 0.95, gap: expect.closeTo(0.02) });
    expect(nextStarGap(0.5).nextAt).toBe(0.7);
    expect(nextStarGap(0.99).nextAt).toBeNull();
  });
});
