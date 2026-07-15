// React wrapper around OpenSheetMusicDisplay. Renders once per piece/tier
// (never during play — play-time feedback mutates the SVG via colorizer.ts).

import { useEffect, useRef } from "react";
import { extractTimeline, NoteEvent } from "./timeline";
import { dimOtherStaff, dimOutsideChunk } from "./colorizer";

export interface ScoreViewProps {
  xml: string;
  /** null = judge both staves; 1 or 2 dims the other staff. */
  judgedStaff: number | null;
  /** Gray out everything outside this measure range (chunk practice). */
  chunkRange?: { measureStart: number; measureEnd: number } | null;
  zoom?: number;
  onReady: (osmd: any, events: NoteEvent[]) => void;
  onError: (err: unknown) => void;
}

export function ScoreView({
  xml,
  judgedStaff,
  chunkRange = null,
  zoom = 0.85,
  onReady,
  onError,
}: ScoreViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    let osmd: any = null;
    const container = containerRef.current;
    if (!container) return;

    (async () => {
      try {
        const { OpenSheetMusicDisplay } = await import("opensheetmusicdisplay");
        if (cancelled) return;
        container.innerHTML = "";
        osmd = new OpenSheetMusicDisplay(container, {
          backend: "svg",
          autoResize: false,
          drawTitle: false,
          drawSubtitle: false,
          drawComposer: false,
          drawLyricist: false,
          drawPartNames: false,
          drawCredits: false,
          followCursor: true,
          drawingParameters: "compacttight",
        });
        await osmd.load(xml);
        if (cancelled) return;
        try {
          osmd.Zoom = zoom;
        } catch {
          osmd.zoom = zoom;
        }
        osmd.render();

        const events = extractTimeline(osmd);

        if (judgedStaff !== null || chunkRange) {
          if (judgedStaff !== null) dimOtherStaff(events, judgedStaff);
          if (chunkRange) {
            dimOutsideChunk(events, chunkRange.measureStart, chunkRange.measureEnd);
          }
          osmd.render();
        }

        // If the container wasn't laid out yet when render() measured it, the
        // SVG comes out degenerate (0-wide). Verify on the next frame and
        // re-render once — cheap insurance that also covers slow layouts.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (cancelled) return;
        const svg = container.querySelector("svg");
        const badWidth =
          !svg ||
          svg.getBoundingClientRect().width < container.clientWidth * 0.5 ||
          svg.getBoundingClientRect().width > container.clientWidth * 1.5;
        if (badWidth && container.clientWidth > 0) {
          osmd.render();
        }

        osmd.cursor.show();
        osmd.cursor.reset();
        if (!cancelled) onReadyRef.current(osmd, events);
      } catch (err) {
        if (!cancelled) onErrorRef.current(err);
      }
    })();

    return () => {
      cancelled = true;
      try {
        osmd?.clear?.();
      } catch {
        // ignore
      }
      container.innerHTML = "";
    };
  }, [xml, judgedStaff, zoom, chunkRange?.measureStart, chunkRange?.measureEnd]);

  return <div className="score-container" ref={containerRef} />;
}
