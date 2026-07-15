// Performs a timeline slice through the PianoSynth, driving the score cursor
// along. The scheduling math is a pure function so it can be unit-tested.

import { NoteEvent } from "../score/timeline";
import { PianoSynth } from "./pianoSynth";

export interface PlannedNote {
  midi: number;
  /** Seconds from playback start. */
  when: number;
  durationSec: number;
  eventIndex: number;
}

export const PLAYBACK_LEAD_IN = 0.25;

/** Pure scheduling: timeline slice + tempo + optional staff filter → notes. */
export function schedulePlan(
  events: NoteEvent[],
  bpm: number,
  staff: 1 | 2 | null,
): PlannedNote[] {
  if (events.length === 0 || bpm <= 0) return [];
  const spb = 60 / bpm;
  const offset = events[0].beats;
  const plan: PlannedNote[] = [];
  for (const event of events) {
    for (const note of event.notes) {
      if (staff !== null && note.staffId !== staff) continue;
      plan.push({
        midi: note.midi,
        when: PLAYBACK_LEAD_IN + (event.beats - offset) * spb,
        durationSec: Math.max(0.1, note.durationBeats * spb),
        eventIndex: event.index,
      });
    }
  }
  return plan;
}

export interface PlaybackOptions {
  events: NoteEvent[];
  bpm: number;
  /** null = both staves; 2 = left hand only (duet groundwork). */
  staff: 1 | 2 | null;
  context?: AudioContext;
  onAdvance?: (event: NoteEvent) => void;
  onFinish?: () => void;
}

export class PlaybackController {
  private opts: PlaybackOptions;
  private context: AudioContext | null = null;
  private ownsContext = false;
  private synth: PianoSynth | null = null;
  private ticker: number | null = null;
  private playing = false;

  constructor(opts: PlaybackOptions) {
    this.opts = opts;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  start(): void {
    this.stop();
    const plan = schedulePlan(this.opts.events, this.opts.bpm, this.opts.staff);
    if (plan.length === 0) {
      this.opts.onFinish?.();
      return;
    }

    this.context = this.opts.context ?? new AudioContext();
    this.ownsContext = !this.opts.context;
    if (this.context.state === "suspended") void this.context.resume();
    this.synth = new PianoSynth(this.context);

    const startTime = this.context.currentTime + 0.05;
    for (const n of plan) {
      this.synth.noteOn(n.midi, startTime + n.when, n.durationSec);
    }
    const endTime =
      startTime + plan.reduce((m, n) => Math.max(m, n.when + n.durationSec), 0) + 0.5;

    // Cursor follow: fire onAdvance as each event's nominal time passes.
    const cues = this.opts.events
      .map((event) => ({
        event,
        at: startTime + PLAYBACK_LEAD_IN + (event.beats - this.opts.events[0].beats) * (60 / this.opts.bpm),
      }))
      .filter(({ event }) =>
        this.opts.staff === null || event.notes.some((n) => n.staffId === this.opts.staff),
      );
    let cueIdx = 0;
    this.playing = true;
    this.ticker = window.setInterval(() => {
      const now = this.context!.currentTime;
      while (cueIdx < cues.length && now >= cues[cueIdx].at - 0.03) {
        this.opts.onAdvance?.(cues[cueIdx].event);
        cueIdx++;
      }
      if (now >= endTime) {
        this.stop();
        this.opts.onFinish?.();
      }
    }, 30);
  }

  stop(): void {
    if (this.ticker !== null) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    this.synth?.stopAll();
    this.synth = null;
    if (this.context && this.ownsContext) {
      void this.context.close();
    }
    this.context = null;
    this.playing = false;
  }
}
