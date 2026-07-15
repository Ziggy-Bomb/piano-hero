import { useStore } from "../state/store";
import { usePieces } from "../ui/usePieces";
import { TIERS, TierId } from "../practice/tiers";
import { levelForXp, xpForLevel } from "../game/config";
import { PieceMeta } from "../pieces/library";

function LevelBar() {
  const xp = useStore((s) => s.xp);
  const level = levelForXp(xp);
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const frac = next > base ? Math.min(1, (xp - base) / (next - base)) : 0;
  return (
    <div className="level-bar">
      <div className="level-badge">Lv {level}</div>
      <div className="level-track">
        <div className="level-fill" style={{ width: `${frac * 100}%` }} />
      </div>
      <div className="level-xp">{xp} XP</div>
    </div>
  );
}

function StreakFlame() {
  const streak = useStore((s) => s.streak);
  return (
    <div className="streak" title={`Best: ${streak.best} days`}>
      <span className="streak-flame">🔥</span>
      <span className="streak-num">{streak.current}</span>
      {streak.shields > 0 && <span className="streak-shield">🛡️×{streak.shields}</span>}
    </div>
  );
}

function PieceCard({ piece }: { piece: PieceMeta }) {
  const progress = useStore((s) => s.pieces[piece.id]);
  const openPractice = useStore((s) => s.openPractice);

  // The next tier to attempt: first unpassed one.
  let nextTierId: TierId = TIERS[0].id;
  for (const t of TIERS) {
    if (!progress?.tiers[t.id]?.passed) {
      nextTierId = t.id;
      break;
    }
    nextTierId = t.id;
  }
  const crowned = progress?.crowned ?? false;
  const totalStars = TIERS.reduce((sum, t) => sum + (progress?.tiers[t.id]?.stars ?? 0), 0);

  return (
    <div className={`piece-card ${crowned ? "crowned" : ""}`}>
      <div className="piece-head">
        <div>
          <div className="piece-title">
            {crowned && <span className="crown">👑</span>} {piece.title}
          </div>
          <div className="piece-composer">{piece.composer}</div>
        </div>
        <div className="piece-stars">
          ⭐ {totalStars}/{TIERS.length * 3}
        </div>
      </div>
      <div className="tier-ladder">
        {TIERS.map((t) => {
          const tp = progress?.tiers[t.id];
          const isNext = t.id === nextTierId && !crowned;
          return (
            <button
              key={t.id}
              className={`tier-chip ${tp?.passed ? "passed" : ""} ${isNext ? "next" : ""}`}
              onClick={() => openPractice(piece.id, t.id)}
            >
              <span className="tier-emoji">{t.emoji}</span>
              <span className="tier-label">{t.shortLabel}</span>
              <span className="tier-stars">
                {tp && tp.stars > 0 ? "⭐".repeat(tp.stars) : ""}
              </span>
            </button>
          );
        })}
      </div>
      <button className="btn-play" onClick={() => openPractice(piece.id, nextTierId)}>
        ▶ Play
      </button>
    </div>
  );
}

export function Home() {
  const { pieces, loading } = usePieces();
  const setScreen = useStore((s) => s.setScreen);
  const calibration = useStore((s) => s.calibration);
  const assigned = pieces.filter((p) => p.assigned);

  return (
    <div className="screen home">
      <header className="home-header">
        <h1>🎹 Piano Hero</h1>
        <StreakFlame />
      </header>
      <LevelBar />

      {!calibration && (
        <button className="calibration-nudge" onClick={() => setScreen("calibrate")}>
          🎤 First time? Tap here to teach the app your piano! (30 seconds)
        </button>
      )}

      <div className="piece-list">
        {loading && <div className="muted">Loading pieces…</div>}
        {!loading && assigned.length === 0 && (
          <div className="muted">No pieces yet — add some in Settings.</div>
        )}
        {assigned.map((p) => (
          <PieceCard key={p.id} piece={p} />
        ))}
      </div>

      <nav className="bottom-nav">
        <button className="nav-btn active">🏠 Home</button>
        <button className="nav-btn" onClick={() => setScreen("rewards")}>🎁 Rewards</button>
        <button className="nav-btn" onClick={() => setScreen("settings")}>⚙️ Grown-ups</button>
      </nav>
    </div>
  );
}
