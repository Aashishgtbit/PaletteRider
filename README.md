# PaletteRider

Step into a famous painting and ride a bicycle through it.

**▶ [Play it in your browser](https://aashishgtbit.github.io/PaletteRider/)**

Each chapter turns a real artwork into a small 3D city you can explore. Something has fallen into the streets: gather it, carry it home before dawn, and land your jumps cleanly, or half your load slips away.

**Chapter 1: Castle and Sun** (Paul Klee, 1928). A patchwork city of coloured blocks and triangle roofs, with traffic, townsfolk, rooftops to ride on and ramps to flip from. Collect the little suns and bring them to the castle.

**Chapter 2: Café Terrace at Night** (Vincent van Gogh, 1888). The streets of Arles, painted in thick brush strokes under a swirling night sky. Gather the fallen stars and carry them to the glowing café, and watch each one return to the sky. Guests sit at the café tables, market stalls line the square and some streets, and people stop to talk. The town has no wall: its streets fade into dark fields of cypresses, and a rider who wanders out is turned gently back.

**Chapter 3: The Water Lily Pond** (Claude Monet, 1899). Monet's garden at Giverny on a summer day: the lily pond with its green Japanese footbridge under wisteria, weeping willows, long beds of flowers, an avenue of rose arches and the pink house with green shutters. Gather the loose flowers and carry them to the house, and watch the water lilies open on the pond.

**Chapter 4: The Jungfrau** (Ferdinand Hodler, *The Jungfrau seen from Isenfluh*, 1902). The real Lauterbrunnen valley in Switzerland, built from OpenStreetMap and real elevation data and painted in Hodler's colours: the valley floor between sheer cliffs streaked with waterfalls (the Staubbach among them), the milky Weisse Lütschine, every chalet, road and path in the village, the railway, the cable car to Mürren, cows on the meadows and the Jungfrau, Mönch and Eiger above. Gather the edelweiss and carry them to the village church; climb the zigzag paths to Wengen for the view of the Jungfrau.

Every ride opens on the original painting and flies into it. The bike rolls along gently by itself: steer it, pedal to go faster, and press down to stop.

**Mind Games.** Get off your bike anywhere and walk. In Monet's garden, a neon-lit pavilion beside the flower avenue holds the Mind Games: play the Tower of Hanoi against the clock (3 to 7 discs), put one of the three chapter paintings back together in the Painting Slide puzzle (3×3, 4×4 or 5×5), or find the pairs of painting details in Memory Match; beat your best time, and share a score card of your solve. The title screen lists every ride and game; a game card starts you on foot beside that game (`?chapter=3&spot=hanoi`, `slide`, `memory` or `archery`).

**Archery.** On the lawn across the avenue from the pavilion is a roped-off archery range. Walk up to the line, hold to draw the bow, aim and let go: 5 or 10 arrows at a ten-ring target. The arrow flies a real arc, watched in slow motion from just behind it: it drops if the bow is not fully drawn, the wind carries it sideways (read the windsock), and on Medium and Hard the target rides a rail from side to side. The final score comes as a card to share. Jump straight there with `?chapter=3&spot=archery`.

**Live riders.** Other people playing at the same moment appear on the streets on their own coloured bikes, each with a guest name, and the game shows how many are riding right now. Runs in any modern browser, on desktop or phone.

## Controls

| Action | Keyboard | Phone |
|---|---|---|
| Go faster / stop | W / S | Push the thumb stick / pull it back |
| Steer | A / D | Point the thumb stick where you want to ride |
| Jump, hold to glide | Space | JUMP button |
| Flip / spin in the air | W, S / A, D | Thumb stick |
| Look around | Drag with the mouse, scroll to zoom | Drag the screen, pinch to zoom |
| Map | Tab | Tap the map |
| Pause | P or Esc | Pause button |
| Sound on / off | M | Sound button |
| Hide the controls bar | H | — |
| Get off / back on the bike | F | Get off / Ride button |
| Play at a game table | E | Play button |
| Archery: draw, aim, shoot | Hold the mouse (or Space), move to aim, let go | Hold a finger down, drag to aim, lift |

## Run it

```bash
npm install
npm run dev
```

Open the address it prints. Choose a chapter on the title screen, or add `?chapter=2`, `?chapter=3` or `?chapter=4` to the address.

`npm run build` writes a static site to `dist/` that can be hosted anywhere. Every push to `main` publishes it to GitHub Pages automatically (see `.github/workflows/pages.yml`).

## Made with

[Three.js](https://threejs.org) and [Vite](https://vitejs.dev). The cities, people, music and sound are all generated in code; the only image files are the four paintings, and the only data file is chapter 4's map of Lauterbrunnen.

## Live riders

There is no game server. Each browser sends its rider's position a few times a second to a free public message relay (an MQTT broker over WebSocket) and listens for the others; see `src/net.js`. Only a random id, a made-up guest name, two colours and a position are sent. Public relays come with no guarantees, so if one is unreachable the game simply plays solo. To use your own relay, change `RELAYS` in `src/net.js`.

## Chapter 4's map

`public/lauterbrunnen.json` is baked from real data by the scripts in `tools/lauterbrunnen/`:

```bash
python3 -I tools/lauterbrunnen/fetch.py <raw-folder>    # one-off download
python3 -I tools/lauterbrunnen/bake.py <raw-folder> public/lauterbrunnen.json
```

The valley is scaled down to one game unit for five metres, with heights at the same scale; chalets and roads are drawn a little larger than life so they read at bicycle size, and the distant peaks are drawn taller, as Hodler painted them.

- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, available under the [Open Database License](https://opendatacommons.org/licenses/odbl/). The baked file is a derived database under the same licence.
- Terrain: [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) on the AWS Open Data Registry (Mapzen/Tilezen; sources include SRTM).

## Paintings

`public/castle-and-sun.jpg` (Paul Klee, *Castle and Sun*, 1928), `public/cafe-terrace-at-night.jpg` (Vincent van Gogh, *Café Terrace at Night*, 1888) `public/water-lily-pond.jpg` (Claude Monet, *Bridge over a Pond of Water Lilies*, 1899, The Metropolitan Museum of Art) and `public/jungfrau-isenfluh.jpg` (Ferdinand Hodler, *The Jungfrau seen from Isenfluh*, 1902) are public-domain reproductions from Wikimedia Commons.
