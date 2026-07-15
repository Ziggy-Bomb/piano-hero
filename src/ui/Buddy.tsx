// The practice buddy on the home screen — grows with XP, misses you gently.

import { useState } from "react";
import { useStore, today } from "../state/store";
import { buddyStage, nextBuddyStage, buddyMood, buddyMessage } from "../game/buddy";

export function Buddy() {
  const xp = useStore((s) => s.xp);
  const lastDay = useStore((s) => s.streak.lastDay);
  const name = useStore((s) => s.buddyName);
  const [wiggle, setWiggle] = useState(false);

  const stage = buddyStage(xp);
  const next = nextBuddyStage(xp);
  const mood = buddyMood(lastDay, today());
  const frac = next ? Math.min(1, (xp - stage.minXp) / (next.minXp - stage.minXp)) : 1;

  return (
    <div className="buddy" onClick={() => {
      setWiggle(true);
      window.setTimeout(() => setWiggle(false), 700);
    }}>
      <div className={`buddy-emoji ${wiggle ? "wiggle" : "bob"}`}>
        {stage.emoji}
        {mood === "sleepy" && <span className="buddy-mood">💤</span>}
        {mood === "hungry" && <span className="buddy-mood">🎵</span>}
      </div>
      <div className="buddy-info">
        <div className="buddy-name">
          {name} <span className="buddy-stage">· {stage.name}</span>
        </div>
        <div className="buddy-msg">{buddyMessage(mood, name)}</div>
        {next && (
          <div className="buddy-track">
            <div className="buddy-fill" style={{ width: `${frac * 100}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
