// Core listening engine. Pure TypeScript (no DOM/WebAudio) so it runs in unit
// tests under Node and inside the browser identically.
//
// The engine never transcribes freely: it answers "did the expected pitches
// sound just now?" using harmonic-template evidence measured on an FFT
// spectrum, gated by onset detection and by the *rise* in evidence versus the
// pre-onset spectrum (so ringing strings and pedal wash don't validate new
// notes).

import { Spectrum, interpolatePeak } from "./fft";

export interface Calibration {
  noiseFloorRms: number;
  tuningCents: number;
  inharmonicityB: number;
}

export const DEFAULT_CALIBRATION: Calibration = {
  noiseFloorRms: 0.003,
  tuningCents: 0,
  inharmonicityB: 4e-4,
};

export interface DetectorFrame {
  /** Seconds of audio consumed so far. */
  time: number;
  rms: number;
  flux: number;
  onset: boolean;
  /** Frames elapsed since the most recent onset (0 on the onset frame). */
  framesSinceOnset: number;
  mags: Float32Array;
  /** Spectrum snapshot from just before the most recent onset. */
  preOnsetMags: Float32Array | null;
}

export const HOP_SIZE = 2048;
export const WINDOW_SIZE = 4096;
export const FFT_SIZE = 8192;

const FLUX_HISTORY = 24;
const SPECTRUM_HISTORY = 4; // frames kept for pre-onset snapshots
const FLUX_MAX_HZ = 5000;

export class NoteDetector {
  readonly sampleRate: number;
  readonly spectrum: Spectrum;
  calibration: Calibration;

  private buffer: Float32Array;
  private filled = 0;
  private hops = 0;
  private prevMags: Float32Array | null = null;
  private fluxHistory: number[] = [];
  private magsHistory: Float32Array[] = [];
  private framesSinceOnset = 1e9;
  private preOnsetMags: Float32Array | null = null;

  constructor(sampleRate: number, calibration: Calibration = DEFAULT_CALIBRATION) {
    this.sampleRate = sampleRate;
    this.calibration = { ...calibration };
    this.spectrum = new Spectrum(sampleRate, WINDOW_SIZE, FFT_SIZE);
    this.buffer = new Float32Array(WINDOW_SIZE);
  }

  get hopSeconds(): number {
    return HOP_SIZE / this.sampleRate;
  }

  /** Feed one hop of raw samples (any length; typically HOP_SIZE). */
  processHop(hop: Float32Array): DetectorFrame {
    // Slide the analysis window.
    const n = hop.length;
    if (n >= this.buffer.length) {
      this.buffer.set(hop.subarray(n - this.buffer.length));
    } else {
      this.buffer.copyWithin(0, n);
      this.buffer.set(hop, this.buffer.length - n);
    }
    this.filled = Math.min(this.buffer.length, this.filled + n);
    this.hops++;

    let sumSq = 0;
    for (let i = 0; i < n; i++) sumSq += hop[i] * hop[i];
    const rms = Math.sqrt(sumSq / Math.max(1, n));

    const mags = this.spectrum.magnitudes(this.buffer);

    // Half-wave-rectified spectral flux over the musically relevant band.
    const maxBin = Math.min(mags.length, Math.floor(this.spectrum.binOfFreq(FLUX_MAX_HZ)));
    let flux = 0;
    if (this.prevMags) {
      for (let i = 1; i < maxBin; i++) {
        const d = mags[i] - this.prevMags[i];
        if (d > 0) flux += d;
      }
    }

    // Adaptive onset threshold: median of recent flux, scaled, plus a floor
    // tied to the calibrated noise level.
    const sorted = [...this.fluxHistory].sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    const floor = this.calibration.noiseFloorRms * WINDOW_SIZE * 0.5;
    const threshold = median * 2.2 + floor;
    const loudEnough = rms > this.calibration.noiseFloorRms * 2.5;
    // Attack-tail suppression: the tail of a strike's attack can nudge flux
    // above the adaptive threshold a few frames later; a genuine new onset
    // must be comparable to the recent maximum, not a faint echo of it.
    let recentMax = 0;
    for (let i = Math.max(0, this.fluxHistory.length - 10); i < this.fluxHistory.length; i++) {
      recentMax = Math.max(recentMax, this.fluxHistory[i]);
    }
    const onset =
      this.fluxHistory.length >= 4 &&
      loudEnough &&
      flux > threshold &&
      flux > recentMax * 0.2 &&
      this.framesSinceOnset >= 2;

    if (onset) {
      // Snapshot from before the energy began rising (2 frames back if we
      // have it, else the oldest we hold).
      const h = this.magsHistory;
      this.preOnsetMags = h.length >= 2 ? h[h.length - 2] : h[h.length - 1] ?? null;
      this.framesSinceOnset = 0;
    } else {
      this.framesSinceOnset++;
    }

    this.fluxHistory.push(flux);
    if (this.fluxHistory.length > FLUX_HISTORY) this.fluxHistory.shift();

    this.magsHistory.push(mags.slice());
    if (this.magsHistory.length > SPECTRUM_HISTORY) this.magsHistory.shift();

    this.prevMags = this.magsHistory[this.magsHistory.length - 1];

    return {
      time: (this.hops * HOP_SIZE) / this.sampleRate,
      rms,
      flux,
      onset,
      framesSinceOnset: this.framesSinceOnset,
      mags,
      preOnsetMags: this.preOnsetMags,
    };
  }
}

