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

1. **From a photo (in-app, recommended):** *Grown-ups → New piece from a
   photo*. Photograph the pages; Claude (via your own API key, entered once in
   Grown-ups) transcribes them to MusicXML; you review by eye and by ear
   (playback preview) before saving. Costs roughly 25–60¢ of API credit per
   attempt — use a spend-capped key.
2. **From a file:** *Grown-ups → Add a MusicXML file* (MuseScore community and
   public-domain archives have lots of repertoire), or drop it into
   `public/pieces/` + `manifest.json` and push.

In-app imports live in the browser's IndexedDB (no redeploy needed).

## How practice is structured

Each tier splits into 2-bar **chunks** → passing adjacent chunks unlocks
**stitches** → passing all chunks unlocks the **whole-piece run** (which is
what marks the tier passed). Scoring gives partial credit (a recovered wrong
note costs 0.4, a hinted note 0.7) with stars at 70/85/95% — effort is always
rewarded. If he's stuck reading a note for a few seconds, a gentle keyboard
shows where it lives (configurable in Grown-ups, no score penalty). **Pip**
the buddy on the home screen grows with XP and gets lonely after two days off.

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
