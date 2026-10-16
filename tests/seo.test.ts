import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  SITE, ORG_ID, WEBSITE_ID, DATASET_ID,
  abs, canonicalUrl, clampTitle, clampDescription, jsonLdString, siteGraph,
  orgGraph, website, breadcrumbs, techArticle, article, profilePage,
  learningResource, dataset, softwareApplication,
} from '../src/lib/seo.ts';
import { fetchSiteState } from '../src/lib/build-state.ts';

test('abs: site paths become absolute, absolute URLs pass through', () => {
  assert.equal(abs('/manual/'), `${SITE}/manual/`);
  assert.equal(abs('/og.png'), `${SITE}/og.png`);
  assert.equal(abs('https://example.com/x'), 'https://example.com/x');
});

test('canonicalUrl: trailing slash on pages, none on files, no query or hash', () => {
  assert.equal(canonicalUrl('/manual/reins'), `${SITE}/manual/reins/`);
  assert.equal(canonicalUrl('/manual/reins/'), `${SITE}/manual/reins/`);
  assert.equal(canonicalUrl('/'), `${SITE}/`);
  assert.equal(canonicalUrl('/logs.json'), `${SITE}/logs.json`);
  assert.equal(canonicalUrl('/join?error=oauth_state#top'), `${SITE}/join/`);
  assert.equal(canonicalUrl(`${SITE}/riders/maxcr`), `${SITE}/riders/maxcr/`);
});

test('clampTitle: short titles untouched, long ones cut at a word with an ellipsis', () => {
  assert.equal(clampTitle('Reins — AgentRiders'), 'Reins — AgentRiders');
  const long = 'Reins: permissions that are tight enough to be loosened — Field Manual — AgentRiders';
  const out = clampTitle(long);
  assert.ok(out.length <= 60, `too long: ${out.length}`);
  assert.ok(out.endsWith('…'));
  assert.ok(!/[\s—:,]…$/.test(out), `dangling separator: ${out}`);
  assert.ok(long.startsWith(out.slice(0, -1)), 'cut must be a prefix of the input');
  assert.equal(clampTitle('a'.repeat(70), 10).length, 10); // no space: hard cut at max
  assert.equal(clampTitle('  spaced   out  '), 'spaced out'); // whitespace collapses
});

test('clampDescription: 155 by default, custom max honored', () => {
  const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
  const out = clampDescription(words);
  assert.ok(out.length <= 155);
  assert.ok(out.endsWith('…'));
  assert.equal(clampDescription('short enough'), 'short enough');
  assert.ok(clampDescription(words, 40).length <= 40);
});

test('jsonLdString: "<" and the JS line terminators are escaped, value survives', () => {
  const evil = { name: '</script><script>alert(1)</script>', note: 'a\u2028b\u2029c' };
  const out = jsonLdString(evil);
  assert.ok(!out.includes('</script'), 'raw closing tag leaked');
  assert.ok(!out.includes('<'), 'raw < leaked');
  assert.ok(!out.includes('\u2028') && !out.includes('\u2029'));
  assert.ok(out.includes('\\u003c/script'));
  assert.deepEqual(JSON.parse(out), evil); // still valid JSON, same value
});

test('siteGraph: Organization always, WebSite only on home, page nodes merged without @context', () => {
  const inner = siteGraph({ '@context': 'https://schema.org', '@type': 'Thing', name: 'x' });
  assert.equal(inner['@context'], 'https://schema.org');
  assert.deepEqual(inner['@graph'].map((n: any) => n['@type']), ['Organization', 'Thing']);
  assert.ok(!('@context' in inner['@graph'][1]));

  const home = siteGraph([breadcrumbs([{ name: 'Home', path: '/' }, { name: 'Manual', path: '/manual/' }])], true);
  assert.deepEqual(home['@graph'].map((n: any) => n['@type']), ['Organization', 'WebSite', 'BreadcrumbList']);
  assert.equal(siteGraph(undefined)['@graph'].length, 1);
});

test('orgGraph / website: stable ids, required fields, no SearchAction', () => {
  const org = orgGraph();
  assert.equal(org['@type'], 'Organization');
  assert.equal(org['@id'], ORG_ID);
  assert.equal(org.name, 'AgentRiders');
  assert.equal(org.url, `${SITE}/`);
  assert.ok(org.logo.startsWith(SITE));
  assert.equal(org.sameAs.length, 3);
  assert.equal(org.email, 'hello@agentriders.com');

  const site = website();
  assert.equal(site['@type'], 'WebSite');
  assert.equal(site['@id'], WEBSITE_ID);
  assert.deepEqual(site.publisher, { '@id': ORG_ID });
  assert.deepEqual(site.alternateName, ['Agent Riders', 'agentriders.com']);
  assert.ok(!('potentialAction' in site));
});

test('breadcrumbs: positioned ListItems with canonical item URLs', () => {
  const bc = breadcrumbs([{ name: 'Home', path: '/' }, { name: 'Field Manual', path: '/manual' }]);
  assert.equal(bc['@type'], 'BreadcrumbList');
  assert.equal(bc.itemListElement.length, 2);
  assert.equal(bc.itemListElement[1].position, 2);
  assert.equal(bc.itemListElement[1].item, `${SITE}/manual/`);
});

