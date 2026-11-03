// Preloaded by `npm test` (node --test --import): registers the loader that
// serves Astro's virtual modules, so src/middleware.ts can be imported and its
// onRequest exercised under node:test without a Vite build.
import { register } from 'node:module';

register('./astro-stubs-loader.mjs', import.meta.url);
