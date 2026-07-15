// Thin wrapper over fft.js: Hann-windowed, zero-padded magnitude spectrum.
import FFT from "fft.js";

export class Spectrum {
  readonly fftSize: number;
  readonly windowSize: number;
  readonly sampleRate: number;
  readonly binHz: number;
  private fft: FFT;
  private window: Float32Array;
  private input: Float32Array;
  private complex: number[];

  constructor(sampleRate: number, windowSize = 4096, fftSize = 8192) {
    this.sampleRate = sampleRate;
    this.windowSize = windowSize;
    this.fftSize = fftSize;
    this.binHz = sampleRate / fftSize;
    this.fft = new FFT(fftSize);
    this.input = new Float32Array(fftSize);
    this.complex = this.fft.createComplexArray();
    this.window = new Float32Array(windowSize);
    for (let i = 0; i < windowSize; i++) {
      this.window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (windowSize - 1)));
    }
  }

  /** Magnitude spectrum of the latest `windowSize` samples, zero-padded to `fftSize`. */
  magnitudes(samples: Float32Array, out?: Float32Array): Float32Array {
    const n = this.windowSize;
    this.input.fill(0);
    const start = samples.length - n;
    for (let i = 0; i < n; i++) {
      this.input[i] = samples[start + i] * this.window[i];
    }
    this.fft.realTransform(this.complex, this.input as unknown as number[]);
    const bins = this.fftSize / 2;
    const mags = out ?? new Float32Array(bins);
    for (let i = 0; i < bins; i++) {
      const re = this.complex[2 * i];
      const im = this.complex[2 * i + 1];
      mags[i] = Math.hypot(re, im);
    }
    return mags;
  }

  freqOfBin(bin: number): number {
    return bin * this.binHz;
  }

  binOfFreq(freq: number): number {
    return freq / this.binHz;
  }
}

/** Parabolic interpolation around a peak bin -> {bin: fractional bin, mag}. */
export function interpolatePeak(mags: Float32Array, bin: number): { bin: number; mag: number } {
  if (bin <= 0 || bin >= mags.length - 1) return { bin, mag: mags[bin] ?? 0 };
  const a = mags[bin - 1];
  const b = mags[bin];
  const c = mags[bin + 1];
  const denom = a - 2 * b + c;
  if (denom === 0) return { bin, mag: b };
  const delta = (0.5 * (a - c)) / denom;
  const clamped = Math.max(-0.5, Math.min(0.5, delta));
  const mag = b - 0.25 * (a - c) * clamped;
  return { bin: bin + clamped, mag };
}
