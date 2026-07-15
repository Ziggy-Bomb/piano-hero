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

export async function importPieceFromFile(file: File): Promise<PieceMeta> {
  const xml = await file.text();
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("That file doesn't look like valid MusicXML.");
  }
  const title =
    textOf(doc, "work work-title") ||
    textOf(doc, "movement-title") ||
    file.name.replace(/\.(musicxml|xml|mxl)$/i, "");
  const composer = textOf(doc, 'identification creator[type="composer"]') || "Unknown";
  const beats = parseInt(textOf(doc, "time beats"), 10) || 4;
  const tempoAttr = doc.querySelector("sound[tempo]")?.getAttribute("tempo");
  const targetTempo = tempoAttr ? Math.round(parseFloat(tempoAttr)) : 100;

  const existing: PieceMeta[] = (await get(IMPORTED_LIST_KEY)) ?? [];
  let id = slugify(title);
  while (existing.some((p) => p.id === id)) id = `${id}-2`;

  const meta: PieceMeta = {
    id,
    title,
    composer,
    targetTempo,
    beatsPerBar: beats,
    level: 1,
    assigned: true,
    source: "import",
  };
  await set(xmlKey(id), xml);
  await set(IMPORTED_LIST_KEY, [...existing, meta]);
  return meta;
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
