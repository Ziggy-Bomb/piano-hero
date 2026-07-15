// Speaker-side piano-ish synth: the same additive recipe the fake piano and
// the engine tests use (6 stretched partials, 1/k amplitudes, exponential
// decay), so what you hear in previews is what the detector was built for.

const INHARMONICITY_B = 4e-4;

interface ActiveVoice {
  oscs: OscillatorNode[];
  gain: GainNode;
  stopAt: number;
}

export class PianoSynth {
  private context: AudioContext;
  private master: GainNode;
  private voices: ActiveVoice[] = [];

  constructor(context: AudioContext, destination?: AudioNode) {
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = 0.25;
    this.master.connect(destination ?? context.destination);
  }

  /** Schedule one note strike at absolute audio-clock time `when`. */
  noteOn(midi: number, when: number, durationSec: number, gain = 0.5): void {
    const f0 = 440 * Math.pow(2, (midi - 69) / 12);
    const ring = Math.min(durationSec + 0.35, 3);
    const env = this.context.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(1, when + 0.008);
    env.gain.setTargetAtTime(0.0001, when + 0.02, 0.4); // ~exp(-2.5t) decay
    env.gain.setValueAtTime(0.0001, when + ring);
    env.connect(this.master);

    const oscs: OscillatorNode[] = [];
    for (let k = 1; k <= 6; k++) {
      const fk = k * f0 * Math.sqrt(1 + INHARMONICITY_B * k * k);
      if (fk > this.context.sampleRate / 2) break;
      const osc = this.context.createOscillator();
      osc.type = "sine";
      osc.frequency.value = fk;
      const partialGain = this.context.createGain();
      partialGain.gain.value = gain / k;
      osc.connect(partialGain);
      partialGain.connect(env);
      osc.start(when);
      osc.stop(when + ring + 0.05);
      oscs.push(osc);
    }
    this.voices.push({ oscs, gain: env, stopAt: when + ring });
    this.prune();
  }

  stopAll(): void {
    const now = this.context.currentTime;
    for (const v of this.voices) {
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setTargetAtTime(0.0001, now, 0.03);
        for (const o of v.oscs) o.stop(now + 0.15);
      } catch {
        // already stopped
      }
    }
    this.voices = [];
  }

  private prune(): void {
    const now = this.context.currentTime;
    this.voices = this.voices.filter((v) => v.stopAt > now);
  }
}