export function midiToFreq(midi: number, tuningCents = 0): number {
  return 440 * Math.pow(2, (midi - 69) / 12) * Math.pow(2, tuningCents / 1200);
}

export function freqToMidi(freq: number, tuningCents = 0): number {
  return 69 + 12 * Math.log2(freq / (440 * Math.pow(2, tuningCents / 1200)));
}

export interface PitchEvidence {
  /** Weighted harmonic evidence in dB above local background. */
  evidenceDb: number;
  /** Number of partials found clearly above background. */
  partials: number;
}

/**
 * Harmonic-template evidence for a fundamental f0 in a magnitude spectrum.
 * Searches stretched partials (piano inharmonicity model f_k = k*f0*sqrt(1+B*k^2)),
 * each within a cents window, and scores peak height above the local
 * background (median of the surrounding semitone band).
 */
export function measurePitchEvidence(
  mags: Float32Array,
  binHz: number,
  f0: number,
  inharmonicityB: number,
  maxPartials = 6,
): PitchEvidence {
  let evidence = 0;
  let weightSum = 0;
  let partials = 0;
  const nyquistBin = mags.length - 2;

  // Absolute reference: a partial must stand within 40 dB of the frame's
  // loudest musical-band peak. Without this floor, leakage sidelobes in an
  // otherwise-quiet spectral neighborhood look like strong "evidence".
  const maxSearchBin = Math.min(nyquistBin, Math.floor(5000 / binHz));
  let frameMax = 0;
  for (let b = 1; b <= maxSearchBin; b++) {
    if (mags[b] > frameMax) frameMax = mags[b];
  }
  const globalFloor = frameMax * Math.pow(10, -40 / 20);

  for (let k = 1; k <= maxPartials; k++) {
    const fk = k * f0 * Math.sqrt(1 + inharmonicityB * k * k);
    const centsWindow = 40 + 5 * k;
    const lo = Math.max(1, Math.floor((fk * Math.pow(2, -centsWindow / 1200)) / binHz));
    const hi = Math.min(nyquistBin, Math.ceil((fk * Math.pow(2, centsWindow / 1200)) / binHz));
    if (hi <= lo) break;

    let peakBin = lo;
    for (let b = lo; b <= hi; b++) {
      if (mags[b] > mags[peakBin]) peakBin = b;
    }
    // A real partial is a local maximum. A window whose max sits on the edge
    // still rising outward is just the skirt of a peak that lives elsewhere.
    if (
      (peakBin === lo && lo > 1 && mags[lo - 1] > mags[lo]) ||
      (peakBin === hi && hi < nyquistBin && mags[hi + 1] > mags[hi])
    ) {
      weightSum += 1 / k;
      continue;
    }
    const peak = interpolatePeak(mags, peakBin);

    // Local background: median over +/- 1 semitone, excluding the peak vicinity.
    const bandLo = Math.max(1, Math.floor((fk * Math.pow(2, -100 / 1200)) / binHz));
    const bandHi = Math.min(nyquistBin, Math.ceil((fk * Math.pow(2, 100 / 1200)) / binHz));
    const band: number[] = [];
    for (let b = bandLo; b <= bandHi; b++) {
      if (Math.abs(b - peakBin) > 2) band.push(mags[b]);
    }
    band.sort((a, b) => a - b);
    const localMedian = band.length ? band[Math.floor(band.length / 2)] : 0;
    const background = Math.max(localMedian, globalFloor, 1e-9);

    const partialDb = 20 * Math.log10((peak.mag + 1e-12) / (background + 1e-12));
    const weight = 1 / k;
    if (partialDb > 6) {
      partials++;
      evidence += weight * partialDb;
    }
    weightSum += weight;
  }

  return { evidenceDb: weightSum > 0 ? evidence / weightSum : 0, partials };
}

