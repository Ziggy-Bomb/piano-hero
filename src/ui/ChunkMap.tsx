// The chunk strip inside a piece card: bite-size wins → stitches → full run.

import { Chunk, allChunksPassed, availableStitches, chunkStars } from "../practice/chunks";
import { TierProgress, ActiveChunk } from "../state/store";

export interface ChunkMapProps {
  chunks: Chunk[];
  tierProgress: TierProgress | undefined;
  onPlay: (chunk: ActiveChunk) => void;
}

export function ChunkMap({ chunks, tierProgress, onPlay }: ChunkMapProps) {
  if (chunks.length === 0) {
    // Short piece — straight to the full run.
    return (
      <div className="chunk-map">
        <button className="chunk-chip full unlocked" onClick={() => onPlay("full")}>
          🏁 Whole piece
        </button>
      </div>
    );
  }

  const stitches = availableStitches(tierProgress, chunks);
  const fullUnlocked = allChunksPassed(tierProgress, chunks);

  return (
    <div className="chunk-map">
      {chunks.map((c) => {
        const stars = chunkStars(tierProgress, c.index);
        return (
          <button
            key={c.index}
            className={`chunk-chip ${stars > 0 ? "passed" : ""}`}
            onClick={() => onPlay(c.index)}
          >
            <span className="chunk-label">{c.label}</span>
            <span className="chunk-stars">{stars > 0 ? "⭐".repeat(stars) : "·"}</span>
          </button>
        );
      })}
      {stitches.map((s) => (
        <button
          key={`stitch-${s.parts![0]}`}
          className="chunk-chip stitch"
          onClick={() => onPlay({ stitch: s.parts! })}
        >
          🧵 {s.label}
        </button>
      ))}
      <button
        className={`chunk-chip full ${fullUnlocked ? "unlocked" : "locked"}`}
        onClick={() => fullUnlocked && onPlay("full")}
        title={fullUnlocked ? "" : "Pass every chunk first!"}
      >
        {fullUnlocked ? "🏁 Whole piece" : "🔒 Whole piece"}
      </button>
    </div>
  );
}
