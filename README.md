# Piano Hero 🎹

A practice app for an acoustic piano: it listens through the device microphone,
follows real sheet music with a moving cursor, and turns repetition into a game
— stars, XP, combos, streaks and unlockables.

## How it works

- **Score-informed listening.** The app never guesses blindly at what it hears.
  It knows exactly which notes come next in the score and checks the microphone
  audio for evidence of those specific pitches (their harmonics, freshly struck).
  A red "wrong note" only ever appears when a specific wrong pitch is positively
  identified — coughs, talking and bumped benches are ignored. This is the
  anti-frustration core.
- **Wait mode first.** The cursor waits patiently for the right note. No time
  pressure. Later tiers add a metronome and timing windows.
- **7 tiers per piece.** Right hand → left hand → hands together → 60% → 75% →
  90% → 100% tempo. Each tier earns up to 3 stars (80/90/97% accuracy); passing
  tier 7 crowns the piece 👑.
- **Progress is saved on the device** (localStorage). Use *Grown-ups → Export
  progress* for a backup file.

## Running it

```bash
export PATH="$HOME/.local/node/bin:$PATH"   # Node.js lives here on this Mac
npm install
npm run dev                                  # local dev server
npm test                                     # audio-engine test suite
npm run build                                # production build into dist/
```

## Getting it onto the iPad

The microphone requires HTTPS, so deploy the `dist/` folder to any free static
host (Netlify, Vercel, GitHub Pages). Then on the iPad open the URL in Safari
and *Share → Add to Home Screen* for the full-screen app experience.
Run the 30-second calibration (home screen prompt) once the device sits where
it will live during practice.

## Adding a new piece

Pieces are MusicXML files.

1. **From a photo of sheet music:** ask Claude to transcribe the photo into
   MusicXML, then either add it in-app (*Grown-ups → Add a piece*) or drop the
   file into `public/pieces/` and add an entry to `public/pieces/manifest.json`.
2. **Found online:** MuseScore community and public-domain archives offer
   MusicXML downloads for lots of standard repertoire.

In-app imports live in the browser's IndexedDB (no redeploy needed).

## Demo without a piano

In dev mode, open `http://localhost:5173/?fake=1` — the mic is replaced by a
synthesized piano. From the browser console:

```js
__fakePiano.play([60])                       // strike middle C
__fakePiano.playSequence([[64],[64],[65]], 800)  // melody, 800ms apart
```

## Where things live

- `src/audio/` — mic capture, FFT, onset detection, note verification (the pure
  engine is unit-tested in `test/`)
- `src/score/` — OpenSheetMusicDisplay rendering, timeline extraction, coloring
- `src/practice/` — wait/tempo mode state machines, tier ladder
- `src/game/` — XP, streaks, unlockables, celebrations
- `public/pieces/` — bundled MusicXML + manifest
