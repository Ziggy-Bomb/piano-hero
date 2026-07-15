// Fast per-note visual feedback. During play we mutate the rendered SVG
// directly (a full osmd.render() is far too slow on an iPad); all the fragile
// DOM/OSMD internals are quarantined in this file.

import { NoteEvent, TimelineNote } from "./timeline";

export const COLORS = {
  correct: "#22c55e",
  wrong: "#ef4444",
  hint: "#f59e0b",
  missed: "#94a3b8",
  dimmed: "rgba(30,27,75,0.30)",
};

function svgElementForSourceNote(osmd: any, sourceNote: any): SVGGElement | null {
  try {
    const gNotes: any[] = osmd.cursor?.GNotesUnderCursor?.() ?? [];
    for (const g of gNotes) {
      if (g?.sourceNote === sourceNote) {
        const el =
          g.getSVGGElement?.() ??
          g.vfnote?.[0]?.attrs?.el ??
          null;
        if (el) return el as SVGGElement;
      }
    }
  } catch {
    // OSMD internals moved; coloring becomes a no-op rather than a crash.
  }
  return null;
}

function paintSvgGroup(el: SVGGElement, color: string) {
  // Noteheads live in .vf-notehead groups; stems/flags are siblings. Color
  // the noteheads (and the stem, subtly) so feedback reads clearly at iPad size.
  const noteheads = el.querySelectorAll(".vf-notehead path, .vf-notehead text");
  if (noteheads.length > 0) {
    noteheads.forEach((p) => {
      (p as SVGElement).setAttribute("fill", color);
      (p as SVGElement).setAttribute("stroke", color);
    });
  } else {
    el.querySelectorAll("path, text").forEach((p) => {
      (p as SVGElement).setAttribute("fill", color);
      (p as SVGElement).setAttribute("stroke", color);
    });
  }
}

/** Color one note at the current cursor position (green flash, red flash…). */
export function colorNoteUnderCursor(osmd: any, note: TimelineNote, color: string): void {
  const el = svgElementForSourceNote(osmd, note.sourceNote);
  if (el) paintSvgGroup(el, color);
}

/** Color every note of an event at the current cursor position. */
export function colorEventUnderCursor(osmd: any, event: NoteEvent, color: string): void {
  for (const n of event.notes) colorNoteUnderCursor(osmd, n, color);
}

/**
 * Persistent notehead colors (survive re-render). Used before the initial
 * render for staff dimming, and for the end-of-run recap coloring.
 */
export function setPersistentNoteColor(sourceNote: any, color: string | undefined): void {
  try {
    sourceNote.NoteheadColor = color;
    if ("noteheadColor" in sourceNote) sourceNote.noteheadColor = color;
  } catch {
    // Best effort.
  }
}

/** Dim every note not on the judged staff (hands-separate tiers). Call before render(). */
export function dimOtherStaff(allEvents: NoteEvent[], judgedStaffId: number | null): void {
  for (const e of allEvents) {
    for (const n of e.notes) {
      const dim = judgedStaffId !== null && n.staffId !== judgedStaffId;
      setPersistentNoteColor(n.sourceNote, dim ? "#b6b6c9" : undefined);
    }
  }
}

/** Reset any persistent colors (before a fresh render). */
export function clearPersistentColors(allEvents: NoteEvent[]): void {
  for (const e of allEvents) {
    for (const n of e.notes) setPersistentNoteColor(n.sourceNote, undefined);
  }
}
