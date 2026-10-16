// Site-wide SEO helpers: canonical URLs, <title>/description clamps and the
// JSON-LD builders Base.astro and the page templates emit. Plain strings and
// plain objects only — tests import this under node --test, so it stays
// erasable TypeScript with no Astro imports.

export const SITE = 'https://agentriders.com';

// Stable @ids shared across pages (docs/seo-aeo-plan.md §4.5).
export const ORG_ID = `${SITE}/#org`;
export const WEBSITE_ID = `${SITE}/#website`;
export const DATASET_ID = `${SITE}/logs/#dataset`;

const ORG_DESCRIPTION = 'The guild for people who run AI agents on real work.';

/** Absolute URL for a site path; an absolute URL passes through untouched. */
export function abs(path: string): string {
  return /^https?:\/\//i.test(path) ? path : new URL(path, SITE).href;
}

const hasExtension = (pathname: string) => /\.[a-z0-9]+$/i.test(pathname);

/**
 * Canonical form of a page URL: absolute, no query or fragment, and with the
 * trailing slash every page URL carries. File-like paths (/logs.json,
 * /rss.xml) keep their shape.
 */
export function canonicalUrl(pathOrUrl: string): string {
  const url = new URL(abs(pathOrUrl));
  if (!hasExtension(url.pathname) && !url.pathname.endsWith('/')) url.pathname += '/';
  url.search = '';
  url.hash = '';
  return url.href;
}

// Cut at a word boundary and mark the cut. Trailing separators are dropped so
// a clamp never ends in "— …" or ": …".
function clamp(s: string, max: number): string {
  const text = s.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  let cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  if (space >= Math.floor(max / 2)) cut = cut.slice(0, space);
  return cut.replace(/[\s—–\-:;,.(]+$/u, '') + '…';
}

/** <title> text, ≤60 characters (what a result page shows in full). */
export const clampTitle = (s: string, max = 60): string => clamp(s, max);

/** Meta description, ≤155 characters. */
export const clampDescription = (s: string, max = 155): string => clamp(s, max);

// U+2028 / U+2029, built from code points so no source escape is involved.
const LINE_TERMINATORS = new RegExp(`[${String.fromCharCode(0x2028, 0x2029)}]`, 'g');

/**
 * JSON for a <script type="application/ld+json">. "<" is escaped so a
 * rider-submitted title containing "</script>" can never close the element,
 * and U+2028/U+2029 because they are line terminators to a JS parser. All
 * three stay valid JSON escapes, so the parsed value is unchanged.
 */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(LINE_TERMINATORS, (c) => `\\u${c.charCodeAt(0).toString(16)}`);
}

type Dateish = Date | string | undefined;

// ISO date for JSON-LD; undefined passes through so compact() drops the key.
function isoDate(d: Dateish): string | undefined {
  if (d === undefined) return undefined;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

// Drop undefined values so optional fields never render as null.
function compact<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

function person(name: string, path?: string, handle?: string) {
  return compact({
    '@type': 'Person',
    name,
    alternateName: handle ? `@${handle}` : undefined,
    url: path ? canonicalUrl(path) : undefined,
  });
}

/** Organization node, on every page. */
export function orgGraph() {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: 'AgentRiders',
    url: `${SITE}/`,
    // The brand mark (the dragon's eye) is the one square vector the site
    // ships; a raster logo at ≥112px can replace it later.
    logo: `${SITE}/favicon.svg`,
    description: ORG_DESCRIPTION,
    sameAs: [
      'https://github.com/maxfain/agentriders',
      'https://www.npmjs.com/package/agentriders',
      'https://www.npmjs.com/package/@agentriders/mcp',
    ],
    email: 'hello@agentriders.com',
  };
}

/** WebSite node, homepage only. No SearchAction: the site has no search. */
export function website() {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: 'AgentRiders',
    alternateName: ['Agent Riders', 'agentriders.com'],
    url: `${SITE}/`,
    publisher: { '@id': ORG_ID },
    inLanguage: 'en',
  };
}

/** BreadcrumbList mirroring the visible trail (≥2 items on inner pages). */
export function breadcrumbs(items: { name: string; path: string }[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: canonicalUrl(item.path),
    })),
  };
}

/** TechArticle: Field Manual chapters and their siblings. */
export function techArticle(a: {
  headline: string;
  description: string;
  path: string;
  datePublished?: Dateish;
  dateModified?: Dateish;
  authorName: string;
  authorPath?: string;
  seriesName?: string;
  position?: number;
  keywords?: string[];
}) {
  const url = canonicalUrl(a.path);
  return compact({
    '@type': 'TechArticle',
    '@id': `${url}#article`,
    headline: a.headline,
    description: a.description,
    url,
    mainEntityOfPage: url,
    datePublished: isoDate(a.datePublished),
    dateModified: isoDate(a.dateModified),
    author: person(a.authorName, a.authorPath),
    publisher: { '@id': ORG_ID },
    isPartOf: a.seriesName ? { '@type': 'CreativeWorkSeries', name: a.seriesName } : undefined,
    position: a.position,
    keywords: a.keywords,
    inLanguage: 'en',
  });
}

