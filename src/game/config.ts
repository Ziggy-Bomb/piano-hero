// Gamification tuning + the unlockables catalog. Cosmetic-only rewards.

export const XP = {
  cleanNote: 5,
  helpedNote: 2, // after a wrong note or with a hint showing
  tierPassBase: 50, // x stars
  crownBonus: 300,
  comboStep: 8, // combo needed per extra multiplier
  maxMultiplier: 4,
};

export function levelForXp(xp: number): number {
  // Level 1 at 0 XP; level N needs ~100 * (N-1)^1.5 total XP.
  return Math.floor(Math.pow(Math.max(0, xp) / 100, 2 / 3)) + 1;
}

export function xpForLevel(level: number): number {
  return Math.ceil(100 * Math.pow(level - 1, 1.5));
}

export function multiplierForCombo(combo: number): number {
  return Math.min(XP.maxMultiplier, 1 + Math.floor(combo / XP.comboStep));
}

export const STREAK = {
  minMinutes: 10,
  minXp: 300,
  shieldEveryDays: 7,
};

export interface Unlockable {
  id: string;
  kind: "cursor" | "celebration";
  label: string;
  emoji: string;
  requiredLevel: number;
}

export const UNLOCKABLES: Unlockable[] = [
  { id: "cursor-classic", kind: "cursor", label: "Classic", emoji: "🎯", requiredLevel: 1 },
  { id: "confetti-classic", kind: "celebration", label: "Confetti", emoji: "🎊", requiredLevel: 1 },
  { id: "cursor-rocket", kind: "cursor", label: "Rocket", emoji: "🚀", requiredLevel: 2 },
  { id: "cursor-dino", kind: "cursor", label: "Dino", emoji: "🦖", requiredLevel: 3 },
  { id: "confetti-fireworks", kind: "celebration", label: "Fireworks", emoji: "🎆", requiredLevel: 4 },
  { id: "cursor-ghost", kind: "cursor", label: "Ghost", emoji: "👻", requiredLevel: 5 },
  { id: "confetti-emoji", kind: "celebration", label: "Emoji rain", emoji: "🤩", requiredLevel: 6 },
  { id: "cursor-ninja", kind: "cursor", label: "Ninja", emoji: "🥷", requiredLevel: 7 },
  { id: "cursor-unicorn", kind: "cursor", label: "Unicorn", emoji: "🦄", requiredLevel: 8 },
  { id: "confetti-stars", kind: "celebration", label: "Star burst", emoji: "🌟", requiredLevel: 9 },
  { id: "cursor-dragon", kind: "cursor", label: "Dragon", emoji: "🐉", requiredLevel: 10 },
  { id: "cursor-alien", kind: "cursor", label: "Alien", emoji: "👽", requiredLevel: 12 },
  { id: "cursor-wizard", kind: "cursor", label: "Wizard", emoji: "🧙", requiredLevel: 14 },
  { id: "cursor-trophy", kind: "cursor", label: "Champion", emoji: "🏆", requiredLevel: 16 },
];

export function unlockedAtLevel(level: number): Unlockable[] {
  return UNLOCKABLES.filter((u) => u.requiredLevel <= level);
}
