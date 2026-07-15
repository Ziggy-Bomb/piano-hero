// The per-piece progression ladder. Passing a tier needs >= 80% accuracy;
// stars at 80/90/97%. Crowning a piece = 3 stars... no, = passing tier 7.

export type TierId = "rh" | "lh" | "ht" | "t60" | "t75" | "t90" | "t100";

export interface Tier {
  id: TierId;
  label: string;
  shortLabel: string;
  emoji: string;
  mode: "wait" | "tempo";
  /** 1 = right hand (top staff), 2 = left hand, null = both. */
  staff: number | null;
  /** Fraction of the piece's target tempo (tempo mode only). */
  tempoFactor: number;
  strict: boolean;
  forgiveOctaves: boolean;
  /** Timing window as a fraction of a beat, each side (tempo mode only). */
  windowFrac: number;
}

export const TIERS: Tier[] = [
  { id: "rh",   label: "Right hand",        shortLabel: "RH",   emoji: "🫱", mode: "wait",  staff: 1,    tempoFactor: 1,    strict: false, forgiveOctaves: true,  windowFrac: 0 },
  { id: "lh",   label: "Left hand",         shortLabel: "LH",   emoji: "🫲", mode: "wait",  staff: 2,    tempoFactor: 1,    strict: false, forgiveOctaves: true,  windowFrac: 0 },
  { id: "ht",   label: "Hands together",    shortLabel: "HT",   emoji: "🙌", mode: "wait",  staff: null, tempoFactor: 1,    strict: false, forgiveOctaves: true,  windowFrac: 0 },
  { id: "t60",  label: "Slow groove (60%)", shortLabel: "60%",  emoji: "🐢", mode: "tempo", staff: null, tempoFactor: 0.6,  strict: false, forgiveOctaves: true,  windowFrac: 0.4 },
  { id: "t75",  label: "Walking pace (75%)",shortLabel: "75%",  emoji: "🚶", mode: "tempo", staff: null, tempoFactor: 0.75, strict: false, forgiveOctaves: false, windowFrac: 0.4 },
  { id: "t90",  label: "Nearly there (90%)",shortLabel: "90%",  emoji: "🏃", mode: "tempo", staff: null, tempoFactor: 0.9,  strict: true,  forgiveOctaves: false, windowFrac: 0.3 },
  { id: "t100", label: "Full speed!",       shortLabel: "100%", emoji: "🚀", mode: "tempo", staff: null, tempoFactor: 1,    strict: true,  forgiveOctaves: false, windowFrac: 0.25 },
];

export function tierById(id: TierId): Tier {
  const t = TIERS.find((t) => t.id === id);
  if (!t) throw new Error(`Unknown tier ${id}`);
  return t;
}

export function nextTier(id: TierId): Tier | null {
  const i = TIERS.findIndex((t) => t.id === id);
  return i >= 0 && i < TIERS.length - 1 ? TIERS[i + 1] : null;
}

// Pass = 1 star: one consistent bar for the kid to understand.
export const PASS_ACCURACY = 0.7;

export { starsForAccuracy } from "./scoring";
