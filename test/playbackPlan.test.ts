import { describe, it, expect } from "vitest";
import { schedulePlan, PLAYBACK_LEAD_IN } from "../src/audio/playback";
import { NoteEvent } from "../src/score/timeline";

function ev(index: number, beats: number, notes: Array<[number, number, number]>): NoteEvent {
  return {
    index,
    step: index,
    beats,
    measureIndex: Math.floor(beats / 4),
    notes: notes.map(([midi, staffId, durationBeats]) => ({
      midi,
      staffId,
      sourceNote: null,
      durationBeats,
    })),
  };
}

describe("schedulePlan", () => {
  const events = [
    ev(0, 0, [[64, 1, 1], [48, 2, 4]]),
    ev(1, 1, [[65, 1, 1]]),
    ev(2, 2, [[67, 1, 2]]),
  ];

  it("schedules notes at beat-accurate times (120bpm → 0.5s/beat)", () => {
    const plan = schedulePlan(events, 120, null);
    expect(plan).toHaveLength(4);
    expect(plan[0].when).toBeCloseTo(PLAYBACK_LEAD_IN);
    expect(plan[2].when).toBeCloseTo(PLAYBACK_LEAD_IN + 0.5);
    expect(plan[3].when).toBeCloseTo(PLAYBACK_LEAD_IN + 1.0);
    expect(plan[0].durationSec).toBeCloseTo(0.5);
    expect(plan[1].durationSec).toBeCloseTo(2.0); // whole-note LH
  });

  it("staff filter: LH-only plays only staff 2", () => {
    const plan = schedulePlan(events, 120, 2);
    expect(plan).toHaveLength(1);
    expect(plan[0].midi).toBe(48);
  });

  it("chunk slices start at the lead-in (beats offset removed)", () => {
    const chunk = [ev(0, 8, [[60, 1, 1]]), ev(1, 9, [[62, 1, 1]])];
    const plan = schedulePlan(chunk, 60, null);
    expect(plan[0].when).toBeCloseTo(PLAYBACK_LEAD_IN);
    expect(plan[1].when).toBeCloseTo(PLAYBACK_LEAD_IN + 1);
  });

  it("empty input → empty plan", () => {
    expect(schedulePlan([], 100, null)).toHaveLength(0);
  });
});