test('techArticle: dates as ISO, author Person, series when given, no undefined keys', () => {
  const a = techArticle({
    headline: 'AI agent permissions (reins)', description: 'd', path: '/manual/reins',
    datePublished: '2026-09-26', dateModified: new Date('2026-09-29T00:00:00Z'),
    authorName: 'AgentRiders', seriesName: 'The Field Manual', position: 2, keywords: ['reins'],
  });
  assert.equal(a['@type'], 'TechArticle');
  assert.equal(a.url, `${SITE}/manual/reins/`);
  assert.equal(a.datePublished, '2026-09-26T00:00:00.000Z');
  assert.equal(a.dateModified, '2026-09-29T00:00:00.000Z');
  assert.equal(a.author['@type'], 'Person');
  assert.equal(a.isPartOf?.name, 'The Field Manual');
  assert.ok(!Object.values(a).includes(undefined));
  const bare = techArticle({ headline: 'h', description: 'd', path: '/manual/x/', authorName: 'A' });
  assert.ok(!('isPartOf' in bare) && !('datePublished' in bare));
});

test('article: rider as Person with @handle and profile URL, part of the dataset', () => {
  const a = article({
    headline: 'Shipped Phase 2', description: 'd', path: '/logs/shipped-agentriders-phase-2',
    datePublished: '2026-10-16', riderName: 'maxcr', riderHandle: 'maxcr', riderPath: '/riders/maxcr',
    keywords: ['Claude Code', 'code', 'landed'],
  });
  assert.equal(a['@type'], 'Article');
  assert.equal(a.author.alternateName, '@maxcr');
  assert.equal(a.author.url, `${SITE}/riders/maxcr/`);
  assert.deepEqual(a.isPartOf, { '@id': DATASET_ID });
  assert.deepEqual(a.publisher, { '@id': ORG_ID });
});

test('profilePage: Person main entity with flight and vouch counters', () => {
  const p = profilePage({
    name: 'Max', handle: 'maxcr', path: '/riders/maxcr', dateCreated: '2026-10-01',
    flights: 14, vouches: 2, sameAs: ['https://github.com/maxfain'],
  });
  assert.equal(p['@type'], 'ProfilePage');
  assert.equal(p.mainEntity['@type'], 'Person');
  assert.equal(p.mainEntity.alternateName, '@maxcr');
  assert.equal(p.mainEntity.interactionStatistic[0].userInteractionCount, 14);
  assert.equal(p.mainEntity.interactionStatistic[1].userInteractionCount, 2);
  assert.ok(!('sameAs' in profilePage({ name: 'M', handle: 'm', path: '/riders/m', dateCreated: '2026-10-01', flights: 1, vouches: 0, sameAs: [] }).mainEntity));
});

test('learningResource: LearningResource + Article inside the free Flight School course', () => {
  const l = learningResource({
    name: 'Your first flight', description: 'd', path: '/training/your-first-flight',
    level: 'Fledgling', timeRequired: 'PT25M', teaches: 'Scoping one small task',
  });
  assert.deepEqual(l['@type'], ['LearningResource', 'Article']);
  assert.equal(l.educationalLevel, 'Fledgling');
  assert.equal(l.isPartOf['@type'], 'Course');
  assert.equal(l.isPartOf.name, 'Flight School');
  assert.equal(l.isPartOf.url, `${SITE}/training/`);
  assert.equal(l.isPartOf.isAccessibleForFree, true);
});

test('dataset: CC BY 4.0 license and a JSON distribution at /logs.json', () => {
  const d = dataset({ name: 'Flight logs', description: 'd', path: '/logs/', temporalCoverage: '2026-09/..' });
  assert.equal(d['@type'], 'Dataset');
  assert.equal(d['@id'], DATASET_ID);
  assert.equal(d.license, 'https://creativecommons.org/licenses/by/4.0/');
  assert.equal(d.distribution[0].contentUrl, `${SITE}/logs.json`);
  assert.equal(d.distribution[0].encodingFormat, 'application/json');
  assert.ok(!('aggregateRating' in d));
});

test('softwareApplication: free, MIT, with install and repository URLs', () => {
  const s = softwareApplication({
    name: 'agentriders', description: 'CLI', version: '0.1.0',
    installUrl: 'https://www.npmjs.com/package/agentriders', codeRepository: 'https://github.com/maxfain/agentriders',
  });
  assert.equal(s['@type'], 'SoftwareApplication');
  assert.equal(s.offers.price, '0');
  assert.equal(s.license, 'https://spdx.org/licenses/MIT.html');
  assert.equal(s.softwareVersion, '0.1.0');
  assert.ok(!('aggregateRating' in s));
});

// ---- site-state profiles (feeds the sitemap's rider URLs) -----------------

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.SITE_STATE_ORIGIN;
});

test('fetchSiteState: carries profiles with ≥1 flight, drops malformed rows, defaults to []', async () => {
  process.env.SITE_STATE_ORIGIN = 'http://fixture.local';
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({
      handles: ['maxcr'], verified: {},
      profiles: [
        { handle: 'maxcr', flights: 3, updated: '2026-10-16T04:00:00.000Z' },
        { handle: 'zero', flights: 0, updated: '2026-10-16T04:00:00.000Z' },
        { handle: 'broken' },
      ],
    }), { status: 200 })) as typeof fetch;
  const state = await fetchSiteState();
  assert.deepEqual(state.profiles, [{ handle: 'maxcr', flights: 3, updated: '2026-10-16T04:00:00.000Z' }]);

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ handles: [], verified: {} }), { status: 200 })) as typeof fetch;
  assert.deepEqual((await fetchSiteState()).profiles, []);
});
