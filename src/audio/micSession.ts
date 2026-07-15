// Microphone lifecycle for iOS Safari: everything starts from a user gesture,
// voice-processing DSP is disabled (it mangles piano audio), and the capture
// AudioWorklet posts fixed-size hops to the main thread where the pure
// NoteDetector runs.

import { HOP_SIZE } from "./noteDetector";

// The worklet is tiny, so it's inlined and loaded via a Blob URL — avoids any
// bundler configuration issues and works in Safari.
const WORKLET_CODE = `
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.hopSize = ${HOP_SIZE};
    this.buffer = new Float32Array(this.hopSize);
    this.offset = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];
    let i = 0;
    while (i < channel.length) {
      const take = Math.min(channel.length - i, this.hopSize - this.offset);
      this.buffer.set(channel.subarray(i, i + take), this.offset);
      this.offset += take;
      i += take;
      if (this.offset === this.hopSize) {
        const out = this.buffer;
        this.port.postMessage(out, [out.buffer]);
        this.buffer = new Float32Array(this.hopSize);
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor("capture-processor", CaptureProcessor);
`;

export interface MicSession {
  context: AudioContext;
  sampleRate: number;
  stop: () => void;
}

export async function startMicSession(onHop: (hop: Float32Array) => void): Promise<MicSession> {
  // Dev-only fake piano (?fake=1): synthesizes notes into the pipeline so the
  // whole app can be exercised without a piano or microphone.
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("fake")) {
    return startFakeSession(onHop);
  }
  // getUserMedia FIRST (inside the user gesture), then create the context, so
  // iOS doesn't pin a mismatched sample rate.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  const context = new AudioContext();
  if (context.state === "suspended") await context.resume();

  const workletUrl = URL.createObjectURL(new Blob([WORKLET_CODE], { type: "application/javascript" }));
  try {
    await context.audioWorklet.addModule(workletUrl);
  } finally {
    URL.revokeObjectURL(workletUrl);
  }

  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, "capture-processor", {
    numberOfInputs: 1,
    numberOfOutputs: 0,
  });
  node.port.onmessage = (e: MessageEvent<Float32Array>) => onHop(e.data);
  source.connect(node);

  let wakeLock: WakeLockSentinel | null = null;
  const acquireWakeLock = async () => {
    try {
      if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
    } catch {
      // Not fatal: practice still works, screen may sleep.
    }
  };
  void acquireWakeLock();
  const onVisibility = () => {
    if (document.visibilityState === "visible") void acquireWakeLock();
  };
  document.addEventListener("visibilitychange", onVisibility);

  return {
    context,
    sampleRate: context.sampleRate,
    stop: () => {
      document.removeEventListener("visibilitychange", onVisibility);
      wakeLock?.release().catch(() => {});
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void context.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Fake piano for development: window.__fakePiano.play([60, 64]) strikes notes.

interface FakeNote {
  midi: number;
  gain: number;
  startSample: number; // absolute sample position of the strike
}

function startFakeSession(onHop: (hop: Float32Array) => void): MicSession {
  const context = new AudioContext();
  const sr = context.sampleRate;
  const active: FakeNote[] = [];
  let noiseSeed = 1;
  const startWall = performance.now();
  let samplePos = 0; // absolute samples generated so far

  const wallSamples = () => Math.floor(((performance.now() - startWall) / 1000) * sr);

  (window as any).__fakePiano = {
    play(midis: number[], gain = 0.2) {
      // Timestamp strikes on the wall clock so throttled timers can't squash
      // consecutive strikes together in sample-time.
      const at = Math.max(samplePos, wallSamples());
      for (const m of midis) active.push({ midi: m, gain, startSample: at });
    },
    /** Schedule strikes on the sample clock: [[60],[64,67],...] gapMs apart. */
    playSequence(seq: number[][], gapMs = 700, gain = 0.2) {
      const base = Math.max(samplePos, wallSamples());
      const gap = Math.floor((gapMs / 1000) * sr);
      seq.forEach((midis, i) => {
        for (const m of midis) active.push({ midi: m, gain, startSample: base + i * gap });
      });
    },
  };

  const generateHop = () => {
    const hop = new Float32Array(HOP_SIZE);
    for (let i = 0; i < HOP_SIZE; i++) {
      noiseSeed = (noiseSeed * 1103515245 + 12345) & 0x7fffffff;
      hop[i] = (noiseSeed / 0x7fffffff - 0.5) * 0.002;
    }
    for (const note of active) {
      const f0 = 440 * Math.pow(2, (note.midi - 69) / 12);
      for (let k = 1; k <= 6; k++) {
        const fk = k * f0 * Math.sqrt(1 + 4e-4 * k * k);
        if (fk > sr / 2) break;
        const w = (2 * Math.PI * fk) / sr;
        const amp = note.gain / k;
        for (let i = 0; i < HOP_SIZE; i++) {
          const n = samplePos + i - note.startSample;
          if (n < 0) continue;
          hop[i] += amp * Math.exp(-2.5 * (n / sr)) * Math.sin(w * n);
        }
      }
    }
    samplePos += HOP_SIZE;
    for (let i = active.length - 1; i >= 0; i--) {
      if (samplePos - active[i].startSample > sr * 3) active.splice(i, 1);
    }
    onHop(hop);
  };

  // Timers may be heavily throttled (background tabs); on every tick, catch
  // the sample clock up to the wall clock (bounded per tick).
  const timer = window.setInterval(() => {
    let generated = 0;
    while (samplePos + HOP_SIZE <= wallSamples() && generated < 40) {
      generateHop();
      generated++;
    }
  }, 20);

  return {
    context,
    sampleRate: sr,
    stop: () => {
      clearInterval(timer);
      delete (window as any).__fakePiano;
      void context.close();
    },
  };
}
