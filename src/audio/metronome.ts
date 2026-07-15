// WebAudio metronome using the standard lookahead-scheduler pattern: a coarse
// JS timer schedules sample-accurate clicks slightly ahead on the audio clock.
// Clicks are short filtered noise bursts, deliberately unlike piano partials
// so they don't confuse the detector.

export interface MetronomeTick {
  beat: number; // 0-based beat index since start
  time: number; // AudioContext time of the click
  isDownbeat: boolean;
}

export class Metronome {
  private context: AudioContext;
  private timer: number | null = null;
  private nextBeatTime = 0;
  private beat = 0;
  bpm: number;
  beatsPerBar: number;
  onTick: ((tick: MetronomeTick) => void) | null = null;
  private lookahead = 0.1; // schedule 100ms ahead
  private interval = 25; // check every 25ms
  private gain: GainNode;

  constructor(context: AudioContext, bpm: number, beatsPerBar: number) {
    this.context = context;
    this.bpm = bpm;
    this.beatsPerBar = beatsPerBar;
    this.gain = context.createGain();
    this.gain.gain.value = 0.5;
    this.gain.connect(context.destination);
  }

  start(startDelay = 0.15) {
    this.stop();
    this.beat = 0;
    this.nextBeatTime = this.context.currentTime + startDelay;
    this.timer = window.setInterval(() => this.schedule(), this.interval);
  }

  stop() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  get secondsPerBeat(): number {
    return 60 / this.bpm;
  }

  private schedule() {
    while (this.nextBeatTime < this.context.currentTime + this.lookahead) {
      const isDownbeat = this.beat % this.beatsPerBar === 0;
      this.click(this.nextBeatTime, isDownbeat);
      this.onTick?.({ beat: this.beat, time: this.nextBeatTime, isDownbeat });
      this.beat++;
      this.nextBeatTime += this.secondsPerBeat;
    }
  }

  private click(time: number, isDownbeat: boolean) {
    const ctx = this.context;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = isDownbeat ? 7000 : 5500;
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(0.6, time + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
    osc.connect(env);
    env.connect(this.gain);
    osc.start(time);
    osc.stop(time + 0.05);
  }
}
