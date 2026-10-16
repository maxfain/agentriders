// Post-build internal-link report. Walks dist/**/*.html, collects every
// internal href and prints: (a) page links missing the trailing slash,
// (b) links whose target neither exists in dist/ nor matches an on-demand
// route, (c) inbound-link counts with the indexable pages that have fewer
// than three, (d) totals. A report, not a gate — it always exits 0.
// Zero dependencies; Node 18+.
//
//   npm run link-report               reads ./dist
//   node scripts/link-report.mjs out  reads another output directory
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = process.argv[2] ?? 'dist';
const MIN_INBOUND = 3;

// Paths that legitimately end without a slash: files (an extension in the
// last segment), API endpoints, Astro's /_ internals and the asset folders.
const FILE_LIKE = /\.[a-z0-9]+$/i;
const EXEMPT_PREFIXES = ['/api/', '/_', '/images/', '/icons/', '/badges/'];
const isExempt = (path) => FILE_LIKE.test(path) || EXEMPT_PREFIXES.some((p) => path.startsWith(p));

// On-demand (Pages Functions) routes have no file in dist/; the adapter's
// _routes.json lists their include patterns. The defaults stand in when the
// file is missing and add the routes planned but not yet built.
const DEFAULT_ROUTES = ['/api/*', '/admin', '/admin/*', '/join', '/logs/new', '/me', '/me/*', '/riders/*', '/sitemap-riders*'];

function routePatterns() {
  const file = join(DIST, '_routes.json');
  if (!existsSync(file)) return DEFAULT_ROUTES;
  try {
    const include = JSON.parse(readFileSync(file, 'utf8')).include;
    return Array.isArray(include) ? [...new Set([...include, ...DEFAULT_ROUTES])] : DEFAULT_ROUTES;
  } catch {
    return DEFAULT_ROUTES;
  }
}

// Cloudflare's matcher: `*` is a wildcard, and a rule matches with or
// without the trailing slash (`/foo` matches `/foo/`, `/foo/*` matches `/foo`).
function routeMatcher(patterns) {
  const regexes = patterns.map((rule) => {
    let r = rule;
    if (r !== '/' && r !== '/*') {
      if (r.endsWith('/*')) r = `${r.slice(0, -2)}(/*)?`;
      else if (r.endsWith('/')) r = `${r.slice(0, -1)}(/)?`;
      else if (!r.endsWith('*')) r = `${r}(/)?`;
    }
    return new RegExp(`^${r.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`);
  });
  return (path) => regexes.some((re) => re.test(path));
}

function* htmlFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(full);
    else if (entry.isFile() && entry.name.endsWith('.html')) yield full;
  }
}

// dist/manual/reins/index.html → /manual/reins/ ; dist/404.html → /404
function pagePath(file) {
  const rel = relative(DIST, file).split(sep).join('/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return `/${rel.slice(0, -'index.html'.length)}`;
  return `/${rel.slice(0, -'.html'.length)}`;
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#38;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// Every internal href in a page's markup. Scripts and comments are dropped
// first so a JS string or a note never reads as a link.
function internalHrefs(html) {
  const markup = html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const out = [];
  for (const m of markup.matchAll(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const href = decode(m[1] ?? m[2] ?? '').trim();
    if (href.startsWith('/') && !href.startsWith('//')) out.push(href);
  }
  return out;
}

function stripQueryAndHash(href) {
  const path = href.split('#')[0].split('?')[0];
  try {
    return decodeURIComponent(path) || '/';
  } catch {
    return path || '/';
  }
}

function fileExists(path) {
  const base = join(DIST, ...path.split('/').filter(Boolean));
  const candidates = path.endsWith('/')
    ? [join(base, 'index.html')]
    : [base, join(base, 'index.html'), `${base}.html`];
  return candidates.some((f) => existsSync(f) && statSync(f).isFile());
}

const hasNoindex = (html) => {
  const meta = html.match(/<meta\b[^>]*\bname=["']robots["'][^>]*>/i)?.[0] ?? '';
  return /noindex/i.test(meta);
};

// ---- Collect ---------------------------------------------------------------

if (!existsSync(DIST)) {
  console.log(`link-report: no ${DIST}/ directory — run the build first.`);
  process.exit(0);
}

const isOnDemand = routeMatcher(routePatterns());
const pages = new Map(); // page path → { indexable }
const missingSlash = new Map(); // href → Set<source page>
const broken = new Map(); // href → Set<source page>
const inbound = new Map(); // target page path → Set<source page>
let hrefTotal = 0;
const targets = new Set();

for (const file of [...htmlFiles(DIST)].sort()) {
  const html = readFileSync(file, 'utf8');
  const from = pagePath(file);
  pages.set(from, { indexable: !hasNoindex(html) });
  for (const href of internalHrefs(html)) {
    hrefTotal += 1;
    const path = stripQueryAndHash(href);
    targets.add(path);
    const exempt = isExempt(path);
    if (!exempt && !path.endsWith('/')) {
      if (!missingSlash.has(href)) missingSlash.set(href, new Set());
      missingSlash.get(href).add(from);
    }
    if (!fileExists(path) && !isOnDemand(path)) {
      if (!broken.has(href)) broken.set(href, new Set());
      broken.get(href).add(from);
    }
    if (exempt) continue;
    const key = path.endsWith('/') ? path : `${path}/`;
    if (key === from) continue; // a page linking to itself (nav current item)
    if (!inbound.has(key)) inbound.set(key, new Set());
    inbound.get(key).add(from);
  }
}

// ---- Report ----------------------------------------------------------------

const sources = (set) => {
  const list = [...set].sort();
  return list.length > 3 ? `${list.slice(0, 3).join(', ')} +${list.length - 3} more` : list.join(', ');
};
const section = (title, map) => {
  console.log(`\n${title}: ${map.size}`);
  for (const [href, from] of [...map].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${href}  ← ${from.size} page${from.size === 1 ? '' : 's'}: ${sources(from)}`);
  }
};

console.log(`Link report for ${DIST}/ — ${pages.size} pages, ${hrefTotal} internal hrefs, ${targets.size} distinct targets`);

section('(a) Page links missing a trailing slash', missingSlash);
section('(b) Links to targets that do not exist', broken);

const indexable = [...pages].filter(([, p]) => p.indexable).map(([path]) => path);
const counted = indexable
  .map((path) => ({ path, n: inbound.get(path)?.size ?? 0 }))
  .sort((x, y) => x.n - y.n || x.path.localeCompare(y.path));
const thin = counted.filter((p) => p.n < MIN_INBOUND);
console.log(`\n(c) Inbound internal links per indexable page (${indexable.length} indexable, ${pages.size - indexable.length} noindex); fewer than ${MIN_INBOUND}: ${thin.length}`);
for (const { path, n } of counted) {
  console.log(`  ${String(n).padStart(3)}  ${path}${n < MIN_INBOUND ? '   ← thin' : ''}`);
}

console.log(`\n(d) Totals: ${pages.size} pages scanned · ${hrefTotal} internal hrefs · ${targets.size} distinct targets · ${missingSlash.size} missing-slash · ${broken.size} broken · ${thin.length} thin`);
process.exit(0);
