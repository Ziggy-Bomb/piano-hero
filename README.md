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

## Bonus: Flight Games (offline, for the aeroplane)

`public/games/` holds two self-contained games that need **no internet**:

- `air-control.html` — an Air Control remake for big kids: drag flight paths
  to land jets, planes and helicopters on their matching runways. Auto-saves
  every couple of seconds, so a refresh or closed tab offers *Resume flight*.
  Three modes: Easy (3 hearts), Classic (1 heart) and Monsters — dragons,
  plane-abducting UFOs and rockets cross the airspace.
- `little-pilot.html` — a no-losing toddler game with 12 sequential levels:
  aircraft circle the sky (up to three at once later on); drag each one down
  to land it, then taxi it along the ground into its own parking space — the
  space shows a ghost cut-out of its aircraft, big spaces for big ones,
  little spaces for little ones. Wrong space = a comic squeeze and bounce
  out, right space = snap, flag, stars. Each level ends with a "WELL DONE
  OSCAR!" card, three stars and the phone saying it out loud. New vehicles
  join as levels pass (helicopter → balloon → rocket → dragon), skies cycle
  day/sunset/night, and a free-fly sandbox is one tap from the title screen.
  Progress is saved on the device.
- `index.html` + `manifest.webmanifest` + `sw.js` — a launcher that installs
  both games as one offline home-screen app (*Add to Home screen* in Chrome)
  once the site is deployed. The service worker is scoped to `/games/` only,
  so it never touches the piano app.

Each game is a single HTML file with zero external requests — it can also be
copied straight onto a phone and opened in Chrome from the Files app.

`public/bus-patrol/` is a third, fully separate offline game with its own
installable app (own manifest, service worker scoped to `/bus-patrol/`, own
icon): **Oscar's Bus Patrol**, a gentle tower defence for a 3-year-old.
Cheeky pigeons, clouds, mud splats, snails and a fox toddle toward the bus
depot; tapping bus stops summons colourful UK buses (red single and double
deckers first) that beep musical notes until each visitor turns into
rainbows, flowers or balloons. 16 levels (~1 hour), new buses and sticker
celebrations as it goes, a grand parade finale, no way to lose, progress
saved on the device.

## Bonus: Oscar's Buses (offline tower defence for a nearly-3-year-old)

`public/buses/` is another fully separate offline game with its own installable app
(manifest, icon and a service worker scoped to `/buses/`), aimed at a not-quite-3-year-old
who loves UK buses. It lives at `/buses/` on the Pages site.

**How it plays.** People walk along a footpath while buses drive round the road beside it.
Tap a person and they put a hand out: the next bus with room stops for them and they hop on
("ding ding!"). Tap a bus to stop it anywhere. Full buses drive to the end of the road, where
everybody hops off at the destination and cheers. Cows, sheep, ducks, cones, cats and footballs
wander onto the road and hold the buses up until they are tapped away. Twelve trips (home street,
park, school, shops, farm, seaside, rainy town, zoo, match day, night bus, big city, depot party),
each longer and busier than the last, with new bus colours along the way (red single and double
deckers, school bus, open-top, night bus, rainbow...) and colour-match bonuses later on. Roughly
45 minutes to the finale, then every trip stays replayable from the map.

**No numbers anywhere.** Progress is a little bus driving along the top bar towards the
destination picture, and three stars light up as more people arrive by bus. Nothing can be lost:
a trip always ends once everyone has arrived, by bus or on foot, and the stars only reflect how
many rode the bus.

**Little-fingers-proof.** Fullscreen with landscape lock (draws rotated when held upright),
no zoom/scroll/pull-to-refresh/long-press, the back gesture is trapped, wake lock keeps the
screen on, autosave every 2 s with resume on relaunch, and no reset or quit control on screen.
The grown-ups panel (sound, voice, name, jump to a trip, reset) needs a 1.6 s hold on the cog
plus three numbers tapped in order. An installed app reloads itself once when a newer version
is deployed.

