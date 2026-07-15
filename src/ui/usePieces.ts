import { useCallback, useEffect, useState } from "react";
import { loadLibrary, PieceMeta } from "../pieces/library";

export function usePieces(): { pieces: PieceMeta[]; reload: () => void; loading: boolean } {
  const [pieces, setPieces] = useState<PieceMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadLibrary()
      .then((p) => {
        if (!cancelled) setPieces(p);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { pieces, reload, loading };
}
