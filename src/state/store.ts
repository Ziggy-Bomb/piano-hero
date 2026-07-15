// Persistent game/progress state (localStorage via zustand persist) plus
// session-only bits (combo, current screen).

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Calibration } from "../audio/noteDetector";
import { TierId } from "../practice/tiers";
import { levelForXp, STREAK } from "../game/config";

export interface TierProgress {
  stars: 0 | 1 | 2 | 3;
  bestAccuracy: number;
  attempts: number;
  passed: boolean;
}

export interface PieceProgress {
  tiers: Partial<Record<TierId, TierProgress>>;
  crowned: boolean;
  lastPlayed: string; // ISO day
}

export interface SessionLog {
  day: string; // YYYY-MM-DD local
  minutes: number;
  xp: number;
}

export type Screen = "home" | "practice" | "rewards" | "settings" | "calibrate";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

interface State {
  // persisted
  xp: number;
  streak: { current: number; best: number; lastDay: string | null; shields: number };
  equipped: { cursor: string; celebration: string };
  pieces: Record<string, PieceProgress>;
  sessions: SessionLog[];
  calibration: Calibration | null;
  leniency: "generous" | "normal";

  // session-only
  screen: Screen;
  activePieceId: string | null;
  activeTier: TierId | null;
  combo: number;
  bestComboToday: number;

  // derived helpers
  level(): number;

  // actions
  setScreen(s: Screen): void;
  openPractice(pieceId: string, tier: TierId): void;
  addXp(n: number): void;
  setCombo(n: number): void;
  recordTierResult(pieceId: string, tier: TierId, accuracy: number, stars: 0 | 1 | 2 | 3, passed: boolean, crowned: boolean): void;
  logPracticeTime(minutes: number, xpEarned: number): void;
  setEquipped(kind: "cursor" | "celebration", id: string): void;
  setCalibration(c: Calibration): void;
  setLeniency(l: "generous" | "normal"): void;
  exportProgress(): string;
  importProgress(json: string): boolean;
}

const PERSIST_KEYS = [
  "xp",
  "streak",
  "equipped",
  "pieces",
  "sessions",
  "calibration",
  "leniency",
] as const;

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      xp: 0,
      streak: { current: 0, best: 0, lastDay: null, shields: 0 },
      equipped: { cursor: "cursor-classic", celebration: "confetti-classic" },
      pieces: {},
      sessions: [],
      calibration: null,
      leniency: "generous",

      screen: "home",
      activePieceId: null,
      activeTier: null,
      combo: 0,
      bestComboToday: 0,

      level: () => levelForXp(get().xp),

      setScreen: (s) => set({ screen: s }),
      openPractice: (pieceId, tier) =>
        set({ screen: "practice", activePieceId: pieceId, activeTier: tier }),

      addXp: (n) => set((st) => ({ xp: st.xp + n })),

      setCombo: (n) =>
        set((st) => ({ combo: n, bestComboToday: Math.max(st.bestComboToday, n) })),

      recordTierResult: (pieceId, tier, accuracy, stars, passed, crowned) =>
        set((st) => {
          const piece: PieceProgress = st.pieces[pieceId] ?? {
            tiers: {},
            crowned: false,
            lastPlayed: today(),
          };
          const prev = piece.tiers[tier];
          const next: TierProgress = {
            stars: (prev && prev.stars > stars ? prev.stars : stars) as 0 | 1 | 2 | 3,
            bestAccuracy: Math.max(prev?.bestAccuracy ?? 0, accuracy),
            attempts: (prev?.attempts ?? 0) + 1,
            passed: (prev?.passed ?? false) || passed,
          };
          return {
            pieces: {
              ...st.pieces,
              [pieceId]: {
                ...piece,
                tiers: { ...piece.tiers, [tier]: next },
                crowned: piece.crowned || crowned,
                lastPlayed: today(),
              },
            },
          };
        }),

      logPracticeTime: (minutes, xpEarned) =>
        set((st) => {
          const day = today();
          const sessions = [...st.sessions];
          const idx = sessions.findIndex((s) => s.day === day);
          if (idx >= 0) {
            sessions[idx] = {
              ...sessions[idx],
              minutes: sessions[idx].minutes + minutes,
              xp: sessions[idx].xp + xpEarned,
            };
          } else {
            sessions.push({ day, minutes, xp: xpEarned });
          }
          while (sessions.length > 60) sessions.shift();

          // Streak: does today now count?
          const todayLog = sessions.find((s) => s.day === day)!;
          const counts = todayLog.minutes >= STREAK.minMinutes || todayLog.xp >= STREAK.minXp;
          let streak = { ...st.streak };
          if (counts && streak.lastDay !== day) {
            if (streak.lastDay === null) {
              streak.current = 1;
            } else {
              const gap = daysBetween(streak.lastDay, day);
              if (gap === 1) {
                streak.current += 1;
              } else if (gap > 1) {
                // Spend shields to bridge missed days if possible.
                const missed = gap - 1;
                if (streak.shields >= missed) {
                  streak.shields -= missed;
                  streak.current += 1;
                } else {
                  streak.current = 1;
                }
              }
            }
            streak.lastDay = day;
            streak.best = Math.max(streak.best, streak.current);
            if (streak.current > 0 && streak.current % STREAK.shieldEveryDays === 0) {
              streak.shields += 1;
            }
          }
          return { sessions, streak };
        }),

      setEquipped: (kind, id) =>
        set((st) => ({ equipped: { ...st.equipped, [kind]: id } })),

      setCalibration: (c) => set({ calibration: c }),
      setLeniency: (l) => set({ leniency: l }),

      exportProgress: () => {
        const st = get();
        const data: Record<string, unknown> = {};
        for (const k of PERSIST_KEYS) data[k] = st[k];
        return JSON.stringify({ version: 1, ...data }, null, 2);
      },

      importProgress: (json) => {
        try {
          const data = JSON.parse(json);
          if (data.version !== 1) return false;
          const patch: Record<string, unknown> = {};
          for (const k of PERSIST_KEYS) {
            if (k in data) patch[k] = data[k];
          }
          set(patch as Partial<State>);
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: "piano.progress.v1",
      partialize: (st) =>
        Object.fromEntries(PERSIST_KEYS.map((k) => [k, st[k]])) as Partial<State>,
    },
  ),
);

export { today };
