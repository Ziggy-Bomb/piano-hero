import { NoteEvent } from "../score/timeline";

export interface PracticeSummary {
  totalEvents: number;
  /** Events completed correctly with no wrong notes or hints (wait mode) or
   * hit inside the timing window (tempo mode). */
  cleanEvents: number;
  hintsUsed: number;
  wrongNotes: number;
  missedEvents: number;
  /** Sum of per-event partial credit (see practice/scoring.ts). */
  creditSum: number;
  /** creditSum / totalEvents — partial-credit accuracy, not a clean-rate. */
  accuracy: number;
}

export interface PracticeCallbacks {
  /** Cursor arrived at a new event. */
  onAdvance(event: NoteEvent): void;
  /** One expected note validated (green). */
  onNoteCorrect(event: NoteEvent, midi: number, cleanSoFar: boolean): void;
  /** A specific wrong pitch was identified (red). */
  onWrongNote(event: NoteEvent, playedMidi: number): void;
  /** Second miss on the same event — show help. */
  onHint(event: NoteEvent): void;
  /** All notes of the event validated. */
  onEventComplete(event: NoteEvent, clean: boolean): void;
  /** Tempo mode: the window closed without all notes played. */
  onEventMissed(event: NoteEvent): void;
  onFinish(summary: PracticeSummary): void;
}