**Tuning.** `window.__BUS` exposes the game to a headless play-through: a no-tap run scores
1 star, random tapping about 2, deliberate tapping 3.

## Bonus: Idaho Adventure (Roblox-style 3D explorer for Oliver)

`public/idaho/` is a fourth separate offline app (own manifest, icon and a service
worker scoped to `/idaho/`), live at `/idaho/` on the Pages site: **Idaho Adventure**,
a Roblox-lookalike 3D game that teaches the state of Idaho in roughly 20 minutes.

**How it plays.** A classic blocky avatar (yellow head, blue shirt, green trousers,
name floating overhead) spawns on a studded green baseplate shaped exactly like Idaho,
with the neighbouring states and Canada as lower plates around it and the Snake River
moat in between. Roblox-style UI throughout: top-left menu and chat buttons, a
leaderboard (gems / facts), a quest tracker with a glowing beacon and compass pill,
a hotbar (map, fact book, badges), "E to talk" proximity prompts, NPC dialogue boxes
with a typewriter effect, and "Badge Awarded!" toasts. Third-person camera with
mouse/touch orbit, WASD + Space or a thumb joystick + jump button, Roblox physics
numbers (walk speed 16, jump power 50, gravity 196.2).

**The quest line** (12 NPC stops, each with facts and a one-question check, then a
final 10-question exam):

1. Ranger Ruby in Boise — where Idaho is, its seven neighbours, the Panhandle
2. Mayor Meg at the Capitol — capital, 43rd state (1890), geothermal heating, the blue turf
3. Shoshone Falls — stepping-stone obby across the river; taller than Niagara, Evel Knievel
4. Blackfoot potato farm — collect 10 potatoes; a third of America's potatoes
5. Craters of the Moon — lava-rock obby; Apollo astronauts trained there
6. Arco — flip four switches; first town lit by atomic power (EBR-1)
7. Sun Valley — ride the chairlift, ski down collecting star garnets; first chairlift, the Gem State
8. Borah Peak — spiral ledge climb; highest point, 12,662 ft
9. Salmon — Sacagawea, Lewis and Clark, the made-up name "Idaho", native peoples
10. Hells Canyon — climb to the overlook; deepest gorge in North America
11. Wallace — mine five silver ore; Silver Valley, the Panhandle's two time zones
12. Lake Pend Oreille — Navy submarine testing, then a seaplane ride back to Boise
13. Professor Pat's Idaho Expert Exam (8/10 to pass) → certificate + "facts to tell
    your class" report, always available afterwards from the menu

Walking over a border bridge visits the neighbouring state (with a fact) and zooms
you back; visiting all seven earns the Border Explorer badge. Gems are scattered
along the roads, town signs (Lewiston, Moscow, Coeur d'Alene, Pocatello, Idaho Falls,
Yellowstone, Bruneau Dunes, Perrine Bridge) add extra facts, and everything learned
lands in the Fact Book. Falling into lava or water respawns at the last checkpoint pad.
Progress autosaves on the device.

**Offline.** Like the other games it is a single HTML file with zero external requests:
three.js is inlined into `index.html` (MIT, see `THREE-LICENSE.txt`), so the file can be
copied straight onto a tablet and opened from the Files app, or installed from the
deployed site via *Add to Home Screen*. The menu has a *Graphics: low* toggle (no
shadows) for older iPads; `?low=1` in the URL does the same.

**Tuning.** `window.__IDAHO` exposes the game state, `teleport(x, z)`, `setStage(n)`
and the collider list for headless play-throughs.

## Where things live

- `src/audio/` — mic capture, FFT, onset detection, note verification (the pure
  engine is unit-tested in `test/`)
- `src/score/` — OpenSheetMusicDisplay rendering, timeline extraction, coloring
- `src/practice/` — wait/tempo mode state machines, tier ladder
- `src/game/` — XP, streaks, unlockables, celebrations
- `public/pieces/` — bundled MusicXML + manifest
