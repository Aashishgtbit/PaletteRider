# PaletteRider

Step into a famous painting and ride a bicycle through it.

**▶ [Play it in your browser](https://aashishgtbit.github.io/PaletteRider/)**

Each chapter turns a real artwork into a small 3D city you can explore. Something has fallen into the streets: gather it, carry it home before dawn, and land your jumps cleanly, or half your load slips away.

**Chapter 1: Castle and Sun** (Paul Klee, 1928). A patchwork city of coloured blocks and triangle roofs, with traffic, townsfolk, rooftops to ride on and ramps to flip from. Collect the little suns and bring them to the castle.

**Chapter 2: Café Terrace at Night** (Vincent van Gogh, 1888). The streets of Arles, painted in thick brush strokes under a swirling night sky. Gather the fallen stars and carry them to the glowing café, and watch each one return to the sky. Guests sit at the café tables, market stalls line the square and some streets, and people stop to talk. The town has no wall: its streets fade into dark fields of cypresses, and a rider who wanders out is turned gently back.

**Chapter 3: The Water Lily Pond** (Claude Monet, 1899). Monet's garden at Giverny on a summer day: the lily pond with its green Japanese footbridge under wisteria, weeping willows, long beds of flowers, an avenue of rose arches and the pink house with green shutters. Gather the loose flowers and carry them to the house, and watch the water lilies open on the pond.

Every ride opens on the original painting and flies into it. The bike rolls along gently by itself: steer it, pedal to go faster, and press down to stop.

**Mind Games.** Get off your bike anywhere and walk. In Monet's garden, a neon-lit pavilion beside the flower avenue holds the Mind Games: play the Tower of Hanoi against the clock (3 to 7 discs), or put one of the three chapter paintings back together in the Painting Slide puzzle (3×3, 4×4 or 5×5), beat your best time, and share a score card of your solve. A memory game is on the way. Jump straight there with `?chapter=3&spot=mind` or the MIND GAMES button on the title screen.

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

## Run it

```bash
npm install
npm run dev
```

Open the address it prints. Choose a chapter on the title screen, or add `?chapter=2` or `?chapter=3` to the address.

`npm run build` writes a static site to `dist/` that can be hosted anywhere. Every push to `main` publishes it to GitHub Pages automatically (see `.github/workflows/pages.yml`).

## Made with

[Three.js](https://threejs.org) and [Vite](https://vitejs.dev). The cities, people, music and sound are all generated in code; the only image files are the three paintings.

## Live riders

There is no game server. Each browser sends its rider's position a few times a second to a free public message relay (an MQTT broker over WebSocket) and listens for the others; see `src/net.js`. Only a random id, a made-up guest name, two colours and a position are sent. Public relays come with no guarantees, so if one is unreachable the game simply plays solo. To use your own relay, change `RELAYS` in `src/net.js`.

## Paintings

`public/castle-and-sun.jpg` (Paul Klee, *Castle and Sun*, 1928), `public/cafe-terrace-at-night.jpg` (Vincent van Gogh, *Café Terrace at Night*, 1888) and `public/water-lily-pond.jpg` (Claude Monet, *Bridge over a Pond of Water Lilies*, 1899, The Metropolitan Museum of Art) are public-domain reproductions from Wikimedia Commons.
