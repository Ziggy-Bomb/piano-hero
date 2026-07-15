// Score-informed verification: given the set of expected MIDI pitches at the
// cursor, judge each onset the detector reports. Designed so that a red
// "wrong note" is only ever shown with positive evidence of a specific wrong
// pitch — ambiguous sound (talking, bumps, TV) yields a neutral verdict.

import { DetectorFrame, measureDeltaEvidence, midiToFreq } from "./noteDetector";

export interface VerifierOptions {
  /** dB of evidence rise required to validate an expected pitch. */
  matchThresholdDb: number;
  /** dB required to call out a wrong note (kept higher than match). */
  wrongThresholdDb: number;
  /** Minimum partials clearly present. */
  minPartials: number;
  /** Frames after an onset during which we keep looking for matches. */
  onsetWindowFrames: number;
  /** Treat playing the octave below as correct (generous tiers). */
  forgiveOctaveErrors: boolean;
  tuningCents: number;
  inharmonicityB: number;
}

export const LENIENT_OPTIONS: Omit<VerifierOptions, "tuningCents" | "inharmonicityB"> = {
  matchThresholdDb: 7,
  wrongThresholdDb: 12,
  minPartials: 2,
  onsetWindowFrames: 5,
  forgiveOctaveErrors: true,
};

export const STRICT_OPTIONS: Omit<VerifierOptions, "tuningCents" | "inharmonicityB"> = {
  matchThresholdDb: 9,
  wrongThresholdDb: 12,
  minPartials: 2,
  onsetWindowFrames: 4,
  forgiveOctaveErrors: false,
};

export type Verdict =
  | { type: "match"; midi: number; octaveBelow: boolean }
  | { type: "wrong"; playedMidi: number; nearestExpected: number }
  | { type: "neutral" };

export interface EvaluateResult {
  verdicts: Verdict[];
  /** Expected pitches validated so far (accumulates across frames until reset). */
  validated: Set<number>;
  /** True when every expected pitch has been validated. */
  complete: boolean;
}

export class NoteVerifier {
  private expected: number[] = [];
  private validated = new Set<number>();
  private opts: VerifierOptions;
  private pendingOnset = false;
  private onsetAge = 0;
  private wrongReportedForOnset = false;

  constructor(opts: VerifierOptions) {
    this.opts = opts;
  }

  setOptions(opts: VerifierOptions) {
    this.opts = opts;
  }

  /** New cursor position: which MIDI pitches must sound next. */
  setExpected(midis: number[]) {
    this.expected = [...new Set(midis)];
    this.validated.clear();
    this.pendingOnset = false;
    this.wrongReportedForOnset = false;
  }

  getExpected(): number[] {
    return [...this.expected];
  }

  evaluate(frame: DetectorFrame): EvaluateResult {
    const verdicts: Verdict[] = [];
    const o = this.opts;

    if (frame.onset) {
      this.pendingOnset = true;
      this.onsetAge = 0;
      this.wrongReportedForOnset = false;
    } else if (this.pendingOnset) {
      this.onsetAge++;
      if (this.onsetAge > o.onsetWindowFrames) this.pendingOnset = false;
    }

    if (!this.pendingOnset || this.expected.length === 0) {
      return this.result(verdicts);
    }

    const hzPerBin = this.binHzValue;

    if (this.isMash(frame, hzPerBin)) {
      this.pendingOnset = false;
      return this.result(verdicts);
    }

    // 1) Try to validate each still-unvalidated expected pitch.
    for (const midi of this.expected) {
      if (this.validated.has(midi)) continue;
      const f0 = midiToFreq(midi, o.tuningCents);
      const { deltaDb, partials } = measureDeltaEvidence(
        frame.mags,
        frame.preOnsetMags,
        hzPerBin,
        f0,
        o.inharmonicityB,
      );
      if (deltaDb >= o.matchThresholdDb && partials >= o.minPartials) {
        // Octave guard: strong evidence at the sub-octave's odd partials means
        // the child actually played an octave below (its even partials mimic
        // every partial of the expected note).
        const octaveBelow = this.subOctavePlayed(frame, hzPerBin, midi);
        if (octaveBelow && !o.forgiveOctaveErrors) {
          if (!this.wrongReportedForOnset) {
            verdicts.push({ type: "wrong", playedMidi: midi - 12, nearestExpected: midi });
            this.wrongReportedForOnset = true;
          }
          continue;
        }
        this.validated.add(midi);
        verdicts.push({ type: "match", midi, octaveBelow });
      }
    }

    // 2) If the onset window just closed with nothing validated, look for a
    //    specific wrong note among plausible distractors.
    const windowClosing = this.onsetAge === o.onsetWindowFrames;
    if (windowClosing && verdicts.length === 0 && this.validated.size === 0 && !this.wrongReportedForOnset) {
      const wrong = this.findWrongNote(frame, hzPerBin);
      if (wrong) {
        verdicts.push(wrong);
        this.wrongReportedForOnset = true;
      }
      // else: neutral — say nothing, cost nothing.
    }

    return this.result(verdicts);
  }

