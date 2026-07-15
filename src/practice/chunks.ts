// Chunk model: a piece is practised as small contiguous slices (default 2
// bars) → optional "stitches" of adjacent passed chunks → the full piece.
//
// Chunks are defined purely by MEASURE RANGES derived from the piece's
// measure count, so the Home screen can show the chunk map without loading
// OSMD; the practice screen maps ranges to timeline events at play time.

import { NoteEvent } from "../score/timeline";
import { ActiveChunk, TierProgress } from "../state/store";

export interface Chunk {
  index: number; // 0-based among base chunks; -1 for stitches
  kind: "chunk" | "stitch";
  label: string;
  measureStart: number;
  measureEnd: number; // inclusive, 0-based
  /** For stitches: the base chunk indices being joined. */
  parts?: [number, number];
}

export const DEFAULT_MEASURES_PER_CHUNK = 2;

/** Count `<measure ...>` elements in raw MusicXML (cheap, no parser). */
export function countMeasures(xml: string): number {
  return (xml.match(/<measure[\s>]/g) ?? []).length;
}

export function deriveChunks(
  totalMeasures: number,
  measuresPerChunk = DEFAULT_MEASURES_PER_CHUNK,
): Chunk[] {
  const per = Math.max(1, measuresPerChunk);
  const count = Math.floor(totalMeasures / per);
  // Fewer than 2 chunks → not worth chunking; play the whole piece.
  if (count < 2) return [];

  const chunks: Chunk[] = [];
  for (let i = 0; i < count; i++) {
    const measureStart = i * per;
    // The last chunk absorbs any trailing remainder (no orphan bars).
    const measureEnd = i === count - 1 ? totalMeasures - 1 : measureStart + per - 1;
    chunks.push({
      index: i,
      kind: "chunk",
      label:
        measureStart === measureEnd
          ? `Bar ${measureStart + 1}`
          : `Bars ${measureStart + 1}–${measureEnd + 1}`,
      measureStart,
      measureEnd,
    });
  }
  return chunks;
}

export function stitchOf(a: Chunk, b: Chunk): Chunk {
  return {
    index: -1,
    kind: "stitch",
    label: `Bars ${a.measureStart + 1}–${b.measureEnd + 1}`,
    measureStart: a.measureStart,
    measureEnd: b.measureEnd,
    parts: [a.index, b.index],
  };
}

/** Resolve an ActiveChunk selection to a measure range (null = whole piece). */
export function resolveChunkRange(
  selection: ActiveChunk,
  chunks: Chunk[],
): { measureStart: number; measureEnd: number; chunkIndex: number | null } | null {
  if (selection === "full") return null;
  if (typeof selection === "number") {
    const c = chunks.find((x) => x.index === selection);
    return c ? { measureStart: c.measureStart, measureEnd: c.measureEnd, chunkIndex: c.index } : null;
  }
  const [ai, bi] = selection.stitch;
  const a = chunks.find((x) => x.index === ai);
  const b = chunks.find((x) => x.index === bi);
  return a && b
    ? { measureStart: a.measureStart, measureEnd: b.measureEnd, chunkIndex: null }
    : null;
}

/** Filter + re-index a timeline to a measure range (mirrors filterTimelineByStaff). */
export function sliceEventsByMeasures(
  events: NoteEvent[],
  measureStart: number,
  measureEnd: number,
): NoteEvent[] {
  return events
    .filter((e) => e.measureIndex >= measureStart && e.measureIndex <= measureEnd)
    .map((e, i) => ({ ...e, index: i }));
}

/** Chunk pass state, grandfathering tiers passed before chunks existed. */
export function chunkPassed(tp: TierProgress | undefined, chunkIndex: number): boolean {
  if (!tp) return false;
  if (tp.passed) return true;
  return (tp.chunkStars?.[chunkIndex] ?? 0) >= 1;
}

export function chunkStars(tp: TierProgress | undefined, chunkIndex: number): 0 | 1 | 2 | 3 {
  const recorded = tp?.chunkStars?.[chunkIndex];
  if (recorded !== undefined) return recorded;
  return tp?.passed ? 1 : 0;
}

export function allChunksPassed(tp: TierProgress | undefined, chunks: Chunk[]): boolean {
  if (chunks.length === 0) return true; // unchunked pieces go straight to full runs
  return chunks.every((c) => chunkPassed(tp, c.index));
}

/** Stitches available right now: adjacent pairs where both chunks passed. */
export function availableStitches(tp: TierProgress | undefined, chunks: Chunk[]): Chunk[] {
  const out: Chunk[] = [];
  for (let i = 0; i + 1 < chunks.length; i++) {
    if (chunkPassed(tp, chunks[i].index) && chunkPassed(tp, chunks[i + 1].index)) {
      out.push(stitchOf(chunks[i], chunks[i + 1]));
    }
  }
  return out;
}
