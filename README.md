# PaletteRider

Step into a famous painting and ride a bicycle through it.

**▶ [Play it in your browser](https://aashishgtbit.github.io/PaletteRider/)**

Each chapter turns a real artwork into a small 3D city you can explore. Something has fallen into the streets: gather it, carry it home before dawn, and land your jumps cleanly, or half your load slips away.

**Chapter 1: Castle and Sun** (Paul Klee, 1928). A patchwork city of coloured blocks and triangle roofs, with traffic, townsfolk, rooftops to ride on and ramps to flip from. Collect the little suns and bring them to the castle.

**Chapter 2: Café Terrace at Night** (Vincent van Gogh, 1888). The streets of Arles, painted in thick brush strokes under a swirling night sky. Gather the fallen stars and carry them to the glowing café, and watch each one return to the sky.

Every ride opens on the original painting and zooms into it. Runs in any modern browser, on desktop or phone.

## Controls

| Action | Keyboard | Phone |
|---|---|---|
| Pedal / brake | W / S | Thumb stick up / down |
| Steer | A / D | Thumb stick left / right |
| Jump, hold to glide | Space | JUMP button |
| Flip / spin in the air | W, S / A, D | Thumb stick |
| Look around | Drag with the mouse, scroll to zoom | Drag the screen, pinch to zoom |
| Map | Tab | Tap the map |
| Pause | P or Esc | Pause button |
| Sound on / off | M | Sound button |
| Hide the controls bar | H | — |

## Run it

```bash
npm install
npm run dev
```

Open the address it prints. Choose a chapter on the title screen, or add `?chapter=2` to the address.

`npm run build` writes a static site to `dist/` that can be hosted anywhere. Every push to `main` publishes it to GitHub Pages automatically (see `.github/workflows/pages.yml`).

## Made with

[Three.js](https://threejs.org) and [Vite](https://vitejs.dev). The cities, people, music and sound are all generated in code; the only image files are the two paintings.

## Paintings

`public/castle-and-sun.jpg` (Paul Klee, *Castle and Sun*, 1928) and `public/cafe-terrace-at-night.jpg` (Vincent van Gogh, *Café Terrace at Night*, 1888) are public-domain reproductions from Wikimedia Commons.
