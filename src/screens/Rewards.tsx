import { useStore } from "../state/store";
import { UNLOCKABLES, levelForXp, xpForLevel } from "../game/config";

export function Rewards() {
  const xp = useStore((s) => s.xp);
  const equipped = useStore((s) => s.equipped);
  const setEquipped = useStore((s) => s.setEquipped);
  const setScreen = useStore((s) => s.setScreen);
  const level = levelForXp(xp);

  return (
    <div className="screen rewards">
      <header className="home-header">
        <h1>🎁 Rewards</h1>
        <div className="level-badge">Lv {level}</div>
      </header>
      <p className="muted center">
        Level up by earning XP to unlock new friends and celebrations!
      </p>

      {(["cursor", "celebration"] as const).map((kind) => (
        <section key={kind}>
          <h2 className="section-title">
            {kind === "cursor" ? "🕹️ Music buddies" : "🎉 Celebrations"}
          </h2>
          <div className="unlock-grid">
            {UNLOCKABLES.filter((u) => u.kind === kind).map((u) => {
              const unlocked = level >= u.requiredLevel;
              const isEquipped = equipped[kind] === u.id;
              return (
                <button
                  key={u.id}
                  className={`unlock-card ${unlocked ? "" : "locked"} ${isEquipped ? "equipped" : ""}`}
                  disabled={!unlocked}
                  onClick={() => setEquipped(kind, u.id)}
                >
                  <span className="unlock-emoji">{unlocked ? u.emoji : "🔒"}</span>
                  <span className="unlock-label">{u.label}</span>
                  <span className="unlock-sub">
                    {unlocked ? (isEquipped ? "In use!" : "Tap to use") : `Level ${u.requiredLevel}`}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <p className="muted center">
        Next level at {xpForLevel(level + 1)} XP — you have {xp}.
      </p>

      <nav className="bottom-nav">
        <button className="nav-btn" onClick={() => setScreen("home")}>🏠 Home</button>
        <button className="nav-btn active">🎁 Rewards</button>
        <button className="nav-btn" onClick={() => setScreen("settings")}>⚙️ Grown-ups</button>
      </nav>
    </div>
  );
}
