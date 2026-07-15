// One-time (re-runnable) calibration: measures the room's noise floor and the
// piano's overall tuning offset, then lets the child play with a live
// "note lights up" keyboard as a fun verification.

import { useEffect, useRef, useState } from "react";
import { PitchDetector } from "pitchy";
import { useStore } from "../state/store";
import { startMicSession, MicSession } from "../audio/micSession";
import { DEFAULT_CALIBRATION, freqToMidi } from "../audio/noteDetector";
import { MiniKeyboard } from "../ui/MiniKeyboard";
import { midiNoteName } from "../ui/notes";

type Step = "intro" | "quiet" | "playC4" | "playC5" | "toy";

const WINDOW = 4096;

export function Calibrate() {
  const setScreen = useStore((s) => s.setScreen);
  const setCalibration = useStore((s) => s.setCalibration);
  const existing = useStore((s) => s.calibration);

  const [step, setStep] = useState<Step>("intro");
  const [liveMidi, setLiveMidi] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quietProgress, setQuietProgress] = useState(0);

  const micRef = useRef<MicSession | null>(null);
  const stepRef = useRef<Step>("intro");
  stepRef.current = step;

  const bufferRef = useRef(new Float32Array(WINDOW));
  const rmsSamplesRef = useRef<number[]>([]);
  const centsSamplesRef = useRef<number[]>([]);
  const noiseFloorRef = useRef(DEFAULT_CALIBRATION.noiseFloorRms);
  const centsC4Ref = useRef<number | null>(null);
  const detectorRef = useRef<PitchDetector<Float32Array> | null>(null);

  const start = async () => {
    try {
      const mic = await startMicSession(onHop);
      micRef.current = mic;
      detectorRef.current = PitchDetector.forFloat32Array(WINDOW);
      rmsSamplesRef.current = [];
      setQuietProgress(0);
      setStep("quiet");
    } catch (e) {
      setError(`Couldn't use the microphone: ${String((e as Error)?.message ?? e)}`);
    }
  };

  const onHop = (hop: Float32Array) => {
    const buf = bufferRef.current;
    buf.copyWithin(0, hop.length);
    buf.set(hop, buf.length - hop.length);

    let sum = 0;
    for (let i = 0; i < hop.length; i++) sum += hop[i] * hop[i];
    const rms = Math.sqrt(sum / hop.length);

    const s = stepRef.current;
    if (s === "quiet") {
      rmsSamplesRef.current.push(rms);
      setQuietProgress(Math.min(1, rmsSamplesRef.current.length / 50));
      if (rmsSamplesRef.current.length >= 50) {
        const sorted = [...rmsSamplesRef.current].sort((a, b) => a - b);
        noiseFloorRef.current = Math.max(1e-4, sorted[Math.floor(sorted.length * 0.5)]);
        centsSamplesRef.current = [];
        setStep("playC4");
      }
      return;
    }

    if (s === "playC4" || s === "playC5" || s === "toy") {
      if (rms < noiseFloorRef.current * 4) return;
      const mic = micRef.current;
      const det = detectorRef.current;
      if (!mic || !det) return;
      const [freq, clarity] = det.findPitch(buf, mic.sampleRate);
      if (clarity < 0.92 || freq < 40 || freq > 2200) return;

      const midiFloat = freqToMidi(freq);
      const nearest = Math.round(midiFloat);
      setLiveMidi(nearest);

      if (s === "toy") return;
      const target = s === "playC4" ? 60 : 72;
      if (nearest !== target) return;
      const cents = (midiFloat - nearest) * 100;
      centsSamplesRef.current.push(cents);
      if (centsSamplesRef.current.length >= 8) {
        const sorted = [...centsSamplesRef.current].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        if (s === "playC4") {
          centsC4Ref.current = median;
          centsSamplesRef.current = [];
          setStep("playC5");
        } else {
          const tuningCents = ((centsC4Ref.current ?? 0) + median) / 2;
          setCalibration({
            noiseFloorRms: noiseFloorRef.current,
            tuningCents: Math.max(-45, Math.min(45, tuningCents)),
            inharmonicityB: DEFAULT_CALIBRATION.inharmonicityB,
          });
          setStep("toy");
        }
      }
    }
  };

  useEffect(
    () => () => {
      micRef.current?.stop();
      micRef.current = null;
    },
    [],
  );

  const done = () => {
    micRef.current?.stop();
    micRef.current = null;
    setScreen("home");
  };

  return (
    <div className="screen calibrate">
      <header className="home-header">
        <h1>🎤 Piano check-up</h1>
      </header>

      {error && <div className="toast toast-wrong">{error}</div>}

      {step === "intro" && (
        <div className="calibrate-card">
          <p>
            Let's teach the app what <b>your</b> piano and <b>your</b> room sound like.
            It takes about 30 seconds. Put the device where it will sit during practice
            (music stand is perfect).
          </p>
          {existing && <p className="muted">Already calibrated — running it again is fine.</p>}
          <button className="btn-big btn-start" onClick={start}>Let's go!</button>
          <button className="btn-big btn-secondary" onClick={done}>← Back</button>
        </div>
      )}

      {step === "quiet" && (
        <div className="calibrate-card">
          <h2>🤫 Shhh…</h2>
          <p>Stay quiet for a moment — I'm listening to the room.</p>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${quietProgress * 100}%` }} />
          </div>
        </div>
      )}

      {step === "playC4" && (
        <div className="calibrate-card">
          <h2>🎹 Play middle C!</h2>
          <p>Press middle C a few times, nice and clearly.</p>
          <MiniKeyboard highlight={[60]} from={55} to={67} color="#38bdf8" />
          {liveMidi && <p className="live-note">I hear: <b>{midiNoteName(liveMidi, true)}</b></p>}
        </div>
      )}

      {step === "playC5" && (
        <div className="calibrate-card">
          <h2>🎹 Now the C above!</h2>
          <p>One octave up — play it a few times.</p>
          <MiniKeyboard highlight={[72]} from={67} to={79} color="#38bdf8" />
          {liveMidi && <p className="live-note">I hear: <b>{midiNoteName(liveMidi, true)}</b></p>}
        </div>
      )}

      {step === "toy" && (
        <div className="calibrate-card">
          <h2>✨ All set!</h2>
          <p>Try it — play any key and watch it light up!</p>
          <MiniKeyboard
            highlight={liveMidi ? [liveMidi] : []}
            from={48}
            to={84}
            color="#22c55e"
          />
          {liveMidi && <p className="live-note">{midiNoteName(liveMidi, true)}</p>}
          <button className="btn-big btn-start" onClick={done}>Done — let's play! 🎉</button>
        </div>
      )}
    </div>
  );
}
