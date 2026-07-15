import { describe, it, expect } from "vitest";
import {
  countMeasures,
  deriveChunks,
  resolveChunkRange,
  sliceEventsByMeasures,
  chunkPassed,
  chunkStars,
  allChunksPassed,
  availableStitches,
} from "../src/practice/chunks";
import { NoteEvent } from "../src/score/timeline";
import { TierProgress } from "../src/state/store";

function fakeEvents(measures: number, notesPerMeasure = 2): NoteEvent[] {
  const events: NoteEvent[] = [];
  for (let m = 0; m < measures; m++) {
    for (let n = 0; n < notesPerMeasure; n++) {
      events.push({
        index: events.length,
        step: events.length,
        beats: m * 4 + n * 2,
        measureIndex: m,
        notes: [{ midi: 60, staffId: 1, sourceNote: null, durationBeats: 2 }],
      });
    }
  }
  return events;
}

describe("deriveChunks", () => {
  it("splits 8 bars into four 2-bar chunks", () => {
    const chunks = deriveChunks(8, 2);
    expect(chunks).toHaveLength(4);
    expect(chunks[0]).toMatchObject({ measureStart: 0, measureEnd: 1 });
    expect(chunks[3]).toMatchObject({ measureStart: 6, measureEnd: 7 });
    expect(chunks[0].label).toBe("Bars 1–2");
  });

  it("last chunk absorbs a trailing orphan bar", () => {
    const chunks = deriveChunks(9, 2);
    expect(chunks).toHaveLength(4);
    expect(chunks[3]).toMatchObject({ measureStart: 6, measureEnd: 8 });
  });

  it("respects measuresPerChunk", () => {
    expect(deriveChunks(12, 4)).toHaveLength(3);
  });

  it("short pieces skip chunking", () => {
    expect(deriveChunks(3, 2)).toHaveLength(1 < 2 ? 0 : 1); // 1 chunk → skip
    expect(deriveChunks(3, 2)).toHaveLength(0);
    expect(deriveChunks(0, 2)).toHaveLength(0);
  });
});

describe("countMeasures", () => {
  it("counts measure elements", () => {
    expect(countMeasures('<measure number="1"><note/></measure><measure number="2"/>')).toBe(2);
    expect(countMeasures("no music here")).toBe(0);
  });
});

describe("resolveChunkRange + sliceEventsByMeasures", () => {
  const chunks = deriveChunks(8, 2);
  const events = fakeEvents(8);

  it("full = whole piece", () => {
    expect(resolveChunkRange("full", chunks)).toBeNull();
  });

  it("chunk index → its measures, slice re-indexes", () => {
    const range = resolveChunkRange(1, chunks)!;
    expect(range).toMatchObject({ measureStart: 2, measureEnd: 3 });
    const slice = sliceEventsByMeasures(events, range.measureStart, range.measureEnd);
    expect(slice).toHaveLength(4);
    expect(slice[0].index).toBe(0);
    expect(slice[0].measureIndex).toBe(2);
    expect(slice[0].step).toBe(4); // original cursor step preserved
    expect(slice[0].beats).toBe(8); // original beats preserved (offset handled by tempo mode)
  });

  it("stitch spans both chunks", () => {
    const range = resolveChunkRange({ stitch: [1, 2] }, chunks)!;
    expect(range).toMatchObject({ measureStart: 2, measureEnd: 5, chunkIndex: null });
  });
});

describe("progress + grandfathering", () => {
  const chunks = deriveChunks(8, 2);
  const fresh: TierProgress = { stars: 0, bestAccuracy: 0, attempts: 0, passed: false };

  it("fresh tier: nothing passed, full locked", () => {
    expect(chunkPassed(fresh, 0)).toBe(false);
    expect(allChunksPassed(fresh, chunks)).toBe(false);
    expect(availableStitches(fresh, chunks)).toHaveLength(0);
  });

  it("chunk stars accumulate and unlock stitches", () => {
    const tp: TierProgress = { ...fresh, chunkStars: { 0: 2, 1: 1 } };
    expect(chunkPassed(tp, 0)).toBe(true);
    expect(chunkStars(tp, 0)).toBe(2);
    expect(availableStitches(tp, chunks)).toHaveLength(1);
    expect(allChunksPassed(tp, chunks)).toBe(false);
  });

  it("a tier passed before chunks existed counts as all-chunks-passed", () => {
    const legacy: TierProgress = { stars: 2, bestAccuracy: 0.92, attempts: 3, passed: true };
    expect(chunkPassed(legacy, 3)).toBe(true);
    expect(chunkStars(legacy, 3)).toBe(1); // shown as passed, not inflated
    expect(allChunksPassed(legacy, chunks)).toBe(true);
  });

  it("unchunked piece goes straight to full run", () => {
    expect(allChunksPassed(fresh, [])).toBe(true);
  });
});
