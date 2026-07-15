// Walks the OSMD cursor iterator once after load to build the judgeable
// timeline of note events. This single structure is the contract between the
// score view and the practice modes — judging and cursor position can never
// drift apart because both derive from the same walk.
//
// OSMD internals are typed loosely (any) on purpose: the library's TS types
// shift between versions and we only touch a handful of stable properties.

export interface TimelineNote {
  midi: number;
  /** 1 = top staff (usually right hand), 2 = bottom staff (left hand). */
  staffId: number;
  /** OSMD source note — used to find graphical notes for coloring. */
  sourceNote: any;
  durationBeats: number;
}

export interface NoteEvent {
  /** Position in the events array. */
  index: number;
  /** How many cursor.next() calls from reset reach this event. */
  step: number;
  /** Musical time in quarter-note beats from the start. */
  beats: number;
  notes: TimelineNote[];
}

export function extractTimeline(osmd: any): NoteEvent[] {
  const cursor = osmd.cursor;
  cursor.reset();
  const iterator = cursor.Iterator ?? cursor.iterator;
  const events: NoteEvent[] = [];
  let step = 0;

  while (!iterator.EndReached) {
    const voiceEntries: any[] = iterator.CurrentVoiceEntries ?? [];
    const notes: TimelineNote[] = [];

    for (const ve of voiceEntries) {
      const veNotes: any[] = ve.Notes ?? [];
      for (const note of veNotes) {
        if (!note.Pitch) continue; // rest
        if (note.IsGraceNote || ve.IsGrace) continue;
        // Skip tied continuations — only the tie's first note is struck.
        const tie = note.NoteTie;
        if (tie && tie.StartNote !== note) continue;
        const midi = (note.halfTone ?? note.Pitch.getHalfTone?.() ?? 0) + 12;
        const staffId =
          ve.ParentSourceStaffEntry?.ParentStaff?.Id ??
          note.ParentStaffEntry?.ParentStaff?.Id ??
          1;
        const durationBeats = (note.Length?.RealValue ?? 0.25) * 4;
        notes.push({ midi, staffId, sourceNote: note, durationBeats });
      }
    }

    const beats = (iterator.currentTimeStamp?.RealValue ?? 0) * 4;
    if (notes.length > 0) {
      events.push({ index: events.length, step, beats, notes });
    }

    iterator.moveToNext();
    step++;
  }

  cursor.reset();
  return events;
}

/** Filter a timeline for hands-separate tiers; events left empty are dropped. */
export function filterTimelineByStaff(events: NoteEvent[], staffId: number | null): NoteEvent[] {
  if (staffId === null) return events;
  const out: NoteEvent[] = [];
  for (const e of events) {
    const notes = e.notes.filter((n) => n.staffId === staffId);
    if (notes.length > 0) {
      out.push({ ...e, notes, index: out.length });
    }
  }
  return out;
}