  private result(verdicts: Verdict[]): EvaluateResult {
    return {
      verdicts,
      validated: new Set(this.validated),
      complete: this.expected.length > 0 && this.expected.every((m) => this.validated.has(m)),
    };
  }

  /** Hz per FFT bin — set by the owner from the detector (sampleRate / fftSize). */
  binHzValue = 48000 / 8192;

  private subOctavePlayed(frame: DetectorFrame, binHz: number, midi: number): boolean {
    const o = this.opts;
    if (midi - 12 < 21) return false;
    const f0Sub = midiToFreq(midi - 12, o.tuningCents);
    // The sub-octave's even partials coincide with every partial of the
    // expected note, so only its ODD partials (1x, 3x, 5x of f0Sub) are
    // distinctive. Strong rises at two or more of them mean the child played
    // an octave low. Each is checked as a lone spectral peak (single partial,
    // B=0 since we probe an exact frequency).
    let oddCount = 0;
    for (const k of [1, 3, 5]) {
      const fk = k * f0Sub * Math.sqrt(1 + o.inharmonicityB * k * k);
      const single = measureDeltaEvidence(frame.mags, frame.preOnsetMags, binHz, fk, 0, 1);
      if (single.deltaDb > o.matchThresholdDb * 0.8 && single.partials >= 1) {
        oddCount++;
      }
    }
    return oddCount >= 2;
  }

  private findWrongNote(frame: DetectorFrame, binHz: number): Verdict | null {
    const o = this.opts;
    let best: { midi: number; nearest: number; deltaDb: number } | null = null;
    const tried = new Set<number>(this.expected);
    for (const expected of this.expected) {
      for (const off of [-1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6, -7, 7, -12, 12]) {
        const candidate = expected + off;
        if (candidate < 21 || candidate > 108 || tried.has(candidate)) continue;
        tried.add(candidate);
        const f0 = midiToFreq(candidate, o.tuningCents);
        const { deltaDb, partials } = measureDeltaEvidence(
          frame.mags,
          frame.preOnsetMags,
          binHz,
          f0,
          o.inharmonicityB,
        );
        if (deltaDb >= o.wrongThresholdDb && partials >= o.minPartials) {
          if (!best || deltaDb > best.deltaDb) {
            best = { midi: candidate, nearest: expected, deltaDb };
          }
        }
      }
    }
    if (!best) return null;
    return { type: "wrong", playedMidi: best.midi, nearestExpected: best.nearest };
  }

  /**
   * Broadband smash (forearm, lid bump, clapping): many strong risers at
   * pitches that are NOT harmonically related to what's expected. Octaves,
   * thirds and fifths of expected notes alias through shared partials, so a
   * legitimately played chord lights those up — a smash lights up everything
   * else too.
   */
  private isMash(frame: DetectorFrame, binHz: number): boolean {
    if (!frame.preOnsetMags) return false;
    const relatedClasses = new Set<number>();
    for (const e of this.expected) {
      for (const interval of [0, 4, 7]) {
        relatedClasses.add((((e + interval) % 12) + 12) % 12);
      }
    }
    let alienRisers = 0;
    for (let midi = 36; midi <= 84; midi++) {
      if (relatedClasses.has(midi % 12)) continue;
      const f0 = midiToFreq(midi, this.opts.tuningCents);
      const { deltaDb, partials } = measureDeltaEvidence(
        frame.mags,
        frame.preOnsetMags,
        binHz,
        f0,
        this.opts.inharmonicityB,
        3,
      );
      if (deltaDb > this.opts.matchThresholdDb && partials >= 2) {
        alienRisers++;
        if (alienRisers >= 5) return true;
      }
    }
    return false;
  }
}
