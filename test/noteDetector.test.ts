// Engine tests with synthesized piano-like tones (stretched partials, 1/k
// amplitude rolloff, exponential decay) — the same physics the detector
// models. These are the regression net for every future detector tweak.

import { describe, it, expect } from "vitest";
import {
  NoteDetector,
  DEFAULT_CALIBRATION,
  FFT_SIZE,
  HOP_SIZE,
  midiToFreq,
} from "../src/audio/noteDetector";
import {
  NoteVerifier,
  LENIENT_OPTIONS,
  STRICT_OPTIONS,
  Verdict,
} from "../src/audio/noteVerifier";

const SR = 48000;
const B = DEFAULT_CALIBRATION.inharmonicityB;

// Deterministic PRNG so noise tests can't flake.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Piano-ish tone: 6 stretched partials, 1/k rolloff, exponential decay. */
function synthInto(out: Float32Array, start: number, midi: number, seconds: number, gain = 0.2) {
  const f0 = midiToFreq(midi);
  const n = Math.min(out.length - start, Math.floor(seconds * SR));
  for (let k = 1; k <= 6; k++) {
    const fk = k * f0 * Math.sqrt(1 + B * k * k);
    if (fk > SR / 2) break;
    const amp = gain / k;
    const w = (2 * Math.PI * fk) / SR;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      out[start + i] += amp * Math.exp(-2.5 * t) * Math.sin(w * i);
    }
  }
}

function makeSignal(seconds: number, seed = 1): Float32Array {
  const rand = mulberry32(seed);
  const out = new Float32Array(Math.floor(seconds * SR));
  for (let i = 0; i < out.length; i++) out[i] = (rand() - 0.5) * 0.002; // room hiss
  return out;
}

interface RunResult {
  verdicts: Verdict[];
  completed: boolean;
  completedAtHop: number;
}

function makePair(opts: { strict?: boolean; forgive?: boolean } = {}) {
  const detector = new NoteDetector(SR, DEFAULT_CALIBRATION);
  const base = opts.strict ? STRICT_OPTIONS : LENIENT_OPTIONS;
  const verifier = new NoteVerifier({
    ...base,
    forgiveOctaveErrors: opts.forgive ?? !opts.strict,
    tuningCents: 0,
    inharmonicityB: B,
  });
  verifier.binHzValue = SR / FFT_SIZE;
  return { detector, verifier };
}

function run(
  signal: Float32Array,
  detector: NoteDetector,
  verifier: NoteVerifier,
  onHop?: (hopIndex: number) => void,
): RunResult {
  const verdicts: Verdict[] = [];
  let completed = false;
  let completedAtHop = -1;
  const hops = Math.floor(signal.length / HOP_SIZE);
  for (let h = 0; h < hops; h++) {
    onHop?.(h);
    const frame = detector.processHop(signal.subarray(h * HOP_SIZE, (h + 1) * HOP_SIZE));
    const res = verifier.evaluate(frame);
    verdicts.push(...res.verdicts);
    if (res.complete && !completed) {
      completed = true;
      completedAtHop = h;
    }
  }
  return { verdicts, completed, completedAtHop };
}

const LEAD_IN = 16 * HOP_SIZE; // ~0.7s of room tone before the note

describe("correct single notes validate", () => {
  for (const midi of [48, 60, 67, 76]) {
    it(`validates MIDI ${midi}`, () => {
      const { detector, verifier } = makePair();
      verifier.setExpected([midi]);
      const signal = makeSignal(2, midi);
      synthInto(signal, LEAD_IN, midi, 1.2);
      const res = run(signal, detector, verifier);
      expect(res.completed).toBe(true);
      expect(res.verdicts.some((v) => v.type === "match" && v.midi === midi)).toBe(true);
      expect(res.verdicts.some((v) => v.type === "wrong")).toBe(false);
    });
  }
});

describe("wrong notes are identified, not just missed", () => {
  it("expected E4, played F4 → wrong verdict naming F4", () => {
    const { detector, verifier } = makePair();
    verifier.setExpected([64]);
    const signal = makeSignal(2, 7);
    synthInto(signal, LEAD_IN, 65, 1.2);
    const res = run(signal, detector, verifier);
    expect(res.completed).toBe(false);
    const wrong = res.verdicts.find((v) => v.type === "wrong");
    expect(wrong).toBeDefined();
    expect(wrong && wrong.type === "wrong" && wrong.playedMidi).toBe(65);
  });

  it("expected G2, played D3 (a fifth off — shifted hand) → wrong verdict", () => {
    const { detector, verifier } = makePair();
    verifier.setExpected([43]);
    const signal = makeSignal(2, 22);
    synthInto(signal, LEAD_IN, 50, 1.2);
    const res = run(signal, detector, verifier);
    expect(res.completed).toBe(false);
    const wrong = res.verdicts.find((v) => v.type === "wrong");
    expect(wrong && wrong.type === "wrong" && wrong.playedMidi).toBe(50);
  });

  it("expected G4, played A4 → wrong verdict, no match", () => {
    const { detector, verifier } = makePair();
    verifier.setExpected([67]);
    const signal = makeSignal(2, 8);
    synthInto(signal, LEAD_IN, 69, 1.2);
    const res = run(signal, detector, verifier);
    expect(res.completed).toBe(false);
    expect(res.verdicts.some((v) => v.type === "wrong")).toBe(true);
  });
});

