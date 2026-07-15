// Photo → piece import: photograph sheet music, Claude transcribes it to
// MusicXML, dad reviews by eye and ear, then it lands in the library.

import { useCallback, useRef, useState } from "react";
import { useStore } from "../state/store";
import { getApiKey } from "../import/apiKey";
import { prepareImage, PreparedImage } from "../import/imagePrep";
import {
  transcribeImages,
  TranscribeError,
  TranscribeProgress,
  TranscribeUsage,
} from "../import/transcribe";
import { importPieceFromXml, parseXmlMeta } from "../pieces/library";
import { ScoreView } from "../score/osmdView";
import { NoteEvent } from "../score/timeline";
import { PlaybackController } from "../audio/playback";

type Step = "photos" | "transcribing" | "review" | "saved";

interface PhotoItem {
  file: File;
  thumb: string;
}

export function ImportWizard() {
  const setScreen = useStore((s) => s.setScreen);

  const [step, setStep] = useState<Step>("photos");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [progress, setProgress] = useState<TranscribeProgress>({ charsReceived: 0, measuresSeen: 0 });
  const [error, setError] = useState<string | null>(null);
  const [xml, setXml] = useState<string | null>(null);
  const [usage, setUsage] = useState<TranscribeUsage | null>(null);
  const [scoreOk, setScoreOk] = useState<boolean | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [fixNote, setFixNote] = useState("");
  const [showFix, setShowFix] = useState(false);
  const [playing, setPlaying] = useState<null | "both" | "rh" | "lh">(null);
  const [savedTitle, setSavedTitle] = useState("");

  // Editable metadata (prefilled after transcription)
  const [title, setTitle] = useState("");
  const [composer, setComposer] = useState("");
  const [tempo, setTempo] = useState(100);
  const [beatsPerBar, setBeatsPerBar] = useState(4);

  const fileRef = useRef<HTMLInputElement>(null);
  const preparedRef = useRef<PreparedImage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const eventsRef = useRef<NoteEvent[]>([]);
  const playbackRef = useRef<PlaybackController | null>(null);

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    const items: PhotoItem[] = [];
    for (const f of Array.from(files)) {
      items.push({ file: f, thumb: URL.createObjectURL(f) });
    }
    setPhotos((p) => [...p, ...items]);
    preparedRef.current = []; // invalidate any previous prep
  };

  const removePhoto = (i: number) => {
    setPhotos((p) => {
      URL.revokeObjectURL(p[i].thumb);
      return p.filter((_, idx) => idx !== i);
    });
    preparedRef.current = [];
  };

  const movePhoto = (i: number, dir: -1 | 1) => {
    setPhotos((p) => {
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const copy = [...p];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
    preparedRef.current = [];
  };

  const runTranscription = async (feedback?: { previousXml: string; note: string }) => {
    setError(null);
    setStep("transcribing");
    setProgress({ charsReceived: 0, measuresSeen: 0 });
    stopPlayback();
    try {
      if (preparedRef.current.length !== photos.length) {
        preparedRef.current = [];
        for (const p of photos) {
          preparedRef.current.push(await prepareImage(p.file));
        }
      }
      abortRef.current = new AbortController();
      const result = await transcribeImages(preparedRef.current, {
        feedback,
        onProgress: setProgress,
        signal: abortRef.current.signal,
      });
      setXml(result.xml);
      setUsage(result.usage);
      setScoreOk(null);
      setScoreError(null);
      try {
        const meta = parseXmlMeta(result.xml);
        setTitle((t) => t || meta.title || "New piece");
        setComposer((c) => c || meta.composer);
        setTempo(meta.targetTempo);
        setBeatsPerBar(meta.beatsPerBar);
      } catch {
        // parse failure will surface via ScoreView onError in review
      }
      setStep("review");
    } catch (e) {
      const te = e as TranscribeError;
      if (te.kind === "aborted") {
        setStep(xml ? "review" : "photos");
        return;
      }
      setError(te.message);
      setStep(xml ? "review" : "photos");
    }
  };

  const onScoreReady = useCallback((_osmd: any, events: NoteEvent[]) => {
    eventsRef.current = events;
    setScoreOk(events.length > 0);
    if (events.length === 0) setScoreError("The music came back empty — try again.");
  }, []);

  const onScoreError = useCallback((err: unknown) => {
    setScoreOk(false);
    setScoreError(String((err as Error)?.message ?? err));
  }, []);

  const stopPlayback = () => {
    playbackRef.current?.stop();
    playbackRef.current = null;
    setPlaying(null);
  };

  const play = (mode: "both" | "rh" | "lh") => {
    stopPlayback();
    const ctl = new PlaybackController({
      events: eventsRef.current,
      bpm: tempo,
      staff: mode === "both" ? null : mode === "rh" ? 1 : 2,
      onFinish: () => setPlaying(null),
    });
    playbackRef.current = ctl;
    setPlaying(mode);
    ctl.start();
  };

  const save = async () => {
    if (!xml) return;
    stopPlayback();
    const meta = await importPieceFromXml(xml, {
      title: title || "New piece",
      composer,
      targetTempo: tempo,
      beatsPerBar,
    });
    setSavedTitle(meta.title);
    setStep("saved");
  };

  const exit = () => {
    stopPlayback();
    abortRef.current?.abort();
    photos.forEach((p) => URL.revokeObjectURL(p.thumb));
    setScreen("settings");
  };

  const askFix = async () => {
    if (!xml || !fixNote.trim()) return;
    setShowFix(false);
    await runTranscription({ previousXml: xml, note: fixNote.trim() });
    setFixNote("");
  };

  const hasKey = !!getApiKey();

  return (
    <div className="screen import-wizard">
      <header className="home-header">
        <button className="btn-back" onClick={exit}>←</button>
        <h1>📷 New piece from a photo</h1>
      </header>

      {error && <div className="toast toast-wrong">{error}</div>}

      {step === "photos" && (
        <section className="import-card">
          {!hasKey && (
            <p className="import-warning">
              ⚠️ Add your Anthropic API key in the Grown-ups screen first.
            </p>
          )}
          <p>
            Photograph the sheet music straight-on in good light — one photo per
            page, in order.
          </p>
          <div className="photo-strip">
            {photos.map((p, i) => (
              <div key={p.thumb} className="photo-thumb">
                <img src={p.thumb} alt={`Page ${i + 1}`} />
                <div className="photo-actions">
                  <button onClick={() => movePhoto(i, -1)} disabled={i === 0}>←</button>
                  <button onClick={() => removePhoto(i)}>✕</button>
                  <button onClick={() => movePhoto(i, 1)} disabled={i === photos.length - 1}>→</button>
                </div>
                <span className="photo-num">Page {i + 1}</span>
              </div>
            ))}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            hidden
            onChange={(e) => addPhotos(e.target.files)}
          />
          <button className="btn-big btn-secondary" onClick={() => fileRef.current?.click()}>
            {photos.length === 0 ? "📷 Take / choose photos" : "➕ Add another page"}
          </button>
          {photos.length > 0 && hasKey && (
            <>
              <button className="btn-big btn-start" onClick={() => runTranscription()}>
                🪄 Read the music
              </button>
              <p className="muted">Each attempt usually costs about 25–60¢ of API credit.</p>
            </>
          )}
        </section>
      )}

      {step === "transcribing" && (
        <section className="import-card center">
          <h2>🎼 Reading the music…</h2>
          <p className="live-note">
            {progress.measuresSeen > 0
              ? `Transcribing bar ${progress.measuresSeen}…`
              : "Looking at the page…"}
          </p>
          <p className="muted">{Math.round(progress.charsReceived / 100) / 10}k characters received</p>
          <button
            className="btn-big btn-secondary"
            onClick={() => abortRef.current?.abort()}
          >
            Cancel
          </button>
        </section>
      )}

      {step === "review" && xml && (
        <>
          <section className="import-card">
            <h2>Does this look and sound right?</h2>
            <div className="score-wrap import-score">
              <ScoreView xml={xml} judgedStaff={null} onReady={onScoreReady} onError={onScoreError} />
            </div>
            {scoreOk === false && (
              <p className="import-warning">
                😕 Couldn't display it: {scoreError}
              </p>
            )}
            {scoreOk && (
              <div className="playback-row">
                <button className="btn-small" onClick={() => (playing === "both" ? stopPlayback() : play("both"))}>
                  {playing === "both" ? "⏹ Stop" : "🔊 Play"}
                </button>
                <button className="btn-small" onClick={() => (playing === "rh" ? stopPlayback() : play("rh"))}>
                  {playing === "rh" ? "⏹" : "🫱 Right hand"}
                </button>
                <button className="btn-small" onClick={() => (playing === "lh" ? stopPlayback() : play("lh"))}>
                  {playing === "lh" ? "⏹" : "🫲 Left hand"}
                </button>
              </div>
            )}
            {usage && (
              <p className="muted">
                This attempt cost ~${usage.costUsd.toFixed(2)} of API credit.
              </p>
            )}
          </section>

          <section className="import-card">
            <div className="meta-grid">
              <label>
                Title
                <input value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label>
                Composer
                <input value={composer} onChange={(e) => setComposer(e.target.value)} />
              </label>
              <label>
                Tempo ♩=
                <input
                  type="number"
                  min={30}
                  max={220}
                  value={tempo}
                  onChange={(e) => setTempo(parseInt(e.target.value, 10) || 100)}
                />
              </label>
              <label>
                Beats per bar
                <input
                  type="number"
                  min={2}
                  max={12}
                  value={beatsPerBar}
                  onChange={(e) => setBeatsPerBar(parseInt(e.target.value, 10) || 4)}
                />
              </label>
            </div>
          </section>

          <section className="import-card">
            {showFix ? (
              <>
                <label className="fix-label">
                  What's wrong? Be specific — e.g. "bar 3 right hand should be E F G".
                  <textarea
                    value={fixNote}
                    onChange={(e) => setFixNote(e.target.value)}
                    rows={3}
                  />
                </label>
                <div className="finish-buttons">
                  <button className="btn-big" onClick={askFix} disabled={!fixNote.trim()}>
                    🪄 Ask Claude to fix it
                  </button>
                  <button className="btn-big btn-secondary" onClick={() => setShowFix(false)}>
                    Never mind
                  </button>
                </div>
              </>
            ) : (
              <div className="finish-buttons">
                <button className="btn-big btn-start" onClick={save} disabled={!scoreOk}>
                  ✅ Save to library
                </button>
                <button
                  className="btn-big btn-secondary"
                  onClick={() => {
                    if (scoreOk === false && scoreError) {
                      setFixNote(
                        `The MusicXML failed to display with this error: ${scoreError}. Fix it.`,
                      );
                    }
                    setShowFix(true);
                  }}
                >
                  🔁 Fix something
                </button>
                <button className="btn-big btn-secondary" onClick={exit}>
                  🗑 Discard
                </button>
              </div>
            )}
          </section>
        </>
      )}

      {step === "saved" && (
        <section className="import-card center">
          <h2>🎉 "{savedTitle}" is in the library!</h2>
          <button className="btn-big btn-start" onClick={() => setScreen("home")}>
            🏠 Go play it
          </button>
        </section>
      )}
    </div>
  );
}
