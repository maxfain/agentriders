// @ts-check
import { readdirSync, readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

const SITE = 'https://agentriders.com';

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

// ---- Sitemap inputs, gathered once when the config loads ------------------

// lastmod per content page, read straight from the markdown frontmatter so
// the sitemap never claims a change that didn't happen. A small regex is
// enough here — the collections validate the same fields at build. `updated`
// wins, then `published`, then a log's `date`; drafts are skipped. Each hub
// takes the newest date among its children, the homepage the newest of all.
function contentLastmod() {
  /** @type {Map<string, string>} */
  const dates = new Map();
  let newestOverall = '';
  for (const [dir, hub] of [
    ['manual', '/manual/'], ['training', '/training/'], ['missions', '/missions/'], ['logs', '/logs/'],
  ]) {
    const base = new URL(`./src/content/${dir}/`, import.meta.url);
    let newest = '';
    for (const file of readdirSync(base)) {
      if (!file.endsWith('.md')) continue;
      const fm = readFileSync(new URL(file, base), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!fm || /^draft:\s*true\s*$/m.test(fm[1])) continue;
      const pick = (/** @type {string} */ key) =>
        fm[1].match(new RegExp(`^${key}:\\s*["']?(\\d{4}-\\d{2}-\\d{2})`, 'm'))?.[1];
      const date = pick('updated') ?? pick('published') ?? pick('date');
      if (!date) continue;
      dates.set(`${hub}${file.slice(0, -3)}/`, date);
      if (date > newest) newest = date;
    }
    if (newest) dates.set(hub, newest);
    if (newest > newestOverall) newestOverall = newest;
  }
  if (newestOverall) dates.set('/', newestOverall);
  return dates;
}

// Rider profiles with a published flight are on-demand pages the integration
// can't discover on its own, so they come from the live site-state endpoint
// (the same source src/lib/build-state.ts reads for rider links). A failure
// here must never fail the build: it falls back to no profile URLs.
async function profilePages() {
  const origin = process.env.SITE_STATE_ORIGIN || SITE;
  try {
    const res = await fetch(new URL('/api/public/site-state.json', origin), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const profiles = Array.isArray(data?.profiles) ? data.profiles : [];
    return profiles
      .filter((p) => p && /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(p.handle) && Number(p.flights) > 0)
      .map((p) => ({
        url: `${SITE}/riders/${p.handle}/`,
        lastmod: typeof p.updated === 'string' ? p.updated : undefined,
      }));
  } catch {
    return [];
  }
}

const lastmod = contentLastmod();
const profiles = await profilePages();
const profileLastmod = new Map(profiles.map((p) => [p.url, p.lastmod]));

// Out of the sitemap: private and transactional routes, the 404, and every
// facet page (gated on flight counts separately; none qualifies yet).
const EXCLUDED = /^\/(join|me|logs\/new|admin|404)(\/|$)|^\/logs\/(task|mount|outcome|burns)\//;

// Static-first site on Cloudflare Pages. Every page prerenders as before;
// only routes that declare `export const prerender = false` run as Pages
// Functions (dist/_worker.js). Bindings (D1, KV) come from wrangler.jsonc.
//
// trailingSlash stays at the default ('ignore') on purpose. Page URLs do
// carry a trailing slash everywhere — canonicals (Base.astro), the sitemap,
// RSS, and a 301 for on-demand pages in src/middleware.ts; Cloudflare 308s
// the static ones — but Astro's 'always' would also redirect extension-less
// endpoints: verified on this stack, GET /api/me and POST /api/submissions
// answer 301/308 to the slashed path, which the CLI/MCP never call and
// whose signature (device-auth.ts) covers the exact path.
export default defineConfig({
  site: SITE,
  output: 'static',
  markdown: {
    rehypePlugins: [[rehypeSanitize, sanitizeSchema]],
  },
  vite: {
    build: {
      rollupOptions: {
        // zod 4 (pulled in by @astrojs/rss and @astrojs/sitemap, which
        // bundle their own copy) carries `@__PURE__` comments Rollup can't
        // place; it drops them and warns. Cosmetic and upstream — silenced
        // for that one file set only, so a real warning still shows.
        onwarn(warning, warn) {
          if (warning.code === 'INVALID_ANNOTATION' && warning.id?.includes('/node_modules/zod/')) return;
          warn(warning);
        },
      },
    },
  },
  integrations: [
    sitemap({
      filter: (url) => !EXCLUDED.test(new URL(url).pathname),
      customPages: profiles.map((p) => p.url),
      serialize(item) {
        const date = lastmod.get(new URL(item.url).pathname) ?? profileLastmod.get(item.url);
        return date ? { ...item, lastmod: date } : item;
      },
    }),
  ],
  // imageService 'compile': every image-using page is prerendered, so sharp
  // runs at build time exactly as before the adapter existed.
  adapter: cloudflare({ platformProxy: { enabled: true }, imageService: 'compile' }),
});
