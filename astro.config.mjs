// @ts-check
import { defineConfig } from 'astro/config';

// Static site for Cloudflare Pages: no adapter, no wrangler.toml.
// Pages builds from the repo with `npm run build` and serves `dist/`.
export default defineConfig({
  site: 'https://agentriders.com',
  output: 'static',
});
