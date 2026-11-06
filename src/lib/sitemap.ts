// The static sitemap's gate (astro.config.mjs). @astrojs/sitemap lists every
// non-dynamic page route — prerendered or on-demand — so an on-demand page
// that is noindex or disallowed in robots.txt lands in the sitemap unless it
// is named here; that is how /start/ and /opt-out/ got in once. Out: private
// and transactional routes, the 404, every path public/robots.txt disallows
// (tests/seo.test.ts keeps the two in step), and every facet page (gated on
// flight counts separately; none qualifies yet).
export const SITEMAP_EXCLUDED =
  /^\/(api|admin|me|join|start|opt-out|logs\/new|404)(\/|$)|^\/logs\/(task|mount|outcome|burns)\//;

export function inSitemap(url: string): boolean {
  return !SITEMAP_EXCLUDED.test(new URL(url).pathname);
}
