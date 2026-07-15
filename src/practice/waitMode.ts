// Wait mode: the cursor sits on an event until every expected note has been
// played correctly. No time pressure — the anti-frustration default.

import { DetectorFrame } from "../audio/noteDetector";
import { NoteVerifier } from "../audio/noteVerifier";
import { NoteEvent } from "../score/timeline";
import { creditFor } from "./scoring";
import { PracticeCallbacks, PracticeSummary } from "./types";

const HINT_AFTER_MISSES = 2;

export class WaitModeController {
  private events: NoteEvent[];
  private verifier: NoteVerifier;
  private cb: PracticeCallbacks;
  private moveCursorToStep: (step: number) => void;

  private idx = -1;
  private missesOnEvent = 0;
  private hintShown = false;
  private wrongOnEvent = false;
  private finished = false;

  private cleanEvents = 0;
  private hintsUsed = 0;
  private wrongNotes = 0;
  private creditSum = 0;

  constructor(
    events: NoteEvent[],
    verifier: NoteVerifier,
    moveCursorToStep: (step: number) => void,
    callbacks: PracticeCallbacks,
  ) {
    this.events = events;
    this.verifier = verifier;
    this.moveCursorToStep = moveCursorToStep;
    this.cb = callbacks;
  }

  start() {
    this.idx = -1;
    this.finished = false;
    this.cleanEvents = 0;
    this.hintsUsed = 0;
    this.wrongNotes = 0;
    this.creditSum = 0;
    this.advance();
  }

  get currentEvent(): NoteEvent | null {
    return this.idx >= 0 && this.idx < this.events.length ? this.events[this.idx] : null;
  }

  get isFinished(): boolean {
    return this.finished;
  }

  onFrame(frame: DetectorFrame) {
    if (this.finished) return;
    const event = this.currentEvent;
    if (!event) return;

    const result = this.verifier.evaluate(frame);

    for (const v of result.verdicts) {
      if (v.type === "match") {
        this.cb.onNoteCorrect(event, v.midi, !this.wrongOnEvent && !this.hintShown);
      } else if (v.type === "wrong") {
        this.wrongOnEvent = true;
        this.wrongNotes++;
        this.missesOnEvent++;
        this.cb.onWrongNote(event, v.playedMidi);
        if (this.missesOnEvent >= HINT_AFTER_MISSES && !this.hintShown) {
          this.hintShown = true;
          this.hintsUsed++;
          this.cb.onHint(event);
        }
      }
    }

    if (result.complete) {
      const clean = !this.wrongOnEvent && !this.hintShown;
      if (clean) this.cleanEvents++;
      this.creditSum += creditFor(
        this.hintShown ? "withHint" : this.wrongOnEvent ? "afterWrong" : "clean",
      );
      this.cb.onEventComplete(event, clean);
      this.advance();
    }
  }

  private advance() {
    this.idx++;
    this.missesOnEvent = 0;
    this.hintShown = false;
    this.wrongOnEvent = false;

    if (this.idx >= this.events.length) {
      this.finished = true;
      this.cb.onFinish(this.summary());
      return;
    }

    const event = this.events[this.idx];
    this.moveCursorToStep(event.step);
    this.verifier.setExpected(event.notes.map((n) => n.midi));
    this.cb.onAdvance(event);
  }

  private summary(): PracticeSummary {
    const total = this.events.length;
    return {
      totalEvents: total,
      cleanEvents: this.cleanEvents,
      hintsUsed: this.hintsUsed,
      wrongNotes: this.wrongNotes,
      missedEvents: 0,
      creditSum: this.creditSum,
      accuracy: total > 0 ? this.creditSum / total : 0,
    };
  }
}
