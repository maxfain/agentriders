// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// Static-first site on Cloudflare Pages. Every page prerenders as before;
// only routes that declare `export const prerender = false` run as Pages
// Functions (dist/_worker.js). Bindings (D1, KV) come from wrangler.jsonc.
export default defineConfig({
  site: 'https://agentriders.com',
  output: 'static',
  // imageService 'compile': every image-using page is prerendered, so sharp
  // runs at build time exactly as before the adapter existed.
  adapter: cloudflare({ platformProxy: { enabled: true }, imageService: 'compile' }),
});
