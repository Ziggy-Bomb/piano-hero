// The practice screen wires everything together: mic → detector → verifier →
// mode controller → cursor/colors/XP.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state/store";
import { loadLibrary, loadPieceXml, PieceMeta } from "../pieces/library";
import { ScoreView } from "../score/osmdView";
import { NoteEvent, filterTimelineByStaff } from "../score/timeline";
import { colorEventUnderCursor, colorNoteUnderCursor, COLORS } from "../score/colorizer";
import { startMicSession, MicSession } from "../audio/micSession";
import { NoteDetector, FFT_SIZE, DEFAULT_CALIBRATION } from "../audio/noteDetector";
import { NoteVerifier, LENIENT_OPTIONS, STRICT_OPTIONS } from "../audio/noteVerifier";
import { Metronome } from "../audio/metronome";
import { WaitModeController } from "../practice/waitMode";
import { TempoModeController } from "../practice/tempoMode";
import { PracticeSummary } from "../practice/types";
import { tierById, nextTier, starsForAccuracy, PASS_ACCURACY, TIERS } from "../practice/tiers";
import { nextStarGap } from "../practice/scoring";
import {
  deriveChunks,
  resolveChunkRange,
  sliceEventsByMeasures,
  DEFAULT_MEASURES_PER_CHUNK,
} from "../practice/chunks";
import { PlaybackController } from "../audio/playback";
import { buddyStage } from "../game/buddy";
import { XP, multiplierForCombo } from "../game/config";
import { celebrate, playJingle, smallSparkle } from "../game/celebrations";
import { MiniKeyboard } from "../ui/MiniKeyboard";
import { midiNoteName } from "../ui/notes";
import { UNLOCKABLES } from "../game/config";

type Phase = "loading" | "ready" | "listening" | "finished" | "error";