/** Article: one flight log, by the rider who flew it, part of the dataset. */
export function article(a: {
  headline: string;
  description: string;
  path: string;
  datePublished: Dateish;
  dateModified?: Dateish;
  riderName: string;
  riderHandle?: string;
  riderPath?: string;
  keywords?: string[];
  datasetId?: string;
}) {
  const url = canonicalUrl(a.path);
  return compact({
    '@type': 'Article',
    '@id': `${url}#article`,
    headline: a.headline,
    description: a.description,
    url,
    mainEntityOfPage: url,
    datePublished: isoDate(a.datePublished),
    dateModified: isoDate(a.dateModified),
    author: person(a.riderName, a.riderPath, a.riderHandle),
    publisher: { '@id': ORG_ID },
    keywords: a.keywords,
    isPartOf: { '@id': a.datasetId ?? DATASET_ID },
    inLanguage: 'en',
  });
}

/** ProfilePage + Person for a rider profile. */
export function profilePage(p: {
  name: string;
  handle: string;
  path: string;
  description?: string;
  dateCreated: Dateish;
  dateModified?: Dateish;
  sameAs?: string[];
  flights: number;
  vouches: number;
}) {
  const url = canonicalUrl(p.path);
  const counter = (interactionType: string, name: string, count: number) => ({
    '@type': 'InteractionCounter',
    interactionType,
    name,
    userInteractionCount: count,
  });
  return compact({
    '@type': 'ProfilePage',
    '@id': `${url}#profile`,
    url,
    dateCreated: isoDate(p.dateCreated),
    dateModified: isoDate(p.dateModified),
    mainEntity: compact({
      '@type': 'Person',
      '@id': `${url}#person`,
      name: p.name,
      alternateName: `@${p.handle}`,
      identifier: p.handle,
      url,
      description: p.description,
      sameAs: p.sameAs && p.sameAs.length > 0 ? p.sameAs : undefined,
      interactionStatistic: [
        counter('https://schema.org/WriteAction', 'Published flights', p.flights),
        counter('https://schema.org/EndorseAction', 'Vouches received', p.vouches),
      ],
    }),
  });
}

/** LearningResource + Article for a lesson or mission, inside Flight School. */
export function learningResource(l: {
  name: string;
  description: string;
  path: string;
  level: string;
  timeRequired?: string;
  teaches?: string;
  datePublished?: Dateish;
  dateModified?: Dateish;
  courseName?: string;
  coursePath?: string;
}) {
  const url = canonicalUrl(l.path);
  const courseUrl = canonicalUrl(l.coursePath ?? '/training/');
  return compact({
    '@type': ['LearningResource', 'Article'],
    '@id': `${url}#lesson`,
    name: l.name,
    headline: l.name,
    description: l.description,
    url,
    mainEntityOfPage: url,
    educationalLevel: l.level,
    timeRequired: l.timeRequired,
    teaches: l.teaches,
    datePublished: isoDate(l.datePublished),
    dateModified: isoDate(l.dateModified),
    isAccessibleForFree: true,
    isPartOf: {
      '@type': 'Course',
      '@id': `${courseUrl}#course`,
      name: l.courseName ?? 'Flight School',
      url: courseUrl,
      provider: { '@id': ORG_ID },
      isAccessibleForFree: true,
    },
    author: { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
    inLanguage: 'en',
  });
}

// The fields every published log carries (src/lib/log-schema.ts).
const LOG_FIELDS = ['mount', 'model', 'harness', 'task', 'duration', 'cost_usd', 'outcome', 'burns', 'lesson', 'reins'];

/** Dataset: the flight-log corpus, distributed as /logs.json under CC BY 4.0. */
export function dataset(d: {
  name: string;
  description: string;
  path: string;
  dataUrl?: string;
  dateModified?: Dateish;
  temporalCoverage?: string;
}) {
  const url = canonicalUrl(d.path);
  return compact({
    '@type': 'Dataset',
    '@id': `${url}#dataset`,
    name: d.name,
    description: d.description,
    url,
    license: 'https://creativecommons.org/licenses/by/4.0/',
    isAccessibleForFree: true,
    creator: { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
    distribution: [
      {
        '@type': 'DataDownload',
        encodingFormat: 'application/json',
        contentUrl: abs(d.dataUrl ?? '/logs.json'),
      },
    ],
    variableMeasured: LOG_FIELDS,
    dateModified: isoDate(d.dateModified),
    temporalCoverage: d.temporalCoverage,
    inLanguage: 'en',
  });
}

/** SoftwareApplication: the CLI and the MCP server on /agents/. */
export function softwareApplication(s: {
  name: string;
  description: string;
  version?: string;
  installUrl: string;
  codeRepository: string;
  license?: string;
}) {
  const license = s.license ?? 'MIT';
  return compact({
    '@type': 'SoftwareApplication',
    name: s.name,
    description: s.description,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Linux, Windows',
    softwareVersion: s.version,
    installUrl: s.installUrl,
    codeRepository: s.codeRepository,
    license: /^https?:\/\//.test(license) ? license : `https://spdx.org/licenses/${license}.html`,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    publisher: { '@id': ORG_ID },
  });
}

/**
 * The one JSON-LD document a page emits: Organization (and WebSite on the
 * homepage) plus whatever the page adds, in a single @graph. Page items that
 * carry their own @context lose it — the graph has one.
 */
export function siteGraph(page: object | object[] | undefined, isHome = false) {
  const items: object[] = [orgGraph()];
  if (isHome) items.push(website());
  for (const item of page === undefined ? [] : Array.isArray(page) ? page : [page]) {
    const { '@context': _context, ...rest } = item as Record<string, unknown>;
    items.push(rest);
  }
  return { '@context': 'https://schema.org', '@graph': items };
}
