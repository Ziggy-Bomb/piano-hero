// Tempo mode: metronome-driven. The cursor advances on the beat clock like a
// patient band that won't stop; each event is judged inside a timing window.
// Missed events are gray ("keep going"), never red.

import { DetectorFrame } from "../audio/noteDetector";
import { NoteVerifier } from "../audio/noteVerifier";
import { Metronome } from "../audio/metronome";
import { NoteEvent } from "../score/timeline";
import { PracticeCallbacks, PracticeSummary } from "./types";

interface EventState {
  event: NoteEvent;
  nominal: number; // audio-clock seconds
  windowStart: number;
  windowEnd: number;
  complete: boolean;
  missed: boolean;
  hadWrong: boolean;
  advanced: boolean; // cursor has moved here
}

export class TempoModeController {
  private states: EventState[] = [];
  private verifier: NoteVerifier;
  private metronome: Metronome;
  private cb: PracticeCallbacks;
  private moveCursorToStep: (step: number) => void;
  private now: () => number;
  private windowFrac: number;
  private countInBeats: number;

  private activeIdx = 0; // earliest event still judgeable
  private cursorIdx = -1;
  private ticker: number | null = null;
  private startTime = 0;
  private finished = false;
  private cleanEvents = 0;
  private wrongNotes = 0;
  private missedEvents = 0;

  constructor(opts: {
    events: NoteEvent[];
    verifier: NoteVerifier;
    metronome: Metronome;
    moveCursorToStep: (step: number) => void;
    callbacks: PracticeCallbacks;
    windowFrac: number;
    now: () => number;
  }) {
    this.verifier = opts.verifier;
    this.metronome = opts.metronome;
    this.moveCursorToStep = opts.moveCursorToStep;
    this.cb = opts.callbacks;
    this.windowFrac = opts.windowFrac;
    this.now = opts.now;
    this.countInBeats = opts.metronome.beatsPerBar;

    const spb = opts.metronome.secondsPerBeat;
    const events = opts.events;
    this.states = events.map((event, i) => {
      const nominal = (this.countInBeats + event.beats) * spb;
      let halfWindow = this.windowFrac * spb;
      // Never let adjacent windows overlap (fast passages).
      if (i > 0) {
        const gap = (event.beats - events[i - 1].beats) * spb;
        halfWindow = Math.min(halfWindow, gap * 0.45);
      }
      if (i < events.length - 1) {
        const gap = (events[i + 1].beats - event.beats) * spb;
        halfWindow = Math.min(halfWindow, gap * 0.45);
      }
      return {
        event,
        nominal,
        windowStart: nominal - halfWindow,
        windowEnd: nominal + halfWindow + 0.08, // grace for detection latency
        complete: false,
        missed: false,
        hadWrong: false,
        advanced: false,
      };
    });
  }

  start() {
    this.finished = false;
    this.activeIdx = 0;
    this.cursorIdx = -1;
    this.cleanEvents = 0;
    this.wrongNotes = 0;
    this.missedEvents = 0;
    this.startTime = this.now() + 0.15; // matches metronome startDelay
    this.metronome.start(0.15);
    if (this.states.length > 0) {
      this.verifier.setExpected(this.states[0].event.notes.map((n) => n.midi));
    }
    this.ticker = window.setInterval(() => this.tick(), 30);
  }

  stop() {
    this.metronome.stop();
    if (this.ticker !== null) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  get isFinished(): boolean {
    return this.finished;
  }

  /** Seconds since musical time zero (start of count-in). */
  private elapsed(): number {
    return this.now() - this.startTime;
  }

  private tick() {
    if (this.finished) return;
    const t = this.elapsed();

    // Move the cursor onto events as their nominal time arrives.
    for (let i = this.cursorIdx + 1; i < this.states.length; i++) {
      const s = this.states[i];
      if (t >= s.nominal - 0.02) {
        this.moveCursorToStep(s.event.step);
        s.advanced = true;
        this.cursorIdx = i;
        this.cb.onAdvance(s.event);
      } else {
        break;
      }
    }

    // Expire windows.
    while (this.activeIdx < this.states.length) {
      const s = this.states[this.activeIdx];
      if (s.complete) {
        this.activeIdx++;
        continue;
      }
      if (t > s.windowEnd) {
        s.missed = true;
        this.missedEvents++;
        this.cb.onEventMissed(s.event);
        this.activeIdx++;
        continue;
      }
      break;
    }

    // Point the verifier at the active event once its window opens.
    if (this.activeIdx < this.states.length) {
      const s = this.states[this.activeIdx];
      if (t >= s.windowStart) {
        const expected = s.event.notes.map((n) => n.midi);
        const current = this.verifier.getExpected();
        if (expected.length !== current.length || !expected.every((m) => current.includes(m))) {
          this.verifier.setExpected(expected);
        }
      }
    }

    // Finished when every window has resolved.
    if (this.activeIdx >= this.states.length) {
      this.finish();
    }
  }

  onFrame(frame: DetectorFrame) {
    if (this.finished || this.activeIdx >= this.states.length) return;
    const s = this.states[this.activeIdx];
    const t = this.elapsed();
    if (t < s.windowStart) return;

    const result = this.verifier.evaluate(frame);
    for (const v of result.verdicts) {
      if (v.type === "match") {
        this.cb.onNoteCorrect(s.event, v.midi, !s.hadWrong);
      } else if (v.type === "wrong") {
        s.hadWrong = true;
        this.wrongNotes++;
        this.cb.onWrongNote(s.event, v.playedMidi);
      }
    }

    if (result.complete && !s.complete) {
      s.complete = true;
      const clean = !s.hadWrong;
      if (clean) this.cleanEvents++;
      this.cb.onEventComplete(s.event, clean);
    }
  }

  private finish() {
    this.finished = true;
    this.stop();
    const total = this.states.length;
    const summary: PracticeSummary = {
      totalEvents: total,
      cleanEvents: this.cleanEvents,
      hintsUsed: 0,
      wrongNotes: this.wrongNotes,
      missedEvents: this.missedEvents,
      accuracy: total > 0 ? this.cleanEvents / total : 0,
    };
    this.cb.onFinish(summary);
  }
}
