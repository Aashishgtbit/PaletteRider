import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths, so the built game works from any address:
  // a sub-path such as aashishgtbit.github.io/PaletteRider/, a subdomain, or a plain folder.
  base: './',
  build: {
    target: 'es2022', // chapter 4 waits for its map with a top-level await
    chunkSizeWarningLimit: 1000, // three.js alone is about 520 kB; that is expected
  },
});
