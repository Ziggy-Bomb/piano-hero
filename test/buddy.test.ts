import { describe, it, expect } from "vitest";
import { buddyStage, nextBuddyStage, buddyMood, BUDDY_STAGES } from "../src/game/buddy";

describe("buddyStage", () => {
  it("stage boundaries", () => {
    expect(buddyStage(0).name).toBe("Egg");
    expect(buddyStage(199).name).toBe("Egg");
    expect(buddyStage(200).name).toBe("Hatchling");
    expect(buddyStage(12000).name).toBe("Maestro");
    expect(buddyStage(1_000_000).name).toBe("Maestro");
  });

  it("nextBuddyStage", () => {
    expect(nextBuddyStage(0)?.name).toBe("Hatchling");
    expect(nextBuddyStage(12000)).toBeNull();
  });

  it("stages are ascending", () => {
    for (let i = 1; i < BUDDY_STAGES.length; i++) {
      expect(BUDDY_STAGES[i].minXp).toBeGreaterThan(BUDDY_STAGES[i - 1].minXp);
    }
  });
});

describe("buddyMood", () => {
  it("happy same day and next day", () => {
    expect(buddyMood("2026-07-15", "2026-07-15")).toBe("happy");
    expect(buddyMood("2026-07-14", "2026-07-15")).toBe("happy");
  });
  it("sleepy after 2 days, hungry after 3+ or never", () => {
    expect(buddyMood("2026-07-13", "2026-07-15")).toBe("sleepy");
    expect(buddyMood("2026-07-10", "2026-07-15")).toBe("hungry");
    expect(buddyMood(null, "2026-07-15")).toBe("hungry");
  });
});
