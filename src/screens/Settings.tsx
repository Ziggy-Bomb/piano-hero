// The grown-ups screen: piece management (import/assign), detection leniency,
// calibration, progress backup.

import { useRef, useState } from "react";
import { useStore } from "../state/store";
import { usePieces } from "../ui/usePieces";
import {
  importPieceFromFile,
  removeImportedPiece,
  updateImportedPiece,
} from "../pieces/library";
import { getApiKey, setApiKey, clearApiKey } from "../import/apiKey";
import { testApiKey } from "../import/transcribe";

export function Settings() {
  const setScreen = useStore((s) => s.setScreen);
  const leniency = useStore((s) => s.leniency);
  const setLeniency = useStore((s) => s.setLeniency);
  const calibration = useStore((s) => s.calibration);
  const exportProgress = useStore((s) => s.exportProgress);
  const importProgress = useStore((s) => s.importProgress);
  const sessions = useStore((s) => s.sessions);
  const { pieces, reload } = usePieces();
  const hesitationSeconds = useStore((s) => s.hesitationSeconds);
  const setHesitationSeconds = useStore((s) => s.setHesitationSeconds);
  const buddyName = useStore((s) => s.buddyName);
  const setBuddyName = useStore((s) => s.setBuddyName);
  const fileRef = useRef<HTMLInputElement>(null);
  const progressFileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [hasKey, setHasKey] = useState(!!getApiKey());
  const [testing, setTesting] = useState(false);

  const flash = (m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg(null), 4000);
  };

  const onImportPiece = async (file: File | undefined) => {
    if (!file) return;
    try {
      const meta = await importPieceFromFile(file);
      reload();
      flash(`✅ Added "${meta.title}"`);
    } catch (e) {
      flash(`❌ ${String((e as Error).message ?? e)}`);
    }
  };

  const onToggleAssigned = async (id: string) => {
    const p = pieces.find((x) => x.id === id);
    if (!p || p.source !== "import") return;
    await updateImportedPiece({ ...p, assigned: !p.assigned });
    reload();
  };

  const onRemove = async (id: string) => {
    const p = pieces.find((x) => x.id === id);
    if (!p || p.source !== "import") return;
    if (!window.confirm(`Remove "${p.title}"? Its stars will be kept.`)) return;
    await removeImportedPiece(id);
    reload();
  };

  const onExport = () => {
    const blob = new Blob([exportProgress()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `piano-hero-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImportProgress = async (file: File | undefined) => {
    if (!file) return;
    const ok = importProgress(await file.text());
    flash(ok ? "✅ Progress restored" : "❌ That file didn't work");
  };

  const last14 = sessions.slice(-14);
  const totalMin = Math.round(last14.reduce((s, x) => s + x.minutes, 0));

  return (
    <div className="screen settings">
      <header className="home-header">
        <h1>⚙️ Grown-ups</h1>
      </header>
      {msg && <div className="toast">{msg}</div>}

      <section>
        <h2 className="section-title">🎼 Pieces</h2>
        <div className="settings-pieces">
          {pieces.map((p) => (
            <div key={p.id} className="settings-piece-row">
              <div>
                <div className="sp-title">{p.title}</div>
                <div className="sp-sub">
                  {p.composer} · ♩={p.targetTempo} · {p.source === "repo" ? "built-in" : "imported"}
                </div>
              </div>
              {p.source === "import" && (
                <div className="sp-actions">
                  <button className="btn-small" onClick={() => onToggleAssigned(p.id)}>
                    {p.assigned ? "Hide" : "Show"}
                  </button>
                  <button className="btn-small danger" onClick={() => onRemove(p.id)}>
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <button className="btn-big btn-start" onClick={() => setScreen("import")}>
          📷 New piece from a photo
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".musicxml,.xml"
          hidden
          onChange={(e) => onImportPiece(e.target.files?.[0])}
        />
        <button className="btn-big btn-secondary" onClick={() => fileRef.current?.click()}>
          ➕ Add a MusicXML file
        </button>
      </section>

      <section>
        <h2 className="section-title">🤖 Photo import (Claude API)</h2>
        {hasKey ? (
          <div className="settings-row">
            <span>API key saved ✓</span>
            <div className="sp-actions">
              <button
                className="btn-small"
                disabled={testing}
                onClick={async () => {
                  setTesting(true);
                  try {
                    flash((await testApiKey()) ? "✅ Key works" : "❌ Key rejected");
                  } finally {
                    setTesting(false);
                  }
                }}
              >
                {testing ? "Testing…" : "Test key"}
              </button>
              <button
                className="btn-small danger"
                onClick={() => {
                  clearApiKey();
                  setHasKey(false);
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="settings-row">
            <input
              type="password"
              className="key-input"
              placeholder="sk-ant-…"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
            />
            <button
              className="btn-small"
              disabled={!keyInput.trim()}
              onClick={() => {
                setApiKey(keyInput);
                setKeyInput("");
                setHasKey(true);
                flash("✅ Key saved on this device");
              }}
            >
              Save
            </button>
          </div>
        )}
        <p className="muted">
          Create a key at console.anthropic.com. It's stored only on this device and
          sent directly to Anthropic — but anyone with this device can read it, so use
          a dedicated key with a monthly spend limit (Console → Limits). Each photo
          import costs roughly 25–60¢ of API credit.
        </p>
      </section>

      <section>
        <h2 className="section-title">🎤 Listening</h2>
        <div className="settings-row">
          <span>Note detection</span>
          <div className="segmented">
            <button
              className={leniency === "generous" ? "on" : ""}
              onClick={() => setLeniency("generous")}
            >
              Generous
            </button>
            <button
              className={leniency === "normal" ? "on" : ""}
              onClick={() => setLeniency("normal")}
            >
              Normal
            </button>
          </div>
        </div>
        <p className="muted">
          Generous forgives octave slips everywhere and keeps thresholds soft. Switch to
          Normal once detection is working well on your piano.
        </p>
        <button className="btn-big btn-secondary" onClick={() => setScreen("calibrate")}>
          🎹 Calibrate for your piano {calibration ? "(done ✓)" : "(not done yet)"}
        </button>
        <div className="settings-row">
          <span>Note helper appears after</span>
          <div className="segmented">
            {[0, 2, 4, 6, 8].map((s) => (
              <button
                key={s}
                className={hesitationSeconds === s ? "on" : ""}
                onClick={() => setHesitationSeconds(s)}
              >
                {s === 0 ? "Off" : `${s}s`}
              </button>
            ))}
          </div>
        </div>
        <p className="muted">
          When he's stuck on a note for this long, a little keyboard shows where it
          lives — no penalty, reading always gets the first try.
        </p>
      </section>

      <section>
        <h2 className="section-title">🐣 Buddy</h2>
        <div className="settings-row">
          <span>Buddy's name</span>
          <input
            className="key-input"
            value={buddyName}
            onChange={(e) => setBuddyName(e.target.value)}
          />
        </div>
      </section>

      <section>
        <h2 className="section-title">📈 Practice</h2>
        <p className="muted">Last 14 days: {totalMin} minutes across {last14.length} day(s).</p>
        <div className="settings-row">
          <button className="btn-small" onClick={onExport}>Export progress</button>
          <input
            ref={progressFileRef}
            type="file"
            accept=".json"
            hidden
            onChange={(e) => onImportProgress(e.target.files?.[0])}
          />
          <button className="btn-small" onClick={() => progressFileRef.current?.click()}>
            Restore progress
          </button>
        </div>
      </section>

      <nav className="bottom-nav">
        <button className="nav-btn" onClick={() => setScreen("home")}>🏠 Home</button>
        <button className="nav-btn" onClick={() => setScreen("rewards")}>🎁 Rewards</button>
        <button className="nav-btn active">⚙️ Grown-ups</button>
      </nav>
    </div>
  );
}