/**
 * Rise in evidence for f0 between the pre-onset spectrum and the current one.
 * This is what distinguishes a freshly struck note from one still ringing.
 */
export function measureDeltaEvidence(
  mags: Float32Array,
  preMags: Float32Array | null,
  binHz: number,
  f0: number,
  inharmonicityB: number,
  maxPartials = 6,
): { deltaDb: number; partials: number } {
  // Like measurePitchEvidence, but each partial is scored against the LOUDER
  // of the local background and that partial's own pre-onset magnitude. A
  // partial only counts if it ROSE — this is what lets a re-struck note (the
  // same pitch played twice in a row) validate while a merely ringing note
  // cannot: the re-strike pushes the partial well above its decayed level.
  let evidence = 0;
  let weightSum = 0;
  let partials = 0;
  const nyquistBin = mags.length - 2;

  const maxSearchBin = Math.min(nyquistBin, Math.floor(5000 / binHz));
  let frameMax = 0;
  for (let b = 1; b <= maxSearchBin; b++) {
    if (mags[b] > frameMax) frameMax = mags[b];
  }
  const globalFloor = frameMax * Math.pow(10, -40 / 20);

  for (let k = 1; k <= maxPartials; k++) {
    const fk = k * f0 * Math.sqrt(1 + inharmonicityB * k * k);
    const centsWindow = 40 + 5 * k;
    const lo = Math.max(1, Math.floor((fk * Math.pow(2, -centsWindow / 1200)) / binHz));
    const hi = Math.min(nyquistBin, Math.ceil((fk * Math.pow(2, centsWindow / 1200)) / binHz));
    if (hi <= lo) break;

    let peakBin = lo;
    for (let b = lo; b <= hi; b++) {
      if (mags[b] > mags[peakBin]) peakBin = b;
    }
    if (
      (peakBin === lo && lo > 1 && mags[lo - 1] > mags[lo]) ||
      (peakBin === hi && hi < nyquistBin && mags[hi + 1] > mags[hi])
    ) {
      weightSum += 1 / k;
      continue;
    }
    const peak = interpolatePeak(mags, peakBin);

    const bandLo = Math.max(1, Math.floor((fk * Math.pow(2, -100 / 1200)) / binHz));
    const bandHi = Math.min(nyquistBin, Math.ceil((fk * Math.pow(2, 100 / 1200)) / binHz));
    const band: number[] = [];
    for (let b = bandLo; b <= bandHi; b++) {
      if (Math.abs(b - peakBin) > 2) band.push(mags[b]);
    }
    band.sort((a, b) => a - b);
    const localMedian = band.length ? band[Math.floor(band.length / 2)] : 0;

    // Pre-onset level of this same partial (max over the peak's vicinity so
    // slight frequency drift can't dodge the comparison).
    let refMag = 0;
    if (preMags) {
      const rLo = Math.max(1, peakBin - 2);
      const rHi = Math.min(nyquistBin, peakBin + 2);
      for (let b = rLo; b <= rHi; b++) {
        if (preMags[b] > refMag) refMag = preMags[b];
      }
    }

    const background = Math.max(localMedian, globalFloor, refMag, 1e-9);
    const partialDb = 20 * Math.log10((peak.mag + 1e-12) / (background + 1e-12));
    const weight = 1 / k;
    if (partialDb > 6) {
      partials++;
      evidence += weight * partialDb;
    }
    weightSum += weight;
  }

  return { deltaDb: weightSum > 0 ? evidence / weightSum : 0, partials };
}