describe("chords", () => {
  it("validates a C major triad", () => {
    const { detector, verifier } = makePair();
    verifier.setExpected([60, 64, 67]);
    const signal = makeSignal(2, 9);
    for (const m of [60, 64, 67]) synthInto(signal, LEAD_IN, m, 1.2, 0.15);
    const res = run(signal, detector, verifier);
    expect(res.completed).toBe(true);
  });

  it("validates a slightly rolled chord", () => {
    const { detector, verifier } = makePair();
    verifier.setExpected([60, 64, 67]);
    const signal = makeSignal(2.5, 10);
    synthInto(signal, LEAD_IN, 60, 1.5, 0.15);
    synthInto(signal, LEAD_IN + Math.floor(0.06 * SR), 64, 1.5, 0.15);
    synthInto(signal, LEAD_IN + Math.floor(0.12 * SR), 67, 1.5, 0.15);
    const res = run(signal, detector, verifier);
    expect(res.completed).toBe(true);
  });
});

describe("octave errors", () => {
  it("expected C5, played C4: forgiven in lenient mode (flagged octaveBelow)", () => {
    const { detector, verifier } = makePair({ forgive: true });
    verifier.setExpected([72]);
    const signal = makeSignal(2, 11);
    synthInto(signal, LEAD_IN, 60, 1.2);
    const res = run(signal, detector, verifier);
    expect(res.completed).toBe(true);
    const match = res.verdicts.find((v) => v.type === "match");
    expect(match && match.type === "match" && match.octaveBelow).toBe(true);
  });

  it("expected C5, played C4: rejected in strict mode", () => {
    const { detector, verifier } = makePair({ strict: true, forgive: false });
    verifier.setExpected([72]);
    const signal = makeSignal(2, 12);
    synthInto(signal, LEAD_IN, 60, 1.2);
    const res = run(signal, detector, verifier);
    expect(res.completed).toBe(false);
    expect(res.verdicts.some((v) => v.type === "wrong")).toBe(true);
  });
});

describe("noise robustness — never a false red", () => {
  it("loud broadband noise burst yields no wrong verdicts", () => {
    const { detector, verifier } = makePair();
    verifier.setExpected([64]);
    const signal = makeSignal(2, 13);
    const rand = mulberry32(99);
    for (let i = LEAD_IN; i < LEAD_IN + SR; i++) signal[i] += (rand() - 0.5) * 0.12;
    const res = run(signal, detector, verifier);
    expect(res.verdicts.filter((v) => v.type === "wrong")).toHaveLength(0);
    expect(res.completed).toBe(false);
  });

  it("silence yields nothing at all", () => {
    const { detector, verifier } = makePair();
    verifier.setExpected([60]);
    const signal = makeSignal(1.5, 14);
    const res = run(signal, detector, verifier);
    expect(res.verdicts).toHaveLength(0);
    expect(res.completed).toBe(false);
  });
});

describe("onset gating — ringing notes can't validate the next event", () => {
  it("a still-ringing C4 does not validate a new C4 expectation without a fresh strike", () => {
    const { detector, verifier } = makePair();
    verifier.setExpected([60]);
    const signal = makeSignal(3, 15);
    synthInto(signal, LEAD_IN, 60, 2.4);
    const strikeHop = Math.floor(LEAD_IN / HOP_SIZE);
    let firstDone = false;
    const res = run(signal, detector, verifier, (h) => {
      // Once the first strike validated, expect the SAME pitch again — only a
      // new onset should be able to validate it.
      if (!firstDone && h === strikeHop + 10) {
        firstDone = true;
        verifier.setExpected([60]);
      }
    });
    // The first strike matches quickly; after re-arming at +10 hops with the
    // note merely ringing on, no second match may appear.
    const matches = res.verdicts.filter((v) => v.type === "match");
    expect(matches.length).toBe(1);
  });

  it("the same note struck twice in a row validates twice (repeated notes)", () => {
    const { detector, verifier } = makePair();
    verifier.setExpected([64]);
    const signal = makeSignal(3, 21);
    synthInto(signal, LEAD_IN, 64, 2.0);
    const secondStrike = LEAD_IN + Math.floor(0.5 * SR);
    synthInto(signal, secondStrike, 64, 1.5);
    let rearmed = false;
    const res = run(signal, detector, verifier, (h) => {
      // As soon as the first E4 validates, expect E4 again (like E E in a melody).
      if (!rearmed && verifier.getExpected().length > 0) {
        // re-arm shortly before the second strike
        if (h === Math.floor(secondStrike / HOP_SIZE) - 2) {
          verifier.setExpected([64]);
          rearmed = true;
        }
      }
    });
    const matches = res.verdicts.filter((v) => v.type === "match");
    expect(matches.length).toBe(2);
  });

  it("a fresh D4 strike over a ringing C4 validates D4", () => {
    const { detector, verifier } = makePair();
    const signal = makeSignal(3, 16);
    synthInto(signal, LEAD_IN, 60, 2.4);
    const dStart = LEAD_IN + Math.floor(1.0 * SR);
    synthInto(signal, dStart, 62, 1.2);
    verifier.setExpected([62]); // D4 expected from the start; C4 must not trigger it
    const res = run(signal, detector, verifier);
    expect(res.completed).toBe(true);
    const hopOfD = Math.floor(dStart / HOP_SIZE);
    expect(res.completedAtHop).toBeGreaterThanOrEqual(hopOfD);
  });
});