export function Practice() {
  const pieceId = useStore((s) => s.activePieceId);
  const tierId = useStore((s) => s.activeTier);
  const activeChunk = useStore((s) => s.activeChunk);
  const setScreen = useStore((s) => s.setScreen);
  const calibration = useStore((s) => s.calibration);
  const leniency = useStore((s) => s.leniency);
  const equipped = useStore((s) => s.equipped);
  const hesitationSeconds = useStore((s) => s.hesitationSeconds);
  const buddyName = useStore((s) => s.buddyName);
  const addXp = useStore((s) => s.addXp);
  const setComboStore = useStore((s) => s.setCombo);
  const recordTierResult = useStore((s) => s.recordTierResult);
  const recordChunkResult = useStore((s) => s.recordChunkResult);
  const logPracticeTime = useStore((s) => s.logPracticeTime);
  const prevBestAccuracy = useStore((s) =>
    pieceId && tierId ? s.pieces[pieceId]?.tiers[tierId]?.bestAccuracy ?? 0 : 0,
  );

  const tier = useMemo(() => (tierId ? tierById(tierId) : TIERS[0]), [tierId]);

  const [meta, setMeta] = useState<PieceMeta | null>(null);
  const [xml, setXml] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [scoreNonce, setScoreNonce] = useState(0); // bump to force a fresh render

  // HUD state
  const [combo, setCombo] = useState(0);
  const [sessionXp, setSessionXp] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [wrongMsg, setWrongMsg] = useState<string | null>(null);
  const [hintMidis, setHintMidis] = useState<number[] | null>(null);
  const [countIn, setCountIn] = useState<number | null>(null);
  const [summary, setSummary] = useState<PracticeSummary | null>(null);
  const [starsEarned, setStarsEarned] = useState<0 | 1 | 2 | 3>(0);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [gentleHintMidis, setGentleHintMidis] = useState<number[] | null>(null);
  const [hearing, setHearing] = useState(false);
  const [newBest, setNewBest] = useState(false);

  const osmdRef = useRef<any>(null);
  const judgedRef = useRef<NoteEvent[]>([]);
  const micRef = useRef<MicSession | null>(null);
  const controllerRef = useRef<WaitModeController | TempoModeController | null>(null);
  const metronomeRef = useRef<Metronome | null>(null);
  const cursorStepRef = useRef(0);
  const pausedRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);
  const sessionXpRef = useRef(0);
  const comboRef = useRef(0);
  const wrongTimerRef = useRef<number | null>(null);
  const scoreWrapRef = useRef<HTMLDivElement>(null);
  const gentleTimerRef = useRef<number | null>(null);
  const playbackRef = useRef<PlaybackController | null>(null);
  const allEventsRef = useRef<NoteEvent[]>([]);

  // Resolve the active chunk to a measure range (null = whole piece).
  const chunks = useMemo(
    () =>
      meta
        ? deriveChunks(
            meta.measureCount ?? 0,
            meta.measuresPerChunk ?? DEFAULT_MEASURES_PER_CHUNK,
          )
        : [],
    [meta],
  );
  const chunkRange = useMemo(
    () => resolveChunkRange(activeChunk, chunks),
    [activeChunk, chunks],
  );

  // ---- load piece ----------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lib = await loadLibrary();
        const m = lib.find((p) => p.id === pieceId);
        if (!m) throw new Error("Piece not found");
        const x = await loadPieceXml(m);
        if (cancelled) return;
        setMeta(m);
        setXml(x);
      } catch (e) {
        if (!cancelled) {
          setErrorMsg(String((e as Error).message ?? e));
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pieceId]);

  // ---- cursor helpers ------------------------------------------------------
  const updateCursorOverlay = useCallback(() => {
    try {
      const el = osmdRef.current?.cursor?.cursorElement as HTMLElement | undefined;
      const wrap = scoreWrapRef.current;
      if (el && wrap) {
        const elRect = el.getBoundingClientRect();
        const wrapRect = wrap.getBoundingClientRect();
        setCursorPos({
          x: elRect.left - wrapRect.left + elRect.width / 2,
          y: elRect.top - wrapRect.top + wrap.scrollTop,
        });
        // Keep the cursor comfortably in view.
        const targetY = elRect.top - wrapRect.top + wrap.scrollTop;
        if (targetY > wrap.scrollTop + wrap.clientHeight - 160 || targetY < wrap.scrollTop) {
          wrap.scrollTo({ top: Math.max(0, targetY - 120), behavior: "smooth" });
        }
      }
    } catch {
      // cosmetic only
    }
  }, []);

  const moveCursorToStep = useCallback(
    (step: number) => {
      const osmd = osmdRef.current;
      if (!osmd) return;
      try {
        if (step < cursorStepRef.current) {
          osmd.cursor.reset();
          cursorStepRef.current = 0;
        }
        while (cursorStepRef.current < step) {
          osmd.cursor.next();
          cursorStepRef.current++;
        }
        osmd.cursor.update?.();
      } catch {
        // never let cursor glitches kill practice
      }
      updateCursorOverlay();
    },
    [updateCursorOverlay],
  );

  const onScoreReady = useCallback(
    (osmd: any, events: NoteEvent[]) => {
      osmdRef.current = osmd;
      cursorStepRef.current = 0;
      allEventsRef.current = events;
      let judged = filterTimelineByStaff(events, tier.staff);
      if (chunkRange) {
        judged = sliceEventsByMeasures(judged, chunkRange.measureStart, chunkRange.measureEnd);
      }
      judgedRef.current = judged;
      setProgress({ done: 0, total: judged.length });
      setPhase("ready");
      if (judged.length > 0) moveCursorToStep(judged[0].step);
      updateCursorOverlay();
      if (import.meta.env.DEV) {
        (window as any).__pianoDebug = {
          osmd,
          allEvents: events,
          judged: judgedRef.current,
          moveCursorToStep,
        };
      }
    },
    [tier.staff, chunkRange, moveCursorToStep, updateCursorOverlay],
  );

  const onScoreError = useCallback((err: unknown) => {
    setErrorMsg(`Could not display this piece: ${String((err as Error)?.message ?? err)}`);
    setPhase("error");
  }, []);

  // ---- XP helpers ----------------------------------------------------------
  const awardNoteXp = (clean: boolean) => {
    comboRef.current += 1;
    const mult = multiplierForCombo(comboRef.current);
    const gained = (clean ? XP.cleanNote : XP.helpedNote) * mult;
    sessionXpRef.current += gained;
    setSessionXp(sessionXpRef.current);
    setCombo(comboRef.current);
    setComboStore(comboRef.current);
    if (comboRef.current > 0 && comboRef.current % 10 === 0) smallSparkle();
  };

  const breakCombo = () => {
    comboRef.current = 0;
    setCombo(0);
    setComboStore(0);
  };

  const flashWrong = (event: NoteEvent, playedMidi: number) => {
    colorEventUnderCursor(osmdRef.current, event, COLORS.wrong);
    if (wrongTimerRef.current) clearTimeout(wrongTimerRef.current);
    wrongTimerRef.current = window.setTimeout(() => {
      colorEventUnderCursor(osmdRef.current, event, "#0f172a");
    }, 600);
    const expected = event.notes.map((n) => midiNoteName(n.midi)).join(" + ");
    setWrongMsg(`That was ${midiNoteName(playedMidi)} — look for ${expected}!`);
    window.setTimeout(() => setWrongMsg(null), 2500);
  };

  // ---- start / stop --------------------------------------------------------
  const stopHearing = () => {
    playbackRef.current?.stop();
    playbackRef.current = null;
    setHearing(false);
  };

  const hearIt = () => {
    if (hearing) {
      stopHearing();
      return;
    }
    const ctl = new PlaybackController({
      events: judgedRef.current,
      bpm: meta ? Math.round(meta.targetTempo * (tier.mode === "tempo" ? tier.tempoFactor : 1)) : 100,
      staff: null,
      onAdvance: (event) => moveCursorToStep(event.step),
      onFinish: () => {
        setHearing(false);
        if (judgedRef.current.length > 0) moveCursorToStep(judgedRef.current[0].step);
      },
    });
    playbackRef.current = ctl;
    setHearing(true);
    ctl.start();
  };

  const startListening = async () => {
    if (!meta) return;
    stopHearing(); // never listen and play back at the same time
    try {
      let detector: NoteDetector | null = null;
      const mic = await startMicSession((hop) => {
        if (pausedRef.current || !detector) return;
        const frame = detector.processHop(hop);
        if (import.meta.env.DEV && frame.onset) {
          console.log(
            `[detector] onset t=${frame.time.toFixed(2)} rms=${frame.rms.toFixed(4)} flux=${frame.flux.toFixed(1)}`,
          );
        }
        controllerRef.current?.onFrame(frame);
      });
      micRef.current = mic;

      const calib = calibration ?? DEFAULT_CALIBRATION;
      detector = new NoteDetector(mic.sampleRate, calib);

      const base = tier.strict && leniency === "normal" ? STRICT_OPTIONS : LENIENT_OPTIONS;
      const verifier = new NoteVerifier({
        ...base,
        forgiveOctaveErrors: tier.forgiveOctaves || leniency === "generous",
        tuningCents: calib.tuningCents,
        inharmonicityB: calib.inharmonicityB,
      });
      verifier.binHzValue = mic.sampleRate / FFT_SIZE;
      if (import.meta.env.DEV) {
        (window as any).__pianoDebug = {
          ...(window as any).__pianoDebug,
          detector,
          verifier,
        };
        const origEval = verifier.evaluate.bind(verifier);
        verifier.evaluate = (frame) => {
          const r = origEval(frame);
          if (r.verdicts.length > 0) console.log("[verifier]", JSON.stringify(r.verdicts));
          return r;
        };
      }

      const clearGentleHint = () => {
        if (gentleTimerRef.current) {
          clearTimeout(gentleTimerRef.current);
          gentleTimerRef.current = null;
        }
        setGentleHintMidis(null);
      };

      const callbacks = {
        onAdvance: (event: NoteEvent) => {
          setProgress({ done: event.index, total: judgedRef.current.length });
          // Gentle note helper: if he sits on this event too long, show where
          // the key lives — no scoring penalty, reading comes first.
          clearGentleHint();
          if (tier.mode === "wait" && hesitationSeconds > 0) {
            gentleTimerRef.current = window.setTimeout(() => {
              setGentleHintMidis(event.notes.map((n) => n.midi));
            }, hesitationSeconds * 1000);
          }
        },
        onNoteCorrect: (event: NoteEvent, midi: number, clean: boolean) => {
          const note = event.notes.find((n) => n.midi === midi);
          if (note) colorNoteUnderCursor(osmdRef.current, note, COLORS.correct);
          setHintMidis(null);
          clearGentleHint();
          awardNoteXp(clean);
        },
        onWrongNote: (event: NoteEvent, playedMidi: number) => {
          breakCombo();
          clearGentleHint(); // the real hint flow takes over from here
          flashWrong(event, playedMidi);
        },
        onHint: (event: NoteEvent) => {
          setHintMidis(event.notes.map((n) => n.midi));
          colorEventUnderCursor(osmdRef.current, event, COLORS.hint);
        },
        onEventComplete: (_event: NoteEvent, _clean: boolean) => {
          setHintMidis(null);
          clearGentleHint();
        },
        onEventMissed: (event: NoteEvent) => {
          colorEventUnderCursor(osmdRef.current, event, COLORS.missed);
          breakCombo();
        },
        onFinish: (s: PracticeSummary) => finishRun(s),
      };

      if (tier.mode === "wait") {
        const ctl = new WaitModeController(judgedRef.current, verifier, moveCursorToStep, callbacks);
        controllerRef.current = ctl;
        ctl.start();
      } else {
        const bpm = Math.max(30, Math.round(meta.targetTempo * tier.tempoFactor));
        const metronome = new Metronome(mic.context, bpm, meta.beatsPerBar);
        metronomeRef.current = metronome;
        metronome.onTick = (tick) => {
          if (tick.beat < metronome.beatsPerBar) {
            setCountIn(metronome.beatsPerBar - tick.beat);
          } else {
            setCountIn(null);
          }
        };
        const ctl = new TempoModeController({
          events: judgedRef.current,
          verifier,
          metronome,
          moveCursorToStep,
          callbacks,
          windowFrac: tier.windowFrac,
          now: () => mic.context.currentTime,
        });
        controllerRef.current = ctl;
        ctl.start();
      }

      startedAtRef.current = Date.now();
      sessionXpRef.current = 0;
      comboRef.current = 0;
      setSessionXp(0);
      setCombo(0);
      setSummary(null);
      setPhase("listening");
    } catch (e) {
      setErrorMsg(
        "Couldn't use the microphone. Please allow microphone access and try again. " +
          `(${String((e as Error)?.message ?? e)})`,
      );
      setPhase("error");
    }
  };

  const teardownAudio = () => {
    (controllerRef.current as TempoModeController | null)?.stop?.();
    controllerRef.current = null;
    metronomeRef.current?.stop();
    metronomeRef.current = null;
    micRef.current?.stop();
    micRef.current = null;
    playbackRef.current?.stop();
    playbackRef.current = null;
    setHearing(false);
    if (gentleTimerRef.current) {
      clearTimeout(gentleTimerRef.current);
      gentleTimerRef.current = null;
    }
    setGentleHintMidis(null);
  };

  const logTime = () => {
    if (startedAtRef.current) {
      const minutes = (Date.now() - startedAtRef.current) / 60000;
      logPracticeTime(minutes, sessionXpRef.current);
      startedAtRef.current = null;
    }
  };

  const finishRun = (s: PracticeSummary) => {
    pausedRef.current = true;
    metronomeRef.current?.stop();
    const stars = starsForAccuracy(s.accuracy);
    const passed = s.accuracy >= PASS_ACCURACY;
    const isFullRun = activeChunk === "full";
    const isBaseChunk = typeof activeChunk === "number";
    const crowned = isFullRun && passed && tier.id === "t100";
    setSummary(s);
    setStarsEarned(stars);

    let bonus = 0;
    let best = false;
    if (isFullRun) {
      bonus += XP.tierPassBase * stars;
      if (crowned) bonus += XP.crownBonus;
      best = s.accuracy > prevBestAccuracy && s.accuracy > 0;
      if (best) bonus += XP.improvementBonus;
    } else if (passed) {
      bonus += XP.chunkPassBase + 5 * stars;
    }
    setNewBest(best);
    sessionXpRef.current += bonus;
    setSessionXp(sessionXpRef.current);

    const xpBefore = useStore.getState().xp;
    if (meta && tierId) {
      if (isFullRun) {
        recordTierResult(meta.id, tierId, s.accuracy, stars, passed, crowned);
      } else if (isBaseChunk) {
        recordChunkResult(meta.id, tierId, activeChunk, stars);
      }
      // Stitches earn XP but aren't persisted — they're a bridge, not a box.
    }
    addXp(sessionXpRef.current);
    logTime();
    if (buddyStage(xpBefore).name !== buddyStage(xpBefore + sessionXpRef.current).name) {
      window.setTimeout(() => celebrate(equipped.celebration), 800);
    }

    if (passed && micRef.current) {
      celebrate(equipped.celebration);
      playJingle(micRef.current.context, crowned);
    }
    // Stop the mic after the celebration sounds have played out.
    window.setTimeout(() => {
      teardownAudio();
      pausedRef.current = false;
    }, 1800);
    setPhase("finished");
  };

  const exitToHome = () => {
    // Unfinished run still counts toward practice time.
    if (phase === "listening") {
      addXp(sessionXpRef.current);
      logTime();
    }
    teardownAudio();
    setScreen("home");
  };

  const tryAgain = () => {
    teardownAudio();
    setSummary(null);
    setHintMidis(null);
    setWrongMsg(null);
    setPhase("loading");
    setScoreNonce((n) => n + 1); // fresh OSMD render clears all coloring
  };

  useEffect(() => () => teardownAudio(), []);

  // ---- render --------------------------------------------------------------
  const cursorEmoji =
    UNLOCKABLES.find((u) => u.id === equipped.cursor)?.emoji ?? "🎯";

  if (phase === "error") {
    return (
      <div className="screen practice">
        <div className="practice-error">
          <h2>😅 Oops</h2>
          <p>{errorMsg}</p>
          <button className="btn-big" onClick={exitToHome}>← Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen practice">
      <header className="practice-header">
        <button className="btn-back" onClick={exitToHome}>←</button>
        <div className="practice-title">
          <div className="pt-piece">{meta?.title ?? "…"}</div>
          <div className="pt-tier">
            {tier.emoji} {tier.label}
            {tier.mode === "tempo" && meta
              ? ` · ♩=${Math.round(meta.targetTempo * tier.tempoFactor)}`
              : ""}
            {chunkRange
              ? ` · Bars ${chunkRange.measureStart + 1}–${chunkRange.measureEnd + 1}`
              : ""}
          </div>
        </div>
        <div className="hud">
          <div className={`combo ${combo >= 8 ? "hot" : ""}`}>
            {combo > 1 ? `🔥×${multiplierForCombo(combo)} (${combo})` : ""}
          </div>
          <div className="session-xp">+{sessionXp} XP</div>
        </div>
      </header>

      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
        />
      </div>

      <div className="score-wrap" ref={scoreWrapRef}>
        {xml && (
          <ScoreView
            key={scoreNonce}
            xml={xml}
            judgedStaff={tier.staff}
            chunkRange={chunkRange}
            onReady={onScoreReady}
            onError={onScoreError}
          />
        )}
        {cursorPos && phase === "listening" && (
          <div className="cursor-skin" style={{ left: cursorPos.x, top: cursorPos.y - 26 }}>
            {cursorEmoji}
          </div>
        )}
        {phase === "loading" && <div className="score-loading">Loading music…</div>}
      </div>

      {wrongMsg && <div className="toast toast-wrong">{wrongMsg}</div>}
      {hintMidis && (
        <div className="hint-panel">
          <div className="hint-text">
            Try this key: {hintMidis.map((m) => midiNoteName(m)).join(" + ")}
          </div>
          <MiniKeyboard highlight={hintMidis} />
        </div>
      )}
      {!hintMidis && gentleHintMidis && (
        <div className="hint-panel gentle">
          <div className="hint-text">
            Here's where {gentleHintMidis.length > 1 ? "they live" : "it lives"} 👇{" "}
            ({gentleHintMidis.map((m) => midiNoteName(m)).join(" + ")})
          </div>
          <MiniKeyboard highlight={gentleHintMidis} />
        </div>
      )}
      {countIn !== null && <div className="count-in">{countIn}</div>}

      {phase === "ready" && (
        <div className="start-overlay">
          <button className="btn-big btn-start" onClick={startListening}>
            🎤 Start playing!
          </button>
          <button className="btn-big btn-secondary" onClick={hearIt}>
            {hearing ? "⏹ Stop" : "🔊 Hear it first"}
          </button>
          <p className="start-tip">
            {tier.mode === "wait"
              ? "I'll wait for each note — take your time!"
              : "Listen to the count-in, then keep up with the beat!"}
          </p>
        </div>
      )}

      {phase === "finished" && summary && (
        <div className="finish-overlay">
          <div className="finish-card">
            <div className="finish-stars">
              {["⭐", "⭐", "⭐"].map((s, i) => (
                <span key={i} className={i < starsEarned ? "star on" : "star"}>
                  {s}
                </span>
              ))}
            </div>
            <h2>
              {starsEarned === 3
                ? "AMAZING! 🤩"
                : starsEarned === 2
                  ? "Great job! 🎉"
                  : starsEarned === 1
                    ? "Nice work! 👏"
                    : "Good try — again? 💪"}
            </h2>
            <p>
              {Math.round(summary.accuracy * 100)}% · +{sessionXp} XP
              {summary.missedEvents > 0 ? ` · ${summary.missedEvents} missed` : ""}
            </p>
            {newBest && <p className="finish-best">🏅 New personal best! {buddyName} is dancing!</p>}
            {(() => {
              const { gap, stars } = nextStarGap(summary.accuracy);
              if (gap !== null && gap <= 0.06 && stars < 3) {
                return (
                  <p className="finish-next">
                    So close — just {Math.max(1, Math.ceil(gap * 100))}% from{" "}
                    {"⭐".repeat(stars + 1)}! One more run?
                  </p>
                );
              }
              return null;
            })()}
            {starsEarned > 0 && activeChunk === "full" && nextTier(tier.id) && (
              <p className="finish-next">
                Next up: {nextTier(tier.id)!.emoji} {nextTier(tier.id)!.label}
              </p>
            )}
            <div className="finish-buttons">
              <button className="btn-big" onClick={tryAgain}>🔁 Play again</button>
              {typeof activeChunk === "number" && starsEarned > 0 && activeChunk + 1 < chunks.length && (
                <button
                  className="btn-big"
                  onClick={() => {
                    useStore.setState({ activeChunk: activeChunk + 1 });
                    tryAgain();
                  }}
                >
                  ▶ Next chunk
                </button>
              )}
              <button className="btn-big btn-secondary" onClick={exitToHome}>🏠 Home</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
