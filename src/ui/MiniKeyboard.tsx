// A small helper keyboard that lights up the keys to press (hints) or, in
// calibration, the note currently heard.

import { isBlackKey, midiNoteName } from "./notes";

export interface MiniKeyboardProps {
  highlight: number[];
  /** Inclusive MIDI range; defaults to a range around the highlights. */
  from?: number;
  to?: number;
  color?: string;
}

export function MiniKeyboard({ highlight, from, to, color = "#f59e0b" }: MiniKeyboardProps) {
  let lo = from ?? Math.min(...highlight, 60) - 5;
  let hi = to ?? Math.max(...highlight, 60) + 5;
  // Snap to white keys so the ends look right.
  while (isBlackKey(lo)) lo--;
  while (isBlackKey(hi)) hi++;

  const whites: number[] = [];
  for (let m = lo; m <= hi; m++) if (!isBlackKey(m)) whites.push(m);
  const whiteW = 100 / whites.length;

  return (
    <div className="mini-keyboard">
      {whites.map((m, i) => (
        <div
          key={m}
          className="mk-white"
          style={{
            left: `${i * whiteW}%`,
            width: `${whiteW}%`,
            background: highlight.includes(m) ? color : undefined,
          }}
        >
          {highlight.includes(m) && <span className="mk-label">{midiNoteName(m)}</span>}
        </div>
      ))}
      {whites.map((m, i) => {
        const black = m + 1;
        if (black > hi || !isBlackKey(black)) return null;
        return (
          <div
            key={`b${black}`}
            className="mk-black"
            style={{
              left: `${(i + 0.68) * whiteW}%`,
              width: `${whiteW * 0.62}%`,
              background: highlight.includes(black) ? color : undefined,
            }}
          />
        );
      })}
    </div>
  );
}
