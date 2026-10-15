// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

// Flight-log bodies are rider-submitted markdown. Astro renders raw HTML in
// markdown by default, so without this a submitted <script> would execute on
// the published page. rehype-sanitize strips script/iframe/event-handlers/
// javascript: URLs from every rendered page. The schema extends the default
// to keep Shiki's syntax-highlighting output (styled spans in code blocks),
// which is the only non-markdown HTML the trusted content relies on.
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    span: [...(defaultSchema.attributes?.span ?? []), 'style', 'className', 'class'],
    pre: [
      ...(defaultSchema.attributes?.pre ?? []),
      'style', 'className', 'class', 'tabindex',
      ['dataLanguage', 'data-language'],
    ],
    code: [...(defaultSchema.attributes?.code ?? []), 'style', 'className', 'class'],
  },
};

// Static-first site on Cloudflare Pages. Every page prerenders as before;
// only routes that declare `export const prerender = false` run as Pages
// Functions (dist/_worker.js). Bindings (D1, KV) come from wrangler.jsonc.
export default defineConfig({
  site: 'https://agentriders.com',
  output: 'static',
  markdown: {
    rehypePlugins: [[rehypeSanitize, sanitizeSchema]],
  },
  // imageService 'compile': every image-using page is prerendered, so sharp
  // runs at build time exactly as before the adapter existed.
  adapter: cloudflare({ platformProxy: { enabled: true }, imageService: 'compile' }),
});
