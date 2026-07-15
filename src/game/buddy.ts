// The practice buddy: a pure function of state the store already keeps
// (total XP + streak.lastDay). No extra persistence beyond its name.

export interface BuddyStage {
  emoji: string;
  name: string;
  minXp: number;
}

export const BUDDY_STAGES: BuddyStage[] = [
  { emoji: "🥚", name: "Egg", minXp: 0 },
  { emoji: "🐣", name: "Hatchling", minXp: 200 },
  { emoji: "🐤", name: "Chick", minXp: 800 },
  { emoji: "🐥", name: "Fledgling", minXp: 2000 },
  { emoji: "🐦", name: "Songbird", minXp: 5000 },
  { emoji: "🦜", name: "Maestro", minXp: 12000 },
];

export function buddyStage(xp: number): BuddyStage {
  let stage = BUDDY_STAGES[0];
  for (const s of BUDDY_STAGES) {
    if (xp >= s.minXp) stage = s;
  }
  return stage;
}

export function nextBuddyStage(xp: number): BuddyStage | null {
  return BUDDY_STAGES.find((s) => s.minXp > xp) ?? null;
}

export type BuddyMood = "happy" | "sleepy" | "hungry";

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

export function buddyMood(lastDay: string | null, today: string): BuddyMood {
  if (lastDay === null) return "hungry";
  const gap = daysBetween(lastDay, today);
  if (gap >= 3) return "hungry";
  if (gap === 2) return "sleepy";
  return "happy";
}

export function buddyMessage(mood: BuddyMood, name: string): string {
  switch (mood) {
    case "hungry":
      return `${name} misses the music! One little song? 🎵`;
    case "sleepy":
      return `${name} is getting sleepy… a quick play would wake ${name} up!`;
    default:
      return `${name} loves hearing you play!`;
  }
}
