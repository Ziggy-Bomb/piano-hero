// Piece library: repo pieces (public/pieces/manifest.json) merged with pieces
// imported in-app (stored in IndexedDB so no redeploy is needed when the
// teacher assigns something new).

import { get, set, del } from "idb-keyval";

export interface PieceMeta {
  id: string;
  title: string;
  composer: string;
  file?: string; // repo pieces only
  targetTempo: number;
  beatsPerBar: number;
  level: 1 | 2 | 3;
  assigned: boolean;
  source: "repo" | "import";
  /** Bars per practice chunk (default 2). */
  measuresPerChunk?: number;
  /** Total measures — lets the home screen draw the chunk map without OSMD. */
  measureCount?: number;
}

const IMPORTED_LIST_KEY = "importedPieces";
const xmlKey = (id: string) => `piece-xml:${id}`;

export async function loadLibrary(): Promise<PieceMeta[]> {
  const repo: PieceMeta[] = [];
  try {
    const res = await fetch("./pieces/manifest.json", { cache: "no-cache" });
    if (res.ok) {
      const manifest = await res.json();
      for (const p of manifest.pieces ?? []) {
        repo.push({ ...p, source: "repo" });
      }
    }
  } catch {
    // Offline / missing manifest: imported pieces still work.
  }
  const imported: PieceMeta[] = (await get(IMPORTED_LIST_KEY)) ?? [];
  return [...repo, ...imported];
}

export async function loadPieceXml(meta: PieceMeta): Promise<string> {
  if (meta.source === "repo" && meta.file) {
    const res = await fetch(`./pieces/${meta.file}`);
    if (!res.ok) throw new Error(`Could not load ${meta.file}`);
    return res.text();
  }
  const xml = await get(xmlKey(meta.id));
  if (!xml) throw new Error(`Imported piece ${meta.id} is missing its music`);
  return xml as string;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "piece"
  );
}

function textOf(doc: Document, selector: string): string {
  return doc.querySelector(selector)?.textContent?.trim() ?? "";
}

/** Metadata parsed out of a MusicXML document (no persistence). */
export function parseXmlMeta(xml: string): {
  title: string;
  composer: string;
  beatsPerBar: number;
  targetTempo: number;
} {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("That doesn't look like valid MusicXML.");
  }
  const tempoAttr = doc.querySelector("sound[tempo]")?.getAttribute("tempo");
  return {
    title: textOf(doc, "work work-title") || textOf(doc, "movement-title") || "",
    composer: textOf(doc, 'identification creator[type="composer"]') || "Unknown",
    beatsPerBar: parseInt(textOf(doc, "time beats"), 10) || 4,
    targetTempo: tempoAttr ? Math.round(parseFloat(tempoAttr)) : 100,
  };
}

/** Save a MusicXML string (however obtained) as an imported piece. */
export async function importPieceFromXml(
  xml: string,
  overrides: Partial<PieceMeta> = {},
): Promise<PieceMeta> {
  const parsed = parseXmlMeta(xml);
  const existing: PieceMeta[] = (await get(IMPORTED_LIST_KEY)) ?? [];
  const title = overrides.title || parsed.title || "Untitled piece";
  let id = slugify(title);
  while (existing.some((p) => p.id === id)) id = `${id}-2`;

  const meta: PieceMeta = {
    composer: parsed.composer,
    targetTempo: parsed.targetTempo,
    beatsPerBar: parsed.beatsPerBar,
    level: 1,
    assigned: true,
    measureCount: (xml.match(/<measure[\s>]/g) ?? []).length,
    ...overrides,
    title,
    id, // always the computed unique slug
    source: "import",
  };
  await set(xmlKey(id), xml);
  await set(IMPORTED_LIST_KEY, [...existing, meta]);
  return meta;
}

export async function importPieceFromFile(file: File): Promise<PieceMeta> {
  const xml = await file.text();
  return importPieceFromXml(xml, {
    title:
      parseXmlMeta(xml).title || file.name.replace(/\.(musicxml|xml|mxl)$/i, ""),
  });
}

export async function updateImportedPiece(meta: PieceMeta): Promise<void> {
  const existing: PieceMeta[] = (await get(IMPORTED_LIST_KEY)) ?? [];
  await set(
    IMPORTED_LIST_KEY,
    existing.map((p) => (p.id === meta.id ? meta : p)),
  );
}

export async function removeImportedPiece(id: string): Promise<void> {
  const existing: PieceMeta[] = (await get(IMPORTED_LIST_KEY)) ?? [];
  await set(
    IMPORTED_LIST_KEY,
    existing.filter((p) => p.id !== id),
  );
  await del(xmlKey(id));
}
